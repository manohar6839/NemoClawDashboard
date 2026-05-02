/**
 * telegram.ts — TelegramChannel (Option A: bridge owns Telegram polling)
 *
 * OpenClaw's built-in Telegram channel must be disabled before starting this
 * (set channels.telegram.enabled = false in openclaw.json).
 *
 * Flow per incoming message:
 *   1. getUpdates long-poll (timeout=25s, no flood risk)
 *   2. Filter: skip non-text, non-allowlisted chats, /start /help
 *   3. Create SQLite task (status=in-progress, project_id=null = orphan)
 *   4. classifyAgent → update task assigned_agent + agent_reason
 *   5. Send "routing to <agent>…" Telegram reply, store reply message_id
 *   6. docker exec openclaw agent --session-id tg_<chat_id> -m '...' --json
 *   7. Edit the reply message with the real response
 *   8. Update task status=done, persist both sides to chat_messages table
 *
 * Token resolution order:
 *   TELEGRAM_BOT_TOKEN env var → openclaw.json channels.telegram.botToken
 *
 * Chat ID allowlist:
 *   TELEGRAM_CHAT_ID env var → openclaw.json (not stored there currently)
 *   If unset: accepts all chats (fine for a private bot)
 */

import { exec } from "child_process";
import { promisify } from "util";
import { readFileSync } from "fs";
// No db/classifyAgent imports — bridge is pure transport for Telegram.

const execAsync = promisify(exec);

// -- Types ────────────────────────────────────────────────────────────────────

interface TgUpdate {
  update_id: number;
  message?: TgMessage;
}

interface TgMessage {
  message_id: number;
  from?: { id: number; username?: string; first_name?: string };
  chat: { id: number; type: string };
  text?: string;
  date: number;
}

// -- Config resolution ────────────────────────────────────────────────────────

const OPENCLAW_CONFIG_PATH =
  process.env.OPENCLAW_CONFIG_PATH ||
  "/var/lib/docker/volumes/tiger_tiger-config/_data/openclaw.json";

function readOpenClawConfig(): Record<string, any> {
  try {
    return JSON.parse(readFileSync(OPENCLAW_CONFIG_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function getBotToken(): string {
  if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN;
  // Fall back to openclaw.json -- token lives there from initial setup
  const cfg = readOpenClawConfig();
  return cfg?.channels?.telegram?.botToken ?? "";
}

function getAllowedChatId(): number | null {
  const raw = process.env.TELEGRAM_CHAT_ID;
  if (raw && raw.trim()) return parseInt(raw.trim(), 10);
  return null; // null = accept all chats
}

// -- Telegram API helpers ─────────────────────────────────────────────────────

const TG_BASE = (token: string) => `https://api.telegram.org/bot${token}`;

async function tgGet(
  token: string,
  method: string,
  params: Record<string, string | number> = {}
): Promise<any> {
  const url = new URL(`${TG_BASE(token)}/${method}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(32_000), // slightly above telegram timeout=25
  });
  return res.json();
}

async function tgPost(token: string, method: string, body: Record<string, any>): Promise<any> {
  const res = await fetch(`${TG_BASE(token)}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  return res.json();
}

// Send a message; returns the new message_id or null on failure
async function sendMessage(
  token: string,
  chatId: number,
  text: string,
  replyToMessageId?: number
): Promise<number | null> {
  try {
    const body: Record<string, any> = {
      chat_id: chatId,
      text: text.slice(0, 4096), // Telegram hard limit
      parse_mode: "Markdown",
    };
    if (replyToMessageId) body.reply_to_message_id = replyToMessageId;
    const r = await tgPost(token, "sendMessage", body);
    return r.ok ? (r.result?.message_id ?? null) : null;
  } catch (e: any) {
    console.error("[telegram] sendMessage failed:", e.message);
    return null;
  }
}


// Show "Bot is typing--" indicator. Telegram clears it after 5s, so
// we call it once immediately then repeat every 4s while waiting for
// docker exec to return. Returns a cancel function.
function startTyping(token: string, chatId: number): () => void {
  let active = true;
  const tick = async () => {
    while (active) {
      try {
        await tgPost(token, "sendChatAction", { chat_id: chatId, action: "typing" });
      } catch { /* non-fatal */ }
      await sleep(4000);
    }
  };
  tick(); // fire immediately, don't await
  return () => { active = false; };
}

// -- Per-message handler ──────────────────────────────────────────────────────

async function handleMessage(token: string, msg: TgMessage): Promise<void> {
  const text = (msg.text || "").trim();
  const chatId = msg.chat.id;
  // Session ID is per-chat so OpenClaw maintains conversation context across messages
  const sessionId = `tg_${chatId}`;

  // -- Filter: skip empty, /start, /help --------------------------------
  if (!text) return;
  if (text === "/start" || text === "/help") {
    await sendMessage(
      token, chatId,
      "👋 *Tiger Command Center*\n\nSend me a task or question and I'll get right on it."
    );
    return;
  }

  const from = msg.from?.username ? `@${msg.from.username}` : (msg.from?.first_name ?? "unknown");
  console.log(`[telegram] msg from ${from} in ${chatId}: ${text.slice(0, 80)}`);

  // -- Show typing indicator while Tiger thinks -------------------------
  const stopTyping = startTyping(token, chatId);

  // -- Forward to OpenClaw via docker exec ------------------------------
  // --channel telegram --deliver sends the response back via Telegram natively
  // when the native Telegram channel is enabled. Since we disabled it, we
  // use --json and send the response ourselves.
  // Write message to temp file inside container -- avoids ALL shell escaping
  // issues with backticks, quotes, JSON, code blocks in user messages.
  const tmpFile = `/tmp/tg_${Date.now()}.txt`;
  const { writeFileSync, unlinkSync } = await import("fs");
  const { execSync } = await import("child_process");
  try {
    writeFileSync(tmpFile, text, "utf-8");
    execSync(`docker cp ${tmpFile} tiger-openclaw:${tmpFile}`, { timeout: 5000 });
    unlinkSync(tmpFile);
  } catch (copyErr: any) {
    console.error("[telegram] cp to container failed:", copyErr.message);
    stopTyping();
    await sendMessage(token, chatId, "Internal error — could not forward your message.", msg.message_id);
    return;
  }
  const cmd = `docker exec tiger-openclaw sh -c 'MSG=$(cat ${tmpFile}); rm -f ${tmpFile}; openclaw agent --session-id ${sessionId} -m "$MSG" --json --timeout 120'`;

  let replyText = "";
  let execOk = true;
  try {
    const { stdout } = await execAsync(cmd, {
      timeout: 130_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    let parsed: any;
    try { parsed = JSON.parse(stdout); } catch { parsed = { output: stdout }; }
    replyText =
      parsed?.result?.payloads?.[0]?.text ||
      parsed?.payloads?.[0]?.text ||
      parsed?.summary ||
      parsed?.text ||
      parsed?.output ||
      "_(no response)_";
  } catch (e: any) {
    console.error("[telegram] docker exec failed:", e.message);
    replyText = "⚠️ Tiger timed out or is offline.";
    execOk = false;
  }

  stopTyping();

  // -- Send response -----------------------------------------------------
  const truncated =
    replyText.length > 4000
      ? replyText.slice(0, 3990) + "\n\n_(truncated)_"
      : replyText;

  await sendMessage(token, chatId, truncated, msg.message_id);

  if (execOk) {
    console.log(`[telegram] response sent to ${from} in ${chatId}`);
  }
}

// -- Main poller ──────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}


// Per-chat message queue -- one docker exec at a time per chat_id.
// Prevents concurrent gateway WebSocket connections on Telegram bursts.
const chatQueues = new Map<number, Promise<void>>();

function enqueueForChat(chatId: number, fn: () => Promise<void>): void {
  const prev = chatQueues.get(chatId) ?? Promise.resolve();
  const next = prev.then(() => fn()).catch((e) =>
    console.error('[telegram] queue error for chat ' + chatId + ':', e.message)
  );
  chatQueues.set(chatId, next);
  next.finally(() => {
    if (chatQueues.get(chatId) === next) chatQueues.delete(chatId);
  });
}

export class TelegramChannel {
  private token: string;
  private allowedChatId: number | null;
  private offset = 0;
  private running = false;

  constructor() {
    this.token = getBotToken();
    this.allowedChatId = getAllowedChatId();
  }

  start(): void {
    if (!this.token) {
      console.warn(
        "[telegram] No bot token found in TELEGRAM_BOT_TOKEN env or openclaw.json — channel disabled."
      );
      return;
    }
    if (this.running) return;
    this.running = true;
    console.log(
      `[telegram] Polling started (allowedChatId=${this.allowedChatId ?? "all"})`
    );
    this._poll().catch((e) => console.error("[telegram] Poll loop crashed:", e));
  }

  stop(): void {
    this.running = false;
    console.log("[telegram] Polling stopped.");
  }

  private async _poll(): Promise<void> {
    while (this.running) {
      try {
        const data = await tgGet(this.token, "getUpdates", {
          offset: this.offset,
          timeout: 25,          // seconds -- long-poll
          allowed_updates: "message",
        });

        if (!data.ok || !Array.isArray(data.result)) {
          // Telegram returned an error (bad token, network, etc.)
          console.error("[telegram] getUpdates error:", data.description ?? data);
          await sleep(10_000);
          continue;
        }

        for (const update of data.result as TgUpdate[]) {
          // Advance offset FIRST -- ensures we never re-process even if handler throws
          this.offset = update.update_id + 1;

          const msg = update.message;
          if (!msg) continue;

          // Chat allowlist check
          if (this.allowedChatId !== null && msg.chat.id !== this.allowedChatId) {
            console.log(`[telegram] Skipping chat ${msg.chat.id} — not in allowlist`);
            continue;
          }

          // Queue per chat -- one docker exec at a time per chat_id.
          // Prevents concurrent gateway WebSocket connections on message bursts.
          const token = this.token;
          enqueueForChat(msg.chat.id, () => handleMessage(token, msg));
        }
      } catch (e: any) {
        if (!this.running) break;
        console.error("[telegram] Poll error, backing off 5s:", e.message);
        await sleep(5_000);
      }
    }
  }
}
