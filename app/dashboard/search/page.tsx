"use client"

import * as React from "react"
import Link from "next/link"
import { useAction, useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { IconSearch, IconBookmark, IconX } from "@tabler/icons-react"

type Mode = "hybrid" | "semantic" | "keyword"
type Result = Awaited<ReturnType<ReturnType<typeof useAction<typeof api.search.search.run>>>>

function scoreColor(score: number): string {
  if (score >= 70) return "bg-green-600"
  if (score >= 45) return "bg-amber-500"
  return "bg-muted-foreground"
}

export default function SearchPage() {
  const runSearch = useAction(api.search.search.run)
  const saved = useQuery(api.savedSearches.list, {})
  const createSaved = useMutation(api.savedSearches.create)
  const removeSaved = useMutation(api.savedSearches.remove)

  const [text, setText] = React.useState("")
  const [mode, setMode] = React.useState<Mode>("hybrid")
  const [results, setResults] = React.useState<Result | null>(null)
  const [loading, setLoading] = React.useState(false)

  async function submit(t = text, m = mode) {
    if (!t.trim()) return
    setLoading(true)
    try {
      setResults(await runSearch({ text: t, mode: m }))
    } finally {
      setLoading(false)
    }
  }

  async function saveCurrent() {
    if (!text.trim()) return
    try {
      await createSaved({ name: text.trim(), query: { text: text.trim(), mode } })
      toast.success("Search saved")
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold">Search</h1>
        <p className="text-muted-foreground">
          Find opportunities by keyword or meaning (semantic).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Describe a problem or product, e.g. 'tracking client invoices'"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="w-full sm:max-w-md"
        />
        <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hybrid">Hybrid</SelectItem>
            <SelectItem value="semantic">Semantic</SelectItem>
            <SelectItem value="keyword">Keyword</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => submit()} disabled={loading}>
          <IconSearch className="size-4 sm:mr-2" />
          <span className="hidden sm:inline">
            {loading ? "Searching…" : "Search"}
          </span>
        </Button>
        <Button variant="outline" onClick={saveCurrent} disabled={!text.trim()}>
          <IconBookmark className="size-4 sm:mr-2" />
          <span className="hidden sm:inline">Save</span>
        </Button>
      </div>

      {saved && saved.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Saved:</span>
          {saved.map((s) => (
            <span
              key={s._id}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs"
            >
              <button
                onClick={() => {
                  setText(s.query.text)
                  setMode(s.query.mode)
                  submit(s.query.text, s.query.mode)
                }}
                className="hover:underline"
              >
                {s.name}
              </button>
              <button onClick={() => removeSaved({ id: s._id })}>
                <IconX className="size-3 text-muted-foreground hover:text-foreground" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {results?.length === 0 && (
          <div className="text-muted-foreground">No matches found.</div>
        )}
        {results?.map((r) => (
          <Link key={r.slug} href={`/dashboard/opportunities/${r.slug}`}>
            <Card className="h-full transition-colors hover:border-primary/50">
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold">{r.title}</h2>
                  <span
                    className={`inline-flex shrink-0 items-center rounded px-2 py-0.5 text-sm font-bold text-white ${scoreColor(
                      r.opportunityScore,
                    )}`}
                  >
                    {r.opportunityScore}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant="outline">{r.industry}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(r.matchScore * 100)}% match
                  </span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                  {r.aiSummary}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
