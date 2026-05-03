/**
 * index.ts — Tiger Bridge API Entry Point
 *
 * Express server running on the Hetzner VPS host (port 3456).
 * Wraps docker exec commands into authenticated REST endpoints consumed
 * by the Next.js dashboard and Tiger agent cron jobs.
 *
 * Architecture:
 *   Dashboard (Next.js) → HTTPS → Traefik → Tiger Bridge (port 3456)
 *                                          → docker exec tiger-openclaw
 *                                          → OpenClaw (Tiger agent)
 *
 * Auth: Bearer token (TIGER_BRIDGE_TOKEN). All routes except none are protected.
 *
 * Routes:
 *   GET    /tiger/status                — container health + memory/CPU
 *   GET    /tiger/logs                  — SSE stream of container logs
 *   POST   /tiger/exec                  — run arbitrary command in container
 *   GET    /tiger/config                — read openclaw.json
 *   POST   /tiger/config                — update openclaw.json
 *   GET    /tiger/config/models         — list registered models
 *   GET    /tiger/config/models/agents  — per-agent model overrides
 *   PATCH  /tiger/config/models/agents/:id — update agent model
 *   POST   /tiger/restart               — restart tiger-openclaw container
 *   GET    /tiger/workspace             — list workspace files
 *   GET    /tiger/files/:path           — read a workspace file
 *   PUT    /tiger/agents/:id/file       — write an agent workspace file
 *   GET    /tiger/agents                — list configured agents
 *   GET    /tiger/agents/:id/files      — list agent workspace files
 *   GET    /tiger/agents/activity       — recent agent activity log
 *   GET    /tiger/projects              — list projects (SQLite)
 *   POST   /tiger/projects              — create project
 *   GET    /tiger/projects/:id          — get project
 *   PUT    /tiger/projects/:id          — update project
 *   DELETE /tiger/projects/:id          — delete project
 *   GET    /tiger/tasks                 — list tasks (SQLite)
 *   GET    /tiger/tasks/:id             — get task
 *   PUT    /tiger/tasks/:id             — update task
 *   DELETE /tiger/tasks/:id             — delete task
 *   POST   /tiger/tasks/:id/execute     — enqueue task for execution
 *   GET    /tiger/file-tasks            — TASKS.md → tasks[] (JSON block)
 *   GET    /tiger/file-tasks/active     — in-progress + pending-action only
 *   GET    /tiger/file-tasks/completed  — completed section only
 *   GET    /tiger/file-tasks/projects   — PROJECTS.md → projects[]
 *   GET    /tiger/cron                  — list cron jobs (jobs.json)
 *   POST   /tiger/cron/:id/run          — fire cron job immediately
 *   POST   /tiger/notify                — send Telegram message {message, chatId?}
 *   POST   /tiger/dispatch              — enqueue task to SQLite + write to inbox
 *   GET    /tiger/dispatch/status/:id   — poll task execution status
 *   POST   /tiger/chat                  — SSE streaming chat to Tiger agent
 *   GET    /tiger/chat/history          — recent chat messages (SQLite)
 *   DELETE /tiger/chat/history          — clear chat history
 *   POST   /tiger/chat/persist          — persist a message to SQLite
 *   POST   /tiger/route-task            — LLM router: which agent handles X?
 *   POST   /tiger/deploy-dashboard      — git pull + rebuild + restart dashboard
 *   GET    /tiger/keys                  — key presence map (no values exposed)
 *   PATCH  /tiger/keys                  — upsert a key
 *   DELETE /tiger/keys/:name            — remove a key
 *   ALL    /api/gateway                 — proxy to OpenClaw gateway API
 */

import express from "express";
import cors from "cors";
import { authMiddleware } from "./auth.js";
import statusRouter from "./routes/status.js";
import logsRouter from "./routes/logs.js";
import execRouter from "./routes/exec.js";
import configRouter from "./routes/config.js";
import modelsRouter from "./routes/models.js";
import restartRouter from "./routes/restart.js";
import filesRouter from "./routes/files.js";
import projectsRouter from "./routes/projects.js";
import tasksRouter from "./routes/tasks.js";
import tasksFileRouter from "./routes/tasks-file.js";
import cronRouter from "./routes/cron.js";
import notifyRouter from "./routes/notify.js";
import dispatchRouter from "./routes/dispatch.js";
import agentsRouter from "./routes/agents.js";
import agentsActivityRouter from "./routes/agents-activity.js";
import deployRouter from "./routes/deploy.js";
import routeTaskRouter from "./routes/route-task.js";
import keysRouter from "./routes/keys.js";
import { initWatcher } from "./watcher.js";
import { TelegramChannel } from "./lib/telegram.js";

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
app.use("/tiger/config/models", modelsRouter);
app.use("/tiger/restart", restartRouter);
app.use("/tiger/workspace", filesRouter);
app.use("/tiger/files", filesRouter);  // Same router handles both /workspace and /files/:path

// Project and Task management
app.use("/tiger/projects", projectsRouter);
app.use("/tiger/tasks", tasksRouter);
app.use("/tiger/file-tasks", tasksFileRouter);
app.use("/tiger/cron", cronRouter);
app.use("/tiger/notify", notifyRouter);
app.use("/tiger/dispatch", dispatchRouter);
app.use("/tiger/agents", agentsRouter);
app.use("/tiger/agents/activity", agentsActivityRouter);
app.use("/tiger/deploy-dashboard", deployRouter);
app.use("/tiger/route-task", routeTaskRouter);
app.use("/tiger/keys", keysRouter);
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

  // Start Telegram channel — bridge takes over from OpenClaw native handler.
  // Requires channels.telegram.enabled=false in openclaw.json.
  const tgChannel = new TelegramChannel();
  tgChannel.start();
});
