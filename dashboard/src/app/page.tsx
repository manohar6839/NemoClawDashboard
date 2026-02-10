"use client"

import useSWR from 'swr'
import { ChatInterface } from "@/components/chat-interface"
import Link from "next/link"
import { StatCard } from "@/components/stat-card"
import {
  Activity,
  BrainCircuit,
  Bot,
  Clock,
  FileText,
  AlertCircle,
  Users,
  Zap,
  Cpu,
  Check,
  Loader2,
  Sparkles,
  Eye,
  MessageSquare,
  Image as ImageIcon,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useGatewayRequest } from "@/hooks/use-gateway"
import { cn } from "@/lib/utils"
import * as React from "react"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

interface ModelInfo {
  id: string
  name: string
  provider: string
  contextWindow?: number
  reasoning?: boolean
  input?: string[]
}

function parseModelId(modelId: string): { provider: string; name: string; fullId: string } {
  if (!modelId) return { provider: "", name: "", fullId: "" }
  // Format: "provider/org/model:variant" or "provider/model" or just "model-id"
  const parts = modelId.split("/")
  if (parts.length >= 2) {
    const provider = parts[0]
    const rest = parts.slice(1).join("/")
    // Remove :variant suffix for display name
    const name = rest.replace(/:.*$/, "")
    return { provider, name, fullId: modelId }
  }
  return { provider: "unknown", name: modelId.replace(/:.*$/, ""), fullId: modelId }
}

function providerLabel(provider: string): string {
  const labels: Record<string, string> = {
    openrouter: "OpenRouter",
    anthropic: "Anthropic",
    openai: "OpenAI",
    google: "Google",
    "arcee-ai": "Arcee AI",
  }
  return labels[provider.toLowerCase()] || provider
}

function providerColor(provider: string): string {
  const colors: Record<string, string> = {
    openrouter: "bg-violet-500/15 text-violet-400 border-violet-500/20",
    anthropic: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    openai: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    google: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  }
  return colors[provider.toLowerCase()] || "bg-muted text-muted-foreground border-border"
}

function formatContextWindow(cw: number): string {
  if (cw >= 1000000) return `${(cw / 1000000).toFixed(1)}M`
  if (cw >= 1000) return `${Math.round(cw / 1000)}K`
  return String(cw)
}

export default function DashboardPage() {
  const { data: statusData, error: statusError, mutate: mutateStatus } = useSWR('/api/status', fetcher, { refreshInterval: 5000 })
  const { data: memoryData } = useSWR('/api/memory', fetcher)
  const { request } = useGatewayRequest()
  const [sessionCount, setSessionCount] = React.useState<number | null>(null)
  const [switchingModel, setSwitchingModel] = React.useState<string | null>(null)
  const [modelSearch, setModelSearch] = React.useState("")

  const isError = !!statusError
  const isGateway = statusData?.gateway === true

  const currentModel = (statusData?.agent?.currentModel || "") as string
  const fallbackModels = (statusData?.agent?.fallbackModels || []) as string[]
  const models = (statusData?.models || []) as ModelInfo[]

  const currentParsed = parseModelId(currentModel)

  // Fetch session count from gateway
  React.useEffect(() => {
    request("sessions.list", {})
      .then((data: unknown) => {
        const result = data as { sessions?: unknown[] } | unknown[]
        if (Array.isArray(result)) {
          setSessionCount(result.length)
        } else if (result?.sessions) {
          setSessionCount(result.sessions.length)
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSwitchModel = async (modelId: string) => {
    setSwitchingModel(modelId)
    try {
      // Use config.patch with the correct path: agents.defaults.model.primary
      const patch = JSON.stringify({
        agents: { defaults: { model: { primary: modelId } } }
      })
      await request("config.patch", { raw: patch })
      setTimeout(() => mutateStatus(), 500)
    } catch (e) {
      console.error("Failed to switch model", e)
    } finally {
      setSwitchingModel(null)
    }
  }

  // Group models by provider
  const modelsByProvider = React.useMemo(() => {
    const groups: Record<string, ModelInfo[]> = {}
    const filtered = models.filter(m =>
      (m.id || m.name || "").toLowerCase().includes(modelSearch.toLowerCase()) ||
      (m.provider || "").toLowerCase().includes(modelSearch.toLowerCase()) ||
      (m.name || "").toLowerCase().includes(modelSearch.toLowerCase())
    )
    for (const m of filtered) {
      const provider = m.provider || parseModelId(m.id).provider
      if (!groups[provider]) groups[provider] = []
      groups[provider].push(m)
    }
    return groups
  }, [models, modelSearch])

  // Find current model's full info
  const currentModelInfo = models.find(m => m.id === currentModel)

  return (
    <div className="flex flex-col gap-6">
      {/* Stat Cards Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/memory" className="contents">
          <StatCard
            title="Memory Files"
            value={memoryData?.count || "-"}
            description={memoryData?.latest ? `Latest: ${memoryData.latest.date}` : "Loading..."}
            icon={BrainCircuit}
            className="bg-card/50 hover:bg-card/80 transition-colors cursor-pointer"
          />
        </Link>
        <Link href="/cron" className="contents">
          <StatCard
            title="Cron Jobs"
            value={statusError ? "Err" : (statusData?.agent?.cronJobs ?? "-")}
            description={statusData?.agent?.cronTotal ? `${statusData.agent.cronTotal} total, ${statusData.agent.cronJobs} active` : "Active schedules"}
            icon={Clock}
            className="bg-card/50 hover:bg-card/80 transition-colors cursor-pointer"
          />
        </Link>
        <Link href="/skills" className="contents">
          <StatCard
            title="Skills"
            value={statusError ? "Err" : (statusData?.agent?.skills || "-")}
            description="Installed capabilities"
            icon={Bot}
            className="bg-card/50 hover:bg-card/80 transition-colors cursor-pointer"
          />
        </Link>
        <Link href="/sessions" className="contents">
          <StatCard
            title="Sessions"
            value={sessionCount ?? "-"}
            description="Active conversations"
            icon={Users}
            className="bg-card/50 hover:bg-card/80 transition-colors cursor-pointer"
          />
        </Link>
      </div>

      {isError && (
        <div className="p-4 rounded-md bg-destructive/10 text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>Failed to connect to agent backend. Ensure local server is running.</span>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">

        {/* Recent Memory Widget */}
        <Card className="col-span-4 bg-card/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Recent Memory
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-2">
                {memoryData?.files?.length > 0 ? (
                  memoryData.files.slice(0, 10).map((file: { name: string; date: string }, i: number) => (
                    <Link key={i} href="/memory" className="block">
                      <div className="flex items-center p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                        <div className="w-[100px] text-sm font-semibold text-primary">{file.date}</div>
                        <div className="flex-1">
                          <div className="font-medium text-sm">{file.name.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '')}</div>
                        </div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground p-3">No memory files yet.</div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* System Info Widget */}
        <Card className="col-span-3 bg-card/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              System Info
            </CardTitle>
            <CardDescription>
              {isGateway ? (
                <span className="flex items-center gap-1">
                  <Zap className="h-3 w-3 text-green-500" /> Gateway connected
                </span>
              ) : (
                "Fallback mode"
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
             <div className="space-y-2">
               {statusData?.agent?.name && (
                 <div className="p-3 rounded-md border border-border bg-background/50 text-sm flex justify-between">
                    <span className="text-muted-foreground">Agent</span>
                    <span>{statusData.agent.emoji} {statusData.agent.name}</span>
                 </div>
               )}
               <div className="p-3 rounded-md border border-border bg-background/50 text-sm flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className={statusData?.status === "online" ? "text-green-500" : "text-red-500"}>
                    {statusData?.status === "online" ? "Online" : "Offline"}
                  </span>
               </div>
               <div className="p-3 rounded-md border border-border bg-background/50 text-sm flex justify-between">
                  <span className="text-muted-foreground">Platform</span>
                  <span>{statusData?.system?.platform || "..."}</span>
               </div>
               <div className="p-3 rounded-md border border-border bg-background/50 text-sm flex justify-between">
                  <span className="text-muted-foreground">Memory Usage</span>
                  <span>{statusData?.system?.memoryUsage ? `${statusData.system.memoryUsage}%` : "..."}</span>
               </div>
               <div className="p-3 rounded-md border border-border bg-background/50 text-sm flex justify-between">
                  <span className="text-muted-foreground">Uptime</span>
                  <span>{statusData?.system?.uptime ? `${(statusData.system.uptime / 3600).toFixed(1)}h` : "..."}</span>
               </div>
               <div className="p-3 rounded-md border border-border bg-background/50 text-sm">
                  <div className="flex justify-between mb-1">
                    <span className="text-muted-foreground">Heartbeat</span>
                    <span className="text-xs text-muted-foreground">
                      {statusData?.agent?.lastHeartbeat ? new Date(statusData.agent.lastHeartbeat).toLocaleTimeString() : "—"}
                    </span>
                  </div>
                  {statusData?.agent?.heartbeatContent && (
                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      {statusData.agent.heartbeatContent
                        .split("\n")
                        .filter((line: string) => line.startsWith("- ") || line.startsWith("# "))
                        .map((line: string, i: number) => (
                          <div key={i} className={line.startsWith("# ") ? "font-medium text-foreground" : ""}>
                            {line.startsWith("# ") ? line.replace(/^#+\s*/, "") : line}
                          </div>
                        ))}
                    </div>
                  )}
               </div>
             </div>
          </CardContent>
        </Card>
      </div>

      {/* Model Management */}
      {isGateway && (
        <Card className="bg-card/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-primary" />
              AI Model
            </CardTitle>
            <CardDescription>
              {currentModel ? (
                <span className="flex items-center gap-1.5">
                  <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border", providerColor(currentModelInfo?.provider || currentParsed.provider))}>
                    {providerLabel(currentModelInfo?.provider || currentParsed.provider)}
                  </span>
                  <span>{currentModelInfo?.name || currentParsed.name}</span>
                </span>
              ) : "No model configured"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6">
              {/* Left: Current Model + Fallbacks */}
              <div className="flex-1 min-w-0 space-y-4">
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Primary Model</div>
                  <div className="p-4 rounded-lg border border-primary/30 bg-primary/5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-base">{currentModelInfo?.name || currentParsed.name || "Not configured"}</span>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono mb-2">{currentModel || "—"}</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {(currentModelInfo?.provider || currentParsed.provider) && (
                        <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border", providerColor(currentModelInfo?.provider || currentParsed.provider))}>
                          {providerLabel(currentModelInfo?.provider || currentParsed.provider)}
                        </span>
                      )}
                      {currentModelInfo?.contextWindow && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-1">
                          <MessageSquare className="h-2.5 w-2.5" /> {formatContextWindow(currentModelInfo.contextWindow)} ctx
                        </span>
                      )}
                      {currentModelInfo?.reasoning && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 border border-yellow-500/20 flex items-center gap-1">
                          <Sparkles className="h-2.5 w-2.5" /> Reasoning
                        </span>
                      )}
                      {currentModelInfo?.input?.includes("image") && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 flex items-center gap-1">
                          <ImageIcon className="h-2.5 w-2.5" /> Vision
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Fallback Models */}
                {fallbackModels.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Fallback Models</div>
                    <div className="space-y-2">
                      {fallbackModels.map((fb, i) => {
                        const parsed = parseModelId(fb)
                        const info = models.find(m => m.id === fb)
                        return (
                          <button
                            key={i}
                            className="w-full p-3 rounded-md border border-border bg-background/50 text-sm flex items-center justify-between hover:bg-muted/30 hover:border-primary/30 transition-colors cursor-pointer text-left"
                            onClick={() => handleSwitchModel(fb)}
                            disabled={switchingModel !== null}
                            title="Click to set as primary model"
                          >
                            <div className="min-w-0">
                              <div className="font-medium truncate">{info?.name || parsed.name}</div>
                              <div className="text-[11px] text-muted-foreground font-mono truncate">{fb}</div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border", providerColor(info?.provider || parsed.provider))}>
                                {providerLabel(info?.provider || parsed.provider)}
                              </span>
                              {switchingModel === fb ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : null}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Available Models */}
              <div className="w-[380px] flex-none flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Available Models</div>
                  <span className="text-[10px] text-muted-foreground">{models.length} models</span>
                </div>
                <div className="relative mb-2">
                  <input
                    type="text"
                    placeholder="Search models..."
                    className="w-full px-3 py-1.5 text-xs bg-muted/50 rounded-md border border-border outline-none placeholder:text-muted-foreground focus:border-primary/50"
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                  />
                </div>
                <div className="flex-1 overflow-y-auto max-h-[400px] rounded-lg border border-border">
                  {Object.keys(modelsByProvider).length === 0 ? (
                    <div className="p-4 text-xs text-muted-foreground text-center">No models found</div>
                  ) : (
                    Object.entries(modelsByProvider).map(([provider, providerModels]) => (
                      <div key={provider}>
                        <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40 sticky top-0 z-10 border-b border-border/50">
                          {providerLabel(provider)}
                        </div>
                        {providerModels.map((model) => {
                          const isActive = model.id === currentModel
                          const isFallback = fallbackModels.includes(model.id)
                          return (
                            <button
                              key={model.id}
                              className={cn(
                                "w-full px-3 py-2 text-left hover:bg-muted/30 flex items-center gap-2 transition-colors border-b border-border/30 last:border-0",
                                isActive && "bg-primary/5 border-l-2 border-l-primary",
                                isFallback && !isActive && "bg-amber-500/5"
                              )}
                              onClick={() => handleSwitchModel(model.id)}
                              disabled={switchingModel !== null || isActive}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-medium text-xs truncate">{model.name || parseModelId(model.id).name}</span>
                                  {model.reasoning && <Sparkles className="h-3 w-3 text-yellow-400 shrink-0" />}
                                  {model.input?.includes("image") && <Eye className="h-3 w-3 text-cyan-400 shrink-0" />}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {model.contextWindow && (
                                    <span className="text-[10px] text-muted-foreground">{formatContextWindow(model.contextWindow)} ctx</span>
                                  )}
                                  {isActive && <span className="text-[10px] text-primary font-medium">Active</span>}
                                  {isFallback && !isActive && <span className="text-[10px] text-amber-400 font-medium">Fallback</span>}
                                </div>
                              </div>
                              {switchingModel === model.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                              ) : isActive ? (
                                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                              ) : null}
                            </button>
                          )
                        })}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Command Center Row */}
      <div className="grid gap-4 md:grid-cols-1">
         <ChatInterface className="bg-card/40 border-primary/20" />
      </div>
    </div>
  )
}
