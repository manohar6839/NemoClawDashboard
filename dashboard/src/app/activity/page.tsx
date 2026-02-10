"use client"

import * as React from "react"
import useSWR from "swr"
import { ScrollText } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

interface ActivityEntry {
  id: string
  type: "heartbeat" | "chat" | "config" | "memory" | "system" | "cron"
  timestamp: string
  description: string
  source?: string
}

const typeColors: Record<string, string> = {
  heartbeat: "bg-yellow-400",
  chat: "bg-blue-400",
  config: "bg-orange-400",
  memory: "bg-green-400",
  system: "bg-purple-400",
  cron: "bg-cyan-400",
}

function groupByDate(entries: ActivityEntry[]): Record<string, ActivityEntry[]> {
  const groups: Record<string, ActivityEntry[]> = {}
  for (const entry of entries) {
    const date = new Date(entry.timestamp)
    const key = date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).toUpperCase()
    if (!groups[key]) groups[key] = []
    groups[key].push(entry)
  }
  return groups
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

export default function ActivityPage() {
  const [limit, setLimit] = React.useState(200)
  const { data, error } = useSWR(`/api/activity?limit=${limit}`, fetcher, { refreshInterval: 10000 })

  const entries = (data?.entries || []) as ActivityEntry[]
  const total = data?.total || 0
  const grouped = groupByDate(entries)

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center gap-3">
          <ScrollText className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Activity Log</h1>
            <p className="text-sm text-muted-foreground">A chronological record of agent actions and events</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground px-3 py-1.5 rounded-full border border-border bg-muted/50">
            {total} entries
          </span>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto">
        {error ? (
          <div className="p-8 text-center text-destructive">Failed to load activity log</div>
        ) : !data ? (
          <div className="p-8 text-center text-muted-foreground">Loading activity...</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No activity recorded yet</div>
        ) : (
          <div className="p-6 space-y-8">
            {Object.entries(grouped).map(([dateLabel, dateEntries]) => (
              <div key={dateLabel}>
                {/* Date Header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-xs font-semibold tracking-wider text-muted-foreground">
                    {dateLabel}
                  </div>
                </div>

                {/* Timeline entries */}
                <div className="relative ml-4">
                  {/* Vertical line */}
                  <div className="absolute left-[7px] top-3 bottom-3 w-[2px] bg-border" />

                  <div className="space-y-3">
                    {dateEntries.map((entry) => (
                      <div key={entry.id} className="relative flex items-start gap-4 group">
                        {/* Dot */}
                        <div className="relative z-10 mt-3.5">
                          <div className={`h-4 w-4 rounded-full border-2 border-background ${typeColors[entry.type] || "bg-muted-foreground"}`} />
                        </div>

                        {/* Card */}
                        <div className="flex-1 p-3 rounded-lg border border-border bg-card/60 hover:bg-card/80 transition-colors">
                          <div className="flex items-start gap-3">
                            <span className="text-xs font-semibold text-primary whitespace-nowrap mt-0.5">
                              {formatTime(entry.timestamp)}
                            </span>
                            <p className="text-sm text-foreground leading-relaxed">
                              {entry.description}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            {/* Load more */}
            {entries.length < total && (
              <div className="text-center pt-4">
                <button
                  onClick={() => setLimit((prev) => prev + 200)}
                  className="text-xs font-medium text-primary hover:text-primary/80 px-4 py-2 rounded-md border border-border hover:bg-muted/30 transition-colors"
                >
                  Load more ({total - entries.length} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
