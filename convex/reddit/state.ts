import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { sourceKind, sourceStatus } from "../validators";

const ERROR_THRESHOLD = 5;

/** Context the crawler needs for one source: channel, watermark, and config. */
export const getCrawlContext = internalQuery({
  args: { sourceId: v.id("sources") },
  returns: v.union(
    v.object({
      channel: v.string(),
      source: sourceKind,
      enabled: v.boolean(),
      lastWatermark: v.optional(v.number()),
      config: v.optional(v.any()),
    }),
    v.null(),
  ),
  handler: async (ctx, { sourceId }) => {
    const source = await ctx.db.get(sourceId);
    if (!source) return null;
    const state = await ctx.db
      .query("sourceState")
      .withIndex("by_sourceId", (q) => q.eq("sourceId", sourceId))
      .unique();
    return {
      channel: source.channel,
      source: source.source,
      enabled: source.enabled,
      lastWatermark: state?.lastWatermark,
      config: source.config,
    };
  },
});

/** Persist successful crawl progress (watermark/run id) and clear the error count. */
export const updateCrawlState = internalMutation({
  args: {
    sourceId: v.id("sources"),
    lastWatermark: v.optional(v.number()),
    lastRunId: v.optional(v.string()),
    status: v.optional(sourceStatus),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("sourceState")
      .withIndex("by_sourceId", (q) => q.eq("sourceId", args.sourceId))
      .unique();
    const patch = {
      lastCrawlAt: Date.now(),
      consecutiveErrors: 0,
      status: args.status ?? ("ok" as const),
      ...(args.lastWatermark !== undefined
        ? { lastWatermark: args.lastWatermark }
        : {}),
      ...(args.lastRunId !== undefined ? { lastRunId: args.lastRunId } : {}),
    };
    if (state) {
      await ctx.db.patch(state._id, patch);
    } else {
      await ctx.db.insert("sourceState", { sourceId: args.sourceId, ...patch });
    }
    return null;
  },
});

/** Record a crawl failure; trips the circuit breaker after repeated errors. */
export const recordCrawlError = internalMutation({
  args: { sourceId: v.id("sources"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, { sourceId, error }) => {
    const state = await ctx.db
      .query("sourceState")
      .withIndex("by_sourceId", (q) => q.eq("sourceId", sourceId))
      .unique();
    const consecutiveErrors = (state?.consecutiveErrors ?? 0) + 1;
    const status =
      consecutiveErrors >= ERROR_THRESHOLD
        ? ("degraded" as const)
        : (state?.status ?? ("ok" as const));
    if (state) {
      await ctx.db.patch(state._id, { consecutiveErrors, status });
    } else {
      await ctx.db.insert("sourceState", {
        sourceId,
        consecutiveErrors,
        status,
      });
    }
    console.error(`Crawl error for source ${sourceId}: ${error}`);
    return null;
  },
});
