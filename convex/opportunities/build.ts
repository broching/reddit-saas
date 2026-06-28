import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  mutation,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { requireAdmin } from "../users";
import { generateBusiness, generateTechnical } from "../ai/opportunity";
import { dailyTokenCeiling } from "../ai/usage";

const MIN_MEMBERS = 1; // build an opportunity once a cluster has this many mentions
const OPP_BATCH = 4;
const OPP_STAGGER_MS = 8_000;

function slugify(name: string, clusterId: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  return `${base || "opportunity"}-${clusterId.slice(-6)}`;
}

/**
 * Generate (or refresh) the SaaS opportunity for a cluster: Stage 3–4 business
 * analysis, then Stage 5–6 technical spec, rolled up with cluster scores.
 */
export const buildOpportunity = internalAction({
  args: { clusterId: v.id("clusters") },
  returns: v.object({ built: v.boolean() }),
  handler: async (ctx, { clusterId }) => {
    const cx = await ctx.runQuery(
      internal.opportunities.persist.getClusterContext,
      { clusterId },
    );
    if (!cx) return { built: false };

    const runId = await ctx.runMutation(internal.ops.startRun, {
      kind: "cluster",
      label: cx.industry ?? cx.title.slice(0, 30),
      targetId: clusterId,
      message: `Generating opportunity for "${cx.title.slice(0, 40)}"…`,
    });

    try {
      const biz = await generateBusiness({
        industry: cx.industry,
        problemSummary: cx.summary,
        painPoints: cx.painPoints,
        mentionCount: cx.memberCount,
      });

      await ctx.runMutation(internal.ops.updateRun, {
        runId,
        message: `Designing tech spec for "${biz.saas.name}"…`,
        progress: 0.6,
      });

      const tech = await generateTechnical({
        name: biz.saas.name,
        summary: biz.saas.summary,
        features: biz.saas.features,
      });

      await ctx.runMutation(internal.opportunities.persist.saveOpportunity, {
        clusterId,
        title: biz.saas.name,
        slug: slugify(biz.saas.name, clusterId),
        problemSummary: cx.summary,
        painPoints: cx.painPoints,
        aiSummary: biz.saas.summary,
        saas: biz.saas,
        techSpec: tech.techSpec,
        buildPlan: tech.buildPlan,
        competition: biz.competition,
        scores: {
          opportunity: cx.agg.opportunity,
          willingnessToPay: cx.agg.wtp,
          marketSize: biz.marketScore,
          viability: cx.agg.viability,
          complexity: cx.agg.complexity,
          confidence: cx.confidence,
        },
        opportunityScore: cx.agg.opportunity,
        industry: cx.industry ?? "Unknown",
        mentionCount: cx.memberCount,
        topDocumentIds: cx.topDocumentIds,
        firstSeenAt: cx.firstSeenAt,
      });

      await ctx.runMutation(internal.ai.usage.recordUsage, {
        promptTokens: biz.promptTokens + tech.promptTokens,
        completionTokens: biz.completionTokens + tech.completionTokens,
        documentsAnalyzed: 0,
      });
      await ctx.runMutation(internal.ops.finishRun, {
        runId,
        status: "success",
        message: `Opportunity: ${biz.saas.name} · score ${cx.agg.opportunity}`,
      });
      return { built: true };
    } catch (err) {
      await ctx.runMutation(internal.ops.finishRun, {
        runId,
        status: "error",
        message: `Opportunity build failed`,
        error: (err as Error).message,
      });
      return { built: false };
    }
  },
});

/** Cron entry: build opportunities for clusters that don't have one yet. */
export const opportunityQueue = internalMutation({
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

    const clusters = await ctx.db
      .query("clusters")
      .withIndex("by_memberCount")
      .order("desc")
      .take((limit ?? OPP_BATCH) * 6);

    const todo = clusters
      .filter(
        (c) =>
          c.status === "active" &&
          c.memberCount >= MIN_MEMBERS &&
          !c.opportunityId,
      )
      .slice(0, limit ?? OPP_BATCH);

    todo.forEach((c, i) => {
      ctx.scheduler.runAfter(
        i * OPP_STAGGER_MS,
        internal.opportunities.build.buildOpportunity,
        { clusterId: c._id },
      );
    });
    return { scheduled: todo.length, skippedBudget: false };
  },
});

/** Admin: trigger opportunity generation now. */
export const buildNow = mutation({
  args: { limit: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { limit }) => {
    await requireAdmin(ctx);
    await ctx.scheduler.runAfter(
      0,
      internal.opportunities.build.opportunityQueue,
      { limit },
    );
    return null;
  },
});
