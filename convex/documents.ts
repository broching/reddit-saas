import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";
import { getCurrentUserOrThrow } from "./users";
import { analysisStatus, sourceContentType, sourceKind } from "./validators";

const documentDoc = v.object({
  _id: v.id("documents"),
  _creationTime: v.number(),
  source: sourceKind,
  sourceType: sourceContentType,
  externalId: v.string(),
  dedupeKey: v.string(),
  parentExternalId: v.optional(v.string()),
  postExternalId: v.optional(v.string()),
  sourceId: v.id("sources"),
  channel: v.string(),
  title: v.optional(v.string()),
  body: v.string(),
  author: v.optional(v.string()),
  url: v.optional(v.string()),
  score: v.number(),
  upvoteRatio: v.optional(v.number()),
  numComments: v.optional(v.number()),
  createdAt: v.number(),
  editedAt: v.optional(v.number()),
  contentHash: v.string(),
  rawRef: v.optional(v.id("_storage")),
  analysisStatus,
  isProblem: v.optional(v.boolean()),
  clusterId: v.optional(v.id("clusters")),
  language: v.optional(v.string()),
});

/** Subreddits available to browse (the configured sources). */
export const channels = query({
  args: {},
  returns: v.array(
    v.object({ channel: v.string(), displayName: v.string() }),
  ),
  handler: async (ctx) => {
    await getCurrentUserOrThrow(ctx);
    const sources = await ctx.db.query("sources").take(500);
    return sources
      .map((s) => ({ channel: s.channel, displayName: s.displayName }))
      .sort((a, b) => a.channel.localeCompare(b.channel));
  },
});

/**
 * Paginated posts (thread roots), newest first, optionally for one subreddit.
 * Comments are fetched per-post via `thread`.
 */
export const posts = query({
  args: {
    paginationOpts: paginationOptsValidator,
    channel: v.optional(v.string()),
  },
  handler: async (ctx, { paginationOpts, channel }) => {
    await getCurrentUserOrThrow(ctx);

    if (channel) {
      return await ctx.db
        .query("documents")
        .withIndex("by_channel_type_createdAt", (q) =>
          q.eq("channel", channel).eq("sourceType", "post"),
        )
        .order("desc")
        .paginate(paginationOpts);
    }

    return await ctx.db
      .query("documents")
      .withIndex("by_type_createdAt", (q) => q.eq("sourceType", "post"))
      .order("desc")
      .paginate(paginationOpts);
  },
});

/**
 * All comments belonging to a post (by root post fullname). Bounded — the
 * client builds the nested tree from each comment's `parentExternalId`.
 */
export const thread = query({
  args: { postExternalId: v.string() },
  returns: v.array(documentDoc),
  handler: async (ctx, { postExternalId }) => {
    await getCurrentUserOrThrow(ctx);
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_postExternalId", (q) =>
        q.eq("postExternalId", postExternalId),
      )
      .take(500);
    return docs.filter((d) => d.sourceType === "comment");
  },
});
