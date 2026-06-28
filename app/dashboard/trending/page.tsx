"use client"

import Link from "next/link"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { IconTrendingUp, IconTrendingDown, IconMinus, IconSparkles } from "@tabler/icons-react"

function Sparkline({ series }: { series: { t: number; count: number }[] }) {
  const w = 140
  const h = 36
  const max = Math.max(1, ...series.map((p) => p.count))
  const n = series.length
  const pts = series
    .map((p, i) => `${(i / Math.max(1, n - 1)) * w},${h - (p.count / max) * (h - 4) - 2}`)
    .join(" ")
  return (
    <svg width={w} height={h} className="text-primary">
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

const DIR: Record<string, { icon: typeof IconMinus; cls: string; label: string }> = {
  rising: { icon: IconTrendingUp, cls: "text-green-600", label: "Rising" },
  declining: { icon: IconTrendingDown, cls: "text-destructive", label: "Declining" },
  new: { icon: IconSparkles, cls: "text-blue-600", label: "New" },
  steady: { icon: IconMinus, cls: "text-muted-foreground", label: "Steady" },
}

export default function TrendingPage() {
  const trends = useQuery(api.trending.queries.top, { limit: 30 })

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold">Trending Problems</h1>
        <p className="text-muted-foreground">
          Problem clusters by mention velocity over the last 14 days.
        </p>
      </div>

      <div className="grid gap-3">
        {trends === undefined && <div className="text-muted-foreground">Loading…</div>}
        {trends?.length === 0 && (
          <div className="text-muted-foreground">
            No trend data yet. Trends build as problems are clustered over time.
          </div>
        )}
        {trends?.map((t) => {
          const d = DIR[t.direction] ?? DIR.steady
          const Icon = d.icon
          const inner = (
            <Card className="transition-colors hover:border-primary/50">
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon className={`size-4 ${d.cls}`} />
                    <span className="truncate font-medium">{t.title}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {t.industry && <Badge variant="outline">{t.industry}</Badge>}
                    <span>{t.velocity} mentions / 7d</span>
                    {t.growthRate !== 0 && (
                      <span className={d.cls}>
                        {t.growthRate > 0 ? "+" : ""}
                        {Math.round(t.growthRate * 100)}%
                      </span>
                    )}
                  </div>
                </div>
                <Sparkline series={t.series} />
              </CardContent>
            </Card>
          )
          return t.slug ? (
            <Link key={t.clusterId} href={`/dashboard/opportunities/${t.slug}`}>
              {inner}
            </Link>
          ) : (
            <div key={t.clusterId}>{inner}</div>
          )
        })}
      </div>
    </div>
  )
}
