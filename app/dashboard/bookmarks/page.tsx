"use client"

import Link from "next/link"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { IconBookmark } from "@tabler/icons-react"

function scoreColor(score: number): string {
  if (score >= 70) return "bg-green-600"
  if (score >= 45) return "bg-amber-500"
  return "bg-muted-foreground"
}

export default function BookmarksPage() {
  const bookmarks = useQuery(api.bookmarks.list, {})

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold">Bookmarks</h1>
        <p className="text-muted-foreground">Opportunities you&apos;ve saved.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {bookmarks === undefined && (
          <div className="text-muted-foreground">Loading…</div>
        )}
        {bookmarks?.length === 0 && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <IconBookmark className="size-4" />
            No bookmarks yet. Open an opportunity and hit Save.
          </div>
        )}
        {bookmarks?.map((o) => (
          <Link key={o._id} href={`/dashboard/opportunities/${o.slug}`}>
            <Card className="h-full transition-colors hover:border-primary/50">
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="min-w-0 break-words text-lg font-semibold">
                    {o.title}
                  </h2>
                  <span
                    className={`inline-flex shrink-0 items-center rounded px-2 py-0.5 text-sm font-bold text-white ${scoreColor(
                      o.opportunityScore,
                    )}`}
                  >
                    {o.opportunityScore}
                  </span>
                </div>
                <div className="mt-1">
                  <Badge variant="outline" className="max-w-full truncate">
                    {o.industry}
                  </Badge>
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                  {o.aiSummary}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
