import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { paymentAttemptSchemaValidator } from "./paymentAttemptTypes";
import {
  analysisStatus,
  buildPlan,
  competition,
  docStageStatus,
  opportunityScores,
  pipelineKind,
  pipelineRunStatus,
  saasIdea,
  sourceContentType,
  sourceKind,
  sourceStatus,
  stage1Problem,
  stage2Score,
  techSpec,
  tokenUsage,
  trendDirection,
  trendEntityType,
  trendGranularity,
  userPreferences,
  userRole,
} from "./validators";

/**
 * Embedding dimensionality for Google Gemini `text-embedding-004`.
 * Changing the embedding model requires a new vector index (dimensions are fixed per index).
 */
export const EMBEDDING_DIMENSIONS = 768;

export default defineSchema({
  // =========================================================================
  // Identity & billing (existing — extended)
  // =========================================================================
  users: defineTable({
    name: v.string(),
    // Clerk ID, stored in the subject JWT field.
    externalId: v.string(),
    // New: role-based access. Missing/undefined is treated as "user" in code.
    role: v.optional(userRole),
    preferences: v.optional(userPreferences),
  }).index("byExternalId", ["externalId"]),

  paymentAttempts: defineTable(paymentAttemptSchemaValidator)
    .index("byPaymentId", ["payment_id"])
    .index("byUserId", ["userId"])
    .index("byPayerUserId", ["payer.user_id"]),

  // =========================================================================
  // Source configuration & crawl state
  // =========================================================================

  /** Registry of data sources. One row per (source, channel) e.g. ("reddit", "SaaS"). */
  sources: defineTable({
    source: sourceKind,
    channel: v.string(), // subreddit name (without "r/"), HN tag, repo, etc.
    displayName: v.string(),
    enabled: v.boolean(),
    crawlIntervalMinutes: v.number(),
    priority: v.number(),
    // Source-specific knobs (min score, flair filters, ...). Free-form per source.
    config: v.optional(v.any()),
  })
    .index("by_source_and_channel", ["source", "channel"])
    .index("by_enabled", ["enabled"]),

  /** Mutable per-source crawl bookkeeping. Separated from `sources` (high-churn vs stable). */
  sourceState: defineTable({
    sourceId: v.id("sources"),
    lastWatermark: v.optional(v.number()), // max post createdAt (ms) seen — used as Apify postDateLimit
    lastCrawlAt: v.optional(v.number()),
    lastRunId: v.optional(v.string()), // last Apify run id (audit)
    status: sourceStatus,
    consecutiveErrors: v.number(),
  }).index("by_sourceId", ["sourceId"]),

  // =========================================================================
  // Content — source-agnostic core
  // =========================================================================

  documents: defineTable({
    source: sourceKind,
    sourceType: sourceContentType,
    externalId: v.string(), // Reddit fullname t3_/t1_
    dedupeKey: v.string(), // "reddit:" + externalId  (unique upsert key)
    parentExternalId: v.optional(v.string()), // immediate parent (post t3_ or comment t1_)
    postExternalId: v.optional(v.string()), // root post fullname (t3_) — scopes a thread
    sourceId: v.id("sources"),
    channel: v.string(), // denormalized subreddit for read speed

    title: v.optional(v.string()), // posts only
    body: v.string(),
    author: v.optional(v.string()),
    url: v.optional(v.string()),

    score: v.number(),
    upvoteRatio: v.optional(v.number()),
    numComments: v.optional(v.number()),

    createdAt: v.number(), // source created_utc (ms)
    editedAt: v.optional(v.number()),
    contentHash: v.string(), // edit detection

    rawRef: v.optional(v.id("_storage")), // raw JSON blob

    analysisStatus: analysisStatus,
    isProblem: v.optional(v.boolean()), // cheap prefilter result
    clusterId: v.optional(v.id("clusters")), // denormalized membership
    language: v.optional(v.string()),
  })
    .index("by_dedupeKey", ["dedupeKey"])
    .index("by_status", ["analysisStatus"])
    .index("by_source_channel_createdAt", ["source", "channel", "createdAt"])
    .index("by_type_createdAt", ["sourceType", "createdAt"])
    .index("by_channel_type_createdAt", ["channel", "sourceType", "createdAt"])
    .index("by_postExternalId", ["postExternalId"])
    .index("by_cluster", ["clusterId"])
    .index("by_parent", ["parentExternalId"])
    .searchIndex("search_body", {
      searchField: "body",
      filterFields: ["channel", "source", "analysisStatus"],
    }),

  /** Stage 1–2 results, kept separate from the volatile `documents` row. */
  documentAnalysis: defineTable({
    documentId: v.id("documents"),
    pipelineVersion: v.string(),
    stage1: v.optional(stage1Problem),
    stage2: v.optional(stage2Score),
    // Flattened for indexing/faceting.
    industry: v.optional(v.string()),
    opportunityScore: v.optional(v.number()),
    confidence: v.optional(v.number()), // 0–1
    stageStatus: docStageStatus,
    tokenUsage: v.optional(tokenUsage),
  })
    .index("by_documentId", ["documentId"])
    .index("by_industry", ["industry"])
    .index("by_opportunityScore", ["opportunityScore"]),

  // =========================================================================
  // Embeddings & clustering
  // =========================================================================

  embeddings: defineTable({
    documentId: v.id("documents"),
    vector: v.array(v.float64()),
    model: v.string(),
    industry: v.optional(v.string()),
    source: sourceKind,
  })
    .index("by_documentId", ["documentId"])
    .vectorIndex("by_vector", {
      vectorField: "vector",
      dimensions: EMBEDDING_DIMENSIONS,
      filterFields: ["industry", "source"],
    }),

  clusters: defineTable({
    title: v.string(),
    summary: v.string(),
    industry: v.optional(v.string()),
    centroid: v.array(v.float64()),
    memberCount: v.number(), // denormalized counter — never count rows
    confidence: v.number(), // cohesion (avg intra-cluster similarity)
    opportunityId: v.optional(v.id("opportunities")),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("merged"),
      v.literal("archived"),
    ),
    mergedInto: v.optional(v.id("clusters")),
  })
    .index("by_industry", ["industry"])
    .index("by_status", ["status"])
    .index("by_memberCount", ["memberCount"])
    .index("by_lastSeen", ["lastSeenAt"])
    .vectorIndex("by_centroid", {
      vectorField: "centroid",
      dimensions: EMBEDDING_DIMENSIONS,
      filterFields: ["industry"],
    }),

  /** Join table for cluster membership — avoids an unbounded array on the cluster doc. */
  clusterMembers: defineTable({
    clusterId: v.id("clusters"),
    documentId: v.id("documents"),
    similarity: v.number(), // doc <-> centroid at assignment
  })
    .index("by_cluster", ["clusterId"])
    .index("by_document", ["documentId"])
    .index("by_cluster_and_similarity", ["clusterId", "similarity"]),

  // =========================================================================
  // Opportunities (the product)
  // =========================================================================

  opportunities: defineTable({
    clusterId: v.id("clusters"),
    title: v.string(),
    slug: v.string(),
    problemSummary: v.string(),
    painPoints: v.array(v.string()),
    aiSummary: v.string(),

    // Cluster-level generated stages (3–6).
    saas: v.optional(saasIdea), // Stage 4
    techSpec: v.optional(techSpec), // Stage 5
    buildPlan: v.optional(buildPlan), // Stage 6
    competition: v.optional(competition), // Stage 3

    scores: opportunityScores,
    opportunityScore: v.number(), // flattened from scores.opportunity for indexing

    industry: v.string(),
    mentionCount: v.number(), // denormalized = cluster.memberCount
    topDocumentIds: v.array(v.id("documents")), // bounded display cache
    trendDirection: trendDirection,

    firstSeenAt: v.number(),
    lastUpdatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_cluster", ["clusterId"])
    .index("by_score", ["opportunityScore"])
    .index("by_industry_and_score", ["industry", "opportunityScore"])
    .index("by_trend", ["trendDirection"])
    .searchIndex("search_opportunities", {
      searchField: "title",
      filterFields: ["industry", "trendDirection"],
    }),

  // =========================================================================
  // Trending
  // =========================================================================

  /** Raw time-series counts. One row per (entity, granularity, bucketStart). */
  trendBuckets: defineTable({
    entityType: trendEntityType,
    entityId: v.string(), // cluster/opportunity id or industry name
    granularity: trendGranularity,
    bucketStart: v.number(), // epoch (ms) of bucket start
    count: v.number(),
  }).index("by_entity_gran_bucket", [
    "entityType",
    "entityId",
    "granularity",
    "bucketStart",
  ]),

  /** Pre-computed trend snapshot for fast reads. */
  trends: defineTable({
    entityType: trendEntityType,
    entityId: v.string(),
    velocity: v.number(),
    growthRate: v.number(),
    direction: trendDirection,
    series: v.array(v.object({ t: v.number(), count: v.number() })), // bounded sparkline
    computedAt: v.number(),
  })
    .index("by_entity", ["entityType", "entityId"])
    .index("by_growth", ["growthRate"]),

  // =========================================================================
  // User-facing
  // =========================================================================

  bookmarks: defineTable({
    userId: v.id("users"),
    opportunityId: v.id("opportunities"),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_opportunity", ["userId", "opportunityId"]),

  savedSearches: defineTable({
    userId: v.id("users"),
    name: v.string(),
    query: v.any(), // serialized filter state
  }).index("by_user", ["userId"]),

  // =========================================================================
  // Operations
  // =========================================================================

  /** Audit / dead-letter / cost log + live activity feed for pipeline work. */
  pipelineRuns: defineTable({
    kind: pipelineKind,
    targetId: v.optional(v.string()),
    label: v.optional(v.string()), // short human label, e.g. "r/SaaS"
    message: v.optional(v.string()), // latest human-readable status line
    progress: v.optional(v.number()), // 0–1 for a progress bar, when known
    status: pipelineRunStatus,
    error: v.optional(v.string()),
    attempt: v.number(),
    tokenUsage: v.optional(tokenUsage),
    costEstimate: v.optional(v.number()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
  })
    .index("by_kind_and_status", ["kind", "status"])
    .index("by_startedAt", ["startedAt"]),

  /** Daily usage aggregate for cost guardrails. */
  usageDaily: defineTable({
    date: v.string(), // "YYYY-MM-DD"
    llmTokens: v.number(),
    embeddingTokens: v.number(),
    estCostUsd: v.number(),
    documentsAnalyzed: v.number(),
  }).index("by_date", ["date"]),
});
