import { NextRequest } from "next/server"

const BRIDGE = "http://127.0.0.1:3456"
const TOKEN = "14fb879429386b69beac339bbd98e43011ec29485da17592410da34ed97e0236"

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url") || "/knowledge"
  
  try {
    const res = await fetch(`${BRIDGE}${url}`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    })
    const data = await res.json()
    return Response.json(data)
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const url = request.nextUrl.searchParams.get("url") || "/knowledge"
  
  try {
    const res = await fetch(`${BRIDGE}${url}`, {
      method: "POST",
      headers: { 
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    })
    const data = await res.json()
    return Response.json(data)
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}