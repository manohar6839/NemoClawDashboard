/**
 * /api/tiger/logs — GET (Server-Sent Events proxy)
 *
 * This route proxies the SSE stream from the Tiger Bridge to the browser.
 *
 * Why proxy instead of connecting directly from the browser to the bridge?
 *   - The TIGER_BRIDGE_TOKEN never reaches the browser (security)
 *   - Caddy only needs to expose the dashboard, not the bridge
 *   - Easier CORS — browser just talks to same-origin /api/...
 *
 * How SSE proxying works:
 *   Browser → EventSource("/api/tiger/logs")
 *     → This Next.js route opens a fetch() to the Bridge's /tiger/logs
 *       → Gets an SSE stream back
 *         → Reads it chunk by chunk and writes to a new ReadableStream
 *           → Browser receives the events as if directly from the bridge
 *
 * Query params (passed through to the bridge):
 *   ?lines=N     — historical lines to tail first
 *   ?filter=text — keyword filter
 */

import { bridgeLogsUrl, authHeaders } from "@/lib/bridge";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Parse query params from the incoming browser request
  const { searchParams } = new URL(request.url);
  const lines = parseInt(searchParams.get("lines") || "100", 10);
  const filter = searchParams.get("filter") || "";

  // Build the Bridge SSE URL
  const bridgeUrl = bridgeLogsUrl(lines, filter);

  let bridgeResponse: Response;
  try {
    // Open the SSE connection to the Tiger Bridge
    // The Bridge token is added in the Authorization header (server-side only)
    bridgeResponse = await fetch(bridgeUrl, {
      method: "GET",
      headers: {
        Accept: "text/event-stream",
        ...authHeaders(),
      },
      // @ts-expect-error — duplex is required for streaming in some runtimes
      duplex: "half",
    });
  } catch (err: any) {
    // Bridge is unreachable — send an error event then close
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ message: `Bridge unreachable: ${err.message}` })}\n\n`
          )
        );
        controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  if (!bridgeResponse.ok || !bridgeResponse.body) {
    // Bridge returned an error — propagate it as an SSE error event
    const errText = await bridgeResponse.text().catch(() => "unknown error");
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ message: `Bridge error: ${errText}` })}\n\n`
          )
        );
        controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  // Pipe the bridge's SSE stream directly to the browser
  // The bridge already formats proper SSE events — we just forward them
  return new Response(bridgeResponse.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
