"use client"

/**
 * /agents — Agent overview page (Phase 1)
 *
 * Lists all 5 agents with their full details. Phase 3 will turn each card
 * into a clickable drill-in with the per-agent model dropdown. OpenClaw
 * supports per-agent model overrides via agents.list[].model with live
 * config patching — no container restart needed.
 */

import * as React from "react"
import useSWR from "swr"
import { Bot } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface Agent {
  id: string
  name: string
  emoji: string
  role: string
  fileCount: number
  lastActivity: number
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function relativeTime(ts: number): string {
  if (!ts) return "—"
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60_000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function statusOf(ts: number): "active" | "recent" | "idle" {
  if (!ts) return "idle"
  const diff = Date.now() - ts
  if (diff < 5 * 60_000) return "active"
  if (diff < 60 * 60_000) return "recent"
  return "idle"
}

const STATUS_COLOR = {
  active: "bg-green-500",
  recent: "bg-amber-500",
  idle:   "bg-zinc-500",
}

export default function AgentsPage() {
  const { data, isLoading } = useSWR<{ ok: boolean; agents: Agent[] }>(
    "/api/tiger/agents",
    fetcher,
    { refreshInterval: 30_000 }
  )

  const agents = data?.agents ?? []

  return (
    <div className="space-y-6 max-w-5xl mx-auto w-full">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bot className="h-6 w-6 text-primary" />
          Agents
        </h1>
        <p className="text-muted-foreground text-sm">
          Tiger's orchestrator and 4 specialist sub-agents. Phase 3 will let you
          override the model per agent here.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="h-32 animate-pulse bg-card/30" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => {
            const status = statusOf(agent.lastActivity)
            return (
              <Card key={agent.id} className="bg-card/40 p-4 hover:bg-card/60 transition-colors">
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-3xl leading-none">{agent.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{agent.name}</h3>
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          STATUS_COLOR[status],
                          status === "active" && "animate-pulse"
                        )}
                      />
                    </div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      {agent.role}
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Last activity</span>
                    <span className="text-foreground/80">{relativeTime(agent.lastActivity)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Workspace files</span>
                    <span className="text-foreground/80 tabular-nums">{agent.fileCount}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Model</span>
                    <span className="text-foreground/60 italic text-[11px]">
                      inherits global
                    </span>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <div className="text-xs text-muted-foreground border-t border-border/30 pt-4">
        <strong className="text-foreground/80">Coming in Phase 3:</strong> click any
        agent to set a custom model (e.g., a cheaper model for Researcher,
        a stronger model for Coder).
      </div>
    </div>
  )
}
