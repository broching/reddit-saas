import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  mutation,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { requireAdmin } from "../users";
import { generateStructured } from "./gemini";
import {
  PIPELINE_VERSION,
  STAGE1_SYSTEM,
  STAGE2_SYSTEM,
  stage1Prompt,
  stage1Schema,
  stage2Prompt,
  stage2Schema,
} from "./prompts";
import { coerceStage1, coerceStage2 } from "./schemas";
import { dailyTokenCeiling } from "./usage";

const MIN_CHARS_POST = 40;
const MIN_CHARS_COMMENT = 80;
// Throttled for free-tier Gemini quotas; raise once on a paid plan.
const ANALYZE_BATCH = 8;
const ANALYZE_STAGGER_MS = 4_000;

/** Transient failures (rate limit / overload / timeout) should be retried. */
function isTransient(message: string): boolean {
  return /429|5\d\d|UNAVAILABLE|RESOURCE_EXHAUSTED|quota|overload|aborted|timeout/i.test(
    message,
  );
}

/**
 * Run the per-document AI pipeline: deterministic prefilter → Stage 1 problem
 * extraction (which also gates non-problems) → Stage 2 opportunity scoring.
 * Results land in `documentAnalysis`; progress + cost go to pipelineRuns/usage.
 */
export const analyzeDocument = internalAction({
  args: { documentId: v.id("documents") },
  returns: v.null(),
  handler: async (ctx, { documentId }) => {
    const cx = await ctx.runQuery(internal.ai.persist.getForAnalysis, {
      documentId,
    });
    if (!cx) return null;

    // Cache: skip if already analyzed at the current pipeline version.
    if (
      cx.analysisStatus === "analyzed" &&
      cx.existingVersion === PIPELINE_VERSION
    ) {
      return null;
    }

    // Deterministic prefilter — cheap drop before spending any tokens.
    const text = `${cx.title ?? ""} ${cx.body}`.trim();
    const min = cx.sourceType === "comment" ? MIN_CHARS_COMMENT : MIN_CHARS_POST;
    const deleted = /^\[(deleted|removed)\]$/i.test(cx.body.trim());
    if (!text || text.length < min || deleted) {
      await ctx.runMutation(internal.ai.persist.saveAnalysis, {
        documentId,
        pipelineVersion: PIPELINE_VERSION,
        isProblem: false,
        analysisStatus: "prefiltered_out",
        stageStatus: { s1: "skipped", s2: "skipped" },
      });
      return null;
    }

    const runId = await ctx.runMutation(internal.ops.startRun, {
      kind: "analyze",
      label: `${cx.sourceType} r/${cx.channel}`,
      targetId: documentId,
      message: `Analyzing ${cx.sourceType} from r/${cx.channel}…`,
    });

    try {
      // Stage 1 — Problem Extraction (+ LLM prefilter via isProblem).
      const s1res = await generateStructured({
        system: STAGE1_SYSTEM,
        prompt: stage1Prompt(cx),
        schema: stage1Schema,
      });
      const s1 = coerceStage1(s1res.data);

      if (!s1.isProblem) {
        await ctx.runMutation(internal.ai.persist.saveAnalysis, {
          documentId,
          pipelineVersion: PIPELINE_VERSION,
          stage1: s1.problem,
          industry: s1.problem.industry,
          confidence: s1.confidence,
          isProblem: false,
          analysisStatus: "analyzed",
          stageStatus: { s1: "done", s2: "skipped" },
          tokenUsage: {
            promptTokens: s1res.promptTokens,
            completionTokens: s1res.completionTokens,
            embeddingTokens: 0,
          },
        });
        await ctx.runMutation(internal.ai.usage.recordUsage, {
          promptTokens: s1res.promptTokens,
          completionTokens: s1res.completionTokens,
          documentsAnalyzed: 1,
        });
        await ctx.runMutation(internal.ops.finishRun, {
          runId,
          status: "success",
          message: `Not a problem (r/${cx.channel})`,
        });
        return null;
      }

      // Stage 2 — Opportunity Scoring.
      const s2res = await generateStructured({
        system: STAGE2_SYSTEM,
        prompt: stage2Prompt(s1.problem),
        schema: stage2Schema,
      });
      const s2 = coerceStage2(s2res.data);

      const promptTokens = s1res.promptTokens + s2res.promptTokens;
      const completionTokens = s1res.completionTokens + s2res.completionTokens;

      await ctx.runMutation(internal.ai.persist.saveAnalysis, {
        documentId,
        pipelineVersion: PIPELINE_VERSION,
        stage1: s1.problem,
        stage2: s2,
        industry: s1.problem.industry,
        opportunityScore: s2.opportunityScore,
        confidence: s1.confidence,
        isProblem: true,
        analysisStatus: "analyzed",
        stageStatus: { s1: "done", s2: "done" },
        tokenUsage: { promptTokens, completionTokens, embeddingTokens: 0 },
      });
      await ctx.runMutation(internal.ai.usage.recordUsage, {
        promptTokens,
        completionTokens,
        documentsAnalyzed: 1,
      });
      await ctx.runMutation(internal.ops.finishRun, {
        runId,
        status: "success",
        message: `Problem · score ${s2.opportunityScore} · ${s1.problem.industry}`,
      });
      // Embed + cluster this problem (cost is only spent on real problems).
      await ctx.scheduler.runAfter(
        0,
        internal.clustering.assign.embedAndAssign,
        { documentId },
      );
      return null;
    } catch (err) {
      const message = (err as Error).message;
      // Transient (rate limit/overload) -> requeue as "pending" for the next
      // cron tick; permanent (validation/parse) -> mark "errored" (dead-letter).
      const transient = isTransient(message);
      await ctx.runMutation(internal.ai.persist.setStatus, {
        documentId,
        status: transient ? "pending" : "errored",
      });
      await ctx.runMutation(internal.ops.finishRun, {
        runId,
        status: "error",
        message: transient
          ? `Rate-limited (r/${cx.channel}) — will retry`
          : `Analysis failed (r/${cx.channel})`,
        error: message,
      });
      return null;
    }
  },
});

/**
 * Cron entry point: claim a batch of pending documents and schedule analysis,
 * unless today's token budget is exhausted. Marks docs "analyzing" so repeated
 * ticks don't double-process them.
 */
export const analyzeQueue = internalMutation({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ scheduled: v.number(), skippedBudget: v.boolean() }),
  handler: async (ctx, { limit }) => {
    const date = new Date().toISOString().slice(0, 10);
    const usage = await ctx.db
      .query("usageDaily")
      .withIndex("by_date", (q) => q.eq("date", date))
      .unique();
    if (usage && usage.llmTokens >= dailyTokenCeiling()) {
      return { scheduled: 0, skippedBudget: true };
    }

    const pending = await ctx.db
      .query("documents")
      .withIndex("by_status", (q) => q.eq("analysisStatus", "pending"))
      .take(limit ?? ANALYZE_BATCH);

    let i = 0;
    for (const doc of pending) {
      await ctx.db.patch(doc._id, { analysisStatus: "analyzing" });
      await ctx.scheduler.runAfter(
        i * ANALYZE_STAGGER_MS,
        internal.ai.pipeline.analyzeDocument,
        { documentId: doc._id },
      );
      i++;
    }
    return { scheduled: pending.length, skippedBudget: false };
  },
});

/** Reset documents stuck in "errored" (or "analyzing") back to "pending". */
export const requeueErrored = internalMutation({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ requeued: v.number() }),
  handler: async (ctx, { limit }) => {
    let requeued = 0;
    for (const status of ["errored", "analyzing"] as const) {
      const rows = await ctx.db
        .query("documents")
        .withIndex("by_status", (q) => q.eq("analysisStatus", status))
        .take(limit ?? 200);
      for (const r of rows) {
        await ctx.db.patch(r._id, { analysisStatus: "pending" });
        requeued++;
      }
    }
    return { requeued };
  },
});

/** Admin: trigger an analysis batch immediately. */
export const analyzeNow = mutation({
  args: { limit: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { limit }) => {
    await requireAdmin(ctx);
    await ctx.scheduler.runAfter(0, internal.ai.pipeline.analyzeQueue, {
      limit,
    });
    return null;
  },
});
