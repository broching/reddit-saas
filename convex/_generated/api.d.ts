/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as ai_embeddings from "../ai/embeddings.js";
import type * as ai_gemini from "../ai/gemini.js";
import type * as ai_opportunity from "../ai/opportunity.js";
import type * as ai_persist from "../ai/persist.js";
import type * as ai_pipeline from "../ai/pipeline.js";
import type * as ai_prompts from "../ai/prompts.js";
import type * as ai_queries from "../ai/queries.js";
import type * as ai_schemas from "../ai/schemas.js";
import type * as ai_usage from "../ai/usage.js";
import type * as bookmarks from "../bookmarks.js";
import type * as clustering_assign from "../clustering/assign.js";
import type * as clustering_persist from "../clustering/persist.js";
import type * as clustering_queries from "../clustering/queries.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as documents from "../documents.js";
import type * as http from "../http.js";
import type * as ingest_normalize from "../ingest/normalize.js";
import type * as ingest_upsert from "../ingest/upsert.js";
import type * as lib_hash from "../lib/hash.js";
import type * as opportunities_build from "../opportunities/build.js";
import type * as opportunities_persist from "../opportunities/persist.js";
import type * as opportunities_queries from "../opportunities/queries.js";
import type * as ops from "../ops.js";
import type * as paymentAttemptTypes from "../paymentAttemptTypes.js";
import type * as paymentAttempts from "../paymentAttempts.js";
import type * as reddit_client from "../reddit/client.js";
import type * as reddit_crawler from "../reddit/crawler.js";
import type * as reddit_state from "../reddit/state.js";
import type * as reddit_types from "../reddit/types.js";
import type * as savedSearches from "../savedSearches.js";
import type * as search_search from "../search/search.js";
import type * as sources from "../sources.js";
import type * as trending_buckets from "../trending/buckets.js";
import type * as trending_compute from "../trending/compute.js";
import type * as trending_queries from "../trending/queries.js";
import type * as users from "../users.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  "ai/embeddings": typeof ai_embeddings;
  "ai/gemini": typeof ai_gemini;
  "ai/opportunity": typeof ai_opportunity;
  "ai/persist": typeof ai_persist;
  "ai/pipeline": typeof ai_pipeline;
  "ai/prompts": typeof ai_prompts;
  "ai/queries": typeof ai_queries;
  "ai/schemas": typeof ai_schemas;
  "ai/usage": typeof ai_usage;
  bookmarks: typeof bookmarks;
  "clustering/assign": typeof clustering_assign;
  "clustering/persist": typeof clustering_persist;
  "clustering/queries": typeof clustering_queries;
  crons: typeof crons;
  dashboard: typeof dashboard;
  documents: typeof documents;
  http: typeof http;
  "ingest/normalize": typeof ingest_normalize;
  "ingest/upsert": typeof ingest_upsert;
  "lib/hash": typeof lib_hash;
  "opportunities/build": typeof opportunities_build;
  "opportunities/persist": typeof opportunities_persist;
  "opportunities/queries": typeof opportunities_queries;
  ops: typeof ops;
  paymentAttemptTypes: typeof paymentAttemptTypes;
  paymentAttempts: typeof paymentAttempts;
  "reddit/client": typeof reddit_client;
  "reddit/crawler": typeof reddit_crawler;
  "reddit/state": typeof reddit_state;
  "reddit/types": typeof reddit_types;
  savedSearches: typeof savedSearches;
  "search/search": typeof search_search;
  sources: typeof sources;
  "trending/buckets": typeof trending_buckets;
  "trending/compute": typeof trending_compute;
  "trending/queries": typeof trending_queries;
  users: typeof users;
  validators: typeof validators;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
