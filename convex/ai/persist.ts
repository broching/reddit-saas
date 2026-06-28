import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import {
  analysisStatus,
  docStageStatus,
  sourceContentType,
  stage1Problem,
  stage2Score,
  tokenUsage,
} from "../validators";

/** Loads the fields the analyzer needs plus the existing analysis (for caching). */
export const getForAnalysis = internalQuery({
  args: { documentId: v.id("documents") },
  returns: v.union(
    v.object({
      sourceType: sourceContentType,
      channel: v.string(),
      title: v.optional(v.string()),
      body: v.string(),
      analysisStatus,
      existingVersion: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, { documentId }) => {
    const doc = await ctx.db.get(documentId);
    if (!doc) return null;
    const analysis = await ctx.db
      .query("documentAnalysis")
      .withIndex("by_documentId", (q) => q.eq("documentId", documentId))
      .unique();
    return {
      sourceType: doc.sourceType,
      channel: doc.channel,
      title: doc.title,
      body: doc.body,
      analysisStatus: doc.analysisStatus,
      existingVersion: analysis?.pipelineVersion,
    };
  },
});

/** Upserts a document's analysis and patches the document's status/isProblem. */
export const saveAnalysis = internalMutation({
  args: {
    documentId: v.id("documents"),
    pipelineVersion: v.string(),
    stage1: v.optional(stage1Problem),
    stage2: v.optional(stage2Score),
    industry: v.optional(v.string()),
    opportunityScore: v.optional(v.number()),
    confidence: v.optional(v.number()),
    isProblem: v.boolean(),
    analysisStatus,
    stageStatus: docStageStatus,
    tokenUsage: v.optional(tokenUsage),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("documentAnalysis")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .unique();

    const record = {
      documentId: args.documentId,
      pipelineVersion: args.pipelineVersion,
      stage1: args.stage1,
      stage2: args.stage2,
      industry: args.industry,
      opportunityScore: args.opportunityScore,
      confidence: args.confidence,
      stageStatus: args.stageStatus,
      tokenUsage: args.tokenUsage,
    };
    if (existing) {
      await ctx.db.replace(existing._id, record);
    } else {
      await ctx.db.insert("documentAnalysis", record);
    }

    await ctx.db.patch(args.documentId, {
      analysisStatus: args.analysisStatus,
      isProblem: args.isProblem,
    });
    return null;
  },
});

/** Marks a document's analysis status (e.g. "analyzing" or "errored"). */
export const setStatus = internalMutation({
  args: { documentId: v.id("documents"), status: analysisStatus },
  returns: v.null(),
  handler: async (ctx, { documentId, status }) => {
    await ctx.db.patch(documentId, { analysisStatus: status });
    return null;
  },
});
