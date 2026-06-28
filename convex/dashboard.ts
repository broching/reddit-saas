import { v } from "convex/values";
import { query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { getCurrentUserOrThrow } from "./users";
import { trendDirection } from "./validators";

/**
 * Single roll-up query that powers the dashboard home page. Visible to any
 * signed-in user (unlike `admin.overview`, which is role-gated and exposes
 * cost/usage). Counts are bounded so the query stays cheap on a busy corpus.
 */

const CAP = 1000;

export const home = query({
  args: {},
  returns: v.object({
    counts: v.object({
      opportunities: v.number(),
      clusters: v.number(),
      analyzed: v.number(),
      pending: v.number(),
      posts: v.number(),
      capped: v.boolean(),
    }),
    topOpportunities: v.array(
      v.object({
        _id: v.id("opportunities"),
        title: v.string(),
        slug: v.string(),
        industry: v.string(),
        problemSummary: v.string(),
        opportunityScore: v.number(),
        mentionCount: v.number(),
        trendDirection,
      }),
    ),
    trending: v.array(
      v.object({
        clusterId: v.id("clusters"),
        title: v.string(),
        slug: v.optional(v.string()),
        industry: v.optional(v.string()),
        velocity: v.number(),
        growthRate: v.number(),
        direction: trendDirection,
        series: v.array(v.object({ t: v.number(), count: v.number() })),
      }),
    ),
    lastUpdatedAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx) => {
    await getCurrentUserOrThrow(ctx);

    // --- Bounded corpus counts ------------------------------------------
    const oppRows = await ctx.db
      .query("opportunities")
      .withIndex("by_score")
      .order("desc")
      .take(CAP);

    const clusterRows = await ctx.db
      .query("clusters")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(CAP);

    const analyzedRows = await ctx.db
      .query("documents")
      .withIndex("by_status", (q) => q.eq("analysisStatus", "analyzed"))
      .take(CAP);

    const pendingRows = await ctx.db
      .query("documents")
      .withIndex("by_status", (q) => q.eq("analysisStatus", "pending"))
      .take(CAP);

    const postRows = await ctx.db
      .query("documents")
      .withIndex("by_type_createdAt", (q) => q.eq("sourceType", "post"))
      .take(CAP);

    const capped =
      oppRows.length === CAP ||
      clusterRows.length === CAP ||
      analyzedRows.length === CAP ||
      pendingRows.length === CAP ||
      postRows.length === CAP;

    // --- Top opportunities ----------------------------------------------
    const topOpportunities = oppRows.slice(0, 6).map((o) => ({
      _id: o._id,
      title: o.title,
      slug: o.slug,
      industry: o.industry,
      problemSummary: o.problemSummary,
      opportunityScore: o.opportunityScore,
      mentionCount: o.mentionCount,
      trendDirection: o.trendDirection,
    }));

    const lastUpdatedAt =
      oppRows.length > 0
        ? Math.max(...oppRows.map((o) => o.lastUpdatedAt))
        : null;

    // --- Trending (top movers, joined to opportunity for slug) ----------
    const trendRows = await ctx.db
      .query("trends")
      .withIndex("by_growth")
      .order("desc")
      .take(30);

    const trending = [];
    for (const t of trendRows) {
      if (t.entityType !== "cluster") continue;
      const cluster = await ctx.db.get(t.entityId as Id<"clusters">);
      if (!cluster || cluster.status !== "active") continue;
      let slug: string | undefined;
      let title = cluster.title;
      if (cluster.opportunityId) {
        const opp = await ctx.db.get(cluster.opportunityId);
        if (opp) {
          slug = opp.slug;
          title = opp.title;
        }
      }
      trending.push({
        clusterId: cluster._id,
        title,
        slug,
        industry: cluster.industry,
        velocity: t.velocity,
        growthRate: t.growthRate,
        direction: t.direction,
        series: t.series,
      });
      if (trending.length >= 5) break;
    }

    return {
      counts: {
        opportunities: oppRows.length,
        clusters: clusterRows.length,
        analyzed: analyzedRows.length,
        pending: pendingRows.length,
        posts: postRows.length,
        capped,
      },
      topOpportunities,
      trending,
      lastUpdatedAt,
    };
  },
});
