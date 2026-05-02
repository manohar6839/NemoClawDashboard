// GET /api/tiger/keys — returns key presence (never values)
// PATCH /api/tiger/keys — set one or more keys

import { NextRequest, NextResponse } from "next/server";
import { bridgeGet, bridgePatch } from "@/lib/bridge";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await bridgeGet("/tiger/keys");
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await bridgePatch("/tiger/keys", body as Record<string, unknown>);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 502 });
  }
}
