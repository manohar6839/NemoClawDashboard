"use client"
/**
 * agent-chip-row.tsx — horizontal chip row for selecting agents
 * Scrolls horizontally on mobile. Badge shows fileCount.
 */

import * as React from "react"
import { cn } from "@/lib/utils"

export interface AgentInfo {
  id: string
  name: string
  emoji: string
  role: string
  fileCount: number
  lastActivity: number
}

interface Props {
  agents: AgentInfo[]
  activeId: string | null   // null = "All"
  onChange: (id: string | null) => void
  recentIds?: Set<string>   // agent ids that had recent activity (for badge highlight)
}

export function AgentChipRow({ agents, activeId, onChange, recentIds }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
      {/* All chip */}
      <button
        onClick={() => onChange(null)}
        className={cn(
          "flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
          activeId === null
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:bg-muted/80"
        )}
      >
        🗂️ All
      </button>

      {agents.map((agent) => {
        const isActive = activeId === agent.id
        const hasRecent = recentIds?.has(agent.id)
        return (
          <button
            key={agent.id}
            onClick={() => onChange(agent.id)}
            className={cn(
              "flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            <span>{agent.emoji}</span>
            <span>{agent.name}</span>
            {agent.fileCount > 0 && (
              <span className={cn(
                "text-xs px-1.5 py-0.5 rounded-full font-mono",
                isActive
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : hasRecent
                  ? "bg-orange-500/20 text-orange-400"
                  : "bg-background/40"
              )}>
                {agent.fileCount}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
