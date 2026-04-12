/**
 * restart.ts — POST /tiger/restart
 *
 * Trigger a Tiger container restart via the gateway watchdog script.
 *
 * Why a watchdog script?
 *   A simple `docker restart` would work, but the OpenClaw gateway needs
 *   specific flags (--allow-unconfigured) and the correct sequence to
 *   come back up cleanly.  The watchdog handles all of that.
 *
 * The watchdog lives at /root/gateway-watchdog.sh on the VPS host.
 *
 * POST /tiger/restart
 *   Optional body: { "reason": "string" }  — logged but not used operationally
 *
 * Response:
 *   { ok: true, message: "..." }   — restart was triggered
 *   { ok: false, error: "..." }    — something went wrong
 */

import { Router, Request, Response } from "express";
import { restartTiger } from "../tiger.js";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  // Optional reason — useful for audit logs
  const reason = (req.body?.reason as string) || "manual restart via dashboard";

  console.log(`[tiger-bridge] Restart requested. Reason: ${reason}`);

  try {
    const result = await restartTiger();

    if (result.success) {
      res.json({
        ok: true,
        message: result.message || "Tiger restart triggered",
        reason,
      });
    } else {
      // Watchdog ran but returned non-zero exit code
      res.status(500).json({
        ok: false,
        error: result.message || "Restart failed",
        reason,
      });
    }
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      error: "Failed to trigger restart",
      details: err.message,
      reason,
    });
  }
});

export default router;
