import { NextRequest, NextResponse } from "next/server"
import { getGateway } from "@/lib/gateway"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ method: string[] }> }
) {
  const { method: methodParts } = await params
  const method = methodParts.join(".")

  try {
    const body = await request.json().catch(() => ({}))
    const gw = getGateway()
    const result = await gw.request(method, body)
    return NextResponse.json({ ok: true, data: result })
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

  try {
    const gw = getGateway()
    const result = await gw.request(method)
    return NextResponse.json({ ok: true, data: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gateway request failed"
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }
}
