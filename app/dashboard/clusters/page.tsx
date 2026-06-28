"use client"

import * as React from "react"
import { useQuery, usePaginatedQuery } from "convex/react"
import { FunctionReturnType } from "convex/server"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  IconChevronDown,
  IconChevronUp,
  IconUsers,
  IconSearch,
} from "@tabler/icons-react"

type Cluster = FunctionReturnType<typeof api.clustering.queries.search>[number]

function ClusterMembers({ clusterId }: { clusterId: Id<"clusters"> }) {
  const members = useQuery(api.clustering.queries.members, { clusterId })
  if (members === undefined) {
    return <div className="px-4 py-3 text-sm text-muted-foreground">Loading…</div>
  }
  return (
    <div className="divide-y border-t">
      {members.map((m) => (
        <div key={m.documentId} className="px-3 py-3 sm:px-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <Badge variant="outline">r/{m.channel}</Badge>
            <span className="capitalize">{m.sourceType}</span>
            <span>· {(m.similarity * 100).toFixed(0)}% match</span>
            {m.author && <span>· u/{m.author}</span>}
            {m.url && (
              <a
                href={m.url}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-foreground"
              >
                source ↗
              </a>
            )}
          </div>

          {/* AI analysis */}
          {m.problemStatement && (
            <div className="mt-2 rounded-md border-l-2 border-primary/60 bg-primary/5 px-3 py-2">
              <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                AI analysis
              </div>
              <p className="text-sm">{m.problemStatement}</p>
            </div>
          )}

          {/* Original Reddit text */}
          <div className="mt-2 rounded-md border-l-2 border-muted-foreground/30 bg-muted/30 px-3 py-2">
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Original {m.sourceType}
            </div>
            {m.title && <p className="text-sm font-medium">{m.title}</p>}
            <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
              {m.body}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

function ClusterCard({ cluster }: { cluster: Cluster }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <IconUsers className="size-3" />
                {cluster.memberCount}
              </Badge>
              {cluster.industry && (
                <Badge variant="outline" className="max-w-full truncate">
                  {cluster.industry}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                cohesion {(cluster.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <p className="mt-2 break-words font-medium">{cluster.title}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground"
            onClick={() => setOpen((o) => !o)}
          >
            <span className="hidden sm:inline">{cluster.memberCount} mentions</span>
            {open ? (
              <IconChevronUp className="size-4 sm:ml-1" />
            ) : (
              <IconChevronDown className="size-4 sm:ml-1" />
            )}
          </Button>
        </div>
      </CardContent>
      {open && <ClusterMembers clusterId={cluster._id} />}
    </Card>
  )
}

export default function ClustersPage() {
  const [text, setText] = React.useState("")
  const [submitted, setSubmitted] = React.useState("")

  const searchResults = useQuery(
    api.clustering.queries.search,
    submitted ? { text: submitted } : "skip",
  )
  const {
    results: paged,
    status,
    loadMore,
  } = usePaginatedQuery(api.clustering.queries.list, {}, { initialNumItems: 20 })

  const isSearching = submitted.length > 0
  const clusters = isSearching ? searchResults : paged

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold">Problem Clusters</h1>
        <p className="text-muted-foreground">
          Similar problems grouped by semantic similarity, largest first.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Search clusters…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setSubmitted(text.trim())}
          className="max-w-md"
        />
        <Button onClick={() => setSubmitted(text.trim())}>
          <IconSearch className="size-4 sm:mr-2" />
          <span className="hidden sm:inline">Search</span>
        </Button>
        {isSearching && (
          <Button
            variant="ghost"
            onClick={() => {
              setText("")
              setSubmitted("")
            }}
          >
            Clear
          </Button>
        )}
      </div>

      <div className="grid gap-3">
        {clusters === undefined && (
          <div className="text-muted-foreground">Loading…</div>
        )}
        {clusters?.length === 0 && (
          <div className="text-muted-foreground">
            {isSearching
              ? "No clusters match your search."
              : "No clusters yet. They form as the pipeline analyzes and embeds problems."}
          </div>
        )}
        {clusters?.map((c) => (
          <ClusterCard key={c._id} cluster={c} />
        ))}
      </div>

      {!isSearching && status === "CanLoadMore" && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => loadMore(20)}>
            Load more
          </Button>
        </div>
      )}
    </div>
  )
}
