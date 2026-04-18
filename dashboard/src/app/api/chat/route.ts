/**
 * API route: POST /api/chat
 * Sends chat messages via Tiger Bridge -> OpenClaw CLI
 */

import { NextRequest, NextResponse } from "next/server";

const BRIDGE_URL = process.env.TIGER_BRIDGE_URL || "http://localhost:3456";
const BRIDGE_TOKEN = process.env.TIGER_BRIDGE_TOKEN || "";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const { message } = await request.json();

  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // End-to-end timing: measure the full /api/chat call so we can compare
  // against the bridge's own timing (data.timing) to find overhead.
  const t0 = Date.now();

  try {
    // Call the bridge
    const response = await fetch(`${BRIDGE_URL}/tiger/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${BRIDGE_TOKEN}`,
      },
      body: JSON.stringify({ message }),
    });

    const tBridgeDone = Date.now();
    const data = await response.json();

    if (data?.timing) {
      console.log(
        `[chat.timing] bridge: ${JSON.stringify(data.timing)} | dashboard: bridge_call=${tBridgeDone - t0}ms`
      );
    }

    console.log("[chat] Bridge response:", JSON.stringify(data).substring(0, 500));

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || "Chat failed" },
        { status: response.status }
      );
    }

    // Extract the text response - OpenClaw returns in several possible formats
    let text = "";

    if (data.response?.result?.payloads?.[0]?.text) {
      text = data.response.result.payloads[0].text;
    } else if (data.response?.payloads?.[0]?.text) {
      text = data.response.payloads[0].text;
    } else if (data.response?.summary) {
      text = data.response.summary;
    } else if (data.response?.text) {
      text = data.response.text;
    } else if (data.text) {
      text = data.text;
    } else {
      // Fallback: stringify the whole response for debugging
      text = JSON.stringify(data);
    }

    console.log("[chat] Extracted text:", text.substring(0, 200));

    // Return as SSE with word-by-word streaming.
    //
    // WHY SIMULATE STREAMING?
    // The bridge gives us the entire reply in one shot (LLM call completes
    // before the process returns). That means without this code the whole
    // answer pops in at once — feels sluggish even though the infra is fine.
    // Splitting on whitespace and drip-feeding gives the UI a "typing" feel
    // without changing the backend. Total time until done is identical.
    //
    // When true token-level streaming is wired in the bridge (Phase 3), we
    // can swap this out for real chunks from openclaw's event stream.
    const encoder = new TextEncoder();
    const words = text.split(/(\s+)/); // keep whitespace tokens → smooth flow
    // ~60 words-per-second cadence ≈ 16ms per word. Tune to taste.
    const WORD_DELAY_MS = 25; // 40 wps — smooth typing feel with frame headroom

    const stream = new ReadableStream({
      async start(controller) {
        // Send status marker first so UI can show the thinking indicator.
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "status", content: "" })}\n\n`
          )
        );

        // Drip-feed word tokens. Each is a "chunk" that appends to the
        // streaming message bubble on the client.
        for (const word of words) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "chunk", content: word })}\n\n`
            )
          );
          if (WORD_DELAY_MS > 0) {
            await new Promise((resolve) => setTimeout(resolve, WORD_DELAY_MS));
          }
        }

        // Final done event carries the full text as a safety fallback
        // (see the Bug D fix in chat-interface.tsx).
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "done", content: text })}\n\n`
          )
        );

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    console.error("[chat] Error:", err.message);
    return NextResponse.json(
      { error: "Failed to communicate with Tiger Bridge" },
      { status: 500 }
    );
  }
}