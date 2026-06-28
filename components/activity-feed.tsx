"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Doc } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { IconLoader2, IconCircleCheck, IconAlertTriangle } from "@tabler/icons-react"

export function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

/** Thin progress bar (0–1). */
function ProgressBar({ value }: { value: number }) {
  return (
    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all duration-500"
        style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }}
      />
    </div>
  )
}

/** One activity row — shared by the live feed and the Activity page. */
export function ActivityItem({ run }: { run: Doc<"pipelineRuns"> }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {run.status === "running" && (
            <IconLoader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          )}
          {run.status === "success" && (
            <IconCircleCheck className="size-4 shrink-0 text-green-600" />
          )}
          {(run.status === "error" || run.status === "retrying") && (
            <IconAlertTriangle className="size-4 shrink-0 text-destructive" />
          )}
          <Badge variant="outline" className="shrink-0 text-[10px] capitalize">
            {run.kind}
          </Badge>
          <span className="truncate text-sm">
            {run.message ?? run.label ?? run.kind}
          </span>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {timeAgo(run.startedAt)}
        </span>
      </div>
      {run.status === "running" && <ProgressBar value={run.progress ?? 0} />}
      {run.status === "error" && run.error && (
        <p className="mt-1 truncate text-xs text-destructive/80">{run.error}</p>
      )}
    </div>
  )
}

/**
 * Live feed of recent pipeline activity. Reactively updates as runs progress.
 */
export function ActivityFeed({ limit = 12 }: { limit?: number }) {
  const runs = useQuery(api.ops.recentActivity, { limit })
  const runningCount = runs?.filter((r) => r.status === "running").length ?? 0

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Activity</h2>
          {runningCount > 0 && (
            <Badge variant="secondary" className="gap-1">
              <IconLoader2 className="size-3 animate-spin" />
              {runningCount} running
            </Badge>
          )}
        </div>
        <a href="/dashboard/activity" className="text-xs text-muted-foreground hover:text-foreground">
          View all →
        </a>
      </div>
      <div className="divide-y">
        {runs === undefined && (
          <div className="px-4 py-3 text-sm text-muted-foreground">Loading…</div>
        )}
        {runs?.length === 0 && (
          <div className="px-4 py-3 text-sm text-muted-foreground">
            No activity yet. Trigger a crawl to see live progress here.
          </div>
        )}
        {runs?.map((r) => (
          <ActivityItem key={r._id} run={r as Doc<"pipelineRuns">} />
        ))}
      </div>
    </div>
  )
}
