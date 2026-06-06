/**
 * /api/chat/history — proxy for bridge's chat history.
 *   GET    — list persisted messages for the default session
 *   DELETE — clear them
 *
 * Why a proxy and not a direct bridge call from the client?
 *   - Keeps the bridge auth token on the server side (never leaks to browser)
 *   - Matches the pattern used by /api/chat (POST) and /api/tiger/status
 */

import { NextRequest, NextResponse } from "next/server";

const BRIDGE_URL = process.env.TIGER_BRIDGE_URL || "http://localhost:3456";
const BRIDGE_TOKEN = process.env.TIGER_BRIDGE_TOKEN || "";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId") || "";
  const qs = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
  try {
    const r = await fetch(`${BRIDGE_URL}/tiger/chat/history${qs}`, {
      headers: { Authorization: `Bearer ${BRIDGE_TOKEN}` },
      cache: "no-store",
    });
    const data = await r.json();
    return NextResponse.json(data, { status: r.status });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "Bridge unreachable", details: err.message },
      { status: 502 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId") || "";
  const qs = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
  try {
    const r = await fetch(`${BRIDGE_URL}/tiger/chat/history${qs}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${BRIDGE_TOKEN}` },
    });
    const data = await r.json();
    return NextResponse.json(data, { status: r.status });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "Bridge unreachable", details: err.message },
      { status: 502 }
    );
  }
}
