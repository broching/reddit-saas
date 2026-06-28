import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "../_generated/server";
import { getCurrentUserOrThrow } from "../users";

/** Paginated opportunities, highest score first, optionally filtered by industry. */
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    industry: v.optional(v.string()),
  },
  handler: async (ctx, { paginationOpts, industry }) => {
    await getCurrentUserOrThrow(ctx);
    if (industry) {
      return await ctx.db
        .query("opportunities")
        .withIndex("by_industry_and_score", (q) => q.eq("industry", industry))
        .order("desc")
        .paginate(paginationOpts);
    }
    return await ctx.db
      .query("opportunities")
      .withIndex("by_score")
      .order("desc")
      .paginate(paginationOpts);
  },
});

/** Full opportunity detail plus its originating Reddit posts/comments. */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    await getCurrentUserOrThrow(ctx);
    const opportunity = await ctx.db
      .query("opportunities")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!opportunity) return null;

    const sources = [];
    for (const id of opportunity.topDocumentIds) {
      const doc = await ctx.db.get(id);
      if (!doc) continue;
      sources.push({
        _id: doc._id,
        sourceType: doc.sourceType,
        channel: doc.channel,
        title: doc.title,
        body: doc.body.slice(0, 280),
        url: doc.url,
        score: doc.score,
        author: doc.author,
      });
    }
    return { opportunity, sources };
  },
});

/** Distinct industries present in opportunities (for the filter dropdown). */
export const industries = query({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    await getCurrentUserOrThrow(ctx);
    const rows = await ctx.db.query("opportunities").take(300);
    return Array.from(new Set(rows.map((r) => r.industry))).sort();
  },
});
