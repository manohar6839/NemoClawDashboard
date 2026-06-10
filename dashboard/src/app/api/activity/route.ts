/**
 * /api/activity — unified audit feed for the Activity page.
 *
 * Merges two bridge sources:
 *   /tiger/activity/audit    durable history: spawns, tasks, outputs, cron
 *                            runs — paginated, complete
 *   /tiger/agents/activity   recent file-modification events (in-memory,
 *                            recent-only by nature; merged for first page)
 *
 * ?limit=100&before=<ISO>&types=spawn,cron,task,output,file
 */

import { NextResponse } from "next/server"
import { bridgeGet } from "@/lib/bridge"

export const dynamic = "force-dynamic"

interface AuditEvent {
  id: string
  ts: string
  type: string
  actor: string
  summary: string
  status?: string
  ref?: string
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10), 500)
  const before = url.searchParams.get("before") || ""
  const types = url.searchParams.get("types") || ""

  try {
    const qs = new URLSearchParams({ limit: String(limit) })
    if (before) qs.set("before", before)
    if (types) qs.set("types", types.split(",").filter((t) => t !== "file").join(","))

    const audit = (await bridgeGet(`/tiger/activity/audit?${qs.toString()}`)) as {
      ok: boolean
      events?: AuditEvent[]
      hasMore?: boolean
      oldestTs?: string | null
    }

    let events: AuditEvent[] = audit?.events ?? []

    // File events only exist for the recent window — merge them into the
    // first page (no `before` cursor) when not filtered out.
    const wantFiles = !types || types.split(",").includes("file")
    if (!before && wantFiles) {
      try {
        const fileData = (await bridgeGet("/tiger/agents/activity")) as {
          ok: boolean
          events?: Array<{ agentId: string; agentName: string; path: string; action: string; ts: number }>
        }
        if (fileData?.ok && fileData.events) {
          events = events.concat(
            fileData.events.map((e) => ({
              id: `file:${e.agentId}:${e.ts}`,
              ts: new Date(e.ts).toISOString(),
              type: "file",
              actor: e.agentName,
              summary: `${e.action || "modified"} ${e.path}`,
            })),
          )
        }
      } catch { /* file source down — audit sources still serve */ }
    }

    events.sort((a, b) => (a.ts < b.ts ? 1 : -1))
    const page = events.slice(0, limit)

    return NextResponse.json({
      entries: page,
      hasMore: Boolean(audit?.hasMore) || events.length > page.length,
      oldestTs: page.length > 0 ? page[page.length - 1].ts : null,
    })
  } catch {
    return NextResponse.json({ error: "Failed to fetch activity" }, { status: 500 })
  }
}
