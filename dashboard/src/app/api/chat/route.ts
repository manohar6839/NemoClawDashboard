/**
 * /api/chat — chat send endpoint, now with real WS-based streaming.
 *
 * Replaces the previous bridge → docker exec → fake-typing chain.
 *
 * Request:  POST { message: string, sessionKey?: string }
 * Response: SSE stream of `data: { type, content }` events
 *           types: status | chunk | done | error  (matches existing client parser)
 *
 * Persistence: user message stored BEFORE LLM call (so it's not lost on failure);
 *              agent reply stored after final token via bridge /tiger/chat/persist.
 */

import { NextRequest } from "next/server";
import { streamAgentRun, DEFAULT_SESSION_KEY } from "@/lib/openclaw-ws";

const BRIDGE_URL = process.env.TIGER_BRIDGE_URL || "http://localhost:3456";
const BRIDGE_TOKEN = process.env.TIGER_BRIDGE_TOKEN || "";

export const maxDuration = 180;
export const dynamic = "force-dynamic";

async function persistMessage(role: "user" | "agent", content: string, sessionKey: string, meta?: any) {
  // Best-effort persistence; never block the chat response on this.
  try {
    await fetch(`${BRIDGE_URL}/tiger/chat/persist`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${BRIDGE_TOKEN}`,
      },
      body: JSON.stringify({ role, content, sessionId: sessionKey, meta: meta || {} }),
    });
  } catch (err) {
    console.warn("[chat] persist failed:", role, (err as Error).message);
  }
}

export async function GET(request: NextRequest) {
  const sessionKey = request.nextUrl.searchParams.get("sessionKey") || DEFAULT_SESSION_KEY;
  
  try {
    const res = await fetch(`${BRIDGE_URL}/tiger/chat/history?sessionId=${encodeURIComponent(sessionKey)}&limit=50`, {
      headers: { Authorization: `Bearer ${BRIDGE_TOKEN}` },
    });
    const data = await res.json();
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const message: string = body?.message;
  const sessionKey: string = body?.sessionKey || DEFAULT_SESSION_KEY;

  if (!message || typeof message !== "string") {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  // Persist user message NOW, before the LLM call
  await persistMessage("user", message, sessionKey);

  const t0 = Date.now();
  const encoder = new TextEncoder();

  /**
   * Build the SSE stream.
   * The wire format `data: {"type":"chunk","content":"..."}\n\n` matches what
   * chat-interface.tsx already parses. Types we emit:
   *   status  (the "thinking" indicator on accept ack)
   *   chunk   (each assistant delta from the gateway)
   *   done    (terminal — full text + meta, persists the agent reply)
   *   error   (anything goes wrong, including handshake failures)
   */
  const stream = new ReadableStream({
    async start(controller) {
      const sse = (obj: { type: string; content?: string; meta?: any }) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      try {
        let fullText = "";
        let meta: any = undefined;

        for await (const ev of streamAgentRun({ message, sessionKey })) {
          if (ev.kind === "status") {
            sse({ type: "status", content: "" });
          } else if (ev.kind === "chunk") {
            fullText += ev.content;
            sse({ type: "chunk", content: ev.content });
          } else if (ev.kind === "done") {
            // Prefer the gateway's authoritative final text over our delta accumulation.
            fullText = ev.content || fullText;
            meta = ev.meta;
            sse({ type: "done", content: fullText });
          } else if (ev.kind === "error") {
            sse({ type: "error", content: ev.content });
          }
        }

        const dt = Date.now() - t0;
        console.log(`[chat] sessionKey=${sessionKey} duration=${dt}ms chars=${fullText.length}`);

        // Persist the agent reply AFTER streaming is complete.
        if (fullText) {
          await persistMessage("agent", fullText, sessionKey, {
            ...meta,
            durationMs: dt,
          });
        }
      } catch (err: any) {
        console.error("[chat] stream error:", err);
        sse({ type: "error", content: err?.message || "stream failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable nginx-style buffering when behind a proxy.
      "X-Accel-Buffering": "no",
    },
  });
}
