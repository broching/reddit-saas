"use client"

import * as React from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { toast } from "sonner"
import { IconX } from "@tabler/icons-react"

export default function SettingsPage() {
  const me = useQuery(api.users.current)
  const updatePreferences = useMutation(api.users.updatePreferences)

  const [industries, setIndustries] = React.useState<string[]>([])
  const [input, setInput] = React.useState("")
  const [initialized, setInitialized] = React.useState(false)

  // Seed local state once from the loaded user.
  React.useEffect(() => {
    if (me && !initialized) {
      setIndustries(me.preferences?.defaultIndustries ?? [])
      setInitialized(true)
    }
  }, [me, initialized])

  if (me === undefined) {
    return <div className="p-6 text-muted-foreground">Loading…</div>
  }
  if (me === null) {
    return <div className="p-6 text-muted-foreground">Not signed in.</div>
  }

  function addIndustry() {
    const v = input.trim()
    if (!v || industries.includes(v)) return
    setIndustries((arr) => [...arr, v])
    setInput("")
  }

  async function save() {
    try {
      await updatePreferences({
        preferences: { defaultIndustries: industries },
      })
      toast.success("Preferences saved")
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`)
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Your profile and preferences.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Managed through your account.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name</span>
            <span>{me.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Role</span>
            <Badge variant={me.role === "admin" ? "default" : "secondary"}>
              {me.role ?? "user"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Default industries</CardTitle>
          <CardDescription>
            Industries you care about (used to personalize listings).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Input
              placeholder="e.g. Fintech"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addIndustry()}
              className="max-w-xs"
            />
            <Button variant="outline" onClick={addIndustry}>
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {industries.length === 0 && (
              <span className="text-sm text-muted-foreground">None yet.</span>
            )}
            {industries.map((ind) => (
              <Badge key={ind} variant="secondary" className="gap-1">
                {ind}
                <button
                  onClick={() =>
                    setIndustries((arr) => arr.filter((x) => x !== ind))
                  }
                  className="ml-1"
                >
                  <IconX className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div>
            <Button onClick={save}>Save preferences</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
