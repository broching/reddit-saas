import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUserOrThrow } from "./users";

/** Toggle a bookmark on an opportunity. Returns the new bookmarked state. */
export const toggle = mutation({
  args: { opportunityId: v.id("opportunities") },
  returns: v.object({ bookmarked: v.boolean() }),
  handler: async (ctx, { opportunityId }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const existing = await ctx.db
      .query("bookmarks")
      .withIndex("by_user_and_opportunity", (q) =>
        q.eq("userId", user._id).eq("opportunityId", opportunityId),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { bookmarked: false };
    }
    await ctx.db.insert("bookmarks", { userId: user._id, opportunityId });
    return { bookmarked: true };
  },
});

/** Whether the signed-in user has bookmarked a given opportunity. */
export const isBookmarked = query({
  args: { opportunityId: v.id("opportunities") },
  returns: v.boolean(),
  handler: async (ctx, { opportunityId }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const existing = await ctx.db
      .query("bookmarks")
      .withIndex("by_user_and_opportunity", (q) =>
        q.eq("userId", user._id).eq("opportunityId", opportunityId),
      )
      .unique();
    return existing !== null;
  },
});

/** The signed-in user's bookmarked opportunities (most recent first). */
export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("opportunities"),
      slug: v.string(),
      title: v.string(),
      industry: v.string(),
      opportunityScore: v.number(),
      aiSummary: v.string(),
      mentionCount: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const user = await getCurrentUserOrThrow(ctx);
    const rows = await ctx.db
      .query("bookmarks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(200);

    const out = [];
    for (const b of rows) {
      const o = await ctx.db.get(b.opportunityId);
      if (!o) continue;
      out.push({
        _id: o._id,
        slug: o.slug,
        title: o.title,
        industry: o.industry,
        opportunityScore: o.opportunityScore,
        aiSummary: o.aiSummary,
        mentionCount: o.mentionCount,
      });
    }
    return out;
  },
});
