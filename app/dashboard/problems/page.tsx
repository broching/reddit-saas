"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

function scoreColor(score: number): string {
  if (score >= 70) return "bg-green-600"
  if (score >= 45) return "bg-amber-500"
  return "bg-muted-foreground"
}

export default function ProblemsPage() {
  const problems = useQuery(api.ai.queries.topProblems, { limit: 50 })

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold">Problems</h1>
        <p className="text-muted-foreground">
          Highest-scoring business problems extracted by the AI pipeline.
        </p>
      </div>

      <div className="grid gap-3">
        {problems === undefined && (
          <div className="text-muted-foreground">Loading…</div>
        )}
        {problems?.length === 0 && (
          <div className="text-muted-foreground">
            No analyzed problems yet. The pipeline analyzes ingested posts on a
            schedule — check back after a crawl + analysis cycle.
          </div>
        )}
        {problems?.map((p) => (
          <Card key={p.documentId}>
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 inline-flex shrink-0 items-center rounded px-2 py-0.5 text-sm font-bold text-white ${scoreColor(
                    p.opportunityScore,
                  )}`}
                >
                  {p.opportunityScore}
                </span>
                <div className="min-w-0">
                  <p className="font-medium">{p.problemStatement}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">r/{p.channel}</Badge>
                    <Badge variant="secondary">{p.industry}</Badge>
                    <span>{p.who}</span>
                    {p.willingnessToPay && <span>· WTP: {p.willingnessToPay}</span>}
                    {p.marketSizeEstimate && <span>· {p.marketSizeEstimate}</span>}
                    <span>· severity {p.severity}/5</span>
                    {p.url && (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-foreground"
                      >
                        source ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
