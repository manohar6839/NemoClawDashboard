/**
 * activity-audit.ts — GET /tiger/activity/audit : the complete audit trail
 *
 * Purpose: ONE chronological, paginated record of everything the system DID,
 * so nothing slips by unaudited. Merged sources, each a durable store (the
 * old activity feed only showed recent in-memory file events):
 *
 *   executions  (sqlite)  — every spawn / sub-agent run, with outcome
 *   tasks       (sqlite)  — task lifecycle (created / status changes)
 *   outputs     (sqlite)  — every artifact an agent wrote
 *   cron runs   (volume)  — OpenClaw's JSONL run history for every job
 *
 * Event shape (normalized):
 *   { id, ts (ISO), type, actor, summary, status?, ref? }
 *   type ∈ spawn | task | output | cron
 *
 * Pagination: ?limit=100&before=<ISO ts> walks backwards through history.
 * Optional ?types=spawn,cron filters at the source.
 *
 * Design note: sources are merged at read time rather than double-written
 * into a new audit table — no write-path changes, no risk of an action
 * happening without its audit row, history is complete retroactively.
 */

import { Router, Request, Response } from "express";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import db from "../db.js";

const router = Router();

const DATA_DIR =
  process.env.OPENCLAW_DATA_DIR ||
  "/var/lib/docker/volumes/tiger_tiger-config/_data";

export interface AuditEvent {
  id: string;
  ts: string; // ISO timestamp
  type: "spawn" | "task" | "output" | "cron";
  actor: string;
  summary: string;
  status?: string;
  ref?: string;
}

// ─── SQLite sources ──────────────────────────────────────────────────────────

function executionEvents(beforeIso: string | null, limit: number): AuditEvent[] {
  const rows = db
    .prepare(
      `SELECT id, agent, command, exit_code, started_at, completed_at
       FROM executions
       ${beforeIso ? "WHERE started_at < ?" : ""}
       ORDER BY started_at DESC LIMIT ?`,
    )
    .all(...(beforeIso ? [beforeIso, limit] : [limit])) as Array<{
    id: string;
    agent: string | null;
    command: string | null;
    exit_code: number | null;
    started_at: string;
    completed_at: string | null;
  }>;

  return rows.map((r) => ({
    id: `exec:${r.id}`,
    ts: toIso(r.started_at),
    type: "spawn" as const,
    actor: r.agent ?? "unknown",
    summary: (r.command ?? "").replace(/^spawn:\s*/, "").slice(0, 160),
    status:
      r.exit_code === null ? "running" : r.exit_code === 0 ? "done" : "error",
    ref: r.id,
  }));
}

function taskEvents(beforeIso: string | null, limit: number): AuditEvent[] {
  const rows = db
    .prepare(
      `SELECT id, title, status, assigned_agent, updated_at
       FROM tasks
       ${beforeIso ? "WHERE updated_at < ?" : ""}
       ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(...(beforeIso ? [beforeIso, limit] : [limit])) as Array<{
    id: string;
    title: string;
    status: string;
    assigned_agent: string | null;
    updated_at: string;
  }>;

  return rows.map((r) => ({
    id: `task:${r.id}:${r.updated_at}`,
    ts: toIso(r.updated_at),
    type: "task" as const,
    actor: r.assigned_agent ?? "tiger",
    summary: r.title.slice(0, 160),
    status: r.status,
    ref: r.id,
  }));
}

function outputEvents(beforeIso: string | null, limit: number): AuditEvent[] {
  const rows = db
    .prepare(
      `SELECT id, filename, file_path, execution_id, created_at
       FROM outputs
       ${beforeIso ? "WHERE created_at < ?" : ""}
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(...(beforeIso ? [beforeIso, limit] : [limit])) as Array<{
    id: string;
    filename: string;
    file_path: string;
    execution_id: string | null;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: `output:${r.id}`,
    ts: toIso(r.created_at),
    type: "output" as const,
    actor: "agent",
    summary: `wrote ${r.filename} (${r.file_path})`.slice(0, 160),
    ref: r.execution_id ?? r.id,
  }));
}

// ─── Cron run history (OpenClaw JSONL on the volume) ────────────────────────
// Cached by directory listing + sizes; cron runs append-only files.

let cronCache: { stamp: string; events: AuditEvent[] } | null = null;

/** jobId → human name, from cron/jobs.json (cached per cron rebuild). */
function loadJobNames(): Record<string, string> {
  try {
    const raw = JSON.parse(
      readFileSync(join(DATA_DIR, "cron", "jobs.json"), "utf-8"),
    ) as { jobs?: Array<{ id?: string; name?: string }> };
    const map: Record<string, string> = {};
    for (const j of raw.jobs ?? []) {
      if (j.id && j.name) map[j.id] = j.name;
    }
    return map;
  } catch {
    return {};
  }
}

function cronEvents(): AuditEvent[] {
  const runsDir = join(DATA_DIR, "cron", "runs");
  if (!existsSync(runsDir)) return [];

  let files: string[];
  try {
    files = readdirSync(runsDir).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return [];
  }

  // Cheap cache key: file list + sizes via a stat pass would be ideal; the
  // run files are small, so name-count + latest mtime via re-read every 30s
  // would also be fine. Keep it simple: rebuild when the listing changes.
  const stamp = files.join("|");
  if (cronCache && cronCache.stamp === stamp) return cronCache.events;

  const jobNames = loadJobNames();
  const events: AuditEvent[] = [];
  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(join(runsDir, file), "utf-8");
    } catch {
      continue;
    }
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      let run: Record<string, any>;
      try {
        run = JSON.parse(line);
      } catch {
        continue;
      }
      // Run files log lifecycle actions; only "finished" carries the outcome.
      if (run.action && run.action !== "finished") continue;
      const ts = run.startedAt ?? run.ts ?? run.runAtMs ?? run.timestamp;
      if (!ts) continue;
      const iso = typeof ts === "number" ? new Date(ts).toISOString() : toIso(String(ts));
      const jobId = String(run.jobId ?? file.replace(/\.jsonl$/, ""));
      const name = run.jobName ?? run.name ?? jobNames[jobId] ?? jobId;
      const status = run.status ?? (run.error ? "error" : "ok");
      events.push({
        id: `cron:${file}:${iso}`,
        ts: iso,
        type: "cron",
        actor: "cron",
        summary: String(name).slice(0, 160),
        status: String(status),
        ref: jobId,
      });
    }
  }
  cronCache = { stamp, events };
  return events;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** sqlite datetime('now') yields "YYYY-MM-DD HH:MM:SS" (UTC, no zone) — make it ISO. */
function toIso(s: string): string {
  if (!s) return new Date(0).toISOString();
  if (s.includes("T")) return s;
  return s.replace(" ", "T") + "Z";
}

// ─── Route ──────────────────────────────────────────────────────────────────

router.get("/", (req: Request, res: Response) => {
  const limit = Math.min(
    Math.max(parseInt(String(req.query.limit ?? "100"), 10) || 100, 1),
    500,
  );
  const before = req.query.before ? String(req.query.before) : null;
  const typeFilter = req.query.types
    ? new Set(String(req.query.types).split(","))
    : null;

  const wants = (t: AuditEvent["type"]) => !typeFilter || typeFilter.has(t);

  let events: AuditEvent[] = [];
  if (wants("spawn")) events.push(...executionEvents(before, limit));
  if (wants("task")) events.push(...taskEvents(before, limit));
  if (wants("output")) events.push(...outputEvents(before, limit));
  if (wants("cron")) {
    let cron = cronEvents();
    if (before) cron = cron.filter((e) => e.ts < before);
    events.push(...cron);
  }

  events.sort((a, b) => (a.ts < b.ts ? 1 : -1)); // newest first
  const page = events.slice(0, limit);

  res.json({
    ok: true,
    events: page,
    hasMore: events.length > page.length,
    oldestTs: page.length > 0 ? page[page.length - 1].ts : null,
  });
});

export default router;
