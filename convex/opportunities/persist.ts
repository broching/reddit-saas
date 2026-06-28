import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import {
  buildPlan,
  competition,
  opportunityScores,
  saasIdea,
  techSpec,
} from "../validators";

const WTP_NUM: Record<string, number> = { low: 33, medium: 66, high: 100 };

/** Cluster context + rolled-up member scores for opportunity generation. */
export const getClusterContext = internalQuery({
  args: { clusterId: v.id("clusters") },
  returns: v.union(
    v.object({
      title: v.string(),
      summary: v.string(),
      industry: v.optional(v.string()),
      memberCount: v.number(),
      confidence: v.number(),
      firstSeenAt: v.number(),
      painPoints: v.array(v.string()),
      topDocumentIds: v.array(v.id("documents")),
      agg: v.object({
        opportunity: v.number(),
        viability: v.number(),
        complexity: v.number(),
        wtp: v.number(),
      }),
    }),
    v.null(),
  ),
  handler: async (ctx, { clusterId }) => {
    const cluster = await ctx.db.get(clusterId);
    if (!cluster || cluster.status !== "active") return null;

    const members = await ctx.db
      .query("clusterMembers")
      .withIndex("by_cluster_and_similarity", (q) => q.eq("clusterId", clusterId))
      .order("desc")
      .take(50);

    const painSet = new Set<string>();
    const scored: { docId: typeof members[number]["documentId"]; score: number }[] =
      [];
    let oppSum = 0;
    let viaSum = 0;
    let cplxSum = 0;
    let wtpSum = 0;
    let n = 0;

    for (const m of members) {
      const doc = await ctx.db.get(m.documentId);
      if (!doc) continue;
      scored.push({ docId: m.documentId, score: doc.score });
      const a = await ctx.db
        .query("documentAnalysis")
        .withIndex("by_documentId", (q) => q.eq("documentId", m.documentId))
        .unique();
      if (a?.stage1) painSet.add(a.stage1.problemStatement);
      if (a?.stage2) {
        oppSum += a.opportunityScore ?? a.stage2.opportunityScore;
        viaSum += a.stage2.viability;
        cplxSum += a.stage2.complexity;
        wtpSum += WTP_NUM[a.stage2.willingnessToPay] ?? 66;
        n++;
      }
    }

    const denom = n || 1;
    scored.sort((a, b) => b.score - a.score);

    return {
      title: cluster.title,
      summary: cluster.summary,
      industry: cluster.industry,
      memberCount: cluster.memberCount,
      confidence: cluster.confidence,
      firstSeenAt: cluster.firstSeenAt,
      painPoints: Array.from(painSet).slice(0, 6),
      topDocumentIds: scored.slice(0, 5).map((s) => s.docId),
      agg: {
        opportunity: Math.round(oppSum / denom),
        viability: Math.round(viaSum / denom),
        complexity: Math.round(cplxSum / denom) || 3,
        wtp: Math.round(wtpSum / denom),
      },
    };
  },
});

/** Upserts an opportunity for a cluster and links it back. */
export const saveOpportunity = internalMutation({
  args: {
    clusterId: v.id("clusters"),
    title: v.string(),
    slug: v.string(),
    problemSummary: v.string(),
    painPoints: v.array(v.string()),
    aiSummary: v.string(),
    saas: saasIdea,
    techSpec,
    buildPlan,
    competition,
    scores: opportunityScores,
    opportunityScore: v.number(),
    industry: v.string(),
    mentionCount: v.number(),
    topDocumentIds: v.array(v.id("documents")),
    firstSeenAt: v.number(),
  },
  returns: v.id("opportunities"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("opportunities")
      .withIndex("by_cluster", (q) => q.eq("clusterId", args.clusterId))
      .unique();

    const record = {
      clusterId: args.clusterId,
      title: args.title,
      slug: args.slug,
      problemSummary: args.problemSummary,
      painPoints: args.painPoints,
      aiSummary: args.aiSummary,
      saas: args.saas,
      techSpec: args.techSpec,
      buildPlan: args.buildPlan,
      competition: args.competition,
      scores: args.scores,
      opportunityScore: args.opportunityScore,
      industry: args.industry,
      mentionCount: args.mentionCount,
      topDocumentIds: args.topDocumentIds,
      trendDirection: "new" as const,
      firstSeenAt: args.firstSeenAt,
      lastUpdatedAt: Date.now(),
    };

    let opportunityId;
    if (existing) {
      await ctx.db.replace(existing._id, record);
      opportunityId = existing._id;
    } else {
      opportunityId = await ctx.db.insert("opportunities", record);
    }
    await ctx.db.patch(args.clusterId, { opportunityId });
    return opportunityId;
  },
});
