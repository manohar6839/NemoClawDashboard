// GET /api/tiger/config/models/agents — per-agent model overrides + defaults
import { NextResponse } from "next/server";
import { bridgeGet } from "@/lib/bridge";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await bridgeGet("/tiger/config/models/agents");
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 502 });
  }
}
