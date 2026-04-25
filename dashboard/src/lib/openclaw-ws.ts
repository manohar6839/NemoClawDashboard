/**
 * openclaw-ws.ts — Direct OpenClaw Gateway WebSocket client for the dashboard.
 *
 * REPLACES the old /api/chat → bridge → docker exec → fake-streaming chain.
 * We now talk WS directly to the gateway and stream tokens token-by-token.
 *
 * PROTOCOL (verified empirically against gateway 2026.3.12):
 *   1. Open WS to ws://127.0.0.1:18789 with Origin matching controlUi.allowedOrigins.
 *   2. Gateway pushes unsolicited:  {type:"event",event:"connect.challenge",payload:{nonce,ts}}
 *   3. We reply within 3s with method:"connect" using client.id="openclaw-control-ui"
 *      (only this id passes when dangerouslyDisableDeviceAuth=true).
 *   4. Gateway returns hello-ok.
 *   5. We send method:"agent" with params { idempotencyKey, sessionId, sessionKey, message }.
 *      KEY DISTINCTION:
 *        - sessionKey ("agent:main:main", "agent:main:webchat-xyz") = real context handle
 *        - sessionId = per-request UUID, just for idempotency tracking
 *      Different sessionKey → different conversation memory, isolated context.
 *   6. Gateway responds twice on the same req id:
 *        first  res payload.status="accepted" + runId  (this is the ACK)
 *        later  res payload.status="ok" + summary + result  (this is the FINAL)
 *   7. Between (6) we get streaming event:agent frames with payload.stream:
 *        "lifecycle" → data:{phase:"start"|"end"}
 *        "assistant" → data:{text, delta}  ← the actual tokens
 *
 * EVENT TRANSLATION emitted to caller:
 *   lifecycle:start         → { kind:"status",  content:"thinking" }
 *   assistant.delta         → { kind:"chunk",   content:<delta> }
 *   final res ok            → { kind:"done",    content:<full text>, meta }
 *   any error / connect bad → { kind:"error",   content:<message> }
 */

import WebSocket from "ws";
import { randomUUID } from "crypto";

export type AgentEventKind = "status" | "chunk" | "done" | "error";

export interface AgentEvent {
  kind: AgentEventKind;
  content: string;
  meta?: { runId?: string; model?: string; durationMs?: number };
}

export interface StreamAgentArgs {
  message: string;
  /** OpenClaw session key like "agent:main:main" or "agent:main:webchat-abc". Defaults to "agent:main:main". */
  sessionKey?: string;
  /** Default: env OPENCLAW_GATEWAY_URL → http://127.0.0.1:18789 */
  gatewayWsUrl?: string;
  /** Default: env OPENCLAW_GATEWAY_TOKEN */
  gatewayToken?: string;
  /** Must match gateway.controlUi.allowedOrigins. Default: http://localhost:3100 */
  origin?: string;
  /** Hard ceiling on the whole run. Default 150s. */
  overallTimeoutMs?: number;
  /** Tighter timer for handshake only. Default 5s. */
  connectTimeoutMs?: number;
}

export const DEFAULT_SESSION_KEY = "agent:main:main";

/** Convert http(s):// to ws(s):// — leaves ws:// untouched. */
function toWsUrl(url: string): string {
  if (url.startsWith("ws://") || url.startsWith("wss://")) return url;
  return url.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
}

/**
 * Generate a new sessionKey for a fresh chat. Caller usually persists this in
 * the UI / localStorage and reuses it for follow-up messages in the same chat.
 */
export function newSessionKey(): string {
  return `agent:main:webchat-${randomUUID().slice(0, 8)}`;
}

/**
 * Async generator that yields AgentEvents in real time.
 * Caller (Next.js route) translates each into an SSE frame.
 */
export async function* streamAgentRun(
  args: StreamAgentArgs
): AsyncGenerator<AgentEvent, void, void> {
  const rawUrl = args.gatewayWsUrl ?? process.env.OPENCLAW_GATEWAY_URL ?? "http://127.0.0.1:18789";
  const wsUrl = toWsUrl(rawUrl);
  const token = args.gatewayToken ?? process.env.OPENCLAW_GATEWAY_TOKEN ?? "";
  const origin = args.origin ?? process.env.OPENCLAW_GATEWAY_ORIGIN ?? "http://localhost:3100";
  const sessionKey = args.sessionKey ?? DEFAULT_SESSION_KEY;
  const overallTimeoutMs = args.overallTimeoutMs ?? 150_000;
  const connectTimeoutMs = args.connectTimeoutMs ?? 5_000;

  if (!token) {
    yield { kind: "error", content: "OPENCLAW_GATEWAY_TOKEN not configured" };
    return;
  }

  /* Queue-backed async iterator. WS callbacks push() events; pull() awaits. */
  const pending: AgentEvent[] = [];
  let resolver: ((ev: AgentEvent | null) => void) | null = null;
  let finished = false;

  const push = (ev: AgentEvent): void => {
    if (finished) return;
    if (resolver) { const r = resolver; resolver = null; r(ev); }
    else pending.push(ev);
  };
  const endWith = (ev?: AgentEvent): void => {
    if (finished) return;
    if (ev) push(ev);
    finished = true;
    if (resolver) { const r = resolver; resolver = null; r(null); }
  };
  const pull = (): Promise<AgentEvent | null> => {
    if (pending.length > 0) return Promise.resolve(pending.shift()!);
    if (finished) return Promise.resolve(null);
    return new Promise<AgentEvent | null>((r) => { resolver = r; });
  };

  const ws = new WebSocket(wsUrl, { headers: { Origin: origin } });
  const tStart = Date.now();

  // Hard timeout for the whole stream.
  const overallTimer = setTimeout(() => {
    endWith({ kind: "error", content: `overall timeout after ${overallTimeoutMs}ms` });
    try { ws.close(); } catch { /* noop */ }
  }, overallTimeoutMs);

  // Handshake-only timer (cleared on hello-ok).
  let connectTimer: NodeJS.Timeout | null = setTimeout(() => {
    endWith({ kind: "error", content: `handshake timeout after ${connectTimeoutMs}ms` });
    try { ws.close(); } catch { /* noop */ }
  }, connectTimeoutMs);

  let connectReqId: string | null = null;
  let agentReqId: string | null = null;
  let runId: string | null = null;
  let accumulatedText = "";

  ws.on("error", (err: Error) => {
    endWith({ kind: "error", content: `ws error: ${err.message}` });
  });
  ws.on("close", (code: number, reason: Buffer) => {
    if (!finished) {
      endWith({ kind: "error", content: `ws closed unexpectedly: ${code} ${reason.toString()}` });
    }
  });

  ws.on("message", (raw: WebSocket.RawData) => {
    let frame: any;
    try { frame = JSON.parse(raw.toString()); } catch { return; }

    /* Step 2: connect.challenge → send connect */
    if (frame.type === "event" && frame.event === "connect.challenge") {
      connectReqId = randomUUID();
      ws.send(JSON.stringify({
        type: "req",
        id: connectReqId,
        method: "connect",
        params: {
          minProtocol: 3, maxProtocol: 3,
          // Only "openclaw-control-ui" passes when dangerouslyDisableDeviceAuth=true
          client: { id: "openclaw-control-ui", version: "tiger-dashboard-1.0", platform: "linux", mode: "webchat" },
          role: "operator",
          scopes: ["operator.read", "operator.write", "operator.admin"],
          caps: [], commands: [], permissions: {},
          auth: { token },
          locale: "en-US", userAgent: "tiger-dashboard/1.0",
        },
      }));
      return;
    }

    /* Step 4: hello-ok → fire agent run */
    if (frame.type === "res" && frame.id === connectReqId) {
      if (!frame.ok) {
        endWith({ kind: "error", content: `connect rejected: ${JSON.stringify(frame.error)}` });
        try { ws.close(); } catch { /* noop */ }
        return;
      }
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }

      agentReqId = randomUUID();
      ws.send(JSON.stringify({
        type: "req",
        id: agentReqId,
        method: "agent",
        params: {
          idempotencyKey: randomUUID(),
          sessionId: randomUUID(),  // per-run UUID, NOT the context handle
          sessionKey,                // THE context handle — segregates conversation memory
          message: args.message,
        },
      }));
      return;
    }

    /* Steps 6 & 8: res:agent comes twice (ack, then final) */
    if (frame.type === "res" && frame.id === agentReqId) {
      const status: string | undefined = frame.payload?.status;

      if (status === "accepted") {
        runId = frame.payload?.runId;
        push({ kind: "status", content: "thinking", meta: { runId: runId ?? undefined } });
        return;
      }
      if (status === "ok") {
        const finalText: string = frame.payload?.result?.payloads?.[0]?.text ?? accumulatedText;
        const model: string | undefined = frame.payload?.result?.meta?.agentMeta?.model;
        const durationMs: number = frame.payload?.result?.meta?.durationMs ?? (Date.now() - tStart);
        endWith({
          kind: "done",
          content: finalText,
          meta: { runId: runId ?? undefined, model, durationMs },
        });
        try { ws.close(); } catch { /* noop */ }
        return;
      }
      endWith({
        kind: "error",
        content: `agent failed: status=${status} ${JSON.stringify(frame.payload?.error ?? frame.error)}`,
      });
      try { ws.close(); } catch { /* noop */ }
      return;
    }

    /* Step 7: streaming event:agent frames */
    if (frame.type === "event" && frame.event === "agent") {
      const p = frame.payload ?? {};
      // Filter to OUR run — gateway broadcasts events to all operator clients
      if (runId && p.runId && p.runId !== runId) return;

      if (p.stream === "lifecycle") return; // start/end already covered by status/done

      if (p.stream === "assistant") {
        const data = p.data ?? {};
        const delta: string | undefined = typeof data.delta === "string" ? data.delta : undefined;
        const text: string | undefined = typeof data.text === "string" ? data.text : undefined;
        let chunk: string | null = null;
        if (delta) { chunk = delta; accumulatedText += delta; }
        else if (text) {
          if (text.startsWith(accumulatedText)) {
            chunk = text.slice(accumulatedText.length);
            accumulatedText = text;
          } else { chunk = text; accumulatedText = text; }
        }
        if (chunk) push({ kind: "chunk", content: chunk });
        return;
      }
      // Unknown streams (tool, subagent, etc) — surface in future
      return;
    }
  });

  /* Drain queue and yield to caller */
  try {
    while (true) {
      const ev = await pull();
      if (ev === null) return;
      yield ev;
      if (ev.kind === "done" || ev.kind === "error") return;
    }
  } finally {
    clearTimeout(overallTimer);
    if (connectTimer) clearTimeout(connectTimer);
    try { ws.close(); } catch { /* noop */ }
  }
}

/* ─── Convenience: simple non-streaming RPC ────────────────────────────────
 * For methods that don't need streaming events (sessions.list, sessions.delete, etc).
 * Connects, calls, returns the final res, closes.
 */
export async function callGateway<T = any>(
  method: string,
  params: Record<string, any> = {},
  opts: Pick<StreamAgentArgs, "gatewayWsUrl" | "gatewayToken" | "origin"> = {}
): Promise<{ ok: boolean; payload?: T; error?: any }> {
  const rawUrl = opts.gatewayWsUrl ?? process.env.OPENCLAW_GATEWAY_URL ?? "http://127.0.0.1:18789";
  const wsUrl = toWsUrl(rawUrl);
  const token = opts.gatewayToken ?? process.env.OPENCLAW_GATEWAY_TOKEN ?? "";
  const origin = opts.origin ?? process.env.OPENCLAW_GATEWAY_ORIGIN ?? "http://localhost:3100";

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { headers: { Origin: origin } });
    let connectReqId: string | null = null;
    let callReqId: string | null = null;
    const timer = setTimeout(() => { try { ws.close(); } catch {} reject(new Error(`callGateway timeout method=${method}`)); }, 30000);

    ws.on("error", (err: Error) => { clearTimeout(timer); reject(err); });
    ws.on("close", () => { /* normal */ });
    ws.on("message", (raw: WebSocket.RawData) => {
      let frame: any;
      try { frame = JSON.parse(raw.toString()); } catch { return; }

      if (frame.type === "event" && frame.event === "connect.challenge") {
        connectReqId = randomUUID();
        ws.send(JSON.stringify({
          type: "req", id: connectReqId, method: "connect",
          params: {
            minProtocol: 3, maxProtocol: 3,
            client: { id: "openclaw-control-ui", version: "1.0", platform: "linux", mode: "webchat" },
            role: "operator", scopes: ["operator.read", "operator.write", "operator.admin"],
            caps: [], commands: [], permissions: {},
            auth: { token }, locale: "en-US", userAgent: "tiger-dashboard/1.0",
          },
        }));
        return;
      }
      if (frame.type === "res" && frame.id === connectReqId) {
        if (!frame.ok) {
          clearTimeout(timer); try { ws.close(); } catch {}
          return resolve({ ok: false, error: frame.error });
        }
        callReqId = randomUUID();
        ws.send(JSON.stringify({ type: "req", id: callReqId, method, params }));
        return;
      }
      if (frame.type === "res" && frame.id === callReqId) {
        // Skip "accepted" intermediate; wait for terminal
        if (frame.payload?.status === "accepted") return;
        clearTimeout(timer); try { ws.close(); } catch {}
        resolve({ ok: !!frame.ok, payload: frame.payload, error: frame.error });
      }
    });
  });
}
