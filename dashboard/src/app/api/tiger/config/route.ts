/**
 * /api/tiger/config — GET + POST
 *
 * GET  — Read the current openclaw.json config
 * POST — Update config with a patch (deep-merged + hash regenerated)
 *
 * POST body:
 *   {
 *     patch: {
 *       model: { primary: "openrouter/anthropic/claude-opus-4" }
 *     }
 *   }
 *
 * The bridge handles deep-merging and hash regeneration automatically.
 */

import { NextResponse } from "next/server";
import { bridgeGet, bridgePost } from "@/lib/bridge";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await bridgeGet("/tiger/config");
    return NextResponse.json(config);
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "Failed to read config", details: err.message },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { patch } = body;

  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return NextResponse.json(
      { ok: false, error: "Request body must contain a 'patch' object" },
      { status: 400 }
    );
  }

  try {
    const result = await bridgePost("/tiger/config", { patch });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "Failed to update config", details: err.message },
      { status: 502 }
    );
  }
}
