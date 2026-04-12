/**
 * sub-agents.tsx — Sub-agent visibility panel
 *
 * Shows each of Tiger's sub-agents (Coder, Researcher, Writer, PM).
 * For each: last active time, current task (if any), workspace path.
 */

"use client"

import * as React from "react"
import { Bot, Clock, FileText, Loader2, HardDrive } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useBridgeRequest } from "@/hooks/use-bridge"
import { cn } from "@/lib/utils"

// Inline badge component since shadcn doesn't have Badge
function StatusBadge({ status }: { status: string }) {
  const colors = {
    running: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    idle: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    completed: "bg-green-500/10 text-green-400 border-green-500/20",
    failed: "bg-red-500/10 text-red-400 border-red-500/20",
  }
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded border", colors[status as keyof typeof colors] || colors.idle)}>
      {status === "running" && <span className="animate-pulse mr-1">●</span>}
      {status}
    </span>
  )
}

interface SubAgent {
  name: string
  status: "idle" | "running" | "completed" | "failed"
  lastActive: string | null
  currentTask: string | null
  workspacePath: string
}

const AGENT_CONFIGS = [
  { name: "coder", label: "Coder", icon: "💻", color: "text-blue-400" },
  { name: "researcher", label: "Researcher", icon: "🔬", color: "text-purple-400" },
  { name: "writer", label: "Writer", icon: "📝", color: "text-amber-400" },
  { name: "pm", label: "PM", icon: "📋", color: "text-green-400" },
]

export function SubAgentsPanel() {
  const { request } = useBridgeRequest()
  const [agents, setAgents] = React.useState<SubAgent[]>([])
  const [loading, setLoading] = React.useState(true)

  // Load sub-agent status by reading workspace directories
  React.useEffect(() => {
    const loadAgents = async () => {
      setLoading(true)
      try {
        // Get workspace contents to find agent directories
        const workspace = await request("/api/tiger/workspace") as { ok: boolean; files?: Array<{ name: string; type: string }> }

        const agentData: SubAgent[] = AGENT_CONFIGS.map(config => {
          // Check if agent has workspace directory
          const hasWorkspace = workspace?.ok && workspace?.files?.some(
            f => f.name === config.name && f.type === "directory"
          )

          return {
            name: config.name,
            status: "idle" as const,
            lastActive: null,
            currentTask: null,
            workspacePath: hasWorkspace ? `/workspace/${config.name}` : "",
          }
        })

        // Try to get more info by reading each agent's workspace
        for (const agent of agentData) {
          if (agent.workspacePath) {
            try {
              const agentFiles = await request("/api/tiger/workspace", "GET", { path: agent.name }) as {
                ok: boolean;
                files?: Array<{ name: string; modified?: string }>;
              }

              if (agentFiles.ok && agentFiles.files && agentFiles.files.length > 0) {
                // Get most recent file as "last active"
                const recentFile = agentFiles.files.reduce((latest, file) => {
                  if (!latest) return file
                  const latestTime = new Date(latest.modified || 0).getTime()
                  const fileTime = new Date(file.modified || 0).getTime()
                  return fileTime > latestTime ? file : latest
                }, agentFiles.files[0])

                agent.lastActive = recentFile.modified || null

                // Check for current task file (task.json in progress)
                const taskFile = agentFiles.files.find(f => f.name === "task.json")
                if (taskFile) {
                  agent.status = "running"
                }
              }
            } catch (e) {
              // Ignore individual agent read errors
            }
          }
        }

        setAgents(agentData)
      } catch (e) {
        console.error("Failed to load sub-agents:", e)
        // Initialize with defaults
        setAgents(AGENT_CONFIGS.map(config => ({
          name: config.name,
          status: "idle" as const,
          lastActive: null,
          currentTask: null,
          workspacePath: "",
        })))
      } finally {
        setLoading(false)
      }
    }

    loadAgents()
  }, [request])

  if (loading) {
    return (
      <Card className="bg-card/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Sub-Agents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-card/50">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Bot className="h-5 w-5" />
          Sub-Agents
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {AGENT_CONFIGS.map(config => {
            const agent = agents.find(a => a.name === config.name) || {
              name: config.name,
              status: "idle" as const,
              lastActive: null,
              currentTask: null,
              workspacePath: "",
            }

            return (
              <div
                key={config.name}
                className="p-3 rounded-lg border border-border bg-background/50"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{config.icon}</span>
                    <span className={cn("font-medium", config.color)}>{config.label}</span>
                  </div>

                  {/* Status badge */}
                  <StatusBadge status={agent.status} />
                </div>

                <div className="text-xs text-muted-foreground space-y-1">
                  {/* Last active */}
                  {agent.lastActive ? (
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>Last active: {new Date(agent.lastActive).toLocaleString()}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>Never active</span>
                    </div>
                  )}

                  {/* Current task */}
                  {agent.currentTask && (
                    <div className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      <span>Working on: {agent.currentTask}</span>
                    </div>
                  )}

                  {/* Workspace path */}
                  {agent.workspacePath && (
                    <div className="flex items-center gap-1">
                      <HardDrive className="h-3 w-3" />
                      <span className="font-mono">{agent.workspacePath}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}