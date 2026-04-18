"use client"

import useSWR from 'swr'
import { StatCard } from "@/components/stat-card"
import {
  Activity,
  Bot,
  Clock,
  AlertCircle,
  Zap,
  Cpu,
  Check,
  Loader2,
  RefreshCw,
  Server,
  Terminal,
  MemoryStick,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useBridgeRequest } from "@/hooks/use-bridge"
import { cn } from "@/lib/utils"
import * as React from "react"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

interface TigerStatus {
  status: "online" | "degraded" | "offline"
  container: {
    status: string
    exitCode: number
    startedAt: string
  }
  openclaw: {
    running: boolean
    processInfo: string
  }
  system: {
    memoryUsagePct: number
    memoryTotalMb: number
    uptime: string
  }
  agent: {
    currentModel: string
    fallbackModels: string[]
    availableModels?: string[]
    heartbeat: string | null
    soul: string | null
  }
}

function formatUptime(startedAt: string): string {
  if (!startedAt) return "—"
  const start = new Date(startedAt)
  const now = new Date()
  const diffMs = now.getTime() - start.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

  if (diffHours > 24) {
    const days = Math.floor(diffHours / 24)
    return `${days}d ${diffHours % 24}h`
  }
  return `${diffHours}h ${diffMins}m`
}

export default function DashboardPage() {
  const { data: status, error: statusError, isLoading } = useSWR<TigerStatus>('/api/tiger/status', fetcher, {
    refreshInterval: 5000,
    revalidateOnFocus: true,
  })
  const { request } = useBridgeRequest()
  const [restarting, setRestarting] = React.useState(false)
  const [restartSuccess, setRestartSuccess] = React.useState(false)

  const isOffline = statusError || status?.status === "offline"
  const isCrashed = status?.container?.exitCode === 255

  const handleRestart = async () => {
    setRestarting(true)
    setRestartSuccess(false)
    try {
      await request("/api/tiger/restart", "POST")
      setRestartSuccess(true)
      setTimeout(() => setRestartSuccess(false), 3000)
    } catch (e) {
      console.error("Failed to restart:", e)
    } finally {
      setRestarting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Crash Recovery Banner */}
      {isCrashed && (
        <div className="p-4 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <span className="font-semibold">Tiger Crashed</span>
              <span className="text-sm text-red-400/80 ml-2">(exit code 255 — MiniMax API unreachable)</span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-red-500/30 text-red-400 hover:bg-red-500/10"
            onClick={handleRestart}
            disabled={restarting}
          >
            {restarting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {restartSuccess ? "Restarting..." : "Restart Container"}
          </Button>
        </div>
      )}

      {/* Stat Cards Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className={cn(
          "bg-card/50",
          status?.container?.status === "running" && "border-green-500/30",
          status?.container?.status !== "running" && "border-red-500/30"
        )}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Container</p>
                <p className={cn(
                  "text-2xl font-bold capitalize",
                  status?.container?.status === "running" ? "text-green-400" : "text-red-400"
                )}>
                  {isLoading ? "..." : status?.container?.status || "Unknown"}
                </p>
              </div>
              <Server className={cn(
                "h-5 w-5",
                status?.container?.status === "running" ? "text-green-400" : "text-red-400"
              )} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">OpenClaw</p>
                <p className={cn(
                  "text-2xl font-bold",
                  status?.openclaw?.running ? "text-green-400" : "text-red-400"
                )}>
                  {isLoading ? "..." : status?.openclaw?.running ? "Running" : "Stopped"}
                </p>
              </div>
              <Terminal className={cn(
                "h-5 w-5",
                status?.openclaw?.running ? "text-green-400" : "text-red-400"
              )} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Memory</p>
                <p className="text-2xl font-bold">
                  {isLoading ? "..." : `${status?.system?.memoryUsagePct || 0}%`}
                </p>
              </div>
              <MemoryStick className="h-5 w-5 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Uptime</p>
                <p className="text-2xl font-bold">
                  {isLoading ? "..." : formatUptime(status?.container?.startedAt || "")}
                </p>
              </div>
              <Clock className="h-5 w-5 text-amber-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Error State */}
      {isOffline && !isLoading && (
        <div className="p-4 rounded-md bg-destructive/10 text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>Failed to connect to Tiger Bridge. Ensure the bridge server is running on the VPS.</span>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">

        {/* Container Health Card */}
        <Card className="col-span-4 bg-card/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Tiger Health
            </CardTitle>
            <CardDescription>
              {status?.status === "online" ? (
                <span className="flex items-center gap-1">
                  <Zap className="h-3 w-3 text-green-500" /> All systems operational
                </span>
              ) : status?.status === "degraded" ? (
                <span className="flex items-center gap-1">
                  <Zap className="h-3 w-3 text-yellow-500" /> Degraded mode
                </span>
              ) : (
                "Connection lost"
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Container Status */}
              <div className="p-3 rounded-md border border-border bg-background/50 text-sm flex justify-between items-center">
                <span className="text-muted-foreground">Container Status</span>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "w-2 h-2 rounded-full",
                    status?.container?.status === "running" ? "bg-green-500" : "bg-red-500"
                  )} />
                  <span className="capitalize">{status?.container?.status || "—"}</span>
                </div>
              </div>

              {/* Exit Code */}
              {status?.container?.exitCode !== undefined && status?.container?.exitCode !== 0 && (
                <div className="p-3 rounded-md border border-red-500/30 bg-red-500/5 text-sm flex justify-between items-center">
                  <span className="text-muted-foreground">Exit Code</span>
                  <span className={cn(
                    "font-mono",
                    status?.container?.exitCode === 255 ? "text-red-400 font-bold" : "text-red-300"
                  )}>
                    {status?.container?.exitCode}
                    {status?.container?.exitCode === 255 && " (API unreachable)"}
                  </span>
                </div>
              )}

              {/* OpenClaw Process */}
              <div className="p-3 rounded-md border border-border bg-background/50 text-sm flex justify-between items-center">
                <span className="text-muted-foreground">OpenClaw Process</span>
                <span className={cn(
                  status?.openclaw?.running ? "text-green-400" : "text-red-400"
                )}>
                  {status?.openclaw?.running ? "Running" : "Not running"}
                </span>
              </div>

              {/* Memory Usage */}
              <div className="p-3 rounded-md border border-border bg-background/50 text-sm flex justify-between items-center">
                <span className="text-muted-foreground">Memory Usage</span>
                <span>
                  {status?.system?.memoryUsagePct || 0}% of {status?.system?.memoryTotalMb || 0}MB
                </span>
              </div>

              {/* Uptime */}
              <div className="p-3 rounded-md border border-border bg-background/50 text-sm flex justify-between items-center">
                <span className="text-muted-foreground">Container Uptime</span>
                <span>{formatUptime(status?.container?.startedAt || "")}</span>
              </div>

              {/* Restart Button */}
              <div className="pt-2 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRestart}
                  disabled={restarting}
                  className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                >
                  {restarting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Restart Container
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Agent Model Card */}
        <Card className="col-span-3 bg-card/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              Agent Model
            </CardTitle>
            <CardDescription>Current AI model configuration</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Primary Model */}
              <div className="p-4 rounded-lg border border-primary/30 bg-primary/5">
                <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Primary Model</div>
                <div className="font-semibold text-base">
                  {isLoading ? "..." : status?.agent?.currentModel || "Not configured"}
                </div>
              </div>

              {/* Fallback Models */}
              {status?.agent?.fallbackModels && status.agent.fallbackModels.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Fallback Models</div>
                  <div className="space-y-1">
                    {status.agent.fallbackModels.map((model, i) => (
                      <div key={i} className="p-2 rounded-md border border-border bg-background/50 text-sm font-mono">
                        {model}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Available Models (from providers config) */}
              {status?.agent?.availableModels && status.agent.availableModels.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Available Models</div>
                  <div className="space-y-1">
                    {status.agent.availableModels.map((model, i) => (
                      <div key={i} className="p-2 rounded-md border border-border/50 bg-background/30 text-xs font-mono text-muted-foreground">
                        {model}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Heartbeat */}
              {status?.agent?.heartbeat && (
                <div className="p-3 rounded-md border border-border bg-background/50 text-xs">
                  <div className="text-muted-foreground mb-1">Last Heartbeat</div>
                  <pre className="whitespace-pre-wrap text-muted-foreground/80 font-mono text-[10px] max-h-20 overflow-y-auto">
                    {status.agent.heartbeat.slice(0, 500)}
                  </pre>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-3">
        <a href="/logs" className="contents">
          <StatCard
            title="View Logs"
            value="→"
            description="Live container log stream"
            icon={Activity}
            className="bg-card/50 hover:bg-card/80 transition-colors cursor-pointer"
          />
        </a>
        <a href="/tasks" className="contents">
          <StatCard
            title="Task Board"
            value="→"
            description="Manage and track tasks"
            icon={Check}
            className="bg-card/50 hover:bg-card/80 transition-colors cursor-pointer"
          />
        </a>
        <a href="/settings" className="contents">
          <StatCard
            title="Settings"
            value="→"
            description="Configure Tiger agent"
            icon={Cpu}
            className="bg-card/50 hover:bg-card/80 transition-colors cursor-pointer"
          />
        </a>
      </div>
    </div>
  )
}