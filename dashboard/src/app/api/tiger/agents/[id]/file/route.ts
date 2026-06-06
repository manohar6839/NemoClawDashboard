// GET + PUT /api/tiger/agents/[id]/file?path=...
import { NextResponse } from "next/server";
import { bridgeGet, bridgePut } from "@/lib/bridge";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path") ?? "";
  if (!path) return NextResponse.json({ ok: false, error: "Missing path" }, { status: 400 });
  try {
    const result = await bridgeGet(`/tiger/agents/${id}/file`, { path });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 502 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path") ?? "";
  if (!path) return NextResponse.json({ ok: false, error: "Missing path" }, { status: 400 });
  try {
    const body = await request.json();
    const result = await bridgePut(`/tiger/agents/${id}/file`, { path }, body as Record<string, unknown>);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 502 });
  }
}
