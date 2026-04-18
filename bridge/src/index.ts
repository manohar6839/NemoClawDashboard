/**
 * index.ts — Tiger Bridge API Entry Point
 *
 * This is the main Express server that runs on the Hetzner VPS host.
 * It wraps all the docker→k3s→sandbox commands into clean REST endpoints
 * that the Next.js dashboard can call over HTTPS.
 *
 * Architecture:
 *   Dashboard (Next.js) → HTTPS → Caddy reverse proxy
 *                               → Tiger Bridge (this server, port 3456)
 *                               → docker exec openshell-cluster-nemoclaw
 *                               → kubectl exec -n openshell tiger
 *                               → sandbox pod (Tiger agent)
 *
 * Routes:
 *   GET  /tiger/status      — container health + process state + memory/CPU
 *   GET  /tiger/logs        — SSE stream of real-time container logs
 *   POST /tiger/exec        — run a command inside the sandbox
 *   GET  /tiger/config      — read openclaw.json config
 *   POST /tiger/config      — update config + auto-regen hash
 *   POST /tiger/restart     — trigger container restart via watchdog
 *   GET  /tiger/workspace   — list workspace files
 *   GET  /tiger/files/:path — read a workspace file
 */

import express from "express";
import cors from "cors";
import { authMiddleware } from "./auth.js";
import statusRouter from "./routes/status.js";
import logsRouter from "./routes/logs.js";
import execRouter from "./routes/exec.js";
import configRouter from "./routes/config.js";
import restartRouter from "./routes/restart.js";
import filesRouter from "./routes/files.js";
import projectsRouter from "./routes/projects.js";
import tasksRouter from "./routes/tasks.js";
import dispatchRouter from "./routes/dispatch.js";
import { initWatcher } from "./watcher.js";

// Import db to ensure it's initialized
import "./db.js";

// ─── Configuration ─────────────────────────────────────────────────────────
const PORT = parseInt(process.env.TIGER_BRIDGE_PORT || "3456", 10);
const HOST = process.env.TIGER_BRIDGE_HOST || "0.0.0.0"; // Bind to all interfaces for Docker access

const app = express();

// ─── Middleware ─────────────────────────────────────────────────────────────

// Parse JSON request bodies
app.use(express.json());

// CORS — only allow the dashboard origin
// In production, set ALLOWED_ORIGIN to https://agent.manohargupta.com
const allowedOrigin = process.env.ALLOWED_ORIGIN || "http://localhost:3000";
app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
  })
);

// All routes require a valid bearer token
// Set TIGER_BRIDGE_TOKEN in the environment — same value in dashboard .env
app.use(authMiddleware);

// ─── Routes ─────────────────────────────────────────────────────────────────

// Health check (no auth needed — Caddy health probes use this)
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "tiger-bridge", ts: new Date().toISOString() });
});

// Tiger endpoints — all scoped under /tiger
app.use("/tiger/status", statusRouter);
app.use("/tiger/logs", logsRouter);    // SSE stream
app.use("/tiger/exec", execRouter);
app.use("/tiger/config", configRouter);
app.use("/tiger/restart", restartRouter);
app.use("/tiger/workspace", filesRouter);
app.use("/tiger/files", filesRouter);  // Same router handles both /workspace and /files/:path

// Project and Task management
app.use("/tiger/projects", projectsRouter);
app.use("/tiger/tasks", tasksRouter);
app.use("/tiger/dispatch", dispatchRouter);
app.use("/tiger/chat", (await import("./routes/chat.js")).default);

// Gateway proxy — forwards to gateway inside Tiger container
// This is needed because the dashboard runs in Dokploy which can't reach the container directly
app.use("/api/gateway", (await import("./routes/gateway.js")).default);

// ─── Error handling ─────────────────────────────────────────────────────────

// Catch-all for unmatched routes
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Global error handler (Express catches thrown errors here)
// The 4-arg signature is required by Express to recognise this as an error handler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[tiger-bridge] Unhandled error:", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, HOST, () => {
  console.log(`[tiger-bridge] Listening on http://${HOST}:${PORT}`);
  console.log(`[tiger-bridge] Auth: ${process.env.TIGER_BRIDGE_TOKEN ? "enabled" : "DISABLED (no token set)"}`);
  console.log(`[tiger-bridge] CORS origin: ${allowedOrigin}`);

  // Initialize file watcher for task status updates
  initWatcher();
});
