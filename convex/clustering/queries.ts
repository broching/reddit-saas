import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "../_generated/server";
import { Doc } from "../_generated/dataModel";
import { getCurrentUserOrThrow } from "../users";

const clusterSummary = v.object({
  _id: v.id("clusters"),
  title: v.string(),
  summary: v.string(),
  industry: v.optional(v.string()),
  memberCount: v.number(),
  confidence: v.number(),
  lastSeenAt: v.number(),
});

function mapCluster(c: Doc<"clusters">) {
  return {
    _id: c._id,
    title: c.title,
    summary: c.summary,
    industry: c.industry,
    memberCount: c.memberCount,
    confidence: c.confidence,
    lastSeenAt: c.lastSeenAt,
  };
}

/** Paginated clusters, largest first. */
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    await getCurrentUserOrThrow(ctx);
    const res = await ctx.db
      .query("clusters")
      .withIndex("by_memberCount")
      .order("desc")
      .paginate(paginationOpts);
    return {
      ...res,
      page: res.page.filter((c) => c.status === "active").map(mapCluster),
    };
  },
});

/** Full-text search over cluster summaries. */
export const search = query({
  args: { text: v.string() },
  returns: v.array(clusterSummary),
  handler: async (ctx, { text }) => {
    await getCurrentUserOrThrow(ctx);
    const rows = await ctx.db
      .query("clusters")
      .withSearchIndex("search_clusters", (q) =>
        q.search("summary", text).eq("status", "active"),
      )
      .take(40);
    return rows.map(mapCluster);
  },
});

/** Member documents of a cluster: original Reddit text + its AI summary. */
export const members = query({
  args: { clusterId: v.id("clusters"), limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      documentId: v.id("documents"),
      sourceType: v.union(v.literal("post"), v.literal("comment")),
      channel: v.string(),
      url: v.optional(v.string()),
      author: v.optional(v.string()),
      score: v.number(),
      title: v.optional(v.string()),
      body: v.string(), // original Reddit text
      problemStatement: v.optional(v.string()), // AI analysis
      similarity: v.number(),
    }),
  ),
  handler: async (ctx, { clusterId, limit }) => {
    await getCurrentUserOrThrow(ctx);
    const rows = await ctx.db
      .query("clusterMembers")
      .withIndex("by_cluster_and_similarity", (q) => q.eq("clusterId", clusterId))
      .order("desc")
      .take(Math.min(limit ?? 25, 50));

    const out = [];
    for (const m of rows) {
      const doc = await ctx.db.get(m.documentId);
      if (!doc) continue;
      const analysis = await ctx.db
        .query("documentAnalysis")
        .withIndex("by_documentId", (q) => q.eq("documentId", m.documentId))
        .unique();
      out.push({
        documentId: m.documentId,
        sourceType: doc.sourceType,
        channel: doc.channel,
        url: doc.url,
        author: doc.author,
        score: doc.score,
        title: doc.title,
        body: doc.body.slice(0, 600),
        problemStatement: analysis?.stage1?.problemStatement,
        similarity: m.similarity,
      });
    }
    return out;
  },
});
