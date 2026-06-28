import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { sourceKind } from "../validators";
import { EMBED_MODEL } from "../ai/embeddings";
import { bumpTrend } from "../trending/buckets";

/** Loads the problem text + embedding/cluster status for a candidate document. */
export const getProblemForEmbed = internalQuery({
  args: { documentId: v.id("documents") },
  returns: v.union(
    v.object({
      problemText: v.string(),
      industry: v.optional(v.string()),
      source: sourceKind,
      alreadyEmbedded: v.boolean(),
      alreadyClustered: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, { documentId }) => {
    const doc = await ctx.db.get(documentId);
    if (!doc || !doc.isProblem) return null;
    const analysis = await ctx.db
      .query("documentAnalysis")
      .withIndex("by_documentId", (q) => q.eq("documentId", documentId))
      .unique();
    if (!analysis?.stage1) return null;
    const problemText = [
      analysis.stage1.problemStatement,
      analysis.stage1.desiredSolution,
    ]
      .filter(Boolean)
      .join(" ");
    return {
      problemText,
      industry: analysis.industry,
      source: doc.source,
      alreadyEmbedded: !!analysis.embeddingId,
      alreadyClustered: !!doc.clusterId,
    };
  },
});

/** Returns a document's stored embedding vector, if any. */
export const getEmbeddingVector = internalQuery({
  args: { documentId: v.id("documents") },
  returns: v.union(v.array(v.float64()), v.null()),
  handler: async (ctx, { documentId }) => {
    const row = await ctx.db
      .query("embeddings")
      .withIndex("by_documentId", (q) => q.eq("documentId", documentId))
      .unique();
    return row?.vector ?? null;
  },
});

/** Persists an embedding and links it on the document's analysis. Idempotent. */
export const saveEmbedding = internalMutation({
  args: {
    documentId: v.id("documents"),
    vector: v.array(v.float64()),
    industry: v.optional(v.string()),
    source: sourceKind,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("embeddings")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .unique();
    let embeddingId = existing?._id;
    if (!embeddingId) {
      embeddingId = await ctx.db.insert("embeddings", {
        documentId: args.documentId,
        vector: args.vector,
        model: EMBED_MODEL,
        industry: args.industry,
        source: args.source,
      });
    }
    const analysis = await ctx.db
      .query("documentAnalysis")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .unique();
    if (analysis && !analysis.embeddingId) {
      await ctx.db.patch(analysis._id, { embeddingId });
    }
    return null;
  },
});

/** Adds a document to an existing cluster and updates its centroid/counters. */
export const joinCluster = internalMutation({
  args: {
    clusterId: v.id("clusters"),
    documentId: v.id("documents"),
    vector: v.array(v.float64()),
    similarity: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { clusterId, documentId, vector, similarity }) => {
    const cluster = await ctx.db.get(clusterId);
    if (!cluster || cluster.status !== "active") return null;

    // Guard against double membership.
    const existing = await ctx.db
      .query("clusterMembers")
      .withIndex("by_document", (q) => q.eq("documentId", documentId))
      .unique();
    if (existing) return null;

    await ctx.db.insert("clusterMembers", { clusterId, documentId, similarity });
    await ctx.db.patch(documentId, { clusterId });

    const n = cluster.memberCount;
    const newCentroid = cluster.centroid.map(
      (c, i) => (c * n + vector[i]) / (n + 1),
    );
    const newConfidence = (cluster.confidence * n + similarity) / (n + 1);
    await ctx.db.patch(clusterId, {
      centroid: newCentroid,
      memberCount: n + 1,
      confidence: newConfidence,
      lastSeenAt: Date.now(),
    });

    // Trend buckets use the post's actual Reddit time, not ingestion time.
    const doc = await ctx.db.get(documentId);
    const at = doc?.createdAt ?? Date.now();
    await bumpTrend(ctx, "cluster", clusterId, at);
    if (cluster.industry) await bumpTrend(ctx, "industry", cluster.industry, at);
    return null;
  },
});

/** Creates a new singleton cluster seeded from a document. */
export const createCluster = internalMutation({
  args: {
    documentId: v.id("documents"),
    vector: v.array(v.float64()),
    title: v.string(),
    summary: v.string(),
    industry: v.optional(v.string()),
  },
  returns: v.id("clusters"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const clusterId = await ctx.db.insert("clusters", {
      title: args.title,
      summary: args.summary,
      industry: args.industry,
      centroid: args.vector,
      memberCount: 1,
      confidence: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      status: "active",
    });
    await ctx.db.insert("clusterMembers", {
      clusterId,
      documentId: args.documentId,
      similarity: 1,
    });
    await ctx.db.patch(args.documentId, { clusterId });

    const doc = await ctx.db.get(args.documentId);
    const at = doc?.createdAt ?? now;
    await bumpTrend(ctx, "cluster", clusterId, at);
    if (args.industry) await bumpTrend(ctx, "industry", args.industry, at);
    return clusterId;
  },
});
