import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { bumpTrend, DAY_MS, startOfDay } from "./buckets";

const WINDOW_DAYS = 14;
const RISING = 0.2;
const DECLINING = -0.2;
const NEW_WINDOW_MS = 7 * DAY_MS;

function direction(
  growthRate: number,
  firstSeenAt: number,
  now: number,
): "new" | "rising" | "steady" | "declining" {
  if (now - firstSeenAt <= NEW_WINDOW_MS) return "new";
  if (growthRate > RISING) return "rising";
  if (growthRate < DECLINING) return "declining";
  return "steady";
}

/** Daily: compute velocity/growth/direction per cluster from its day buckets. */
export const computeTrends = internalMutation({
  args: {},
  returns: v.object({ updated: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const today = startOfDay(now);
    const clusters = await ctx.db
      .query("clusters")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(120);

    let updated = 0;
    for (const cluster of clusters) {
      const buckets = await ctx.db
        .query("trendBuckets")
        .withIndex("by_entity_gran_bucket", (q) =>
          q
            .eq("entityType", "cluster")
            .eq("entityId", cluster._id)
            .eq("granularity", "day"),
        )
        .take(60);
      const byDay = new Map(buckets.map((b) => [b.bucketStart, b.count]));

      const series: { t: number; count: number }[] = [];
      for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
        const t = today - i * DAY_MS;
        series.push({ t, count: byDay.get(t) ?? 0 });
      }
      const last7 = series.slice(7).reduce((s, p) => s + p.count, 0);
      const prev7 = series.slice(0, 7).reduce((s, p) => s + p.count, 0);
      const growthRate = (last7 - prev7) / Math.max(prev7, 1);
      const dir = direction(growthRate, cluster.firstSeenAt, now);

      const existing = await ctx.db
        .query("trends")
        .withIndex("by_entity", (q) =>
          q.eq("entityType", "cluster").eq("entityId", cluster._id),
        )
        .unique();
      const record = {
        entityType: "cluster" as const,
        entityId: cluster._id,
        velocity: last7,
        growthRate,
        direction: dir,
        series,
        computedAt: now,
      };
      if (existing) await ctx.db.replace(existing._id, record);
      else await ctx.db.insert("trends", record);

      if (cluster.opportunityId) {
        await ctx.db.patch(cluster.opportunityId, { trendDirection: dir });
      }
      updated++;
    }
    return { updated };
  },
});

/**
 * Ops/one-time: backfill day buckets from existing cluster memberships using
 * each member document's Reddit timestamp. Run once after enabling trending.
 */
export const backfillTrendsOps = internalMutation({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ counted: v.number() }),
  handler: async (ctx, { limit }) => {
    const members = await ctx.db.query("clusterMembers").take(limit ?? 1000);
    let counted = 0;
    for (const m of members) {
      const cluster = await ctx.db.get(m.clusterId);
      const doc = await ctx.db.get(m.documentId);
      if (!cluster || !doc) continue;
      await bumpTrend(ctx, "cluster", m.clusterId, doc.createdAt);
      if (cluster.industry)
        await bumpTrend(ctx, "industry", cluster.industry, doc.createdAt);
      counted++;
    }
    return { counted };
  },
});
