// PATCH /api/tiger/config/models/agents/[id] — set or clear a per-agent model override
// Next.js 15+ requires params to be awaited (they are now a Promise)
import { NextRequest, NextResponse } from "next/server";
import { bridgePatch } from "@/lib/bridge";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const result = await bridgePatch(
      `/tiger/config/models/agents/${id}`,
      body as Record<string, unknown>
    );
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 502 });
  }
}
