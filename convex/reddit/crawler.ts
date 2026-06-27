import { v } from "convex/values";
import { internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  getDatasetItems,
  getRunStatus,
  isTerminal,
  startRedditScraperRun,
} from "./client";
import { ApifyRedditInput } from "./types";
import { apifyItemToDocumentInput } from "../ingest/normalize";
import type { DocumentInput } from "../ingest/normalize";

const REDDIT_BASE = "https://www.reddit.com";
const UPSERT_BATCH = 100;
// Apify accounts cap concurrent actor runs; stagger fan-out so per-source runs
// don't all start at once.
const FANOUT_STAGGER_MS = 20_000;
const DEFAULT_INTERVAL_MINUTES = 15;

// Polling: first check after FIRST_POLL_MS, then every POLL_INTERVAL_MS, giving
// runs up to ~15 min to finish before we give up.
const FIRST_POLL_MS = 20_000;
const POLL_INTERVAL_MS = 15_000;
const MAX_POLL_ATTEMPTS = 60;

const DEFAULTS = {
  maxItems: 60,
  maxPostCount: 25,
  maxComments: 15,
  includeComments: true,
};

type SourceConfig = Partial<typeof DEFAULTS> & { time?: string };

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Start an Apify Reddit scrape for one source, then hand off to `collectRun`
 * which polls the run and ingests the dataset when it finishes. Async because
 * scrapes (especially with comments) can run for several minutes.
 */
export const crawlSource = internalAction({
  args: { sourceId: v.id("sources") },
  returns: v.object({ started: v.boolean() }),
  handler: async (ctx, { sourceId }) => {
    const cx = await ctx.runQuery(internal.reddit.state.getCrawlContext, {
      sourceId,
    });
    if (!cx || !cx.enabled) return { started: false };

    const pipelineRunId = await ctx.runMutation(internal.ops.startRun, {
      kind: "crawl",
      label: `r/${cx.channel}`,
      targetId: sourceId,
      message: `Starting crawl of r/${cx.channel}…`,
    });

    try {
      const cfg: SourceConfig = { ...DEFAULTS, ...(cx.config ?? {}) };
      const watermark = cx.lastWatermark ?? 0;

      const input: ApifyRedditInput = {
        startUrls: [{ url: `${REDDIT_BASE}/r/${cx.channel}/new/` }],
        sort: "new",
        includeMediaLinks: true, // needed for upVotes / upVoteRatio / numberOfComments
        skipUserPosts: true,
        skipCommunity: true,
        skipComments: !cfg.includeComments,
        maxItems: cfg.maxItems,
        maxPostCount: cfg.maxPostCount,
        maxComments: cfg.includeComments ? cfg.maxComments : 0,
        postDateLimit:
          watermark > 0 ? new Date(watermark).toISOString() : undefined,
        time: cfg.time,
        proxy: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
      };

      const { runId, datasetId } = await startRedditScraperRun(input);

      await ctx.runMutation(internal.ops.updateRun, {
        runId: pipelineRunId,
        message: `Scraping r/${cx.channel} on Apify…`,
        progress: 0.1,
      });

      await ctx.scheduler.runAfter(
        FIRST_POLL_MS,
        internal.reddit.crawler.collectRun,
        {
          sourceId,
          channel: cx.channel,
          apifyRunId: runId,
          datasetId,
          pipelineRunId,
          watermark,
          attempt: 0,
        },
      );
      return { started: true };
    } catch (err) {
      await ctx.runMutation(internal.reddit.state.recordCrawlError, {
        sourceId,
        error: (err as Error).message,
      });
      await ctx.runMutation(internal.ops.finishRun, {
        runId: pipelineRunId,
        status: "error",
        message: `r/${cx.channel} crawl failed to start`,
        error: (err as Error).message,
      });
      return { started: false };
    }
  },
});

/** Poll a running Apify scrape; ingest its dataset once it reaches SUCCEEDED. */
export const collectRun = internalAction({
  args: {
    sourceId: v.id("sources"),
    channel: v.string(),
    apifyRunId: v.string(),
    datasetId: v.string(),
    pipelineRunId: v.id("pipelineRuns"),
    watermark: v.number(),
    attempt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { sourceId, channel, apifyRunId, datasetId, pipelineRunId } = args;

    const fail = async (message: string, error: string) => {
      await ctx.runMutation(internal.reddit.state.recordCrawlError, {
        sourceId,
        error,
      });
      await ctx.runMutation(internal.ops.finishRun, {
        runId: pipelineRunId,
        status: "error",
        message,
        error,
      });
    };

    try {
      const { status } = await getRunStatus(apifyRunId);

      if (!isTerminal(status)) {
        if (args.attempt >= MAX_POLL_ATTEMPTS) {
          await fail(`r/${channel} crawl timed out`, "Polling timed out");
          return null;
        }
        await ctx.runMutation(internal.ops.updateRun, {
          runId: pipelineRunId,
          message: `Scraping r/${channel}… (${status.toLowerCase()})`,
          progress: Math.min(0.9, 0.1 + args.attempt * 0.02),
        });
        await ctx.scheduler.runAfter(
          POLL_INTERVAL_MS,
          internal.reddit.crawler.collectRun,
          { ...args, attempt: args.attempt + 1 },
        );
        return null;
      }

      if (status !== "SUCCEEDED") {
        await fail(`r/${channel} crawl ${status.toLowerCase()}`, `Run ${status}`);
        return null;
      }

      // SUCCEEDED — ingest the dataset.
      await ctx.runMutation(internal.ops.updateRun, {
        runId: pipelineRunId,
        message: `Ingesting r/${channel} results…`,
        progress: 0.92,
      });

      const items = await getDatasetItems(datasetId);
      const docs: DocumentInput[] = [];
      let newWatermark = args.watermark;
      let posts = 0;
      for (const item of items) {
        const doc = apifyItemToDocumentInput(item, sourceId, channel);
        if (!doc) continue;
        docs.push(doc);
        if (doc.sourceType === "post") {
          posts++;
          newWatermark = Math.max(newWatermark, doc.createdAt);
        }
      }

      let inserted = 0;
      for (const batch of chunk(docs, UPSERT_BATCH)) {
        const res = await ctx.runMutation(
          internal.ingest.upsert.upsertDocuments,
          { docs: batch },
        );
        inserted += res.inserted;
      }

      await ctx.runMutation(internal.reddit.state.updateCrawlState, {
        sourceId,
        lastWatermark: newWatermark,
        status: "ok",
      });
      // An empty dataset from a SUCCEEDED run usually means Reddit blocked the
      // scrape (403) rather than "no new posts" — surface it so it's not
      // mistaken for clean success. The next scheduled crawl retries.
      const message =
        items.length === 0
          ? `r/${channel}: no items returned (source may be rate-limited; will retry)`
          : `r/${channel}: +${inserted} new (${posts} posts, ${items.length} items)`;
      await ctx.runMutation(internal.ops.finishRun, {
        runId: pipelineRunId,
        status: "success",
        message,
      });
      return null;
    } catch (err) {
      await fail(`r/${channel} ingest failed`, (err as Error).message);
      return null;
    }
  },
});

/**
 * Cron entry point: fan out a crawl for every enabled source that is "due" per
 * its own `crawlIntervalMinutes`. Pass `force: true` to ignore the schedule.
 */
export const crawlAllEnabled = internalMutation({
  args: { force: v.optional(v.boolean()) },
  returns: v.object({ scheduled: v.number() }),
  handler: async (ctx, { force }) => {
    const sources = await ctx.db
      .query("sources")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .take(500);

    const now = Date.now();
    let scheduled = 0;
    for (const s of sources) {
      if (!force) {
        const state = await ctx.db
          .query("sourceState")
          .withIndex("by_sourceId", (q) => q.eq("sourceId", s._id))
          .unique();
        const intervalMs =
          (s.crawlIntervalMinutes ?? DEFAULT_INTERVAL_MINUTES) * 60_000;
        const due =
          !state?.lastCrawlAt || now - state.lastCrawlAt >= intervalMs;
        if (!due) continue;
      }
      await ctx.scheduler.runAfter(
        scheduled * FANOUT_STAGGER_MS,
        internal.reddit.crawler.crawlSource,
        { sourceId: s._id },
      );
      scheduled++;
    }
    return { scheduled };
  },
});
