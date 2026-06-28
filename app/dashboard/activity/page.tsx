"use client"

import * as React from "react"
import { usePaginatedQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Doc } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ActivityItem } from "@/components/activity-feed"

const ALL = "__all__"
const KINDS = ["crawl", "analyze", "embed", "cluster", "trend"] as const
const STATUSES = ["running", "success", "error", "retrying"] as const

type Kind = (typeof KINDS)[number]
type Status = (typeof STATUSES)[number]

export default function ActivityPage() {
  const [kind, setKind] = React.useState<Kind | undefined>(undefined)
  const [status, setStatus] = React.useState<Status | undefined>(undefined)
  const [text, setText] = React.useState("")

  const { results, status: loadStatus, loadMore } = usePaginatedQuery(
    api.ops.activityPage,
    { kind, status },
    { initialNumItems: 30 },
  )

  // Client-side text filter over the loaded pages (message/label).
  const q = text.trim().toLowerCase()
  const filtered = q
    ? results.filter((r) =>
        `${r.message ?? ""} ${r.label ?? ""}`.toLowerCase().includes(q),
      )
    : results

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold">Activity</h1>
        <p className="text-muted-foreground">
          Crawl, analysis, clustering, and opportunity runs.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Filter by text…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={kind ?? ALL}
          onValueChange={(v) => setKind(v === ALL ? undefined : (v as Kind))}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All kinds" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All kinds</SelectItem>
            {KINDS.map((k) => (
              <SelectItem key={k} value={k} className="capitalize">
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status ?? ALL}
          onValueChange={(v) =>
            setStatus(v === ALL ? undefined : (v as Status))
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="divide-y rounded-lg border">
        {loadStatus === "LoadingFirstPage" && (
          <div className="px-4 py-3 text-sm text-muted-foreground">Loading…</div>
        )}
        {filtered.length === 0 && loadStatus !== "LoadingFirstPage" && (
          <div className="px-4 py-3 text-sm text-muted-foreground">
            No activity matches these filters.
          </div>
        )}
        {filtered.map((r) => (
          <ActivityItem key={r._id} run={r as Doc<"pipelineRuns">} />
        ))}
      </div>

      {loadStatus === "CanLoadMore" && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => loadMore(30)}>
            Load more
          </Button>
        </div>
      )}
    </div>
  )
}
