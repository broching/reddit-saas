import { v } from "convex/values";
import { internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { embedText } from "../ai/embeddings";

// Cosine similarity threshold to join an existing cluster vs. start a new one.
const ASSIGN_THRESHOLD = 0.8;
const CLUSTER_BATCH = 8;
const CLUSTER_STAGGER_MS = 1_500;

function title(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > 90 ? `${t.slice(0, 90)}…` : t;
}

/**
 * Embed an analyzed problem document and assign it to the nearest cluster
 * (cosine ≥ threshold) or seed a new cluster. Online, incremental clustering.
 */
export const embedAndAssign = internalAction({
  args: { documentId: v.id("documents") },
  returns: v.object({ assigned: v.boolean(), createdCluster: v.boolean() }),
  handler: async (ctx, { documentId }) => {
    const cx = await ctx.runQuery(
      internal.clustering.persist.getProblemForEmbed,
      { documentId },
    );
    if (!cx || cx.alreadyClustered) {
      return { assigned: false, createdCluster: false };
    }

    // Reuse a stored vector if present, else embed and persist.
    let vector: number[] | null = null;
    if (cx.alreadyEmbedded) {
      vector = await ctx.runQuery(
        internal.clustering.persist.getEmbeddingVector,
        { documentId },
      );
    }
    if (!vector) {
      const { vector: v, tokens } = await embedText(cx.problemText);
      vector = v;
      await ctx.runMutation(internal.clustering.persist.saveEmbedding, {
        documentId,
        vector,
        industry: cx.industry,
        source: cx.source,
      });
      await ctx.runMutation(internal.ai.usage.recordUsage, {
        promptTokens: 0,
        completionTokens: 0,
        embeddingTokens: tokens,
        documentsAnalyzed: 0,
      });
    }

    const matches = await ctx.vectorSearch("clusters", "by_centroid", {
      vector,
      limit: 3,
    });
    const best = matches[0];

    if (best && best._score >= ASSIGN_THRESHOLD) {
      await ctx.runMutation(internal.clustering.persist.joinCluster, {
        clusterId: best._id,
        documentId,
        vector,
        similarity: best._score,
      });
      return { assigned: true, createdCluster: false };
    }

    await ctx.runMutation(internal.clustering.persist.createCluster, {
      documentId,
      vector,
      title: title(cx.problemText),
      summary: cx.problemText,
      industry: cx.industry,
    });
    return { assigned: true, createdCluster: true };
  },
});

/**
 * Cron/ops entry: schedule clustering for analyzed problem documents that
 * aren't yet in a cluster. (New analyses are also scheduled inline by the
 * pipeline; this catches the backlog and any that slipped.)
 */
export const clusterQueue = internalMutation({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ scheduled: v.number() }),
  handler: async (ctx, { limit }) => {
    const candidates = await ctx.db
      .query("documents")
      .withIndex("by_cluster", (q) => q.eq("clusterId", undefined))
      .take((limit ?? CLUSTER_BATCH) * 6);

    const todo = candidates
      .filter((d) => d.isProblem === true && d.analysisStatus === "analyzed")
      .slice(0, limit ?? CLUSTER_BATCH);

    todo.forEach((d, i) => {
      ctx.scheduler.runAfter(
        i * CLUSTER_STAGGER_MS,
        internal.clustering.assign.embedAndAssign,
        { documentId: d._id },
      );
    });
    return { scheduled: todo.length };
  },
});
