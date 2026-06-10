"use client"

/**
 * /activity — the complete audit trail.
 *
 * Every durable action in one timeline: sub-agent spawns, task lifecycle,
 * artifacts written, cron runs, file modifications. Type filters + "Load
 * older" pagination walk the entire history so nothing escapes audit.
 */

import { useCallback, useEffect, useState } from "react"
import { ScrollText, ChevronDown } from "lucide-react"

interface ActivityEntry {
  id: string
  ts: string
  type: string
  actor: string
  summary: string
  status?: string
}

const TYPES = [
  { id: "spawn", label: "Spawns" },
  { id: "cron", label: "Cron" },
  { id: "task", label: "Tasks" },
  { id: "output", label: "Outputs" },
  { id: "file", label: "Files" },
]

const TYPE_COLORS: Record<string, string> = {
  spawn: "text-violet-400 border-violet-400/30",
  cron: "text-sky-400 border-sky-400/30",
  task: "text-amber-400 border-amber-400/30",
  output: "text-emerald-400 border-emerald-400/30",
  file: "text-muted-foreground border-border",
}

const STATUS_COLORS: Record<string, string> = {
  done: "text-emerald-400",
  ok: "text-emerald-400",
  running: "text-sky-400",
  error: "text-red-400",
}

export default function ActivityPage() {
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [active, setActive] = useState<Set<string>>(new Set(TYPES.map((t) => t.id)))
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPage = useCallback(
    async (before?: string) => {
      const qs = new URLSearchParams({ limit: "100" })
      if (before) qs.set("before", before)
      if (active.size < TYPES.length) qs.set("types", Array.from(active).join(","))
      const r = await fetch(`/api/activity?${qs.toString()}`)
      return r.json() as Promise<{
        entries?: ActivityEntry[]
        hasMore?: boolean
        oldestTs?: string | null
        error?: string
      }>
    },
    [active],
  )

  // (Re)load whenever filters change
  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchPage()
      .then((data) => {
        if (data.entries) {
          setEntries(data.entries)
          setHasMore(Boolean(data.hasMore))
        } else setError(data.error || "No data")
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [fetchPage])

  const loadOlder = async () => {
    if (loadingMore || entries.length === 0) return
    setLoadingMore(true)
    try {
      const data = await fetchPage(entries[entries.length - 1].ts)
      if (data.entries && data.entries.length > 0) {
        setEntries((prev) => {
          const known = new Set(prev.map((e) => e.id))
          return [...prev, ...data.entries!.filter((e) => !known.has(e.id))]
        })
        setHasMore(Boolean(data.hasMore))
      } else setHasMore(false)
    } finally {
      setLoadingMore(false)
    }
  }

  const toggle = (id: string) =>
    setActive((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        if (next.size > 1) next.delete(id) // never filter down to nothing
      } else next.add(id)
      return next
    })

  const fmt = (ts: string) =>
    new Date(ts).toLocaleString([], {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-2 mb-1">
        <ScrollText className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Activity</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Complete audit trail — spawns, cron runs, tasks, outputs, file changes.
      </p>

      <div className="flex flex-wrap gap-2 mb-5">
        {TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => toggle(t.id)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              active.has(t.id)
                ? TYPE_COLORS[t.id] + " bg-muted/30"
                : "text-muted-foreground/40 border-border/40"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-sm text-muted-foreground py-8">Loading…</div>}
      {error && <div className="text-sm text-red-500 py-8">Error: {error}</div>}

      {!loading && !error && (
        <div className="flex flex-col">
          {entries.length === 0 && (
            <div className="text-sm text-muted-foreground py-8">No events.</div>
          )}
          {entries.map((e) => (
            <div
              key={e.id}
              className="flex items-start gap-3 py-2.5 border-b border-border/40 text-sm"
            >
              <span className="text-[11px] text-muted-foreground/70 w-28 shrink-0 pt-0.5">
                {fmt(e.ts)}
              </span>
              <span
                className={`text-[10px] uppercase tracking-wide border rounded px-1.5 py-0.5 shrink-0 ${TYPE_COLORS[e.type] ?? TYPE_COLORS.file}`}
              >
                {e.type}
              </span>
              <span className="flex-1 break-words">
                <span className="text-muted-foreground">{e.actor}</span>{" "}
                {e.summary}
                {e.status && (
                  <span className={`ml-2 text-[11px] ${STATUS_COLORS[e.status] ?? "text-muted-foreground"}`}>
                    {e.status}
                  </span>
                )}
              </span>
            </div>
          ))}

          {hasMore && (
            <button
              onClick={loadOlder}
              disabled={loadingMore}
              className="self-center mt-4 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 py-1.5 px-3 rounded hover:bg-muted/40 transition-colors"
            >
              <ChevronDown className="h-3 w-3" />
              {loadingMore ? "Loading…" : "Load older"}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
