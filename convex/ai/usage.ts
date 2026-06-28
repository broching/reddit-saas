import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

// Rough Gemini flash-lite pricing (USD per 1M tokens) for cost estimates only.
const INPUT_USD_PER_1M = 0.1;
const OUTPUT_USD_PER_1M = 0.4;

/** Daily LLM token ceiling. Override with GEMINI_DAILY_TOKEN_CEILING. */
export function dailyTokenCeiling(): number {
  const v = Number(process.env.GEMINI_DAILY_TOKEN_CEILING);
  return Number.isFinite(v) && v > 0 ? v : 2_000_000;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const recordUsage = internalMutation({
  args: {
    promptTokens: v.number(),
    completionTokens: v.number(),
    embeddingTokens: v.optional(v.number()),
    documentsAnalyzed: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const date = today();
    const llm = args.promptTokens + args.completionTokens;
    const embed = args.embeddingTokens ?? 0;
    const cost =
      (args.promptTokens / 1_000_000) * INPUT_USD_PER_1M +
      (args.completionTokens / 1_000_000) * OUTPUT_USD_PER_1M;

    const existing = await ctx.db
      .query("usageDaily")
      .withIndex("by_date", (q) => q.eq("date", date))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        llmTokens: existing.llmTokens + llm,
        embeddingTokens: existing.embeddingTokens + embed,
        estCostUsd: existing.estCostUsd + cost,
        documentsAnalyzed: existing.documentsAnalyzed + args.documentsAnalyzed,
      });
    } else {
      await ctx.db.insert("usageDaily", {
        date,
        llmTokens: llm,
        embeddingTokens: embed,
        estCostUsd: cost,
        documentsAnalyzed: args.documentsAnalyzed,
      });
    }
    return null;
  },
});

/** Today's usage totals (for the budget gate and admin display). */
export const getTodayUsage = internalQuery({
  args: {},
  returns: v.object({
    date: v.string(),
    llmTokens: v.number(),
    estCostUsd: v.number(),
    documentsAnalyzed: v.number(),
    ceiling: v.number(),
  }),
  handler: async (ctx) => {
    const date = today();
    const row = await ctx.db
      .query("usageDaily")
      .withIndex("by_date", (q) => q.eq("date", date))
      .unique();
    return {
      date,
      llmTokens: row?.llmTokens ?? 0,
      estCostUsd: row?.estCostUsd ?? 0,
      documentsAnalyzed: row?.documentsAnalyzed ?? 0,
      ceiling: dailyTokenCeiling(),
    };
  },
});
