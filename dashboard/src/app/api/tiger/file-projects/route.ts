/**
 * /api/tiger/file-projects — Tiger Workspace Projects Proxy
 *
 * Reads projects from Tiger's PROJECTS.md (via /tiger/file-tasks/projects bridge endpoint).
 */

import { NextResponse } from "next/server";
import { bridgeGet } from "@/lib/bridge";

export const dynamic = "force-dynamic";

// GET /api/tiger/file-projects — all projects from PROJECTS.md
export async function GET() {
  try {
    const result = await bridgeGet("/tiger/file-tasks/projects");
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
