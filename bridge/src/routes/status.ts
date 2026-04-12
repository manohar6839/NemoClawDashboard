/**
 * Status route — GET /api/status
 * Returns comprehensive Tiger health: container state, OpenClaw process,
 * model info, memory usage, heartbeat content.
 */

import { Router } from "express";
import { getTigerStatus } from "../tiger.js";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const status = await getTigerStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({
      error: "Failed to get Tiger status",
      details: err.message,
    });
  }
});

export default router;
