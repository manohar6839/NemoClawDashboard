/**
 * /api/tiger/restart — POST
 *
 * Trigger a Tiger container restart via the gateway watchdog script.
 *
 * Request body (optional):
 *   { reason: "string" }
 *
 * Response:
 *   { ok: true, message: "Tiger restart triggered", reason: "..." }
 *   { ok: false, error: "...", reason: "..." }
 */

import { NextResponse } from "next/server";
import { bridgePost } from "@/lib/bridge";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};

  try {
    body = await request.json();
  } catch {
    // Body is optional — ignore parse errors
  }

  const reason = (body.reason as string) || "manual restart via dashboard";

  try {
    const result = await bridgePost("/tiger/restart", { reason });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "Failed to restart Tiger", details: err.message, reason },
      { status: 502 }
    );
  }
}
