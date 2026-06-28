"use client"

import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { timeAgo } from "@/components/activity-feed"
import { IconRefresh } from "@tabler/icons-react"

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  )
}

export default function AdminAnalyticsPage() {
  const me = useQuery(api.users.current)
  const isAdmin = me?.role === "admin"

  const overview = useQuery(api.admin.overview, isAdmin ? {} : "skip")
  const history = useQuery(api.admin.usageHistory, isAdmin ? { days: 14 } : "skip")
  const deadLetter = useQuery(api.admin.deadLetter, isAdmin ? { limit: 30 } : "skip")
  const requeueErrored = useMutation(api.admin.requeueErrored)
  const reprocess = useMutation(api.admin.reprocessDocument)

  if (me === undefined) return <div className="p-6 text-muted-foreground">Loading…</div>
  if (!isAdmin) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="mt-2 text-muted-foreground">
          This page requires the <span className="font-mono">admin</span> role.
        </p>
      </div>
    )
  }

  const u = overview?.usageToday
  const usagePct = u ? Math.min(100, Math.round((u.llmTokens / u.ceiling) * 100)) : 0
  const maxCost = Math.max(1, ...(history?.map((h) => h.estCostUsd) ?? [1]))

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">Pipeline throughput, corpus, and cost.</p>
      </div>

      {/* Corpus + pipeline counts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Opportunities" value={overview?.opportunities ?? "—"} />
        <Stat label="Clusters" value={overview?.clusters ?? "—"} />
        <Stat label="Problems" value={overview?.problems ?? "—"} />
        <Stat label="Analyzed" value={overview?.documents.analyzed ?? "—"} />
        <Stat label="Pending" value={overview?.documents.pending ?? "—"} />
        <Stat label="Errored" value={overview?.documents.errored ?? "—"} />
      </div>

      {/* Today usage */}
      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s AI usage</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="LLM tokens" value={u?.llmTokens.toLocaleString() ?? "—"} />
            <Stat label="Est. cost" value={u ? `$${u.estCostUsd.toFixed(3)}` : "—"} />
            <Stat label="Docs analyzed" value={u?.documentsAnalyzed ?? "—"} />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>Daily token budget</span>
              <span>{usagePct}% of {u?.ceiling.toLocaleString()}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${usagePct >= 90 ? "bg-destructive" : "bg-primary"}`}
                style={{ width: `${usagePct}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cost history */}
      <Card>
        <CardHeader>
          <CardTitle>Daily cost (last 14 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {history && history.length > 0 ? (
            <div className="flex h-32 items-end gap-1">
              {history.map((h) => (
                <div key={h.date} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-primary/70"
                    style={{ height: `${(h.estCostUsd / maxCost) * 100}%` }}
                    title={`${h.date}: $${h.estCostUsd.toFixed(3)}`}
                  />
                  <span className="text-[9px] text-muted-foreground">
                    {h.date.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No usage history yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Dead-letter */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>
            Dead-letter{" "}
            {overview && overview.deadLetter > 0 && (
              <Badge variant="destructive">{overview.deadLetter}</Badge>
            )}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await requeueErrored({})
              toast.success("Errored documents requeued")
            }}
          >
            <IconRefresh className="mr-2 size-4" />
            Requeue all
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {deadLetter?.length === 0 && (
            <p className="text-sm text-muted-foreground">No failed runs. 🎉</p>
          )}
          {deadLetter?.map((d) => (
            <div
              key={d._id}
              className="flex items-start justify-between gap-3 rounded border p-2 text-sm"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="capitalize">
                    {d.kind}
                  </Badge>
                  <span className="truncate">{d.message ?? d.label}</span>
                </div>
                {d.error && (
                  <p className="mt-1 truncate text-xs text-destructive/80">
                    {d.error}
                  </p>
                )}
                <span className="text-xs text-muted-foreground">
                  {timeAgo(d.startedAt)}
                </span>
              </div>
              {d.kind === "analyze" && d.targetId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await reprocess({
                      documentId: d.targetId as Id<"documents">,
                    })
                    toast.success("Reprocessing scheduled")
                  }}
                >
                  Retry
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
