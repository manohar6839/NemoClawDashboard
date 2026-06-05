/**
 * chat-mirror.ts — Mirror Telegram messages to shared SQLite
 *
 * This is a simple endpoint that can be called to mirror messages
 * from any channel (Telegram, WhatsApp, etc.) into the chat history.
 *
 * POST /tiger/chat/mirror
 *   Body: {
 *     role: "user" | "agent",
 *     content: "message text",
 *     source: "telegram" | "whatsapp" | "web",
 *     sessionId?: "agent:main:main"
 *   }
 *
 * Response: { ok: true, id: number }
 */

import { Router, Request, Response } from "express";
import db from "../db.js";

const router = Router();

const DEFAULT_SESSION_ID = "agent:main:main";

const insertMessage = db.prepare(`
  INSERT INTO chat_messages (session_id, role, content, meta)
  VALUES (?, ?, ?, ?)
`);

// POST /tiger/chat/mirror — store a message from any source
router.post("/", async (req: Request, res: Response) => {
  const { role, content, source, sessionId } = req.body;

  if (!role || !content) {
    return res.status(400).json({
      ok: false,
      error: "role and content are required"
    });
  }

  if (role !== "user" && role !== "agent" && role !== "system") {
    return res.status(400).json({
      ok: false,
      error: "role must be 'user', 'agent', or 'system'"
    });
  }

  const sid = sessionId || DEFAULT_SESSION_ID;
  const meta = JSON.stringify({
    source: source || "unknown",
    mirrored: true,
    timestamp: new Date().toISOString()
  });

  try {
    const info = insertMessage.run(sid, role, content, meta);
    res.json({
      ok: true,
      id: info.lastInsertRowid,
      sessionId: sid,
      source: source || "unknown"
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;