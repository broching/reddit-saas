import { ApifyRedditInput, ApifyRedditItem } from "./types";

const ACTOR = "trudax~reddit-scraper-lite";
const API_BASE = "https://api.apify.com/v2";

export type ApifyRunStatus =
  | "READY"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "ABORTED"
  | "TIMING-OUT"
  | "TIMED-OUT"
  | string;

function token(): string {
  const t = process.env.APIFY_TOKEN;
  if (!t) {
    throw new Error(
      "Missing APIFY_TOKEN. Set it via `npx convex env set APIFY_TOKEN <token>`.",
    );
  }
  return t;
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 60_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Apify ${res.status}: ${text.slice(0, 300)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Starts an actor run asynchronously and returns identifiers to poll/collect.
 * We do NOT hold the connection open — Reddit scrapes with comments can run for
 * minutes, so the crawler polls the run and collects the dataset when it ends.
 */
export async function startRedditScraperRun(
  input: ApifyRedditInput,
): Promise<{ runId: string; datasetId: string }> {
  const json = await fetchJson(
    `${API_BASE}/acts/${ACTOR}/runs?token=${token()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    30_000,
  );
  const data = json?.data;
  if (!data?.id || !data?.defaultDatasetId) {
    throw new Error("Apify run start returned no run id / dataset id");
  }
  return { runId: data.id, datasetId: data.defaultDatasetId };
}

/** Returns the current status of an actor run. */
export async function getRunStatus(
  runId: string,
): Promise<{ status: ApifyRunStatus; itemCount?: number }> {
  const json = await fetchJson(
    `${API_BASE}/actor-runs/${runId}?token=${token()}`,
    undefined,
    30_000,
  );
  return {
    status: json?.data?.status as ApifyRunStatus,
    itemCount: json?.data?.stats?.itemCount,
  };
}

/** Fetches all dataset items for a finished run (drops the bulky `html` field). */
export async function getDatasetItems(
  datasetId: string,
): Promise<ApifyRedditItem[]> {
  const params = new URLSearchParams({
    token: token(),
    clean: "true",
    format: "json",
    omit: "html",
  });
  const items = await fetchJson(
    `${API_BASE}/datasets/${datasetId}/items?${params.toString()}`,
    undefined,
    120_000,
  );
  return Array.isArray(items) ? (items as ApifyRedditItem[]) : [];
}

/** True once the run has reached a terminal state. */
export function isTerminal(status: ApifyRunStatus): boolean {
  return (
    status === "SUCCEEDED" ||
    status === "FAILED" ||
    status === "ABORTED" ||
    status === "TIMED-OUT"
  );
}

export type { ApifyRedditInput };
