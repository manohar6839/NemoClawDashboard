import { NextResponse } from "next/server"
import os from "os"

const BRIDGE_URL = process.env.TIGER_BRIDGE_URL || "http://localhost:3456"
const BRIDGE_TOKEN = process.env.TIGER_BRIDGE_TOKEN || ""

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const freeMem = os.freemem()
    const totalMem = os.totalmem()
    const memUsage = Math.round(((totalMem - freeMem) / totalMem) * 100)

    // Use bridge's /tiger/status instead of gateway directly
    // Gateway runs inside Tiger container and is not directly accessible
    let agentStatus = "offline"
    let gatewayConnected = false
    let tigerStatus: any = null

    try {
      const res = await fetch(`${BRIDGE_URL}/tiger/status`, {
        headers: { "Authorization": `Bearer ${BRIDGE_TOKEN}` },
      })
      if (res.ok) {
        tigerStatus = await res.json()
        agentStatus = tigerStatus?.status === "online" ? "online" : "degraded"
        gatewayConnected = tigerStatus?.status === "online"
      }
    } catch { /* offline */ }

    return NextResponse.json({
      status: agentStatus,
      gateway: gatewayConnected,
      system: { memoryUsage: memUsage, uptime: os.uptime(), platform: os.platform() },
      agent: {
        name: "Tiger",
        skills: 0,
        cronJobs: 0,
        lastHeartbeat: tigerStatus?.agent?.heartbeat,
        currentModel: tigerStatus?.agent?.currentModel,
        fallbackModels: tigerStatus?.agent?.fallbackModels || [],
        container: tigerStatus?.container?.status,
        memoryUsagePct: tigerStatus?.system?.memoryUsagePct,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch status" }, { status: 500 })
  }
}