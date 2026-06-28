import { MutationCtx } from "../_generated/server";

export type TrendEntity = "cluster" | "industry" | "opportunity";
export const DAY_MS = 86_400_000;

/** Epoch ms at the start of the UTC day containing `ms`. */
export function startOfDay(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

/**
 * Increment the day-bucket mention counter for an entity. Denormalized counter
 * (never counts rows) so trend reads stay O(buckets).
 */
export async function bumpTrend(
  ctx: MutationCtx,
  entityType: TrendEntity,
  entityId: string,
  atMs: number,
): Promise<void> {
  const bucketStart = startOfDay(atMs);
  const existing = await ctx.db
    .query("trendBuckets")
    .withIndex("by_entity_gran_bucket", (q) =>
      q
        .eq("entityType", entityType)
        .eq("entityId", entityId)
        .eq("granularity", "day")
        .eq("bucketStart", bucketStart),
    )
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, { count: existing.count + 1 });
  } else {
    await ctx.db.insert("trendBuckets", {
      entityType,
      entityId,
      granularity: "day",
      bucketStart,
      count: 1,
    });
  }
}
