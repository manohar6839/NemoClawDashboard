/**
 * telegram-webhook.ts — Handle Telegram webhooks and mirror to chat history
 *
 * Receives Telegram message updates and mirrors them to the chat_messages table.
 * This enables Telegram ↔ WebChat history sync.
 *
 * POST /tiger/telegram-webhook
 *   Body: Telegram Update object (https://core.telegram.org/bots/api#update)
 *   Response: OK
 */

import { Router, Request, Response } from "express";
import db from "../db.js";

const router = Router();

const DEFAULT_SESSION_ID = "agent:main:main";

const insertMessage = db.prepare(`
  INSERT INTO chat_messages (session_id, role, content, meta)
  VALUES (?, ?, ?, ?)
`);

// POST /tiger/telegram-webhook — receive Telegram updates
router.post("/", async (req: Request, res: Response) => {
  try {
    const update = req.body;
    
    // Handle message updates
    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat?.id?.toString();
      const text = msg.text;
      const from = msg.from;
      
      if (text && chatId) {
        // Store user message
        const meta = JSON.stringify({
          source: "telegram",
          chatId: chatId,
          messageId: msg.message_id,
          from: from ? {
            id: from.id,
            firstName: from.first_name,
            lastName: from.last_name,
            username: from.username
          } : null,
          timestamp: new Date().toISOString()
        });
        
        insertMessage.run(DEFAULT_SESSION_ID, "user", text, meta);
        
        // If it's a reply (has reply_to_message), store agent response too
        if (msg.reply_to_message) {
          const replyText = msg.reply_to_message.text;
          const replyMeta = JSON.stringify({
            source: "telegram",
            chatId: chatId,
            replyToMessageId: msg.message_id,
            timestamp: new Date().toISOString()
          });
          insertMessage.run(DEFAULT_SESSION_ID, "agent", replyText, replyMeta);
        }
      }
    }
    
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[telegram-webhook] Error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;