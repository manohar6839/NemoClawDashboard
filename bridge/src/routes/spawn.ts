/**
 * spawn.ts — POST /tiger/spawn : REAL sub-agent execution
 *
 * Replaces the long-standing placeholder. A spawn is an isolated OpenClaw
 * session of the `main` agent running with a specialist persona prepended
 * (see lib/agents.ts for the registry and the per-agent upgrade path).
 *
 * Flow per spawn:
 *   1. validate + normalize agent id (accepts cody/ethan/cathy/elon + legacy aliases)
 *   2. insert a row into `executions` (status = running while exit_code IS NULL)
 *   3. enqueue — at most MAX_CONCURRENT sessions run at once. The VPS is
 *      memory-constrained; parallel agent turns push it into swap and every
 *      turn times out. Serializing is a feature, not a limitation.
 *   4. run `openclaw agent --session-id spawn-<agent>-<n> ... --json` inside
 *      the tiger-openclaw container. The message travels via docker cp of a
 *      temp file — same battle-tested pattern as lib/telegram.ts, immune to
 *      shell-escaping bugs from quotes/backticks/JSON in task text.
 *   5. parse the reply, complete the executions row, fire a Telegram
 *      notification through the bridge's own /tiger/notify route.
 *
 * Routes:
 *   POST /tiger/spawn            { agentId, task, context?, taskId? }
 *   GET  /tiger/spawn/runs       recent spawn runs (+ live queue state)
 *   GET  /tiger/spawn/runs/:id   one run with full output
 *   GET  /tiger/spawn/agents     the specialist registry
 */

import { Router, Request, Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFileSync, unlinkSync } from "fs";
import { randomUUID } from "crypto";
import db, { generateId } from "../db.js";
import {
  SPECIALISTS,
  ACCEPTED_AGENT_IDS,
  normalizeAgentId,
  buildSpawnPrompt,
  type SpecialistAgent,
} from "../lib/agents.js";

const execAsync = promisify(exec);
const router = Router();

const DOCKER_CONTAINER = "tiger-openclaw";
/** One agent turn at a time — see header comment about RAM. Raise after the
 *  server is upgraded / the homelab is evicted. */
const MAX_CONCURRENT = 1;
/** Keep below the 300s cron budget so cron-triggered spawns can't be the
 *  thing that blows the cron's own timeout. */
const SPAWN_TIMEOUT_SECONDS = 240;

const BRIDGE_SELF_URL = process.env.TIGER_BRIDGE_SELF_URL || "http://127.0.0.1:3456";
const BRIDGE_TOKEN = process.env.TIGER_BRIDGE_TOKEN || "";

// ─── Run bookkeeping ─────────────────────────────────────────────────────────

interface SpawnRequest {
  runId: string;
  agent: SpecialistAgent;
  task: string;
  context?: string;
  sessionId: string;
}

interface SpawnOutcome {
  ok: boolean;
  reply: string;
  error?: string;
}

let activeCount = 0;
const queue: Array<() => Promise<void>> = [];

function pump(): void {
  while (activeCount < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift();
    if (!job) break;
    activeCount += 1;
    void job().finally(() => {
      activeCount -= 1;
      pump();
    });
  }
}

// ─── Core runner (exported so lib/inbox.ts can spawn without HTTP) ──────────

export interface SpawnTicket {
  runId: string;
  sessionId: string;
  agent: { id: string; name: string };
  queued: number;
}

export function spawnTask(input: {
  agentId: string;
  task: string;
  context?: string;
  taskId?: string;
}): SpawnTicket {
  const agent = normalizeAgentId(input.agentId);
  if (!agent) {
    throw new Error(
      `Unknown agent '${input.agentId}'. Accepted: ${ACCEPTED_AGENT_IDS.join(", ")}`,
    );
  }
  const task = (input.task || "").trim();
  if (!task) throw new Error("task is required");

  const runId = generateId("exec");
  const sessionId = `spawn-${agent.id}-${randomUUID().slice(0, 8)}`;

  // exit_code NULL = still running; completed_at NULL until the turn ends.
  db.prepare(
    `INSERT INTO executions (id, task_id, agent, command)
     VALUES (?, ?, ?, ?)`,
  ).run(runId, input.taskId ?? null, agent.id, `spawn: ${task.slice(0, 300)}`);

  const req: SpawnRequest = { runId, agent, task, context: input.context, sessionId };
  queue.push(() => executeSpawn(req));
  pump();

  return {
    runId,
    sessionId,
    agent: { id: agent.id, name: agent.name },
    queued: queue.length,
  };
}

async function executeSpawn(req: SpawnRequest): Promise<void> {
  const { runId, agent, task, context, sessionId } = req;
  const prompt = buildSpawnPrompt(agent, task, context);
  const tmpFile = `/tmp/spawn_${runId}.txt`;

  let outcome: SpawnOutcome;
  try {
    // Stage the message inside the container (escaping-proof transport).
    writeFileSync(tmpFile, prompt, "utf-8");
    await execAsync(`docker cp ${tmpFile} ${DOCKER_CONTAINER}:${tmpFile}`, {
      timeout: 10_000,
    });
    unlinkSync(tmpFile);

    const cmd =
      `docker exec ${DOCKER_CONTAINER} sh -c '` +
      `MSG=$(cat ${tmpFile}); rm -f ${tmpFile}; ` +
      `openclaw agent --session-id ${sessionId} -m "$MSG" --json ` +
      `--timeout ${SPAWN_TIMEOUT_SECONDS}'`;

    const { stdout } = await execAsync(cmd, {
      timeout: (SPAWN_TIMEOUT_SECONDS + 30) * 1000,
      maxBuffer: 10 * 1024 * 1024,
    });

    outcome = { ok: true, reply: extractReply(stdout) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[spawn] ${runId} (${agent.id}) failed:`, message);
    outcome = { ok: false, reply: "", error: message };
    try { unlinkSync(tmpFile); } catch { /* already gone */ }
  }

  db.prepare(
    `UPDATE executions
     SET stdout = ?, stderr = ?, exit_code = ?, completed_at = datetime('now')
     WHERE id = ?`,
  ).run(outcome.reply, outcome.error ?? "", outcome.ok ? 0 : 1, runId);

  await notifyCompletion(req, outcome);
}

/** Pull the text reply out of `openclaw agent --json` output. */
function extractReply(stdout: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return stdout.trim();
  }
  const p = parsed as Record<string, any>;
  return (
    p?.result?.payloads?.[0]?.text ||
    p?.payloads?.[0]?.text ||
    p?.summary ||
    p?.text ||
    p?.output ||
    stdout.trim()
  );
}

/** Report the outcome to Telegram via the bridge's own notify route. */
async function notifyCompletion(req: SpawnRequest, outcome: SpawnOutcome): Promise<void> {
  const { agent, task, runId } = req;
  const resultLine =
    outcome.reply
      .split("\n")
      .reverse()
      .find((l) => l.startsWith("RESULT:") || l.startsWith("BLOCKED:")) ??
    outcome.reply.slice(-300);

  const message = outcome.ok
    ? `🤖 *${agent.name}* finished: ${task.slice(0, 120)}\n\n${resultLine.slice(0, 800)}\n\n_run ${runId}_`
    : `⚠️ *${agent.name}* failed: ${task.slice(0, 120)}\n\n${(outcome.error ?? "unknown error").slice(0, 300)}\n\n_run ${runId}_`;

  try {
    await fetch(`${BRIDGE_SELF_URL}/tiger/notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${BRIDGE_TOKEN}`,
      },
      body: JSON.stringify({ message }),
    });
  } catch (err) {
    // Notification failure must never mark the run failed — log and move on.
    const m = err instanceof Error ? err.message : String(err);
    console.error(`[spawn] notify failed for ${runId}:`, m);
  }
}

// ─── HTTP surface ────────────────────────────────────────────────────────────

interface ExecutionRow {
  id: string;
  task_id: string | null;
  agent: string | null;
  command: string | null;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  started_at: string;
  completed_at: string | null;
}

function rowStatus(row: ExecutionRow): "running" | "done" | "error" {
  if (row.exit_code === null) return "running";
  return row.exit_code === 0 ? "done" : "error";
}

router.post("/", (req: Request, res: Response) => {
  const { agentId, task, context, taskId } = req.body as {
    agentId?: string;
    task?: string;
    context?: string;
    taskId?: string;
  };
  try {
    const ticket = spawnTask({
      agentId: agentId ?? "",
      task: task ?? "",
      context,
      taskId,
    });
    res.json({ ok: true, status: "spawned", ...ticket });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ ok: false, error: message });
  }
});

router.get("/runs", (_req: Request, res: Response) => {
  const rows = db
    .prepare(
      `SELECT id, task_id, agent, command, exit_code, started_at, completed_at
       FROM executions
       WHERE command LIKE 'spawn:%'
       ORDER BY started_at DESC
       LIMIT 50`,
    )
    .all() as ExecutionRow[];

  res.json({
    ok: true,
    active: activeCount,
    queued: queue.length,
    runs: rows.map((r) => ({
      runId: r.id,
      agent: r.agent,
      task: (r.command ?? "").replace(/^spawn:\s*/, ""),
      status: rowStatus(r),
      startedAt: r.started_at,
      completedAt: r.completed_at,
    })),
  });
});

router.get("/runs/:id", (req: Request, res: Response) => {
  const row = db
    .prepare(`SELECT * FROM executions WHERE id = ?`)
    .get(req.params.id) as ExecutionRow | undefined;
  if (!row) return res.status(404).json({ ok: false, error: "run not found" });

  res.json({
    ok: true,
    run: {
      runId: row.id,
      agent: row.agent,
      task: (row.command ?? "").replace(/^spawn:\s*/, ""),
      status: rowStatus(row),
      reply: row.stdout,
      error: row.stderr,
      startedAt: row.started_at,
      completedAt: row.completed_at,
    },
  });
});

router.get("/agents", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    agents: Object.values(SPECIALISTS).map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      aliases: a.aliases,
    })),
  });
});

export default router;
