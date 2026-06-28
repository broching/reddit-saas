"use client"

import * as React from "react"
import { Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery, usePaginatedQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Doc, Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { IconMessage, IconChevronDown, IconChevronUp } from "@tabler/icons-react"

const ALL = "__all__"

type DocT = Doc<"documents">

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

/** Recursively render a comment and its replies, Reddit-style. */
function CommentNode({
  comment,
  childrenByParent,
  depth,
}: {
  comment: DocT
  childrenByParent: Map<string, DocT[]>
  depth: number
}) {
  const replies = childrenByParent.get(comment.externalId) ?? []
  return (
    <div className={depth === 0 ? "" : "border-l pl-2 sm:pl-3"}>
      <a
        href={comment.url}
        target="_blank"
        rel="noreferrer"
        className="block rounded py-2 transition-colors hover:bg-muted/40"
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            u/{comment.author ?? "—"}
          </span>
          <span>▲ {comment.score}</span>
          <span>· {timeAgo(comment.createdAt)} ago</span>
          {comment.analysisStatus === "analyzed" && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              analyzed
            </Badge>
          )}
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm">{comment.body}</p>
      </a>
      {replies.map((r) => (
        <CommentNode
          key={r._id}
          comment={r}
          childrenByParent={childrenByParent}
          depth={depth + 1}
        />
      ))}
    </div>
  )
}

function Thread({ post }: { post: DocT }) {
  const comments = useQuery(api.documents.thread, {
    postExternalId: post.externalId,
  })

  const { roots, childrenByParent } = React.useMemo(() => {
    const childrenByParent = new Map<string, DocT[]>()
    const roots: DocT[] = []
    if (!comments) return { roots, childrenByParent }
    const ids = new Set(comments.map((c) => c.externalId))
    for (const c of comments) {
      const parent = c.parentExternalId
      // Root if it hangs off the post, or its parent wasn't scraped (orphan).
      if (!parent || parent === post.externalId || !ids.has(parent)) {
        roots.push(c)
      } else {
        const arr = childrenByParent.get(parent) ?? []
        arr.push(c)
        childrenByParent.set(parent, arr)
      }
    }
    const byScore = (a: DocT, b: DocT) => b.score - a.score
    roots.sort(byScore)
    childrenByParent.forEach((arr) => arr.sort(byScore))
    return { roots, childrenByParent }
  }, [comments, post.externalId])

  if (comments === undefined) {
    return <div className="px-4 py-3 text-sm text-muted-foreground">Loading comments…</div>
  }
  if (comments.length === 0) {
    return (
      <div className="px-4 py-3 text-sm text-muted-foreground">
        No comments ingested for this post yet.
      </div>
    )
  }
  return (
    <div className="px-4 pb-3">
      {roots.map((c) => (
        <CommentNode
          key={c._id}
          comment={c}
          childrenByParent={childrenByParent}
          depth={0}
        />
      ))}
    </div>
  )
}

function scoreColor(score: number): string {
  if (score >= 70) return "bg-green-600"
  if (score >= 45) return "bg-amber-500"
  return "bg-muted-foreground"
}

/** Inline AI analysis for a post (problem extraction + opportunity score). */
function AIPanel({ documentId }: { documentId: Id<"documents"> }) {
  const a = useQuery(api.ai.queries.getAnalysis, { documentId })
  if (!a) return null
  if (a.opportunityScore === undefined || !a.stage1) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        AI: not flagged as a problem
      </p>
    )
  }
  return (
    <div className="mt-3 rounded-md border bg-muted/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold text-white ${scoreColor(
            a.opportunityScore,
          )}`}
        >
          Opportunity {a.opportunityScore}
        </span>
        <Badge variant="outline" className="max-w-full truncate">
          {a.industry}
        </Badge>
        {a.stage2 && (
          <span className="text-xs text-muted-foreground">
            WTP: {a.stage2.willingnessToPay} · {a.stage2.marketSizeEstimate}
          </span>
        )}
      </div>
      <div className="mb-0.5 mt-2 text-[10px] font-semibold uppercase tracking-wide text-primary">
        AI analysis
      </div>
      <p className="break-words text-sm">{a.stage1.problemStatement}</p>
    </div>
  )
}

function PostThread({ post }: { post: DocT }) {
  const [open, setOpen] = React.useState(false)
  const [expanded, setExpanded] = React.useState(false)
  const isLong = post.body.length > 220
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge variant="outline">r/{post.channel}</Badge>
          <Badge
            variant={post.analysisStatus === "analyzed" ? "default" : "secondary"}
          >
            {post.analysisStatus}
          </Badge>
          <span className="text-xs text-muted-foreground">
            ▲ {post.score} · u/{post.author ?? "—"} · {timeAgo(post.createdAt)} ago
          </span>
        </div>

        <a
          href={post.url}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block break-words text-base font-semibold hover:underline sm:text-lg"
        >
          {post.title ?? post.body.slice(0, 140)}
        </a>
        {post.title && post.body && (
          <>
            <p
              className={`mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground ${
                expanded ? "" : "line-clamp-3"
              }`}
            >
              {post.body}
            </p>
            {isLong && (
              <button
                onClick={() => setExpanded((e) => !e)}
                className="mt-1 text-xs font-medium text-primary hover:underline"
              >
                {expanded ? "Show less" : "Read more"}
              </button>
            )}
          </>
        )}

        <AIPanel documentId={post._id} />

        <Button
          variant="ghost"
          size="sm"
          className="mt-2 -ml-2 text-muted-foreground"
          onClick={() => setOpen((o) => !o)}
        >
          <IconMessage className="mr-2 size-4" />
          {post.numComments ?? 0} comments
          {open ? (
            <IconChevronUp className="ml-1 size-4" />
          ) : (
            <IconChevronDown className="ml-1 size-4" />
          )}
        </Button>
      </CardContent>
      {open && (
        <div className="border-t">
          <Thread post={post} />
        </div>
      )}
    </Card>
  )
}

function PostsInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlSub = searchParams.get("subreddit") ?? undefined

  const channels = useQuery(api.documents.channels, {})
  const channel = urlSub

  const { results, status, loadMore } = usePaginatedQuery(
    api.documents.posts,
    { channel },
    { initialNumItems: 15 },
  )

  function setChannel(value: string) {
    const next = value === ALL ? "" : `?subreddit=${encodeURIComponent(value)}`
    router.replace(`/dashboard/posts${next}`)
  }

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reddit Posts</h1>
          <p className="text-muted-foreground">
            Posts and their comment threads, newest first.
          </p>
        </div>
        <Select value={channel ?? ALL} onValueChange={setChannel}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="All subreddits" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All subreddits</SelectItem>
            {channels?.map((c) => (
              <SelectItem key={c.channel} value={c.channel}>
                {c.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3">
        {status === "LoadingFirstPage" && (
          <div className="text-muted-foreground">Loading…</div>
        )}
        {results.length === 0 && status !== "LoadingFirstPage" && (
          <div className="text-muted-foreground">
            No posts{channel ? ` in r/${channel}` : ""} yet. Enable a source and
            crawl from the admin Sources page.
          </div>
        )}
        {results.map((post) => (
          <PostThread key={post._id} post={post} />
        ))}
      </div>

      {status === "CanLoadMore" && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => loadMore(15)}>
            Load more
          </Button>
        </div>
      )}
    </div>
  )
}

export default function PostsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Loading…</div>}>
      <PostsInner />
    </Suspense>
  )
}
