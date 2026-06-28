"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { IconArrowLeft, IconBookmark, IconBookmarkFilled } from "@tabler/icons-react"

function BookmarkButton({ opportunityId }: { opportunityId: Id<"opportunities"> }) {
  const bookmarked = useQuery(api.bookmarks.isBookmarked, { opportunityId })
  const toggle = useMutation(api.bookmarks.toggle)
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => toggle({ opportunityId })}
    >
      {bookmarked ? (
        <IconBookmarkFilled className="size-4 sm:mr-2" />
      ) : (
        <IconBookmark className="size-4 sm:mr-2" />
      )}
      <span className="hidden sm:inline">
        {bookmarked ? "Saved" : "Save"}
      </span>
    </Button>
  )
}

function scoreColor(score: number): string {
  if (score >= 70) return "bg-green-600"
  if (score >= 45) return "bg-amber-500"
  return "bg-muted-foreground"
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="py-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        {children}
      </CardContent>
    </Card>
  )
}

function Pills({ items }: { items?: string[] }) {
  if (!items?.length) return <p className="text-sm text-muted-foreground">—</p>
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it, i) => (
        <span
          key={i}
          className="inline-flex max-w-full items-center whitespace-normal break-words rounded-md bg-secondary px-2 py-0.5 text-xs font-normal text-secondary-foreground"
        >
          {it}
        </span>
      ))}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

export default function OpportunityDetailPage() {
  const params = useParams()
  const slug = params.slug as string
  const data = useQuery(api.opportunities.queries.getBySlug, { slug })

  if (data === undefined) {
    return <div className="p-6 text-muted-foreground">Loading…</div>
  }
  if (data === null) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Opportunity not found.</p>
        <Link href="/dashboard/opportunities" className="underline">
          Back to opportunities
        </Link>
      </div>
    )
  }

  const { opportunity: o, sources } = data
  const s = o.scores

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <Link
        href="/dashboard/opportunities"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <IconArrowLeft className="size-4" /> Opportunities
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold sm:text-3xl">{o.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{o.industry}</Badge>
            <Badge variant="secondary">{o.mentionCount} mentions</Badge>
            <Badge variant="secondary">{o.trendDirection}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <BookmarkButton opportunityId={o._id} />
          <span
            className={`inline-flex items-center rounded-lg px-4 py-2 text-2xl font-bold text-white ${scoreColor(
              o.opportunityScore,
            )}`}
          >
            {o.opportunityScore}
          </span>
        </div>
      </div>

      {/* Scores */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <Stat label="Opportunity" value={s.opportunity} />
        <Stat label="Market" value={s.marketSize} />
        <Stat label="Viability" value={s.viability} />
        <Stat label="WTP" value={s.willingnessToPay} />
        <Stat label="Complexity" value={s.complexity} />
        <Stat label="Confidence" value={Math.round(s.confidence * 100)} />
      </div>

      {/* Problem */}
      <Section title="The Problem">
        <p className="text-sm">{o.problemSummary}</p>
        {o.painPoints.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {o.painPoints.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}
      </Section>

      {/* SaaS idea */}
      {o.saas && (
        <Section title="Suggested SaaS">
          <p className="text-sm">{o.saas.summary}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-xs font-medium text-muted-foreground">Ideal customer</div>
              <p className="text-sm">{o.saas.icp}</p>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">Competitive advantage</div>
              <p className="text-sm">{o.saas.advantage}</p>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">Monetization</div>
              <p className="text-sm">{o.saas.monetization}</p>
            </div>
          </div>
          <div className="mt-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">Features</div>
            <Pills items={o.saas.features} />
          </div>
        </Section>
      )}

      {/* Pricing */}
      {o.saas?.pricing && o.saas.pricing.length > 0 && (
        <Section title="Pricing">
          <div className="grid gap-3 sm:grid-cols-3">
            {o.saas.pricing.map((tier, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="font-semibold">{tier.tier}</div>
                <div className="text-lg">{tier.price}</div>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {tier.features.map((f, j) => (
                    <li key={j}>• {f}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Competition */}
      {o.competition && (
        <Section title="Competition">
          <div className="flex gap-2">
            <Badge variant={o.competition.saturated ? "destructive" : "secondary"}>
              {o.competition.saturated ? "Saturated" : "Not saturated"}
            </Badge>
            <Badge variant={o.competition.underserved ? "default" : "secondary"}>
              {o.competition.underserved ? "Underserved" : "Well served"}
            </Badge>
          </div>
          {o.competition.existingProducts.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Existing products</div>
              <ul className="space-y-1 text-sm">
                {o.competition.existingProducts.map((p, i) => (
                  <li key={i}>
                    <span className="font-medium">{p.name}</span>
                    {p.note ? ` — ${p.note}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {o.competition.gaps.length > 0 && (
            <div className="mt-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">Gaps</div>
              <Pills items={o.competition.gaps} />
            </div>
          )}
        </Section>
      )}

      {/* Tech spec */}
      {o.techSpec && (
        <Section title="Technical Specification">
          <p className="text-sm">{o.techSpec.architecture}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Auth">{o.techSpec.auth}</Field>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Recommended libraries</div>
              <Pills items={o.techSpec.libraries} />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Pages</div>
              <Pills items={o.techSpec.pages} />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Integrations</div>
              <Pills items={o.techSpec.integrations} />
            </div>
          </div>

          {o.techSpec.dbSchema.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Database schema</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {o.techSpec.dbSchema.map((t, i) => (
                  <div key={i} className="rounded border p-2 text-sm">
                    <div className="break-words font-mono font-medium">{t.table}</div>
                    <div className="break-words text-xs text-muted-foreground">
                      {t.fields.join(", ")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {o.techSpec.apiEndpoints.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 text-xs font-medium text-muted-foreground">API endpoints</div>
              <div className="space-y-1 text-xs">
                {o.techSpec.apiEndpoints.map((e, i) => (
                  <div key={i} className="break-words">
                    <span className="font-mono font-semibold">{e.method}</span>{" "}
                    <span className="font-mono">{e.path}</span>
                    <span className="text-muted-foreground"> — {e.purpose}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Build plan */}
      {o.buildPlan && (
        <Section title="Build Roadmap">
          <div className="flex gap-2">
            <Badge variant="outline">~{o.buildPlan.estimatedBuildTime}</Badge>
            <Badge variant="secondary">difficulty: {o.buildPlan.difficulty}</Badge>
          </div>
          <ol className="mt-3 space-y-2">
            {o.buildPlan.phases.map((p, i) => (
              <li key={i} className="rounded border p-2">
                <div className="text-sm font-medium">
                  {i + 1}. {p.name}
                </div>
                <div className="text-xs text-muted-foreground">{p.goal}</div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* Sources */}
      <Section title="Original Reddit Discussions">
        <div className="space-y-2">
          {sources.map((src) => (
            <a
              key={src._id}
              href={src.url}
              target="_blank"
              rel="noreferrer"
              className="block rounded border p-2 hover:border-primary/50"
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">r/{src.channel}</Badge>
                <span>{src.sourceType}</span>
                <span>▲ {src.score}</span>
                <span>u/{src.author ?? "—"}</span>
              </div>
              <p className="mt-1 text-sm">{src.title ?? src.body}</p>
            </a>
          ))}
        </div>
      </Section>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      <p className="text-sm">{children}</p>
    </div>
  )
}
