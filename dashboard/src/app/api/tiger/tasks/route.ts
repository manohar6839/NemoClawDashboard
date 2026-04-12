/**
 * /api/tiger/tasks — Task CRUD proxy
 *
 * Proxies requests from dashboard to Tiger Bridge.
 */

import { NextResponse } from "next/server";
import { bridgeGet, bridgePost } from "@/lib/bridge";

export const dynamic = "force-dynamic";

// GET /api/tiger/tasks — list tasks (with optional filters)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query: Record<string, string> = {};

    const status = searchParams.get("status");
    const project = searchParams.get("project");
    const agent = searchParams.get("agent");

    if (status) query.status = status;
    if (project) query.project = project;
    if (agent) query.agent = agent;

    const result = await bridgeGet("/tiger/tasks", query);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

// POST /api/tiger/tasks — create task (not used directly - tasks belong to projects)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await bridgePost("/tiger/tasks", body);
    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}