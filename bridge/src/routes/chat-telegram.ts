/**
 * chat-telegram.ts — GET /tiger/chat/telegram : the REAL Telegram mirror
 *
 * History of this feature (why the old one showed nothing):
 *   The original design (telegram-webhook.ts + chat-mirror.ts) waited for
 *   Telegram to POST updates to the bridge. But the bot is handled by
 *   OpenClaw's NATIVE telegram channel via long-polling, and Telegram's API
 *   forbids webhook + getUpdates on the same bot token — so the webhook was
 *   never registered, chat_messages never received a single Telegram row,
 *   and the dashboard card stayed empty. Even if it had worked, it could
 *   only see inbound messages, never Tiger's replies.
 *
 * This route reads the conversation from the source of truth instead:
 * OpenClaw's session transcript (JSONL) for the telegram:direct session.
 * It is the same file Tiger's own context is built from, so the dashboard
 * is in perfect sync by construction — both directions, full history,
 * nothing to register, nothing to double-write.
 *
 * GET /tiger/chat/telegram?limit=50&before=<seq>
 *   → { ok, sessionKey, messages: [{ seq, role, text, timestamp }], hasMore, oldestSeq }
 *   - messages are ascending by seq (chronological)
 *   - `before` pages backwards through history (omit for the newest page)
 *
 * Transcript line shape (verified live on tiger-config volume):
 *   { type:"message", timestamp:"2026-06-09T21:08:38.574Z",
 *     message:{ role:"user"|"assistant"|"toolResult", content:[{type:"text",text}] } }
 */

import { Router, Request, Response } from "express";
import { readFileSync, statSync } from "fs";
import { join } from "path";

const router = Router();

// The bridge runs on the host as root, so it reads the docker volume directly —
// no docker-exec hop on a route that the dashboard polls every few seconds.
const DATA_DIR =
  process.env.OPENCLAW_DATA_DIR ||
  "/var/lib/docker/volumes/tiger_tiger-config/_data";
const SESSIONS_DIR = join(DATA_DIR, "agents", "main", "sessions");

interface ThreadMessage {
  seq: number;
  role: "user" | "agent";
  text: string;
  timestamp: string;
}

interface SessionIndexEntry {
  sessionId?: string;
  updatedAt?: number;
}

/**
 * OpenClaw injects machinery into user messages before they reach the model:
 *   - leading blocks like:
 *       Conversation info (untrusted metadata): ```json {...}```
 *       Sender (untrusted metadata): ```json {...}```
 *   - whole synthetic messages ("A new session was started via /new...",
 *     heartbeat prompts, system reminders)
 * None of that was typed by the human in Telegram, so the mirror strips it.
 * Returning "" makes the caller drop the message entirely.
 */
function cleanUserText(raw: string): string {
  let text = raw;

  // Strip any leading "<Label> (untrusted metadata): ```json ... ```" blocks.
  // They always appear before the real message; loop in case there are several.
  const metaBlock = /^\s*[A-Za-z ]+\(untrusted metadata\):\s*```json[\s\S]*?```\s*/;
  while (metaBlock.test(text)) {
    text = text.replace(metaBlock, "");
  }

  // Synthetic system messages — not human input, drop them outright.
  const synthetic = [
    /^A new session was started via/,
    /^\[?HEARTBEAT/i,
    /^System:/,
    /^GroupChat context/,
  ];
  if (synthetic.some((re) => re.test(text.trim()))) return "";

  return text;
}

/** Newest telegram session: key + transcript path. */
function resolveTelegramSession(): { key: string; file: string } | null {
  let index: Record<string, SessionIndexEntry>;
  try {
    index = JSON.parse(
      readFileSync(join(SESSIONS_DIR, "sessions.json"), "utf-8"),
    ) as Record<string, SessionIndexEntry>;
  } catch {
    return null;
  }

  const candidates = Object.entries(index)
    .filter(([key]) => key.includes(":telegram:") || key.includes(":tg_"))
    .sort((a, b) => (b[1].updatedAt ?? 0) - (a[1].updatedAt ?? 0));

  for (const [key, entry] of candidates) {
    if (entry.sessionId) {
      return { key, file: join(SESSIONS_DIR, `${entry.sessionId}.jsonl`) };
    }
  }
  return null;
}

// ─── Parse cache ─────────────────────────────────────────────────────────────
// The card polls for new messages; re-parsing the whole transcript each poll
// is wasted work. Cache the parsed array keyed on (path, mtime, size).

let cache: { file: string; mtimeMs: number; size: number; messages: ThreadMessage[] } | null = null;

function parseTranscript(file: string): ThreadMessage[] {
  const st = statSync(file);
  if (
    cache &&
    cache.file === file &&
    cache.mtimeMs === st.mtimeMs &&
    cache.size === st.size
  ) {
    return cache.messages;
  }

  const messages: ThreadMessage[] = [];
  const lines = readFileSync(file, "utf-8").split("\n");
  let seq = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    seq += 1;
    let entry: Record<string, any>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type !== "message") continue;

    const role = entry.message?.role;
    if (role !== "user" && role !== "assistant") continue; // skip toolResult etc.

    const content: unknown = entry.message?.content;
    let text = "";
    let hasToolCall = false;
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      for (const c of content) {
        if (!c) continue;
        if (c.type === "toolCall") hasToolCall = true;
        if (c.type === "text" && typeof c.text === "string") text += c.text + "\n";
        // type === "thinking" is deliberately ignored
      }
    }

    // Assistant messages that carry toolCall blocks are intermediate working
    // turns ("Let me check if codexbar is available...") — OpenClaw never
    // sent those to Telegram, so the mirror must not show them either.
    if (role === "assistant" && hasToolCall) continue;

    if (role === "user") text = cleanUserText(text);
    text = text.trim();
    if (!text) continue; // tool-call-only turns / fully-injected messages

    messages.push({
      seq,
      role: role === "user" ? "user" : "agent",
      text,
      timestamp: typeof entry.timestamp === "string" ? entry.timestamp : "",
    });
  }

  cache = { file, mtimeMs: st.mtimeMs, size: st.size, messages };
  return messages;
}

router.get("/", (req: Request, res: Response) => {
  const limit = Math.min(
    Math.max(parseInt(String(req.query.limit ?? "50"), 10) || 50, 1),
    200,
  );
  const before = parseInt(String(req.query.before ?? ""), 10) || null;

  const session = resolveTelegramSession();
  if (!session) {
    return res.status(404).json({
      ok: false,
      error: "No telegram session found in OpenClaw session index",
    });
  }

  let all: ThreadMessage[];
  try {
    all = parseTranscript(session.file);
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ ok: false, error: `transcript read failed: ${m}` });
  }

  const upTo = before === null ? all : all.filter((m) => m.seq < before);
  const page = upTo.slice(-limit);

  res.json({
    ok: true,
    sessionKey: session.key,
    messages: page,
    hasMore: upTo.length > page.length,
    oldestSeq: page.length > 0 ? page[0].seq : null,
  });
});

export default router;
