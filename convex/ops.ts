import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalMutation, query } from "./_generated/server";
import { pipelineKind, pipelineRunStatus, tokenUsage } from "./validators";
import { getCurrentUserOrThrow } from "./users";

/**
 * Pipeline run tracking — powers the dead-letter log AND the live activity feed
 * / progress bar shown in the dashboard. Crawl and AI-pipeline code call
 * `startRun` then `updateRun`/`finishRun` so the UI can react in real time.
 */

export const startRun = internalMutation({
  args: {
    kind: pipelineKind,
    label: v.optional(v.string()),
    targetId: v.optional(v.string()),
    message: v.optional(v.string()),
  },
  returns: v.id("pipelineRuns"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("pipelineRuns", {
      kind: args.kind,
      label: args.label,
      targetId: args.targetId,
      message: args.message,
      progress: 0,
      status: "running",
      attempt: 1,
      startedAt: Date.now(),
    });
  },
});

export const updateRun = internalMutation({
  args: {
    runId: v.id("pipelineRuns"),
    message: v.optional(v.string()),
    progress: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { runId, message, progress }) => {
    const patch: Record<string, unknown> = {};
    if (message !== undefined) patch.message = message;
    if (progress !== undefined) patch.progress = progress;
    await ctx.db.patch(runId, patch);
    return null;
  },
});

export const finishRun = internalMutation({
  args: {
    runId: v.id("pipelineRuns"),
    status: pipelineRunStatus,
    message: v.optional(v.string()),
    error: v.optional(v.string()),
    tokenUsage: v.optional(tokenUsage),
    costEstimate: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {
      status: args.status,
      finishedAt: Date.now(),
      progress: 1,
    };
    if (args.message !== undefined) patch.message = args.message;
    if (args.error !== undefined) patch.error = args.error;
    if (args.tokenUsage !== undefined) patch.tokenUsage = args.tokenUsage;
    if (args.costEstimate !== undefined) patch.costEstimate = args.costEstimate;
    await ctx.db.patch(args.runId, patch);
    return null;
  },
});

const pipelineRunDoc = v.object({
  _id: v.id("pipelineRuns"),
  _creationTime: v.number(),
  kind: pipelineKind,
  targetId: v.optional(v.string()),
  label: v.optional(v.string()),
  message: v.optional(v.string()),
  progress: v.optional(v.number()),
  status: pipelineRunStatus,
  error: v.optional(v.string()),
  attempt: v.number(),
  tokenUsage: v.optional(tokenUsage),
  costEstimate: v.optional(v.number()),
  startedAt: v.number(),
  finishedAt: v.optional(v.number()),
});

/** Paginated pipeline activity with optional kind/status filters (Activity page). */
export const activityPage = query({
  args: {
    paginationOpts: paginationOptsValidator,
    kind: v.optional(pipelineKind),
    status: v.optional(pipelineRunStatus),
  },
  handler: async (ctx, { paginationOpts, kind, status }) => {
    await getCurrentUserOrThrow(ctx);
    if (kind) {
      return await ctx.db
        .query("pipelineRuns")
        .withIndex("by_kind_and_status", (q) =>
          status ? q.eq("kind", kind).eq("status", status) : q.eq("kind", kind),
        )
        .order("desc")
        .paginate(paginationOpts);
    }
    if (status) {
      return await ctx.db
        .query("pipelineRuns")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .paginate(paginationOpts);
    }
    return await ctx.db
      .query("pipelineRuns")
      .withIndex("by_startedAt")
      .order("desc")
      .paginate(paginationOpts);
  },
});

/** Recent pipeline activity, newest first — drives the live activity feed. */
export const recentActivity = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(pipelineRunDoc),
  handler: async (ctx, { limit }) => {
    await getCurrentUserOrThrow(ctx);
    return await ctx.db
      .query("pipelineRuns")
      .withIndex("by_startedAt")
      .order("desc")
      .take(Math.min(limit ?? 20, 50));
  },
});
