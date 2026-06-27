import { v } from "convex/values";

/**
 * Shared validators for the Reddit Opportunity Intelligence platform.
 *
 * These are imported by `schema.ts` and by individual Convex functions so the
 * shape of pipeline data is defined in exactly one place. Pure data only — no
 * Convex function definitions live here.
 */

// ---------------------------------------------------------------------------
// Sources & ingestion
// ---------------------------------------------------------------------------

/** Which external platform a piece of content came from. Extend this union to add sources. */
export const sourceKind = v.union(
  v.literal("reddit"),
  v.literal("hackernews"),
  v.literal("github"),
  v.literal("producthunt"),
);

/** post vs comment (or future equivalents). */
export const sourceContentType = v.union(
  v.literal("post"),
  v.literal("comment"),
);

/** Crawl health of a single (source, channel). */
export const sourceStatus = v.union(
  v.literal("ok"),
  v.literal("degraded"),
  v.literal("disabled"),
);

/** Where a document is in the analysis pipeline. */
export const analysisStatus = v.union(
  v.literal("pending"),
  v.literal("prefiltered_out"),
  v.literal("analyzing"),
  v.literal("analyzed"),
  v.literal("errored"),
);

// ---------------------------------------------------------------------------
// AI pipeline — per-document stages (1–2)
// ---------------------------------------------------------------------------

/** Stage 1 — Problem Extraction. */
export const stage1Problem = v.object({
  problemStatement: v.string(),
  who: v.string(),
  industry: v.string(),
  severity: v.number(), // 1–5
  urgency: v.number(), // 1–5
  recurring: v.boolean(),
  workaround: v.optional(v.string()),
  desiredSolution: v.optional(v.string()),
});

/** Qualitative low/medium/high used by several scoring fields. */
export const lowMedHigh = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
);

/** Stage 2 — Opportunity Scoring. */
export const stage2Score = v.object({
  opportunityScore: v.number(), // 0–100
  willingnessToPay: lowMedHigh,
  marketSizeEstimate: v.string(),
  frequency: lowMedHigh,
  viability: v.number(), // 0–100
  complexity: v.number(), // 1–5 (engineering effort)
});

/** Per-stage execution state for the resumable workflow. */
export const stageState = v.union(
  v.literal("pending"),
  v.literal("done"),
  v.literal("error"),
  v.literal("skipped"),
);

export const docStageStatus = v.object({
  s1: stageState,
  s2: stageState,
});

export const tokenUsage = v.object({
  promptTokens: v.number(),
  completionTokens: v.number(),
  embeddingTokens: v.number(),
});

// ---------------------------------------------------------------------------
// AI pipeline — cluster-level stages (3–6), stored on `opportunities`
// ---------------------------------------------------------------------------

/** Stage 3 — Competitor Analysis. */
export const competition = v.object({
  existingProducts: v.array(
    v.object({ name: v.string(), note: v.optional(v.string()) }),
  ),
  saturated: v.boolean(),
  underserved: v.boolean(),
  gaps: v.array(v.string()),
});

/** Stage 4 — Generated SaaS Idea. */
export const saasIdea = v.object({
  name: v.string(),
  summary: v.string(),
  icp: v.string(),
  features: v.array(v.string()),
  pricing: v.array(
    v.object({
      tier: v.string(),
      price: v.string(),
      features: v.array(v.string()),
    }),
  ),
  mvpScope: v.array(v.string()),
  monetization: v.string(),
  advantage: v.string(),
});

/** Stage 5 — Technical Specification. */
export const techSpec = v.object({
  features: v.array(v.string()),
  roles: v.array(v.string()),
  pages: v.array(v.string()),
  navigation: v.array(v.string()),
  apiEndpoints: v.array(
    v.object({ method: v.string(), path: v.string(), purpose: v.string() }),
  ),
  dbSchema: v.array(
    v.object({ table: v.string(), fields: v.array(v.string()) }),
  ),
  jobs: v.array(v.string()),
  auth: v.string(),
  integrations: v.array(v.string()),
  architecture: v.string(),
  libraries: v.array(v.string()),
});

/** Stage 6 — Development Plan. */
export const buildPlan = v.object({
  milestones: v.array(
    v.object({ title: v.string(), detail: v.optional(v.string()) }),
  ),
  phases: v.array(
    v.object({ name: v.string(), goal: v.string() }),
  ),
  estimatedBuildTime: v.string(),
  difficulty: lowMedHigh,
});

// ---------------------------------------------------------------------------
// Opportunity rollups & trending
// ---------------------------------------------------------------------------

/** Rolled-up scores displayed on an opportunity (median/weighted across the cluster). */
export const opportunityScores = v.object({
  opportunity: v.number(), // 0–100 (also flattened to top-level for indexing)
  willingnessToPay: v.number(), // 0–100
  marketSize: v.number(), // 0–100
  viability: v.number(), // 0–100
  complexity: v.number(), // 1–5
  confidence: v.number(), // 0–1
});

export const trendDirection = v.union(
  v.literal("new"),
  v.literal("rising"),
  v.literal("steady"),
  v.literal("declining"),
);

export const trendGranularity = v.union(
  v.literal("day"),
  v.literal("week"),
  v.literal("month"),
);

export const trendEntityType = v.union(
  v.literal("cluster"),
  v.literal("industry"),
  v.literal("opportunity"),
);

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export const pipelineKind = v.union(
  v.literal("crawl"),
  v.literal("analyze"),
  v.literal("embed"),
  v.literal("cluster"),
  v.literal("trend"),
);

export const pipelineRunStatus = v.union(
  v.literal("running"),
  v.literal("success"),
  v.literal("error"),
  v.literal("retrying"),
);

export const userRole = v.union(v.literal("user"), v.literal("admin"));

// ---------------------------------------------------------------------------
// Ingestion — normalized document input (crawler -> upsert mutation)
// ---------------------------------------------------------------------------

/**
 * The shape produced by a source normalizer and handed to `ingest.upsertDocuments`.
 * Excludes system fields and pipeline-managed fields (analysisStatus, isProblem,
 * clusterId, rawRef) which the mutation sets.
 */
export const documentInput = v.object({
  source: sourceKind,
  sourceType: sourceContentType,
  externalId: v.string(),
  dedupeKey: v.string(),
  parentExternalId: v.optional(v.string()), // immediate parent (post t3_ or comment t1_)
  postExternalId: v.optional(v.string()), // root post fullname (t3_) — scopes a thread
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
  language: v.optional(v.string()),
});

export const userPreferences = v.object({
  defaultIndustries: v.optional(v.array(v.string())),
  theme: v.optional(v.string()),
});
