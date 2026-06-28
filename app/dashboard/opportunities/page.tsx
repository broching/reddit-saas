"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery, usePaginatedQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { IconUsers } from "@tabler/icons-react"

const ALL = "__all__"

function scoreColor(score: number): string {
  if (score >= 70) return "bg-green-600"
  if (score >= 45) return "bg-amber-500"
  return "bg-muted-foreground"
}

export default function OpportunitiesPage() {
  const [industry, setIndustry] = React.useState<string | undefined>(undefined)
  const industries = useQuery(api.opportunities.queries.industries, {})
  const { results, status, loadMore } = usePaginatedQuery(
    api.opportunities.queries.list,
    { industry },
    { initialNumItems: 12 },
  )

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Opportunities</h1>
          <p className="text-muted-foreground">
            AI-generated SaaS opportunities, highest scoring first.
          </p>
        </div>
        <Select
          value={industry ?? ALL}
          onValueChange={(v) => setIndustry(v === ALL ? undefined : v)}
        >
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="All industries" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All industries</SelectItem>
            {industries?.map((i) => (
              <SelectItem key={i} value={i}>
                {i}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {status === "LoadingFirstPage" && (
          <div className="text-muted-foreground">Loading…</div>
        )}
        {results.length === 0 && status !== "LoadingFirstPage" && (
          <div className="text-muted-foreground">
            No opportunities yet. They generate from problem clusters on a
            schedule.
          </div>
        )}
        {results.map((o) => (
          <Link key={o._id} href={`/dashboard/opportunities/${o.slug}`}>
            <Card className="h-full transition-colors hover:border-primary/50">
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="min-w-0 break-words text-lg font-semibold">{o.title}</h2>
                  <span
                    className={`inline-flex shrink-0 items-center rounded px-2 py-0.5 text-sm font-bold text-white ${scoreColor(
                      o.opportunityScore,
                    )}`}
                  >
                    {o.opportunityScore}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="max-w-full truncate">
                    {o.industry}
                  </Badge>
                  <Badge variant="secondary" className="gap-1">
                    <IconUsers className="size-3" />
                    {o.mentionCount}
                  </Badge>
                  {o.trendDirection !== "steady" && (
                    <Badge variant="secondary">{o.trendDirection}</Badge>
                  )}
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                  {o.aiSummary}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {status === "CanLoadMore" && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => loadMore(12)}>
            Load more
          </Button>
        </div>
      )}
    </div>
  )
}
