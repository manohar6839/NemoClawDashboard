/**
 * Logs Page — Real-time Tiger container log viewer
 *
 * Uses the Tiger Bridge's SSE stream (/api/tiger/logs) instead of the
 * old WebSocket gateway. Key differences:
 *   - Before: gateway events (agent thoughts/actions) via WebSocket
 *   - Now: actual Docker container logs via SSE → much more useful for debugging
 *
 * Features:
 *   - Live streaming with auto-scroll
 *   - Pause/resume
 *   - Keyword filter (reconnects SSE with filter param)
 *   - Color-coded log levels
 *   - Clear button
 */

"use client"

import * as React from "react"
import { ScrollText, RotateCcw, Loader2, Pause, Play, Filter, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useTigerLogs } from "@/hooks/use-bridge"
import { cn } from "@/lib/utils"

export default function LogsPage() {
  // filterInput is the text currently in the search box (controlled input)
  const [filterInput, setFilterInput] = React.useState("")
  // activeFilter is what we actually pass to the SSE hook (applied on Enter/button)
  const [activeFilter, setActiveFilter] = React.useState("")

  /**
   * useTigerLogs opens an EventSource to /api/tiger/logs
   * and handles reconnection automatically.
   */
  const { logs, connected, paused, clear, pause, resume } = useTigerLogs({
    lines: 150,           // tail 150 lines of history first
    filter: activeFilter, // keyword filter applied server-side
    maxLines: 600,        // keep at most 600 lines in memory
  })

  // Ref to the scroll container so we can auto-scroll to bottom
  const scrollRef = React.useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new logs arrive (unless paused)
  React.useEffect(() => {
    if (!paused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs, paused])

  // Apply filter: reconnect SSE with the new filter keyword
  const applyFilter = () => {
    setActiveFilter(filterInput)
    clear() // Clear old entries when filter changes
  }

  const clearFilter = () => {
    setFilterInput("")
    setActiveFilter("")
    clear()
  }

  // Color codes for log levels — matches the terminal convention
  function levelColor(level: string) {
    switch (level) {
      case "ERROR": return "text-red-400"
      case "WARN":  return "text-yellow-400"
      case "DEBUG": return "text-gray-500"
      default:      return "text-gray-400" // INFO
    }
  }

  // Faint background highlight for errors
  function rowBg(level: string) {
    if (level === "ERROR") return "bg-red-950/20"
    if (level === "WARN")  return "bg-yellow-950/10"
    return ""
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col gap-3 p-4">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tiger Logs</h1>
          <p className="text-sm text-muted-foreground">
            Live Docker container logs via Tiger Bridge
          </p>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border",
              connected
                ? "bg-green-500/10 text-green-400 border-green-500/20"
                : "bg-gray-500/10 text-gray-400 border-gray-500/20"
            )}
          >
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                connected ? "bg-green-400 animate-pulse" : "bg-gray-500"
              )}
            />
            {connected ? "Streaming" : "Connecting..."}
          </span>
        </div>
      </div>

      {/* ── Controls ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {/* Filter box */}
        <div className="flex items-center gap-1 flex-1 max-w-xs">
          <div className="relative flex-1">
            <Filter className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-7 h-8 text-xs"
              placeholder="Filter keyword..."
              value={filterInput}
              onChange={(e) => setFilterInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
            />
            {filterInput && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={clearFilter}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={applyFilter}>
            Apply
          </Button>
        </div>

        {/* Active filter badge */}
        {activeFilter && (
          <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Filter: &quot;{activeFilter}&quot;
          </span>
        )}

        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={paused ? resume : pause}
          >
            {paused ? (
              <><Play className="h-3.5 w-3.5 mr-1" /> Resume</>
            ) : (
              <><Pause className="h-3.5 w-3.5 mr-1" /> Pause</>
            )}
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={clear}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        </div>
      </div>

      {/* ── Log viewer ─────────────────────────────────────────────── */}
      <div className="flex-1 border rounded-lg overflow-hidden bg-black/90 min-h-0">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600">
            <ScrollText className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">
              {connected
                ? "Waiting for logs…"
                : "Connecting to Tiger Bridge…"}
            </p>
            {!connected && (
              <p className="text-xs mt-1 opacity-60">
                Make sure the Tiger Bridge is running on the VPS
              </p>
            )}
          </div>
        ) : (
          // ScrollArea component wraps a scrollable div
          // We give it a ref so we can programmatically scroll to bottom
          <div
            className="h-full overflow-y-auto p-3 font-mono text-xs space-y-0.5"
            ref={scrollRef}
          >
            {logs.map((entry) => (
              <div
                key={entry.id}
                className={cn(
                  "flex gap-2 px-1 py-0.5 rounded hover:bg-white/5",
                  rowBg(entry.level)
                )}
              >
                {/* Timestamp — short format for readability */}
                <span className="text-gray-600 flex-shrink-0 w-[70px] tabular-nums">
                  {new Date(entry.ts).toLocaleTimeString("en-US", {
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>

                {/* Level badge */}
                <span className={cn("flex-shrink-0 w-[45px] font-semibold", levelColor(entry.level))}>
                  {entry.level}
                </span>

                {/* Log text — break-all prevents long lines from overflowing */}
                <span className="text-gray-300 break-all leading-relaxed">
                  {entry.text}
                </span>
              </div>
            ))}

            {/* Pause indicator at the bottom */}
            {paused && (
              <div className="text-center py-2 text-yellow-500/60 text-xs">
                ── paused ──
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer info ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{logs.length} lines</span>
        {activeFilter && <span>Filtered: &quot;{activeFilter}&quot;</span>}
        <span>Source: docker logs → Tiger Bridge SSE</span>
      </div>
    </div>
  )
}
