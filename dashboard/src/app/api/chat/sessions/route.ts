/**
 * /api/chat/sessions — list, create, delete chat sessions.
 *
 * GET    → list webchat-eligible sessions (Main + any "agent:main:webchat-*")
 *          via gateway sessions.list. Returns simplified shape for the UI.
 * POST   → mint a new session key. The session is auto-created in the
 *          gateway on first message (so we don't need to call anything
 *          here — just return the key for the UI to start using).
 * DELETE ?key=agent:main:webchat-xyz → remove from gateway + clear sqlite history.
 *          The default "agent:main:main" session can never be deleted.
 */

import { NextRequest, NextResponse } from "next/server";
import { callGateway, newSessionKey, DEFAULT_SESSION_KEY } from "@/lib/openclaw-ws";

const BRIDGE_URL = process.env.TIGER_BRIDGE_URL || "http://localhost:3456";
const BRIDGE_TOKEN = process.env.TIGER_BRIDGE_TOKEN || "";

/** Whitelist: only "agent:main:main" + "agent:main:webchat-*" sessions are dashboard-visible. */
function isWebchatSession(key: string): boolean {
  return key === DEFAULT_SESSION_KEY || key.startsWith("agent:main:webchat-");
}

/** Pretty label for the dropdown. */
function deriveLabel(key: string, displayName?: string): string {
  if (key === DEFAULT_SESSION_KEY) return "Main";
  if (displayName && displayName !== "undefined") return displayName;
  // For "agent:main:webchat-abc12345" → "Chat abc12345"
  const m = key.match(/^agent:main:webchat-(.+)$/);
  if (m) return `Chat ${m[1].slice(0, 8)}`;
  return key;
}

export async function GET() {
  try {
    // Ask gateway for ALL sessions, then filter to webchat-visible ones.
    const r = await callGateway("sessions.list", {});
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: "gateway sessions.list failed", details: r.error },
        { status: 502 }
      );
    }
    const all = (r.payload as any)?.sessions || [];
    const webchat = all
      .filter((s: any) => isWebchatSession(s.key))
      .map((s: any) => ({
        key: s.key,
        label: deriveLabel(s.key, s.displayName),
        updatedAt: s.updatedAt || null,
        messageCount: s.messageCount || 0,
        isDefault: s.key === DEFAULT_SESSION_KEY,
      }))
      // Default first, then most-recently-updated
      .sort((a: any, b: any) => {
        if (a.isDefault) return -1;
        if (b.isDefault) return 1;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });

    // Always ensure "Main" is in the list, even if gateway hasn't seen it yet
    if (!webchat.find((s: any) => s.key === DEFAULT_SESSION_KEY)) {
      webchat.unshift({ key: DEFAULT_SESSION_KEY, label: "Main", updatedAt: null, messageCount: 0, isDefault: true });
    }

    return NextResponse.json({ ok: true, sessions: webchat });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "sessions list failed", details: err.message },
      { status: 502 }
    );
  }
}

export async function POST() {
  // Mint a new key. Actual gateway session is created lazily on first message.
  const key = newSessionKey();
  return NextResponse.json({
    ok: true,
    session: { key, label: deriveLabel(key), updatedAt: null, messageCount: 0, isDefault: false },
  });
}

export async function DELETE(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key") || "";
  if (!key) {
    return NextResponse.json({ ok: false, error: "key query param required" }, { status: 400 });
  }
  if (key === DEFAULT_SESSION_KEY) {
    return NextResponse.json({ ok: false, error: "the Main session cannot be deleted" }, { status: 400 });
  }
  if (!isWebchatSession(key)) {
    return NextResponse.json({ ok: false, error: "only webchat sessions can be deleted from here" }, { status: 400 });
  }

  // 1. Best-effort: ask gateway to delete its session record.
  //    If the session has never been used (no first message yet) the gateway
  //    won't know about it — that's fine, we still want to clean sqlite.
  let gatewayResult: { ok: boolean; error?: any } = { ok: true };
  try {
    gatewayResult = await callGateway("sessions.delete", { key });
  } catch (err: any) {
    gatewayResult = { ok: false, error: err.message };
  }

  // 2. Clear our sqlite history for this session via the bridge.
  let bridgeResult = { ok: true } as any;
  try {
    const r = await fetch(
      `${BRIDGE_URL}/tiger/chat/history?sessionId=${encodeURIComponent(key)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${BRIDGE_TOKEN}` } }
    );
    bridgeResult = await r.json();
  } catch (err: any) {
    bridgeResult = { ok: false, error: err.message };
  }

  return NextResponse.json({
    ok: bridgeResult.ok,
    gateway: gatewayResult,
    bridge: bridgeResult,
  });
}
