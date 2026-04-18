/**
 * /api/tiger/dispatch — Task dispatch proxy
 *
 * POST /api/tiger/dispatch
 * Body: { taskId, title, description, assignedAgent, context }
 */

import { NextResponse } from "next/server";
import { bridgePost } from "@/lib/bridge";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await bridgePost("/tiger/dispatch", body);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

