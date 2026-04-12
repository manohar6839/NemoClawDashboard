/**
 * /api/tiger/status — GET
 *
 * Returns comprehensive Tiger agent status: container health, OpenClaw
 * process state, system resources (memory), and heartbeat content.
 *
 * This route proxies to the Tiger Bridge API on the VPS.
 * The bridge token is kept server-side — never exposed to the browser.
 *
 * Response shape (from bridge/src/tiger.ts → getTigerStatus()):
 *   {
 *     status: "online" | "degraded",
 *     container: { status, exitCode, startedAt },
 *     openclaw: { running, processInfo },
 *     system: { memoryUsagePct, memoryTotalMb, uptime },
 *     agent: { currentModel, fallbackModels, heartbeat, soul }
 *   }
 */

import { NextResponse } from "next/server";
import { bridgeGet } from "@/lib/bridge";

// force-dynamic: don't cache this route — status must always be fresh
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await bridgeGet("/tiger/status");
    return NextResponse.json(status);
  } catch (err: any) {
    // Return a structured "offline" response rather than a 500,
    // so the dashboard can still render meaningfully when the bridge is down
    return NextResponse.json(
      {
        status: "offline",
        error: err.message,
        container: { status: "unreachable", exitCode: -1, startedAt: "" },
        openclaw: { running: false, processInfo: "" },
        system: { memoryUsagePct: 0, memoryTotalMb: 0, uptime: "" },
        agent: { currentModel: "unknown", fallbackModels: [], heartbeat: null, soul: null },
      },
      { status: 200 } // Still 200 so the dashboard handles it gracefully
    );
  }
}
