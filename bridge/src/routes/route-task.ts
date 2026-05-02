/**
 * routes/route-task.ts — Standalone routing endpoint
 *
 * POST /tiger/route-task
 * Body: { text: string }
 * Returns: { ok: true, agent: AgentId, reason: string }
 *
 * This is a thin HTTP wrapper around classifyAgent() from lib/llm.ts.
 * It exists so the dashboard (or external tools / Telegram) can ask
 * "where would you route this?" without creating a task.
 *
 * The actual task-creation flow in projects.ts and dispatch.ts will
 * import classifyAgent directly — they don't need to round-trip through
 * this endpoint. So this route is for the UI's "preview routing" affordance.
 *
 * Failure mode: classifyAgent never throws. The HTTP response will
 * always be 200 with { agent, reason }. If reason starts with
 * "router_unavailable:" the UI can show a warning banner.
 */

import { Router, Request, Response } from "express";
import { classifyAgent } from "../lib/llm.js";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const { text } = req.body as { text?: string };

  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({
      ok: false,
      error: "Body.text is required and must be a non-empty string",
    });
  }

  // classifyAgent has its own try/catch — we never get an exception here,
  // we just get a result with a "router_unavailable:" reason if the LLM
  // call failed. That's the contract.
  const result = await classifyAgent(text);

  res.json({ ok: true, ...result });
});

export default router;
