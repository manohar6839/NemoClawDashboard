/**
 * /api/tiger/agents-activity — Agent Activity Proxy
 *
 * Reads per-agent activity from Tiger's workspace via bridge endpoint.
 */

import { NextResponse } from "next/server";
import { bridgeGet } from "@/lib/bridge";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await bridgeGet("/tiger/agents/activity");
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
