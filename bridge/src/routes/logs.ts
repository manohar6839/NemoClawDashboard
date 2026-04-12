/**
 * logs.ts — GET /tiger/logs  (Server-Sent Events)
 *
 * Streams real-time Docker container logs to the dashboard using SSE.
 *
 * SSE (Server-Sent Events) is simpler than WebSockets for one-way data
 * (server → client). The browser's native EventSource API reconnects
 * automatically if the connection drops.
 *
 * Query params:
 *   ?lines=N     — how many historical lines to tail first (default: 100)
 *   ?filter=text — only forward lines containing this string (case-insensitive)
 *
 * SSE event format:
 *   data: {"ts":"ISO-string","text":"log line","level":"INFO|WARN|ERROR|DEBUG"}\n\n
 */

import { Router, Request, Response } from "express";
import { streamLogs } from "../tiger.js";

const router = Router();

router.get("/", (req: Request, res: Response) => {
  // ─── Parse query params ──────────────────────────────────────────────────
  const lines = parseInt((req.query.lines as string) || "100", 10);
  const filter = ((req.query.filter as string) || "").toLowerCase();

  // ─── Set SSE headers ─────────────────────────────────────────────────────
  // These headers tell the browser this is an event stream
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable Nginx/Caddy buffering

  // Flush headers immediately so the client knows the stream started
  res.flushHeaders();

  // ─── Helper: send one SSE event ──────────────────────────────────────────
  /**
   * SSE format is simple:
   *   data: <json>\n\n
   * The double newline signals the end of one event.
   * The 'event:' field is optional — we use it to distinguish log lines
   * from control messages (like "connected" or "error").
   */
  const sendEvent = (eventType: string, payload: unknown) => {
    // res.writable becomes false once the client disconnects
    if (!res.writable) return;
    res.write(`event: ${eventType}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  // ─── Keepalive comments ───────────────────────────────────────────────────
  // SSE comments (lines starting with `:`) are ignored by clients.
  // We send them every 15s to keep proxies and firewalls from closing the conn.
  const keepalive = setInterval(() => {
    if (res.writable) res.write(": keepalive\n\n");
  }, 15_000);

  // ─── Start log stream ────────────────────────────────────────────────────
  // This spawns: docker logs --follow --tail N <container>
  const proc = streamLogs(lines);

  // Send a "connected" event so the client knows the stream is live
  sendEvent("connected", { ts: new Date().toISOString(), tail: lines });

  /**
   * Docker logs interleaves stdout (normal logs) and stderr (error logs).
   * We listen to both with the same handler.
   */
  const handleData = (data: Buffer) => {
    // Split on newlines — one buffer chunk may contain multiple log lines
    const lines_arr = data.toString().split("\n").filter(Boolean);

    for (const line of lines_arr) {
      // Apply keyword filter if set
      if (filter && !line.toLowerCase().includes(filter)) continue;

      // Heuristic log level detection
      const lower = line.toLowerCase();
      const level = lower.includes("error")
        ? "ERROR"
        : lower.includes("warn")
        ? "WARN"
        : lower.includes("debug")
        ? "DEBUG"
        : "INFO";

      sendEvent("log", {
        ts: new Date().toISOString(),
        text: line,
        level,
      });
    }
  };

  proc.stdout.on("data", handleData);
  proc.stderr.on("data", handleData);

  // If the docker process exits (container stopped, etc.), notify the client
  proc.on("close", (code) => {
    sendEvent("closed", {
      ts: new Date().toISOString(),
      message: `Log stream ended (exit code: ${code})`,
    });
    clearInterval(keepalive);
    res.end();
  });

  proc.on("error", (err) => {
    sendEvent("error", {
      ts: new Date().toISOString(),
      message: `Failed to start log stream: ${err.message}`,
    });
    clearInterval(keepalive);
    res.end();
  });

  // ─── Cleanup on client disconnect ─────────────────────────────────────────
  // When the user closes the Logs tab, clean up the docker logs process
  req.on("close", () => {
    proc.kill(); // Stop the docker logs process
    clearInterval(keepalive);
  });
});

export default router;
