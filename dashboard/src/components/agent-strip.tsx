"use client"

/**
 * agent-strip.tsx — Live state of Tiger + sub-agents
 *
 * Replaces the old "Agent Model" card on the home page. Now you see ALL 5
 * agents at once with status, last activity, and file count.
 *
 * DATA SOURCE: /api/tiger/agents — already exists, returns:
 *   { ok: true, agents: [{ id, name, emoji, role, fileCount, lastActivity }] }
 */

import * as React from "react"
import useSWR from "swr"
import { cn } from "@/lib/utils"

interface Agent {
  id: string
  name: string
  emoji: string
  role: string
  fileCount: number
  lastActivity: number
}

interface AgentsResponse {
  ok: boolean
  agents: Agent[]
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function relativeTime(ts: number): string {
  if (!ts) return "—"
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60_000)
  if (m < 1) return "now"
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

function statusOf(ts: number): "active" | "recent" | "idle" {
  if (!ts) return "idle"
  const diff = Date.now() - ts
  if (diff < 5 * 60_000) return "active"
  if (diff < 60 * 60_000) return "recent"
  return "idle"
}

const STATUS_DOT: Record<"active" | "recent" | "idle", string> = {
  active: "bg-green-500 animate-pulse",
  recent: "bg-amber-500",
  idle:   "bg-zinc-500",
}

export function AgentStrip() {
  const { data, error, isLoading } = useSWR<AgentsResponse>(
    "/api/tiger/agents",
    fetcher,
    { refreshInterval: 30_000 }
  )

  if (isLoading) {
    return (
      <div>
        <SectionLabel>Agents</SectionLabel>
        <div className="flex gap-3 overflow-x-auto pb-2 snap-x">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="min-w-[140px] h-[80px] rounded-lg border border-border/50 bg-card/30 animate-pulse"
            />
          ))}
        </div>
      </div>
    )
  }

  if (error || !data?.ok) {
    return (
      <div>
        <SectionLabel>Agents</SectionLabel>
        <div className="text-sm text-muted-foreground p-3 rounded-lg border border-border/50">
          Could not load agents. Bridge unreachable?
        </div>
      </div>
    )
  }

  const agents = data.agents ?? []

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <SectionLabel>Agents</SectionLabel>
        <a href="/agents" className="text-xs text-primary hover:underline">
          View all →
        </a>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
        {agents.map((agent) => {
          const status = statusOf(agent.lastActivity)
          return (
            <a
              key={agent.id}
              href={`/agents?id=${agent.id}`}
              className="snap-start shrink-0 min-w-[140px] p-3 rounded-lg border border-border/50 bg-card/40 hover:bg-card/60 hover:border-primary/30 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg leading-none">{agent.emoji}</span>
                <span className="text-sm font-medium truncate flex-1">
                  {agent.name}
                </span>
                <span
                  className={cn(
                    "h-2 w-2 rounded-full shrink-0",
                    STATUS_DOT[status]
                  )}
                />
              </div>

              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                {agent.role}
              </div>

              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>last: {relativeTime(agent.lastActivity)}</span>
                <span className="tabular-nums">{agent.fileCount} files</span>
              </div>
            </a>
          )
        })}
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
      {children}
    </span>
  )
}
