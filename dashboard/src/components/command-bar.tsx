"use client"

/**
 * command-bar.tsx — The new home-page hero
 *
 * This is the single most important UI change in the redesign.
 * The old home page told you Tiger was alive. This one lets you tell
 * Tiger what to do. That shift — from monitoring to commanding —
 * is the whole reason Phase 1 exists.
 *
 * BEHAVIOR:
 *  - User types a prompt and hits Enter (or clicks Send).
 *  - We POST to /api/chat which already exists and routes to the bridge.
 *  - On success we redirect to /chat so the user can watch the response.
 *  - The chips below the input are auto-derived prompts. Phase 1 ships with
 *    sensible defaults; Phase 2 will swap those for SQL-aggregated frequent
 *    prompts from the chat_messages table.
 */

import * as React from "react"
import { Send, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import useSWR from "swr"

// Hard-coded for Phase 1. Phase 2 replaces this with real history aggregation.
const FALLBACK_PROMPTS = [
  "Morning digest",
  "Pull latest CERC orders",
  "Status report",
  "Plan a new project",
]

const fetcher = (url: string) =>
  fetch(url).then((r) => (r.ok ? r.json() : null))

interface FrequentPromptsResponse {
  ok: boolean
  prompts: string[]
}

export function CommandBar() {
  const [value, setValue] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  // Frequent prompts — gracefully degrades if the endpoint doesn't exist yet.
  const { data } = useSWR<FrequentPromptsResponse>(
    "/api/tiger/prompts/frequent",
    fetcher,
    {
      refreshInterval: 5 * 60_000,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  )

  const chips =
    data?.ok && data.prompts && data.prompts.length > 0
      ? data.prompts.slice(0, 4)
      : FALLBACK_PROMPTS

  const handleSubmit = async () => {
    const trimmed = value.trim()
    if (!trimmed || submitting) return

    setSubmitting(true)
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      })

      if (res.ok) {
        window.location.href = "/chat"
      } else {
        console.error("Submit failed:", res.status, await res.text())
        setSubmitting(false)
      }
    } catch (e) {
      console.error("Submit threw:", e)
      setSubmitting(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <Card className="bg-card/50 border-primary/20 p-4 md:p-5">
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Tell Tiger…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          disabled={submitting}
          className="flex-1 bg-transparent outline-none text-base md:text-lg placeholder:text-muted-foreground/60 disabled:opacity-50"
          autoFocus
        />
        <Button
          size="icon"
          onClick={handleSubmit}
          disabled={!value.trim() || submitting}
          className="shrink-0"
          aria-label="Send to Tiger"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => setValue(chip)}
            disabled={submitting}
            className="text-xs px-3 py-1.5 rounded-full bg-muted/50 hover:bg-muted/80 text-muted-foreground hover:text-foreground border border-border/50 transition-colors disabled:opacity-50"
          >
            {chip}
          </button>
        ))}
      </div>
    </Card>
  )
}
