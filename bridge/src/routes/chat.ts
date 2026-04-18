/**
 * routes/chat.ts — Chat via OpenClaw CLI + persistence
 *
 * POST   /tiger/chat            — send a message; response includes reply
 * GET    /tiger/chat/history    — ?sessionId=X&limit=50 → past messages
 * DELETE /tiger/chat/history    — ?sessionId=X → clear history for a session
 *
 * Persistence rationale (see phase1b-patches.py):
 *   Chat history is duplicated into our SQLite so it survives:
 *     - browser hard refresh
 *     - close/reopen tab
 *     - use from a different device
 *     - OpenClaw restarts (session state may or may not persist internally)
 *   We own the read path; OpenClaw owns the reasoning context.
 */

import { Router } from "express";
import db from "../db.js";

// The main Tiger session — matches the hardcoded session in chat.send below.
// Keep this constant in sync with the --session-id used by openclaw agent.
const DEFAULT_SESSION_ID = "c1e6a067-7ca5-423b-9506-105db0702997";

const insertMessage = db.prepare(`
  INSERT INTO chat_messages (session_id, role, content, meta)
  VALUES (?, ?, ?, ?)
`);
const getHistory = db.prepare(`
  SELECT id, role, content, meta, created_at
  FROM chat_messages
  WHERE session_id = ?
  ORDER BY created_at ASC, id ASC
  LIMIT ?
`);
const deleteHistory = db.prepare(`
  DELETE FROM chat_messages WHERE session_id = ?
`);

const router = Router();

// ─── GET /tiger/chat/history ─────────────────────────────────────────────
router.get("/history", (req, res) => {
  const sessionId = (req.query.sessionId as string) || DEFAULT_SESSION_ID;
  const limit = Math.min(parseInt(req.query.limit as string) || 200, 500);
  const rows = getHistory.all(sessionId, limit) as any[];
  res.json({
    ok: true,
    sessionId,
    count: rows.length,
    messages: rows.map((r) => ({
      id: String(r.id),
      role: r.role,
      content: r.content,
      timestamp: new Date(r.created_at + "Z").getTime(),
      meta: r.meta ? JSON.parse(r.meta) : {},
    })),
  });
});

// ─── DELETE /tiger/chat/history ──────────────────────────────────────────
router.delete("/history", (req, res) => {
  const sessionId = (req.query.sessionId as string) || DEFAULT_SESSION_ID;
  const result = deleteHistory.run(sessionId);
  res.json({ ok: true, deleted: result.changes });
});

// ─── POST /tiger/chat ────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ ok: false, error: "message is required" });
  }

  // Persist the user's message BEFORE calling the LLM so history is intact
  // even if the LLM call fails.
  try {
    insertMessage.run(DEFAULT_SESSION_ID, "user", message, "{}");
  } catch (e: any) {
    console.warn("[chat] failed to persist user message:", e.message);
  }

  // ── Timing instrumentation ──────────────────────────────────────
  // Label each phase so we can see where latency goes. Format in logs:
  //   [chat.timing] spawn=120ms exec=2834ms parse=3ms total=2957ms
  const tStart = Date.now();
  let tSpawn = 0;
  let tExec = 0;
  let tParse = 0;

  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);

    // Escape the message for shell
    const escapedMessage = message.replace(/'/g, "'\\''");

    // Use openclaw agent to send a message to the main session
    // Session ID: c1e6a067-7ca5-423b-9506-105db0702997 (agent:main:main)
    // In TIGER_REMOTE mode, prefix with ssh so docker runs on the VPS.
    const sshPrefix = process.env.TIGER_REMOTE === "true"
      ? `ssh ${process.env.TIGER_REMOTE_SSH || "root@100.75.128.45"} `
      : "";
    const cmd = `${sshPrefix}docker exec tiger-openclaw openclaw agent --session-id c1e6a067-7ca5-423b-9506-105db0702997 -m '${escapedMessage}' --json --timeout 120`;

    const tBeforeSpawn = Date.now();
    tSpawn = tBeforeSpawn - tStart;
    console.log("[chat] Executing:", cmd.substring(0, 100) + "...");

    const { stdout, stderr } = await execAsync(cmd, {
      timeout: 130000,
      maxBuffer: 10 * 1024 * 1024,
    });

    tExec = Date.now() - tBeforeSpawn;
    console.log("[chat] Response:", stdout.substring(0, 500));

    // Parse the JSON response
    const tBeforeParse = Date.now();
    let result;
    try {
      result = JSON.parse(stdout);
    } catch {
      result = { output: stdout, error: stderr };
    }
    tParse = Date.now() - tBeforeParse;

    const tTotal = Date.now() - tStart;
    console.log(
      `[chat.timing] spawn=${tSpawn}ms exec=${tExec}ms parse=${tParse}ms total=${tTotal}ms`
    );

    // Persist the agent's reply. Extract text using the same fallback chain
    // as the dashboard so we store whatever the user actually sees.
    try {
      const agentText =
        result?.result?.payloads?.[0]?.text ||
        result?.payloads?.[0]?.text ||
        result?.summary ||
        result?.text ||
        "";
      if (agentText) {
        const meta = {
          runId: result?.runId,
          model: result?.result?.meta?.agentMeta?.model || result?.meta?.agentMeta?.model,
          durationMs: tTotal,
        };
        insertMessage.run(DEFAULT_SESSION_ID, "agent", agentText, JSON.stringify(meta));
      }
    } catch (e: any) {
      console.warn("[chat] failed to persist agent reply:", e.message);
    }

    res.json({
      ok: true,
      timing: { spawn: tSpawn, exec: tExec, parse: tParse, total: tTotal },
      response: result,
    });
  } catch (err: any) {
    const tTotal = Date.now() - tStart;
    console.error(`[chat] Error after ${tTotal}ms:`, err.message);
    res.status(500).json({
      ok: false,
      error: err.message || "Failed to send chat message",
    });
  }
});

export default router;