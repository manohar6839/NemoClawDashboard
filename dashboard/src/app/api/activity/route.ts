import { NextResponse } from "next/server"
import { bridgeGet } from "@/lib/bridge"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const limit = parseInt(url.searchParams.get("limit") || "50", 10)

    // Get activity from bridge endpoint that already works
    const bridgeData = await bridgeGet("/tiger/agents/activity") as {
      ok: boolean
      events: Array<{
        agentId: string
        agentName: string
        agentEmoji: string
        path: string
        action: string
        ts: number
      }>
    }

    if (!bridgeData?.ok || !bridgeData.events) {
      return NextResponse.json({ entries: [], total: 0 })
    }

    // Transform bridge format to activity format
    const entries = bridgeData.events.slice(0, limit).map((e) => ({
      id: `${e.agentId}-${e.ts}`,
      type: "system",
      timestamp: new Date(e.ts).toISOString(),
      description: `${e.agentName} modified ${e.path}`,
      source: e.agentId,
    }))

    return NextResponse.json({
      entries,
      total: bridgeData.events.length,
    })
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch activity" }, { status: 500 })
  }
}