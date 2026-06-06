"use client"

import { bridgeGet } from "@/lib/bridge"

/**
 * digest-card.tsx — Today's digest of agent activity
 *
 * The home page used to make you click into /logs or /activity to see what
 * Tiger had been doing. Now it surfaces directly. Live "what just happened"
 * feed driven by /api/tiger/agents-activity.
 */

import * as React from "react"
import useSWR from "swr"
import { Card } from "@/components/ui/card"
import { Activity } from "lucide-react"

interface ActivityEvent {
  agentId: string
  agentName: string
  agentEmoji: string
  path: string
  action: string
  ts: number
}

interface ActivityResponse {
  ok: boolean
  events: ActivityEvent[]
}

const fetcher = (url: string) => bridgeGet(url).then((r) => r.json())

function relTime(ts: number): string {
  if (!ts) return ""
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60_000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

// Truncate from the LEFT so the filename stays readable.
function leftTruncate(s: string, max = 40): string {
  if (s.length <= max) return s
  return "…" + s.slice(-(max - 1))
}

export function DigestCard() {
  const { data, isLoading } = useSWR<ActivityResponse>(
    "/api/tiger/agents-activity",
    fetcher,
    { refreshInterval: 60_000 }
  )

  const events = React.useMemo(() => {
    const list = data?.events ?? []
    return [...list].sort((a, b) => b.ts - a.ts).slice(0, 6)
  }, [data])

  return (
    <Card className="bg-card/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-primary" />
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
          Today's digest
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-6 rounded bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center">
          No activity yet today.
        </div>
      ) : (
        <ul className="space-y-2">
          {events.map((ev, i) => (
            <li key={`${ev.ts}-${i}`} className="flex items-start gap-2 text-sm">
              <span className="shrink-0 text-base leading-snug" aria-hidden>
                {ev.agentEmoji}
              </span>

              <div className="flex-1 min-w-0">
                <div
                  className="font-mono text-xs text-foreground/90 truncate"
                  title={ev.path}
                >
                  {leftTruncate(ev.path)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {ev.agentName} {ev.action}
                </div>
              </div>

              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums pt-0.5">
                {relTime(ev.ts)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
