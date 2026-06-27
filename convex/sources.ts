import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { sourceKind, sourceStatus } from "./validators";
import { requireAdmin } from "./users";

const sourceStateDoc = v.object({
  _id: v.id("sourceState"),
  _creationTime: v.number(),
  sourceId: v.id("sources"),
  lastCursor: v.optional(v.string()),
  lastWatermark: v.optional(v.number()),
  lastCrawlAt: v.optional(v.number()),
  status: sourceStatus,
  rateRemaining: v.optional(v.number()),
  rateResetAt: v.optional(v.number()),
  consecutiveErrors: v.number(),
});

const sourceWithState = v.object({
  _id: v.id("sources"),
  _creationTime: v.number(),
  source: sourceKind,
  channel: v.string(),
  displayName: v.string(),
  enabled: v.boolean(),
  crawlIntervalMinutes: v.number(),
  priority: v.number(),
  config: v.optional(v.any()),
  state: v.union(sourceStateDoc, v.null()),
});

/**
 * The default subreddits seeded on first run. These are pain-point-rich
 * communities for SaaS opportunity discovery.
 */
const DEFAULT_SUBREDDITS: string[] = [
  "SaaS",
  "startups",
  "Entrepreneur",
  "smallbusiness",
  "webdev",
  "Shopify",
  "marketing",
  "freelance",
  "accounting",
  "ecommerce",
];

const DEFAULT_CRAWL_INTERVAL_MINUTES = 15;

/** List all configured sources joined with their crawl state. Admin only. */
export const list = query({
  args: {},
  returns: v.array(sourceWithState),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const sources = await ctx.db.query("sources").take(500);
    return await Promise.all(
      sources.map(async (source) => {
        const state = await ctx.db
          .query("sourceState")
          .withIndex("by_sourceId", (q) => q.eq("sourceId", source._id))
          .unique();
        return { ...source, state };
      }),
    );
  },
});

/** Create or update a source by (source, channel). Admin only. */
export const upsert = mutation({
  args: {
    source: sourceKind,
    channel: v.string(),
    displayName: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
    crawlIntervalMinutes: v.optional(v.number()),
    priority: v.optional(v.number()),
    config: v.optional(v.any()),
  },
  returns: v.id("sources"),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const existing = await ctx.db
      .query("sources")
      .withIndex("by_source_and_channel", (q) =>
        q.eq("source", args.source).eq("channel", args.channel),
      )
      .unique();

    const fields = {
      source: args.source,
      channel: args.channel,
      displayName: args.displayName ?? `r/${args.channel}`,
      enabled: args.enabled ?? true,
      crawlIntervalMinutes:
        args.crawlIntervalMinutes ?? DEFAULT_CRAWL_INTERVAL_MINUTES,
      priority: args.priority ?? 1,
      config: args.config,
    };

    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }

    const sourceId = await ctx.db.insert("sources", fields);
    await ctx.db.insert("sourceState", {
      sourceId,
      status: "ok" as const,
      consecutiveErrors: 0,
    });
    return sourceId;
  },
});

/** Enable/disable crawling for a source without deleting it. Admin only. */
export const toggle = mutation({
  args: { sourceId: v.id("sources"), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { sourceId, enabled }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(sourceId, { enabled });
    return null;
  },
});

/** Delete a source and its crawl state. Admin only. (Documents are retained.) */
export const remove = mutation({
  args: { sourceId: v.id("sources") },
  returns: v.null(),
  handler: async (ctx, { sourceId }) => {
    await requireAdmin(ctx);
    const state = await ctx.db
      .query("sourceState")
      .withIndex("by_sourceId", (q) => q.eq("sourceId", sourceId))
      .unique();
    if (state) await ctx.db.delete(state._id);
    await ctx.db.delete(sourceId);
    return null;
  },
});

/** Manually trigger a crawl now (bypasses the per-source schedule). Admin only. */
export const crawlNow = mutation({
  args: { sourceId: v.optional(v.id("sources")) },
  returns: v.null(),
  handler: async (ctx, { sourceId }) => {
    await requireAdmin(ctx);
    if (sourceId) {
      await ctx.scheduler.runAfter(0, internal.reddit.crawler.crawlSource, {
        sourceId,
      });
    } else {
      await ctx.scheduler.runAfter(0, internal.reddit.crawler.crawlAllEnabled, {
        force: true,
      });
    }
    return null;
  },
});

/** Shared seeding logic used by the admin mutation and the ops/CLI variant. */
async function seedDefaultSources(ctx: MutationCtx): Promise<number> {
  let created = 0;
  for (const channel of DEFAULT_SUBREDDITS) {
    const existing = await ctx.db
      .query("sources")
      .withIndex("by_source_and_channel", (q) =>
        q.eq("source", "reddit").eq("channel", channel),
      )
      .unique();
    if (existing) continue;

    const sourceId = await ctx.db.insert("sources", {
      source: "reddit" as const,
      channel,
      displayName: `r/${channel}`,
      enabled: true,
      crawlIntervalMinutes: DEFAULT_CRAWL_INTERVAL_MINUTES,
      priority: 1,
      config: undefined,
    });
    await ctx.db.insert("sourceState", {
      sourceId,
      status: "ok" as const,
      consecutiveErrors: 0,
    });
    created++;
  }
  return created;
}

/** Seed the default subreddit list. Idempotent. Admin only. */
export const seedDefaults = mutation({
  args: {},
  returns: v.object({ created: v.number() }),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return { created: await seedDefaultSources(ctx) };
  },
});

/** Ops/CLI seeding (no auth) — for `npx convex run sources:seedDefaultsOps`. */
export const seedDefaultsOps = internalMutation({
  args: {},
  returns: v.object({ created: v.number() }),
  handler: async (ctx) => {
    return { created: await seedDefaultSources(ctx) };
  },
});

/** Ops/CLI enable-or-disable a source (no auth) — for verification/scripts. */
export const setEnabledOps = internalMutation({
  args: { sourceId: v.id("sources"), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { sourceId, enabled }) => {
    await ctx.db.patch(sourceId, { enabled });
    return null;
  },
});
