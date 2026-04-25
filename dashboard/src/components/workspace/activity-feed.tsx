"use client"
/**
 * activity-feed.tsx — chronological list of recent file modifications
 * across all agents.
 */

import * as React from "react"
import { Clock, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ActivityEvent {
  agentId: string
  agentName: string
  agentEmoji: string
  path: string
  action: string
  ts: number
}

interface Props {
  events: ActivityEvent[]
  loading?: boolean
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function ActivityFeed({ events, loading }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
        <Clock className="h-6 w-6" />
        <span className="text-sm">No recent activity</span>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {events.map((ev, i) => (
        <div
          key={i}
          className="flex items-start gap-3 px-3 py-2.5 rounded-md hover:bg-muted/40 transition-colors"
        >
          {/* Agent avatar */}
          <span className="text-base leading-none mt-0.5 shrink-0">{ev.agentEmoji}</span>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-medium">{ev.agentName}</span>
              <span className="text-xs text-muted-foreground">{ev.action}</span>
            </div>
            <p className="text-xs text-muted-foreground font-mono truncate">{ev.path}</p>
          </div>

          <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
            {relativeTime(ev.ts)}
          </span>
        </div>
      ))}
    </div>
  )
}
