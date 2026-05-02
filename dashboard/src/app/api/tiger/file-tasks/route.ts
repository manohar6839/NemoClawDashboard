/**
 * /api/tiger/file-tasks — Tiger Workspace Tasks Proxy
 *
 * Reads tasks from Tiger's TASKS.md (via /tiger/file-tasks bridge endpoint).
 * This is the authoritative task list — not from SQLite.
 */

import { NextResponse } from "next/server";
import { bridgeGet } from "@/lib/bridge";

export const dynamic = "force-dynamic";

// GET /api/tiger/file-tasks — all tasks from TASKS.md
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const section = searchParams.get("section"); // active | completed | all

    let endpoint = "/tiger/file-tasks";
    if (section === "active") endpoint = "/tiger/file-tasks/active";
    else if (section === "completed") endpoint = "/tiger/file-tasks/completed";

    const result = await bridgeGet(endpoint);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
