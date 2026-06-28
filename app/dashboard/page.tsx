"use client"

import Link from "next/link"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ActivityFeed, timeAgo } from "@/components/activity-feed"
import {
  IconSparkles,
  IconListDetails,
  IconBrandReddit,
  IconCircleCheck,
  IconClock,
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconArrowRight,
} from "@tabler/icons-react"

function Sparkline({ series }: { series: { t: number; count: number }[] }) {
  const w = 120
  const h = 28
  const max = Math.max(1, ...series.map((p) => p.count))
  const n = series.length
  const pts = series
    .map(
      (p, i) =>
        `${(i / Math.max(1, n - 1)) * w},${h - (p.count / max) * (h - 4) - 2}`,
    )
    .join(" ")
  return (
    <svg width={w} height={h} className="shrink-0 text-primary">
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  )
}

const DIR: Record<string, { icon: typeof IconMinus; cls: string }> = {
  rising: { icon: IconTrendingUp, cls: "text-green-600" },
  declining: { icon: IconTrendingDown, cls: "text-destructive" },
  new: { icon: IconSparkles, cls: "text-blue-600" },
  steady: { icon: IconMinus, cls: "text-muted-foreground" },
}

function scoreColor(score: number): string {
  if (score >= 75) return "bg-green-600 text-white"
  if (score >= 50) return "bg-amber-500 text-white"
  return "bg-muted text-muted-foreground"
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  href,
}: {
  icon: typeof IconSparkles
  label: string
  value: number | string
  sub?: string
  href?: string
}) {
  const inner = (
    <Card className={href ? "transition-colors hover:border-primary/50" : ""}>
      <CardContent className="flex items-center gap-3 py-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="text-2xl font-bold leading-none">{value}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {label}
            {sub ? ` · ${sub}` : ""}
          </div>
        </div>
      </CardContent>
    </Card>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

export default function DashboardHome() {
  const data = useQuery(api.dashboard.home, {})
  const c = data?.counts

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Opportunity Intelligence</h1>
          <p className="text-muted-foreground">
            Live view of what Reddit is complaining about — and the SaaS ideas
            it implies.
          </p>
        </div>
        {data?.lastUpdatedAt && (
          <span className="text-xs text-muted-foreground">
            Opportunities updated {timeAgo(data.lastUpdatedAt)}
          </span>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard
          icon={IconSparkles}
          label="Opportunities"
          value={c?.opportunities ?? "—"}
          href="/dashboard/opportunities"
        />
        <KpiCard
          icon={IconListDetails}
          label="Active clusters"
          value={c?.clusters ?? "—"}
          href="/dashboard/clusters"
        />
        <KpiCard
          icon={IconBrandReddit}
          label="Posts ingested"
          value={c?.posts ?? "—"}
          sub={c?.capped ? "1k+" : undefined}
          href="/dashboard/posts"
        />
        <KpiCard
          icon={IconCircleCheck}
          label="Analyzed"
          value={c?.analyzed ?? "—"}
        />
        <KpiCard
          icon={IconClock}
          label="In queue"
          value={c?.pending ?? "—"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Top opportunities */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Top opportunities</CardTitle>
              <Link
                href="/dashboard/opportunities"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                View all <IconArrowRight className="size-3" />
              </Link>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {data === undefined && (
                <p className="text-sm text-muted-foreground">Loading…</p>
              )}
              {data && data.topOpportunities.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No opportunities yet. They generate as problem clusters form.
                </p>
              )}
              {data?.topOpportunities.map((o) => (
                <Link
                  key={o._id}
                  href={`/dashboard/opportunities/${o.slug}`}
                  className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:border-primary/50"
                >
                  <span
                    className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-md text-sm font-bold ${scoreColor(o.opportunityScore)}`}
                  >
                    {o.opportunityScore}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{o.title}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {o.problemSummary}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {o.industry}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {o.mentionCount} mentions
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Trending */}
        <div>
          <Card className="h-full">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Trending</CardTitle>
              <Link
                href="/dashboard/trending"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                View all <IconArrowRight className="size-3" />
              </Link>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {data === undefined && (
                <p className="text-sm text-muted-foreground">Loading…</p>
              )}
              {data && data.trending.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No trend data yet.
                </p>
              )}
              {data?.trending.map((t) => {
                const d = DIR[t.direction] ?? DIR.steady
                const Icon = d.icon
                const inner = (
                  <div className="flex items-center justify-between gap-2 rounded-lg border p-2.5 transition-colors hover:border-primary/50">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Icon className={`size-3.5 shrink-0 ${d.cls}`} />
                        <span className="truncate text-sm font-medium">
                          {t.title}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {t.velocity} / 7d
                        {t.growthRate !== 0 && (
                          <span className={`ml-1 ${d.cls}`}>
                            {t.growthRate > 0 ? "+" : ""}
                            {Math.round(t.growthRate * 100)}%
                          </span>
                        )}
                      </span>
                    </div>
                    <Sparkline series={t.series} />
                  </div>
                )
                return t.slug ? (
                  <Link
                    key={t.clusterId}
                    href={`/dashboard/opportunities/${t.slug}`}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div key={t.clusterId}>{inner}</div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Live activity */}
      <ActivityFeed limit={10} />
    </div>
  )
}
