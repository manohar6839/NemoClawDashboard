/**
 * feedback.ts — Continuous Learning
 * Simple feedback storage
 */

import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import db from "../db.js";

const router = Router();

// Ensure tables exist
const initTables = () => {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS feedback_log (
        id TEXT PRIMARY KEY,
        context TEXT NOT NULL,
        user_feedback TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);
  } catch (e) { /* tables may exist */ }
};
initTables();

// Log feedback
router.post("/", async (req: Request, res: Response) => {
  const { context, feedback } = req.body;
  if (!context || !feedback) {
    return res.status(400).json({ error: "context and feedback required" });
  }
  const id = randomUUID();
  try {
    db.prepare("INSERT INTO feedback_log (id, context, user_feedback) VALUES (?, ?, ?)")
      .run(id, context, feedback);
    // Simple pattern detection
    if (feedback.toLowerCase().includes("short") || feedback.toLowerCase().includes("brief")) {
      db.prepare("INSERT OR REPLACE INTO user_preferences (key, value) VALUES ('reply_length', 'brief')").run();
    }
    res.json({ ok: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get preferences
router.get("/prefer", async (req: Request, res: Response) => {
  try {
    const prefs = db.prepare("SELECT * FROM user_preferences").all();
    res.json({ preferences: prefs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Store preference
router.post("/prefer", async (req: Request, res: Response) => {
  const { key, value } = req.body;
  if (!key || value === undefined) {
    return res.status(400).json({ error: "key and value required" });
  }
  try {
    db.prepare("INSERT OR REPLACE INTO user_preferences (key, value) VALUES (?, ?)").run(key, String(value));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;