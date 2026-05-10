"use client"

import * as React from "react"
import useSWR from "swr"
import { ScrollText } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

// Shape returned by bridge /tiger/agents/activity
interface AgentEvent {
  agentId: string
  agentName: string
  agentEmoji: string
  path: string       // relative path inside the agent's workspace
  action: string     // e.g. "modified"
  ts: number         // unix ms
}

// Display colours per agent role
const agentColors: Record<string, string> = {
  main:       "bg-yellow-400",
  coder:      "bg-blue-400",
  researcher: "bg-green-400",
  writer:     "bg-purple-400",
  pm:         "bg-orange-400",
}

function groupByDate(events: AgentEvent[]): Record<string, AgentEvent[]> {
  const groups: Record<string, AgentEvent[]> = {}
  for (const ev of events) {
    const key = new Date(ev.ts)
      .toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
      .toUpperCase()
    if (!groups[key]) groups[key] = []
    groups[key].push(ev)
  }
  return groups
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

export default function ActivityPage() {
  const [limit, setLimit] = React.useState(200)
  // Uses /api/tiger/activity — proxies to bridge /tiger/agents/activity
  // which scans Tiger + sub-agent Docker workspace files for recent modifications.
  const { data, error } = useSWR(`/api/tiger/activity?limit=${limit}`, fetcher, {
    refreshInterval: 10000,
  })

  const events = (data?.events || []) as AgentEvent[]
  const grouped = groupByDate(events)

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center gap-3">
          <ScrollText className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Activity Log</h1>
            <p className="text-sm text-muted-foreground">
              Recent file modifications across Tiger and sub-agent workspaces
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground px-3 py-1.5 rounded-full border border-border bg-muted/50">
            {events.length} entries
          </span>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto">
        {error ? (
          <div className="p-8 text-center text-destructive">Failed to load activity log</div>
        ) : !data ? (
          <div className="p-8 text-center text-muted-foreground">Loading activity...</div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No recent workspace activity</div>
        ) : (
          <div className="p-6 space-y-6">
            {Object.entries(grouped).map(([date, dayEvents]) => (
              <div key={date}>
                <div className="text-xs font-semibold text-muted-foreground mb-3 tracking-widest">
                  {date}
                </div>
                <div className="space-y-2">
                  {dayEvents.map((ev, i) => (
                    <div
                      key={`${ev.agentId}-${ev.ts}-${i}`}
                      className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors"
                    >
                      <div
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${agentColors[ev.agentId] ?? "bg-gray-400"}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">
                            {ev.agentEmoji} {ev.agentName}
                          </span>
                          <span className="text-xs text-muted-foreground font-mono truncate">
                            {ev.path}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 capitalize">
                          {ev.action}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0">
                        {formatTime(ev.ts)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
