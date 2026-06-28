import { v } from "convex/values";
import { action, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { embedText } from "../ai/embeddings";

const summary = v.object({
  slug: v.string(),
  title: v.string(),
  industry: v.string(),
  opportunityScore: v.number(),
  aiSummary: v.string(),
  mentionCount: v.number(),
  matchScore: v.number(),
});

const searchMode = v.union(
  v.literal("keyword"),
  v.literal("semantic"),
  v.literal("hybrid"),
);

type OppSummary = {
  slug: string;
  title: string;
  industry: string;
  opportunityScore: number;
  aiSummary: string;
  mentionCount: number;
  matchScore: number;
};

/** Full-text search over document bodies; returns (documentId, rank score). */
export const keywordDocs = internalQuery({
  args: { text: v.string() },
  returns: v.array(v.object({ documentId: v.id("documents"), score: v.number() })),
  handler: async (ctx, { text }) => {
    const rows = await ctx.db
      .query("documents")
      .withSearchIndex("search_body", (q) => q.search("body", text))
      .take(30);
    return rows.map((r, i) => ({ documentId: r._id, score: 1 - i / 30 }));
  },
});

/**
 * Resolves matched documents/embeddings up to their opportunities, deduping and
 * keeping the best match score. Used by both keyword and semantic search.
 */
export const resolve = internalQuery({
  args: {
    docPairs: v.array(
      v.object({ documentId: v.id("documents"), score: v.number() }),
    ),
    embPairs: v.array(
      v.object({ embeddingId: v.id("embeddings"), score: v.number() }),
    ),
  },
  returns: v.array(summary),
  handler: async (ctx, { docPairs, embPairs }) => {
    const best = new Map<
      string,
      { score: number; opp: any }
    >();

    const addDoc = async (documentId: Id<"documents">, score: number) => {
      const doc = await ctx.db.get(documentId);
      if (!doc?.clusterId) return;
      const cluster = await ctx.db.get(doc.clusterId);
      if (!cluster?.opportunityId) return;
      const opp = await ctx.db.get(cluster.opportunityId);
      if (!opp) return;
      const prev = best.get(opp._id);
      if (!prev || score > prev.score) best.set(opp._id, { score, opp });
    };

    for (const p of docPairs) await addDoc(p.documentId, p.score);
    for (const p of embPairs) {
      const emb = await ctx.db.get(p.embeddingId);
      if (emb) await addDoc(emb.documentId, p.score);
    }

    return Array.from(best.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 25)
      .map(({ score, opp }) => ({
        slug: opp.slug,
        title: opp.title,
        industry: opp.industry,
        opportunityScore: opp.opportunityScore,
        aiSummary: opp.aiSummary,
        mentionCount: opp.mentionCount,
        matchScore: score,
      }));
  },
});

/** Hybrid search: semantic (vector) + keyword (full-text), merged. */
export const run = action({
  args: { text: v.string(), mode: searchMode },
  returns: v.array(summary),
  handler: async (ctx, { text, mode }): Promise<OppSummary[]> => {
    let embPairs: { embeddingId: Id<"embeddings">; score: number }[] = [];
    let docPairs: { documentId: Id<"documents">; score: number }[] = [];

    if (mode !== "keyword" && text.trim()) {
      const { vector } = await embedText(text);
      const matches = await ctx.vectorSearch("embeddings", "by_vector", {
        vector,
        limit: 40,
      });
      embPairs = matches.map((m) => ({ embeddingId: m._id, score: m._score }));
    }
    if (mode !== "semantic" && text.trim()) {
      docPairs = await ctx.runQuery(internal.search.search.keywordDocs, { text });
    }

    const results: OppSummary[] = await ctx.runQuery(
      internal.search.search.resolve,
      { docPairs, embPairs },
    );
    return results;
  },
});
