/**
 * use-bridge.ts — React hooks for the Tiger Bridge API
 *
 * These are CLIENT-SIDE hooks.  They call the Next.js /api/tiger/* routes,
 * which in turn call the Tiger Bridge on the VPS.
 *
 * Why use Next.js routes as a middleman?
 *   - The TIGER_BRIDGE_TOKEN never reaches the browser
 *   - The bridge can only be accessed server-side (safe)
 *   - We avoid CORS config between browser and VPS
 *
 * Hooks exported:
 *   useBridgeRequest()    — one-shot fetch (status, exec, config, restart)
 *   useTigerLogs()        — SSE hook that streams log lines from the bridge
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BridgeStatus {
  status: "online" | "degraded" | "offline";
  container: {
    status: string;
    exitCode: number;
    startedAt: string;
  };
  openclaw: {
    running: boolean;
    processInfo: string;
  };
  system: {
    memoryUsagePct: number;
    memoryTotalMb: number;
    uptime: string;
  };
  agent: {
    currentModel: string;
    fallbackModels: string[];
    heartbeat: string | null;
    soul: string | null;
  };
}

export interface LogEntry {
  id: string;
  ts: string;
  text: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
}

// ─── useBridgeRequest ─────────────────────────────────────────────────────────

/**
 * Low-level hook for making requests to /api/tiger/* endpoints.
 *
 * Usage:
 *   const { request, loading } = useBridgeRequest()
 *   const status = await request("/api/tiger/status")
 *   await request("/api/tiger/restart", "POST", { reason: "dashboard" })
 *   await request("/api/tiger/tasks/task_123", "PUT", { status: "done" })
 *   await request("/api/tiger/projects/proj_123", "DELETE")
 */
export function useBridgeRequest() {
  const [loading, setLoading] = useState(false);

  const request = useCallback(
    async (
      apiPath: string,
      method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
      body?: Record<string, unknown>
    ): Promise<unknown> => {
      setLoading(true);
      try {
        const res = await fetch(apiPath, {
          method,
          headers: body || method === "DELETE" ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(err.error || `HTTP ${res.status}`);
        }

        return await res.json();
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { request, loading };
}

// ─── useTigerLogs ─────────────────────────────────────────────────────────────

/**
 * Hook that opens an SSE connection to /api/tiger/logs and streams
 * log lines in real-time.
 *
 * How SSE works (simple mental model):
 *   - Your browser opens a one-way "long-lived" HTTP connection
 *   - The server keeps the connection open and sends events as they happen
 *   - It's like a news ticker: the server pushes updates, you don't poll
 *   - If the connection drops, EventSource reconnects automatically
 *
 * Usage:
 *   const { logs, connected, clear, pause, paused } = useTigerLogs({ lines: 200 })
 *
 * @param lines    - How many historical lines to fetch first (default 100)
 * @param filter   - Optional keyword filter (passed to bridge)
 * @param maxLines - Max entries to keep in memory (default 500)
 */
export function useTigerLogs({
  lines = 100,
  filter = "",
  maxLines = 500,
}: {
  lines?: number;
  filter?: string;
  maxLines?: number;
} = {}) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);

  // We use a ref for paused so the event handler always sees the latest value
  // (closure would capture the initial value otherwise)
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Build the URL with query params
  const url = filter
    ? `/api/tiger/logs?lines=${lines}&filter=${encodeURIComponent(filter)}`
    : `/api/tiger/logs?lines=${lines}`;

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      // EventSource is the browser's built-in SSE API
      // It reconnects automatically after errors
      eventSource = new EventSource(url);

      // "connected" event — our custom event type from the bridge
      eventSource.addEventListener("connected", () => {
        setConnected(true);
      });

      // "log" event — each log line from Docker
      eventSource.addEventListener("log", (e: MessageEvent) => {
        if (pausedRef.current) return;

        try {
          const data = JSON.parse(e.data) as { ts: string; text: string; level: string };
          const entry: LogEntry = {
            id: `log-${Date.now()}-${Math.random()}`,
            ts: data.ts,
            text: data.text,
            level: (data.level as LogEntry["level"]) || "INFO",
          };

          // Keep only the last maxLines entries (prevent memory leak)
          setLogs((prev) => [...prev.slice(-(maxLines - 1)), entry]);
        } catch {
          // Ignore malformed events
        }
      });

      // "closed" event — stream ended (container stopped, etc.)
      eventSource.addEventListener("closed", () => {
        setConnected(false);
      });

      // "error" event — bridge error
      eventSource.addEventListener("error", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          setLogs((prev) => [
            ...prev.slice(-(maxLines - 1)),
            {
              id: `err-${Date.now()}`,
              ts: new Date().toISOString(),
              text: `[BRIDGE ERROR] ${data.message}`,
              level: "ERROR",
            },
          ]);
        } catch { /* ignore */ }
      });

      // onerror fires when EventSource loses connection
      eventSource.onerror = () => {
        setConnected(false);
        eventSource?.close();
        // Retry after 5 seconds
        retryTimeout = setTimeout(connect, 5000);
      };
    };

    connect();

    // Cleanup when component unmounts
    return () => {
      eventSource?.close();
      if (retryTimeout) clearTimeout(retryTimeout);
      setConnected(false);
    };
  }, [url, maxLines]); // Reconnect if URL changes (filter/lines changed)

  const clear = useCallback(() => setLogs([]), []);
  const pause = useCallback(() => setPaused(true), []);
  const resume = useCallback(() => setPaused(false), []);

  return { logs, connected, paused, clear, pause, resume };
}
