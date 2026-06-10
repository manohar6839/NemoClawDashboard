/** /api/health/system — proxy for the bridge's layered self-diagnosis. */
import { NextResponse } from "next/server"
import { bridgeGet } from "@/lib/bridge"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const data = await bridgeGet("/tiger/health/system")
    return NextResponse.json(data)
  } catch {
    // Bridge itself unreachable IS a finding — surface it as critical.
    return NextResponse.json({
      ok: true,
      verdict: "critical",
      issues: ["Bridge unreachable from dashboard — control plane is down"],
      checks: {},
      checkedAt: new Date().toISOString(),
    })
  }
}
