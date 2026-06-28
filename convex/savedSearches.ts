import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUserOrThrow } from "./users";

const savedSearchQuery = v.object({
  text: v.string(),
  mode: v.union(
    v.literal("keyword"),
    v.literal("semantic"),
    v.literal("hybrid"),
  ),
});

/** Save a search (query text + mode) for the signed-in user. */
export const create = mutation({
  args: { name: v.string(), query: savedSearchQuery },
  returns: v.id("savedSearches"),
  handler: async (ctx, { name, query }) => {
    const user = await getCurrentUserOrThrow(ctx);
    return await ctx.db.insert("savedSearches", {
      userId: user._id,
      name,
      query,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("savedSearches") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const row = await ctx.db.get(id);
    if (row && row.userId === user._id) {
      await ctx.db.delete(id);
    }
    return null;
  },
});

/** The signed-in user's saved searches. */
export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("savedSearches"),
      name: v.string(),
      query: savedSearchQuery,
    }),
  ),
  handler: async (ctx) => {
    const user = await getCurrentUserOrThrow(ctx);
    const rows = await ctx.db
      .query("savedSearches")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(100);
    return rows.map((r) => ({
      _id: r._id,
      name: r.name,
      query: r.query as { text: string; mode: "keyword" | "semantic" | "hybrid" },
    }));
  },
});
