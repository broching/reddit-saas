"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQuery } from "convex/react"
import { FunctionReturnType } from "convex/server"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ActivityFeed } from "@/components/activity-feed"
import { toast } from "sonner"
import {
  IconTrash,
  IconPlus,
  IconSeeding,
  IconRefresh,
  IconAdjustmentsHorizontal,
  IconChevronRight,
} from "@tabler/icons-react"

type SourceRow = FunctionReturnType<typeof api.sources.list>[number]

const CONFIG_DEFAULTS = {
  maxItems: 60,
  maxPostCount: 25,
  maxComments: 15,
  includeComments: true,
}

function ConfigEditor({ s }: { s: SourceRow }) {
  const upsert = useMutation(api.sources.upsert)
  const cfg = { ...CONFIG_DEFAULTS, ...((s.config as object) ?? {}) }
  const [interval, setInterval] = React.useState(s.crawlIntervalMinutes)
  const [maxItems, setMaxItems] = React.useState(cfg.maxItems)
  const [maxPostCount, setMaxPostCount] = React.useState(cfg.maxPostCount)
  const [maxComments, setMaxComments] = React.useState(cfg.maxComments)
  const [includeComments, setIncludeComments] = React.useState(
    cfg.includeComments,
  )

  async function save() {
    try {
      await upsert({
        source: s.source,
        channel: s.channel,
        displayName: s.displayName,
        enabled: s.enabled,
        priority: s.priority,
        crawlIntervalMinutes: Number(interval) || 15,
        config: {
          maxItems: Number(maxItems) || CONFIG_DEFAULTS.maxItems,
          maxPostCount: Number(maxPostCount) || CONFIG_DEFAULTS.maxPostCount,
          maxComments: Number(maxComments),
          includeComments,
        },
      })
      toast.success(`Saved settings for ${s.displayName}`)
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`)
    }
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
      <Field label="Frequency (min)">
        <Input type="number" min={5} value={interval}
          onChange={(e) => setInterval(Number(e.target.value))} />
      </Field>
      <Field label="Max items">
        <Input type="number" min={1} value={maxItems}
          onChange={(e) => setMaxItems(Number(e.target.value))} />
      </Field>
      <Field label="Max posts">
        <Input type="number" min={1} value={maxPostCount}
          onChange={(e) => setMaxPostCount(Number(e.target.value))} />
      </Field>
      <Field label="Max comments">
        <Input type="number" min={0} value={maxComments}
          onChange={(e) => setMaxComments(Number(e.target.value))} />
      </Field>
      <div className="flex flex-col gap-2">
        <Label className="text-xs text-muted-foreground">Include comments</Label>
        <div className="flex h-9 items-center">
          <Switch checked={includeComments} onCheckedChange={setIncludeComments} />
        </div>
      </div>
      <div className="flex items-end">
        <Button size="sm" onClick={save}>Save</Button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function SourceRows({ s }: { s: SourceRow }) {
  const router = useRouter()
  const toggle = useMutation(api.sources.toggle)
  const remove = useMutation(api.sources.remove)
  const crawlNow = useMutation(api.sources.crawlNow)
  const [open, setOpen] = React.useState(false)
  const sourceId = s._id as Id<"sources">

  const goToPosts = () =>
    router.push(`/dashboard/posts?subreddit=${encodeURIComponent(s.channel)}`)

  // Prevent row navigation when interacting with controls.
  const stop = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <>
      <TableRow className="cursor-pointer" onClick={goToPosts}>
        <TableCell className="font-medium">
          <div className="flex items-center gap-2">
            <IconChevronRight className="size-4 text-muted-foreground" />
            {s.displayName}
          </div>
        </TableCell>
        <TableCell>
          <Badge variant={s.state?.status === "ok" ? "secondary" : "destructive"}>
            {s.state?.status ?? "unknown"}
          </Badge>
        </TableCell>
        <TableCell className="text-muted-foreground">
          every {s.crawlIntervalMinutes}m
        </TableCell>
        <TableCell className="text-muted-foreground">
          {s.state?.lastCrawlAt
            ? new Date(s.state.lastCrawlAt).toLocaleString()
            : "never"}
        </TableCell>
        <TableCell onClick={stop}>
          <div className="flex items-center gap-2">
            <Switch
              checked={s.enabled}
              onCheckedChange={(enabled) => toggle({ sourceId, enabled })}
            />
            <span className="text-xs text-muted-foreground">
              {s.enabled ? "on" : "off"}
            </span>
          </div>
        </TableCell>
        <TableCell onClick={stop}>
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" title="Crawl now"
              onClick={async () => {
                await crawlNow({ sourceId })
                toast.success(`Crawl started for ${s.displayName}`)
              }}>
              <IconRefresh className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" title="Settings"
              onClick={() => setOpen((o) => !o)}>
              <IconAdjustmentsHorizontal className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" title="Remove"
              onClick={() => remove({ sourceId })}>
              <IconTrash className="size-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/30">
            <ConfigEditor s={s} />
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

export default function AdminSourcesPage() {
  const me = useQuery(api.users.current)
  const isAdmin = me?.role === "admin"
  const sources = useQuery(api.sources.list, isAdmin ? {} : "skip")

  const seedDefaults = useMutation(api.sources.seedDefaults)
  const upsert = useMutation(api.sources.upsert)
  const crawlNow = useMutation(api.sources.crawlNow)
  const [channel, setChannel] = React.useState("")

  if (me === undefined) {
    return <div className="p-6 text-muted-foreground">Loading…</div>
  }
  if (!isAdmin) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Sources</h1>
        <p className="mt-2 text-muted-foreground">
          This page requires the <span className="font-mono">admin</span> role.
        </p>
      </div>
    )
  }

  async function handleAdd() {
    const name = channel.trim().replace(/^r\//i, "")
    if (!name) return
    try {
      await upsert({ source: "reddit", channel: name })
      setChannel("")
      toast.success(`Added r/${name}`)
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sources</h1>
          <p className="text-muted-foreground">
            Subreddits the crawler scans. Click a row to view its posts.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline"
            onClick={async () => {
              try {
                await crawlNow({})
                toast.success("Crawl started for all enabled sources")
              } catch (e) {
                toast.error(`Failed: ${(e as Error).message}`)
              }
            }}>
            <IconRefresh className="mr-2 size-4" />
            Crawl all now
          </Button>
          <Button variant="outline"
            onClick={async () => {
              try {
                const res = await seedDefaults({})
                toast.success(`Seeded ${res.created} default subreddit(s)`)
              } catch (e) {
                toast.error(`Failed: ${(e as Error).message}`)
              }
            }}>
            <IconSeeding className="mr-2 size-4" />
            Seed defaults
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Add a subreddit (e.g. SaaS)"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          className="max-w-xs"
        />
        <Button onClick={handleAdd}>
          <IconPlus className="mr-2 size-4" />
          Add
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subreddit</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Last crawl</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources?.map((s) => <SourceRows key={s._id} s={s} />)}
          </TableBody>
        </Table>
        {sources?.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">
            No sources yet. Add one above or seed the defaults.
          </div>
        )}
      </div>

      <ActivityFeed />
    </div>
  )
}
