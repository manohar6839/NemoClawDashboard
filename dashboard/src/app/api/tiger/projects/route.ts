/**
 * /api/tiger/projects — Project CRUD proxy
 *
 * Proxies requests from dashboard to Tiger Bridge.
 */

import { NextResponse } from "next/server";
import { bridgeGet, bridgePost } from "@/lib/bridge";

export const dynamic = "force-dynamic";

// GET /api/tiger/projects — list all projects
export async function GET() {
  try {
    const result = await bridgeGet("/tiger/projects");
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

// POST /api/tiger/projects — create project
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await bridgePost("/tiger/projects", body);
    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}