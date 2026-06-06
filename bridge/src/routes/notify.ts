import { Router, Request, Response } from "express";
import { readFileSync } from "fs";

const router = Router();

const OPENCLAW_CONFIG_PATH =
  process.env.OPENCLAW_CONFIG_PATH ||
  "/var/lib/docker/volumes/tiger_tiger-config/_data/openclaw.json";

function getBotToken(): string {
  if (process.env.TELEGRAM_BOT_TOKEN?.trim()) return process.env.TELEGRAM_BOT_TOKEN.trim();
  try {
    const cfg = JSON.parse(readFileSync(OPENCLAW_CONFIG_PATH, "utf-8"));
    return cfg?.channels?.telegram?.botToken ?? "";
  } catch { return ""; }
}

function getChatId(): string {
  if (process.env.TELEGRAM_CHAT_ID?.trim()) return process.env.TELEGRAM_CHAT_ID.trim();
  return "";
}

/**
 * POST /tiger/notify
 * Body: { message: string, chatId?: string }
 *
 * Sends a Telegram message via the bridge's bot token.
 * Called by Tiger's cron jobs (via curl from inside the container)
 * since OpenClaw's native Telegram channel is disabled (bridge owns polling).
 *
 * curl example from inside container:
 *   curl -s -X POST http://172.17.0.1:3456/tiger/notify \
 *     -H "Content-Type: application/json" \
 *     -H "Authorization: Bearer $BRIDGE_TOKEN" \
 *     -d '{"message":"HEARTBEAT_OK"}'
 */
router.post("/", async (req: Request, res: Response) => {
  const { message, chatId: overrideChatId } = req.body as {
    message?: string;
    chatId?: string;
  };

  if (!message?.trim()) {
    return res.status(400).json({ ok: false, error: "message is required" });
  }

  const token  = getBotToken();
  const chatId = overrideChatId || getChatId();

  if (!token) {
    return res.status(503).json({ ok: false, error: "No bot token configured" });
  }
  if (!chatId) {
    return res.status(503).json({
      ok: false,
      error: "No TELEGRAM_CHAT_ID in bridge .env — set it so Tiger knows where to send notifications",
    });
  }

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message.slice(0, 4096),
        parse_mode: "Markdown",
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const data = await tgRes.json() as any;
    if (!data.ok) {
      console.error("[notify] Telegram error:", data.description);
      return res.status(502).json({ ok: false, error: data.description });
    }

    console.log(`[notify] Sent to chat ${chatId}: ${message.slice(0, 60)}…`);
    res.json({ ok: true, messageId: data.result?.message_id });
  } catch (err: any) {
    console.error("[notify] fetch failed:", err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

export default router;
