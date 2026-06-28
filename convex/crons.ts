import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Tick every 5 minutes; `crawlAllEnabled` only schedules sources that are
// "due" per their own `crawlIntervalMinutes` (default 15). Apify returns posts
// and their comments in a single run, so there is no separate comment-sync job.
crons.interval(
  "crawl reddit",
  { minutes: 5 },
  internal.reddit.crawler.crawlAllEnabled,
  {},
);

// Analyze a batch of pending documents through the AI pipeline (budget-gated).
crons.interval(
  "analyze documents",
  { minutes: 5 },
  internal.ai.pipeline.analyzeQueue,
  {},
);

// Embed + cluster analyzed problems not yet assigned to a cluster.
crons.interval(
  "cluster problems",
  { minutes: 5 },
  internal.clustering.assign.clusterQueue,
  {},
);

// Generate SaaS opportunities for clusters that don't have one yet.
crons.interval(
  "build opportunities",
  { minutes: 10 },
  internal.opportunities.build.opportunityQueue,
  {},
);

// Recompute trend velocity/growth/direction from day buckets.
crons.interval(
  "compute trends",
  { hours: 6 },
  internal.trending.compute.computeTrends,
  {},
);

export default crons;
