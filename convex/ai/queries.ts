import { v } from "convex/values";
import { query } from "../_generated/server";
import { getCurrentUserOrThrow, requireAdmin } from "../users";
import { dailyTokenCeiling } from "./usage";

/** The AI analysis for one document (for inline display on a post/comment). */
export const getAnalysis = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    await getCurrentUserOrThrow(ctx);
    return await ctx.db
      .query("documentAnalysis")
      .withIndex("by_documentId", (q) => q.eq("documentId", documentId))
      .unique();
  },
});

/** Highest-scoring extracted problems, newest models first. */
export const topProblems = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      documentId: v.id("documents"),
      title: v.optional(v.string()),
      channel: v.string(),
      url: v.optional(v.string()),
      problemStatement: v.string(),
      who: v.string(),
      industry: v.string(),
      opportunityScore: v.number(),
      severity: v.number(),
      urgency: v.number(),
      willingnessToPay: v.optional(v.string()),
      marketSizeEstimate: v.optional(v.string()),
      confidence: v.number(),
    }),
  ),
  handler: async (ctx, { limit }) => {
    await getCurrentUserOrThrow(ctx);
    const analyses = await ctx.db
      .query("documentAnalysis")
      .withIndex("by_opportunityScore")
      .order("desc")
      .take(Math.min(limit ?? 50, 100));

    const out = [];
    for (const a of analyses) {
      if (a.opportunityScore === undefined || !a.stage1) continue; // problems only
      const doc = await ctx.db.get(a.documentId);
      if (!doc) continue;
      out.push({
        documentId: a.documentId,
        title: doc.title,
        channel: doc.channel,
        url: doc.url,
        problemStatement: a.stage1.problemStatement,
        who: a.stage1.who,
        industry: a.stage1.industry,
        opportunityScore: a.opportunityScore,
        severity: a.stage1.severity,
        urgency: a.stage1.urgency,
        willingnessToPay: a.stage2?.willingnessToPay,
        marketSizeEstimate: a.stage2?.marketSizeEstimate,
        confidence: a.confidence ?? 0,
      });
    }
    return out;
  },
});

/** Admin: today's AI usage + budget for display. */
export const usageToday = query({
  args: {},
  returns: v.object({
    date: v.string(),
    llmTokens: v.number(),
    estCostUsd: v.number(),
    documentsAnalyzed: v.number(),
    ceiling: v.number(),
  }),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const date = new Date().toISOString().slice(0, 10);
    const row = await ctx.db
      .query("usageDaily")
      .withIndex("by_date", (q) => q.eq("date", date))
      .unique();
    return {
      date,
      llmTokens: row?.llmTokens ?? 0,
      estCostUsd: row?.estCostUsd ?? 0,
      documentsAnalyzed: row?.documentsAnalyzed ?? 0,
      ceiling: dailyTokenCeiling(),
    };
  },
});
