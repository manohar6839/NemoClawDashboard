/**
 * /api/chat/telegram-thread — proxy for the bridge's Telegram mirror.
 *
 * GET ?limit=50&before=<seq>
 * Same proxy pattern as /api/chat/history: the bridge bearer token stays on
 * the server, the browser only ever talks to this route.
 */

import { NextRequest, NextResponse } from "next/server";

const BRIDGE_URL = process.env.TIGER_BRIDGE_URL || "http://localhost:3456";
const BRIDGE_TOKEN = process.env.TIGER_BRIDGE_TOKEN || "";

export async function GET(request: NextRequest) {
  const limit = request.nextUrl.searchParams.get("limit") || "50";
  const before = request.nextUrl.searchParams.get("before") || "";
  const qs = new URLSearchParams({ limit });
  if (before) qs.set("before", before);

  try {
    const r = await fetch(`${BRIDGE_URL}/tiger/chat/telegram?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${BRIDGE_TOKEN}` },
      cache: "no-store",
    });
    const data = await r.json();
    return NextResponse.json(data, { status: r.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: "Bridge unreachable", details: message },
      { status: 502 },
    );
  }
}
