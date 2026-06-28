import { v } from "convex/values";
import { query } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { getCurrentUserOrThrow } from "../users";
import { trendDirection } from "../validators";

/** Top trending clusters by growth, joined to their opportunity for display. */
export const top = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
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
  handler: async (ctx, { limit }) => {
    await getCurrentUserOrThrow(ctx);
    const trends = await ctx.db
      .query("trends")
      .withIndex("by_growth")
      .order("desc")
      .take(Math.min(limit ?? 30, 60));

    const out = [];
    for (const t of trends) {
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
      out.push({
        clusterId: cluster._id,
        title,
        slug,
        industry: cluster.industry,
        velocity: t.velocity,
        growthRate: t.growthRate,
        direction: t.direction,
        series: t.series,
      });
    }
    return out;
  },
});
