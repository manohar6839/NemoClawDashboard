import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const ANGEL_API_URL = process.env.ANGEL_API_URL || "https://angel.manohargupta.com"

async function angelFetch(path: string) {
  const res = await fetch(`${ANGEL_API_URL}${path}`, { cache: "no-store" })
  if (!res.ok) throw new Error(`angel API ${path} failed: ${res.status}`)
  return res.json()
}

export async function GET() {
  try {
    const [posData, histData] = await Promise.all([
      angelFetch("/api/positions"),
      angelFetch("/api/pnl-history"),
    ])
    return NextResponse.json({ ok: true, positions: posData.data ?? [], summary: histData.summary ?? {} })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 502 })
  }
}

export async function POST() {
  try {
    const res = await fetch(`${ANGEL_API_URL}/api/refresh`, { method: "POST", cache: "no-store" })
    if (!res.ok) throw new Error(`refresh failed: ${res.status}`)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 502 })
  }
}
