/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as documents from "../documents.js";
import type * as http from "../http.js";
import type * as ingest_normalize from "../ingest/normalize.js";
import type * as ingest_upsert from "../ingest/upsert.js";
import type * as lib_hash from "../lib/hash.js";
import type * as ops from "../ops.js";
import type * as paymentAttemptTypes from "../paymentAttemptTypes.js";
import type * as paymentAttempts from "../paymentAttempts.js";
import type * as reddit_client from "../reddit/client.js";
import type * as reddit_crawler from "../reddit/crawler.js";
import type * as reddit_state from "../reddit/state.js";
import type * as reddit_types from "../reddit/types.js";
import type * as sources from "../sources.js";
import type * as users from "../users.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  documents: typeof documents;
  http: typeof http;
  "ingest/normalize": typeof ingest_normalize;
  "ingest/upsert": typeof ingest_upsert;
  "lib/hash": typeof lib_hash;
  ops: typeof ops;
  paymentAttemptTypes: typeof paymentAttemptTypes;
  paymentAttempts: typeof paymentAttempts;
  "reddit/client": typeof reddit_client;
  "reddit/crawler": typeof reddit_crawler;
  "reddit/state": typeof reddit_state;
  "reddit/types": typeof reddit_types;
  sources: typeof sources;
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
