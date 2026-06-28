import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAdmin } from "./users";
import { dailyTokenCeiling } from "./ai/usage";

/** Pipeline + corpus counts for the admin analytics dashboard. */
export const overview = query({
  args: {},
  returns: v.object({
    documents: v.object({
      pending: v.number(),
      analyzing: v.number(),
      analyzed: v.number(),
      prefilteredOut: v.number(),
      errored: v.number(),
    }),
    problems: v.number(),
    clusters: v.number(),
    opportunities: v.number(),
    deadLetter: v.number(),
    usageToday: v.object({
      llmTokens: v.number(),
      estCostUsd: v.number(),
      documentsAnalyzed: v.number(),
      ceiling: v.number(),
    }),
  }),
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const statuses = [
      "pending",
      "analyzing",
      "analyzed",
      "prefiltered_out",
      "errored",
    ] as const;
    const counts: Record<string, number> = {};
    for (const st of statuses) {
      // Bounded count — caps at 1000 to stay cheap; good enough for a dashboard.
      const rows = await ctx.db
        .query("documents")
        .withIndex("by_status", (q) => q.eq("analysisStatus", st))
        .take(1000);
      counts[st] = rows.length;
    }

    const problems = (
      await ctx.db
        .query("documentAnalysis")
        .withIndex("by_opportunityScore")
        .take(1000)
    ).filter((a) => a.opportunityScore !== undefined).length;

    const clusters = (
      await ctx.db
        .query("clusters")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .take(1000)
    ).length;

    const opportunities = (
      await ctx.db.query("opportunities").withIndex("by_score").take(1000)
    ).length;

    const deadLetter = (
      await ctx.db
        .query("pipelineRuns")
        .withIndex("by_status", (q) => q.eq("status", "error"))
        .take(1000)
    ).length;

    const date = new Date().toISOString().slice(0, 10);
    const usage = await ctx.db
      .query("usageDaily")
      .withIndex("by_date", (q) => q.eq("date", date))
      .unique();

    return {
      documents: {
        pending: counts.pending ?? 0,
        analyzing: counts.analyzing ?? 0,
        analyzed: counts.analyzed ?? 0,
        prefilteredOut: counts.prefiltered_out ?? 0,
        errored: counts.errored ?? 0,
      },
      problems,
      clusters,
      opportunities,
      deadLetter,
      usageToday: {
        llmTokens: usage?.llmTokens ?? 0,
        estCostUsd: usage?.estCostUsd ?? 0,
        documentsAnalyzed: usage?.documentsAnalyzed ?? 0,
        ceiling: dailyTokenCeiling(),
      },
    };
  },
});

/** Recent daily usage history (for a cost/throughput chart). */
export const usageHistory = query({
  args: { days: v.optional(v.number()) },
  returns: v.array(
    v.object({
      date: v.string(),
      llmTokens: v.number(),
      embeddingTokens: v.number(),
      estCostUsd: v.number(),
      documentsAnalyzed: v.number(),
    }),
  ),
  handler: async (ctx, { days }) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("usageDaily")
      .withIndex("by_date")
      .order("desc")
      .take(Math.min(days ?? 14, 60));
    return rows
      .map((r) => ({
        date: r.date,
        llmTokens: r.llmTokens,
        embeddingTokens: r.embeddingTokens,
        estCostUsd: r.estCostUsd,
        documentsAnalyzed: r.documentsAnalyzed,
      }))
      .reverse();
  },
});

/** Failed pipeline runs (dead-letter), newest first. */
export const deadLetter = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("pipelineRuns"),
      kind: v.string(),
      label: v.optional(v.string()),
      message: v.optional(v.string()),
      error: v.optional(v.string()),
      targetId: v.optional(v.string()),
      startedAt: v.number(),
    }),
  ),
  handler: async (ctx, { limit }) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("pipelineRuns")
      .withIndex("by_status", (q) => q.eq("status", "error"))
      .order("desc")
      .take(Math.min(limit ?? 50, 100));
    return rows.map((r) => ({
      _id: r._id,
      kind: r.kind,
      label: r.label,
      message: r.message,
      error: r.error,
      targetId: r.targetId,
      startedAt: r.startedAt,
    }));
  },
});

/** Admin: requeue all errored documents back to pending for reprocessing. */
export const requeueErrored = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    await ctx.scheduler.runAfter(0, internal.ai.pipeline.requeueErrored, {});
    return null;
  },
});

/** Admin: reprocess a single document (reset to pending + schedule analysis). */
export const reprocessDocument = mutation({
  args: { documentId: v.id("documents") },
  returns: v.null(),
  handler: async (ctx, { documentId }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(documentId, { analysisStatus: "pending" });
    await ctx.scheduler.runAfter(0, internal.ai.pipeline.analyzeDocument, {
      documentId,
    });
    return null;
  },
});
