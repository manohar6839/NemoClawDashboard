// GET /api/tiger/agents/[id]/files?path=... — proxy to bridge
import { NextResponse } from "next/server";
import { bridgeGet } from "@/lib/bridge";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path") ?? "";
  try {
    const query: Record<string, string> = {};
    if (path) query.path = path;
    const result = await bridgeGet(`/tiger/agents/${id}/files`, query);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 502 });
  }
}
