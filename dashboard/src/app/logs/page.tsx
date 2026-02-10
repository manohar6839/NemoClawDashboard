"use client"

import * as React from "react"
import { ScrollText, RotateCcw, Loader2, Pause, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useGatewayRequest, useGatewayEvents } from "@/hooks/use-gateway"
import { cn } from "@/lib/utils"

interface LogEntry {
  id: string
  timestamp: string
  level: string
  message: string
  subsystem?: string
}

export default function LogsPage() {
  const { request } = useGatewayRequest()
  const [logs, setLogs] = React.useState<LogEntry[]>([])
  const [loading, setLoading] = React.useState(true)
  const [paused, setPaused] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const pausedRef = React.useRef(false)
  pausedRef.current = paused

  // Load initial logs
  React.useEffect(() => {
    request("logs.tail", { lines: 100 })
      .then((data: unknown) => {
        const result = data as { logs?: LogEntry[]; lines?: string[] }
        if (result?.logs) {
          setLogs(result.logs)
        } else if (result?.lines) {
          setLogs(result.lines.map((line, i) => parseLogLine(line, i)))
        } else if (Array.isArray(data)) {
          setLogs((data as string[]).map((line, i) => parseLogLine(String(line), i)))
        }
      })
      .catch(() => {
        setLogs([{ id: "err", timestamp: new Date().toISOString(), level: "ERROR", message: "Failed to load logs. Is the gateway running?" }])
      })
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Subscribe to live events for log-like data
  useGatewayEvents((event, payload) => {
    if (pausedRef.current) return
    const data = payload as Record<string, unknown>
    const entry: LogEntry = {
      id: `live-${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: `[${event}] ${JSON.stringify(data).slice(0, 200)}`,
      subsystem: event,
    }
    setLogs(prev => [...prev.slice(-500), entry])
  }, [])

  // Auto-scroll
  React.useEffect(() => {
    if (!paused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs, paused])

  const handleClear = () => setLogs([])

  function levelColor(level: string) {
    if (level === "ERROR") return "text-red-400"
    if (level === "WARN") return "text-yellow-400"
    if (level === "DEBUG") return "text-gray-500"
    return "text-muted-foreground"
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live Logs</h1>
          <p className="text-muted-foreground">Real-time gateway event stream.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPaused(!paused)}>
            {paused ? <Play className="h-4 w-4 mr-1" /> : <Pause className="h-4 w-4 mr-1" />}
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleClear}>
            <RotateCcw className="h-4 w-4 mr-1" /> Clear
          </Button>
        </div>
      </div>

      <div className="flex-1 border rounded-lg overflow-hidden bg-black/90">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="h-full" ref={scrollRef}>
            <div className="p-4 font-mono text-xs space-y-0.5">
              {logs.map(entry => (
                <div key={entry.id} className="flex gap-2 hover:bg-white/5 px-1 rounded">
                  <span className="text-gray-600 flex-shrink-0 w-[80px]">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={cn("flex-shrink-0 w-[50px]", levelColor(entry.level))}>
                    {entry.level}
                  </span>
                  {entry.subsystem && (
                    <span className="text-blue-400 flex-shrink-0">[{entry.subsystem}]</span>
                  )}
                  <span className="text-gray-300 break-all">{entry.message}</span>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="text-gray-600 text-center py-8">
                  <ScrollText className="mx-auto h-8 w-8 mb-2 opacity-50" />
                  No log entries yet. Events will appear here in real-time.
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}

function parseLogLine(line: string, index: number): LogEntry {
  try {
    const parsed = JSON.parse(line)
    return {
      id: `log-${index}`,
      timestamp: parsed.time || parsed._meta?.date || new Date().toISOString(),
      level: parsed._meta?.logLevelName || "INFO",
      message: parsed["0"] || JSON.stringify(parsed),
      subsystem: parsed._meta?.name || undefined,
    }
  } catch {
    return {
      id: `log-${index}`,
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: line,
    }
  }
}
