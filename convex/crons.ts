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

export default crons;
