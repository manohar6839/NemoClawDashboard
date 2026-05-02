// POST /api/tiger/bridge-restart — restart the tiger-bridge systemd service
// Responds immediately, then triggers the restart with a short delay so the
// HTTP response is fully written before the process exits.
import { NextResponse } from "next/server";
import { exec } from "child_process";

export const dynamic = "force-dynamic";

export async function POST() {
  // Schedule restart after response is flushed
  setTimeout(() => {
    exec("systemctl restart tiger-bridge", (err) => {
      if (err) console.error("[bridge-restart] systemctl failed:", err.message);
    });
  }, 600);

  return NextResponse.json({
    ok: true,
    message: "Bridge restart initiated. Dashboard will reconnect in ~5s.",
  });
}
