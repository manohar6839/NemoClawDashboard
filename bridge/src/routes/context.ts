/**
 * context.ts — GET/POST /tiger/context
 *
 * Session context storage - remembers context across messages.
 * This enables T012: Context Injection.
 *
 * GET /tiger/context?sessionId=X   — get context for session
 * POST /tiger/context         — set context { sessionId, key, value }
 * DELETE /tiger/context?sessionId=X — clear context
 *
 * Response:
 *   { ok: true, context: { ... }, message }
 */

import { Router, Request, Response } from "express";
import db from "../db.js";

const router = Router();

// Table for session context
const getContext = db.prepare(`
  SELECT key, value FROM session_context WHERE session_id = ?
`);
const setContext = db.prepare(`
  INSERT OR REPLACE INTO session_context (session_id, key, value, updated_at)
  VALUES (?, ?, ?, datetime('now'))
`);
const clearContext = db.prepare(`
  DELETE FROM session_context WHERE session_id = ?
`);

const DEFAULT_SESSION = "agent:main:main";

// GET context
router.get("/", async (req: Request, res: Response) => {
  const sessionId = (req.query.sessionId as string) || DEFAULT_SESSION;
  
  try {
    const rows = getContext.all(sessionId) as any[];
    const context: Record<string, string> = {};
    for (const row of rows) {
      context[row.key] = row.value;
    }
    
    res.json({ ok: true, sessionId, context });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST set context
router.post("/", async (req: Request, res: Response) => {
  const { sessionId, key, value } = req.body;
  const sid = sessionId || DEFAULT_SESSION;
  
  if (!key) {
    return res.status(400).json({ ok: false, error: "key is required" });
  }
  if (!value) {
    return res.status(400).json({ ok: false, error: "value is required" });
  }
  
  try {
    setContext.run(sid, key, value);
    res.json({ ok: true, sessionId: sid, key, value, message: "Context saved" });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE clear context
router.delete("/", async (req: Request, res: Response) => {
  const sessionId = (req.query.sessionId as string) || DEFAULT_SESSION;
  
  try {
    clearContext.run(sessionId);
    res.json({ ok: true, message: "Context cleared", sessionId });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router