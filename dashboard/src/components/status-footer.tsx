"use client"

/**
 * status-footer.tsx — Thin status strip at the bottom of the home page
 *
 * The OLD home page made "is Tiger alive" the headline. The NEW home page
 * relegates it to a footer strip. When something IS wrong, the strip
 * promotes itself into a banner with a Restart button.
 */

import * as React from "react"
import useSWR from "swr"
import { cn } from "@/lib/utils"
import { AlertCircle, RefreshCw, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useBridgeRequest } from "@/hooks/use-bridge"

interface TigerStatus {
  status: "online" | "degraded" | "offline"
  container: {
    status: string
    exitCode: number
    startedAt: string
  }
  openclaw: { running: boolean }
  system: { memoryUsagePct: number; memoryTotalMb: number }
  agent: { currentModel: string }
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function uptimeShort(startedAt: string): string {
  if (!startedAt) return "—"
  const start = new Date(startedAt).getTime()
  const diff = Date.now() - start
  const m = Math.floor(diff / 60_000)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

function shortModel(m: string): string {
  if (!m) return "—"
  const parts = m.split("/")
  return parts[parts.length - 1].replace(/:.*$/, "")
}

export function StatusFooter() {
  const { data, error } = useSWR<TigerStatus>("/api/tiger/status", fetcher, {
    refreshInterval: 10_000,
  })

  const { request } = useBridgeRequest()
  const [restarting, setRestarting] = React.useState(false)

  const isCrashed = data?.container?.exitCode === 255
  const isOffline = error || data?.status === "offline"

  const handleRestart = async () => {
    setRestarting(true)
    try {
      await request("/api/tiger/restart", "POST")
      setTimeout(() => setRestarting(false), 3000)
    } catch (e) {
      console.error("Restart failed:", e)
      setRestarting(false)
    }
  }

  if (isCrashed) {
    return (
      <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="font-medium">Tiger crashed</span>
          <span className="text-red-400/80 text-xs">
            (exit 255 — {shortModel(data?.agent?.currentModel || "")} unreachable)
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRestart}
          disabled={restarting}
          className="border-red-500/30 text-red-400 hover:bg-red-500/10 h-7"
        >
          {restarting ? (
            <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3 mr-1.5" />
          )}
          Restart
        </Button>
      </div>
    )
  }

  if (isOffline) {
    return (
      <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center gap-2 text-sm">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>Bridge unreachable. Status data may be stale.</span>
      </div>
    )
  }

  const dotClass =
    data?.status === "online"   ? "bg-green-500"  :
    data?.status === "degraded" ? "bg-amber-500"  :
                                   "bg-zinc-500"

  return (
    <div className="flex items-center gap-4 px-4 py-2 rounded-md bg-card/30 border border-border/40 text-xs text-muted-foreground flex-wrap">
      <span className="flex items-center gap-1.5">
        <span className={cn("h-2 w-2 rounded-full", dotClass)} />
        <span>up {uptimeShort(data?.container?.startedAt || "")}</span>
      </span>

      <span className="tabular-nums">
        {data?.system?.memoryUsagePct ?? 0}% mem
      </span>

      <span className="font-mono text-[11px]">
        {shortModel(data?.agent?.currentModel || "")}
      </span>

      <span className="ml-auto text-muted-foreground/60">
        ₹— today
      </span>
    </div>
  )
}
