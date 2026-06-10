"use client"

/**
 * HealthBanner — surfaces system degradation the moment it exists.
 *
 * Polls /api/health/system every 30s. Renders NOTHING while healthy (a
 * banner that's always there is a banner nobody reads). On degraded it
 * shows an amber strip with each issue; on critical, red. Click toggles
 * the detail list. The point: "⚠️ Tiger timed out" on Telegram should
 * never again be the first place a failure shows up.
 */

import { useEffect, useState } from "react"
import { AlertTriangle, OctagonAlert, ChevronDown } from "lucide-react"

interface Health {
  verdict: "healthy" | "degraded" | "critical"
  issues: string[]
  checkedAt: string
}

const POLL_MS = 30_000

export function HealthBanner() {
  const [health, setHealth] = useState<Health | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    const load = () =>
      fetch("/api/health/system")
        .then((r) => r.json())
        .then((d: Health) => { if (alive && d?.verdict) setHealth(d) })
        .catch(() => { /* next poll retries */ })
    load()
    const t = setInterval(load, POLL_MS)
    return () => { alive = false; clearInterval(t) }
  }, [])

  if (!health || health.verdict === "healthy") return null

  const critical = health.verdict === "critical"
  const Icon = critical ? OctagonAlert : AlertTriangle
  const tone = critical
    ? "bg-red-500/10 border-red-500/40 text-red-400"
    : "bg-amber-500/10 border-amber-500/40 text-amber-400"

  return (
    <button
      onClick={() => setOpen((v) => !v)}
      className={`w-full text-left rounded-lg border px-4 py-2.5 mb-4 ${tone}`}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 shrink-0" />
        System {health.verdict} — {health.issues.length} issue
        {health.issues.length === 1 ? "" : "s"}
        <ChevronDown
          className={`h-3.5 w-3.5 ml-auto transition-transform ${open ? "rotate-180" : ""}`}
        />
      </span>
      {open && (
        <ul className="mt-2 ml-6 list-disc text-[13px] space-y-1 text-foreground/80">
          {health.issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
    </button>
  )
}
