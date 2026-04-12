/**
 * config.ts — GET /tiger/config  +  POST /tiger/config
 *
 * Read and update the OpenClaw configuration file (openclaw.json).
 *
 * Why this is important:
 *   The Tiger agent reads openclaw.json on startup to know which model to use,
 *   what tools to load, API keys, etc.  When you change it, you also MUST
 *   update the config hash — otherwise the gateway refuses to start with:
 *     "Config hash mismatch — refusing to boot"
 *
 *   Previously this hash regeneration was a manual step that was constantly
 *   forgotten. This endpoint does it automatically.
 *
 * GET  /tiger/config         — returns the current parsed config
 * POST /tiger/config         — deep-merges a patch into the config + rehashes
 *
 * POST body example:
 *   { "model": { "primary": "openrouter/anthropic/claude-opus-4" } }
 */

import { Router, Request, Response } from "express";
import { getConfig, updateConfig } from "../tiger.js";

const router = Router();

// ─── GET /tiger/config ───────────────────────────────────────────────────────
router.get("/", async (_req: Request, res: Response) => {
  try {
    const config = await getConfig();
    res.json({ ok: true, config });
  } catch (err: any) {
    // Common failure: openclaw.json doesn't exist yet or wrong path
    res.status(500).json({
      ok: false,
      error: "Failed to read openclaw.json",
      details: err.message,
    });
  }
});

// ─── POST /tiger/config ──────────────────────────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  const { patch } = req.body;

  // Validate: patch must be a plain object
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return res.status(400).json({
      ok: false,
      error: "Request body must be { patch: { ...fields } }",
    });
  }

  try {
    // updateConfig deep-merges, writes the file, AND regenerates the hash
    await updateConfig(patch);

    // Read back the updated config to confirm
    const updated = await getConfig();

    res.json({
      ok: true,
      message: "Config updated and hash regenerated",
      config: updated,
    });
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      error: "Failed to update config",
      details: err.message,
    });
  }
});

export default router;
