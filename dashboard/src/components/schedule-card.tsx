"use client"

/**
 * ScheduleCard — shows Tiger's cron jobs + scheduler status
 * Displayed on the dashboard home page.
 *
 * Fetches GET /api/tiger/cron → { ok, jobs[], status{} }
 * Each job row shows: name, schedule, next run, last run status, "Run now" button
 */

import * as React from "react"
import useSWR from "swr"
import { Clock, Play, CheckCircle2, XCircle, Loader2, CalendarClock, RefreshCw } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface CronJob {
  id: string
  name?: string
  label?: string
  schedule: string
  enabled: boolean
  nextRun?: string
  lastRun?: { status: string; at: string }
}

interface CronStatus {
  running?: boolean
  nextCheck?: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function relTime(iso: string | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const diff = d.getTime() - Date.now()
  const abs  = Math.abs(diff)
  const m    = Math.floor(abs / 60_000)
  const h    = Math.floor(m / 60)
  const suffix = diff > 0 ? "from now" : "ago"
  if (m < 1)  return diff > 0 ? "imminent" : "just now"
  if (m < 60) return `${m}m ${suffix}`
  if (h < 24) return `${h}h ${suffix}`
  return `${Math.floor(h / 24)}d ${suffix}`
}

export function ScheduleCard() {
  const { data, isLoading, mutate } = useSWR<{
    ok: boolean
    jobs: CronJob[]
    status: CronStatus
  }>("/api/tiger/cron", fetcher, { refreshInterval: 60_000 })

  const [running, setRunning] = React.useState<string | null>(null)
  const [runMsg, setRunMsg] = React.useState<Record<string, string>>({})

  const jobs = data?.jobs ?? []
  const schedulerRunning = data?.status?.running ?? false

  const handleRunNow = async (jobId: string) => {
    setRunning(jobId)
    try {
      const res = await fetch(`/api/tiger/cron/${jobId}/run`, { method: "POST" })
      const d = await res.json()
      setRunMsg((m) => ({ ...m, [jobId]: d.ok ? "triggered" : (d.error ?? "failed") }))
      setTimeout(() => setRunMsg((m) => { const n = { ...m }; delete n[jobId]; return n }), 4000)
    } catch {
      setRunMsg((m) => ({ ...m, [jobId]: "error" }))
    } finally {
      setRunning(null)
      mutate()
    }
  }

  return (
    <Card className="bg-card/40">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            Schedule
            {/* Scheduler health dot */}
            <span
              title={schedulerRunning ? "Scheduler active" : "Scheduler offline"}
              className={cn(
                "h-2 w-2 rounded-full",
                isLoading ? "bg-zinc-500" : schedulerRunning ? "bg-green-500" : "bg-red-500"
              )}
            />
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => mutate()}
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-20" />
            <p className="text-xs">No cron jobs configured.</p>
            <p className="text-xs mt-1 opacity-70">
              Use <span className="font-mono">openclaw cron add</span> to schedule Tiger.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => {
              const label = job.name ?? job.label ?? job.id
              const lastStatus = job.lastRun?.status?.toLowerCase() ?? ""
              const isOk  = lastStatus === "success" || lastStatus === "ok" || lastStatus === "done"
              const isFail= lastStatus === "failed" || lastStatus === "error"

              return (
                <div
                  key={job.id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                    job.enabled ? "hover:bg-muted/30" : "opacity-50"
                  )}
                >
                  {/* Last run status icon */}
                  {isOk   && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                  {isFail && <XCircle      className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                  {!isOk && !isFail && (
                    <Clock className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                  )}

                  {/* Name + schedule */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{label}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{job.schedule}</div>
                  </div>

                  {/* Next run */}
                  <div className="text-[10px] text-muted-foreground shrink-0 text-right">
                    {job.nextRun ? (
                      <>
                        <div className="text-foreground/60">{relTime(job.nextRun)}</div>
                        <div className="opacity-50">next</div>
                      </>
                    ) : job.lastRun?.at ? (
                      <>
                        <div className="text-foreground/60">{relTime(job.lastRun.at)}</div>
                        <div className="opacity-50">last run</div>
                      </>
                    ) : "—"}
                  </div>

                  {/* Run now */}
                  {job.enabled && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => handleRunNow(job.id)}
                      disabled={running === job.id}
                      title={runMsg[job.id] ?? "Run now"}
                    >
                      {running === job.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Play className="h-3 w-3" />
                      }
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
