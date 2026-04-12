/**
 * /api/tiger/exec — POST
 *
 * Run a shell command inside the Tiger sandbox.
 * Proxies to the Bridge's POST /tiger/exec endpoint.
 *
 * Request body:
 *   {
 *     command: string        — the shell command to run
 *     timeout?: number       — timeout in ms (default 30000)
 *     target?: "sandbox"|"host"  — where to run (default: sandbox)
 *   }
 *
 * Response:
 *   { stdout: string, stderr: string, exitCode: number }
 */

import { NextResponse } from "next/server";
import { bridgePost } from "@/lib/bridge";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { command, timeout, target } = body;

  if (!command || typeof command !== "string") {
    return NextResponse.json(
      { error: "Missing 'command' field in request body" },
      { status: 400 }
    );
  }

  try {
    const result = await bridgePost("/tiger/exec", { command, timeout, target });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to execute command", details: err.message },
      { status: 502 }
    );
  }
}
