import { NextRequest, NextResponse } from "next/server"

const BRIDGE_URL = process.env.TIGER_BRIDGE_URL || "http://localhost:3456"
const BRIDGE_TOKEN = process.env.TIGER_BRIDGE_TOKEN || ""

// Map gateway-style methods to bridge endpoints
const METHOD_MAP: Record<string, string> = {
  "status.canvas": "/tiger/status",
  "config.get": "/tiger/config",
  "config.set": "/tiger/config",
}

// Proxy to the bridge instead of trying to reach the gateway directly
// (gateway runs inside Tiger container - not accessible from dashboard)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ method: string[] }> }
) {
  const { method: methodParts } = await params
  const method = methodParts.join(".")

  // Map gateway method to bridge endpoint, or default to /tiger/status
  const bridgePath = METHOD_MAP[method] || `/tiger/${methodParts[0]}`

  try {
    const body = await request.json().catch(() => ({}))
    const res = await fetch(`${BRIDGE_URL}${bridgePath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${BRIDGE_TOKEN}`,
      },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json({ ok: res.ok, data })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gateway request failed"
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ method: string[] }> }
) {
  const { method: methodParts } = await params
  const method = methodParts.join(".")

  const bridgePath = METHOD_MAP[method] || `/tiger/${methodParts[0]}`

  try {
    const res = await fetch(`${BRIDGE_URL}${bridgePath}`, {
      headers: { "Authorization": `Bearer ${BRIDGE_TOKEN}` },
    })
    const data = await res.json()
    return NextResponse.json({ ok: res.ok, data })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gateway request failed"
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }
}