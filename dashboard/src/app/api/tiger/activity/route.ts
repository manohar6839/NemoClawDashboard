// GET /api/tiger/activity?limit=50 — proxy to bridge
import { NextResponse } from "next/server";
import { bridgeGet } from "@/lib/bridge";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit") ?? "50";
  try {
    const result = await bridgeGet("/tiger/agents/activity", { limit });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 502 });
  }
}
