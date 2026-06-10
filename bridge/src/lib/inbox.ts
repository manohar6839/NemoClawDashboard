/**
 * lib/inbox.ts — TASKS.md as Tiger's inbox, drained by the bridge
 *
 * The productivity loop this enables:
 *   You drop a one-line task into the `## 📥 INBOX` section of TASKS.md
 *   (from Telegram via Tiger, from the dashboard workspace editor, or by
 *   hand). Every DRAIN_INTERVAL the bridge picks the FIRST unchecked item,
 *   asks classifyAgent() which specialist owns it, spawns that specialist
 *   (lib/agents.ts + routes/spawn.ts), and rewrites the line in place with
 *   the run id so nothing is picked twice. Completion is reported to
 *   Telegram by the spawn runner.
 *
 * Why the BRIDGE schedules this instead of an OpenClaw cron:
 *   - an OpenClaw cron job is itself an agent turn → it would burn a model
 *     call just to decide whether there is work, every hour
 *   - the cron prompt would need the bridge bearer token embedded in it
 *     (a secret inside a prompt — bad pattern)
 *   - the bridge can check TASKS.md for free and only spend model tokens
 *     (one classify call) when there is actually an item to dispatch
 *   The existing "Hourly Task Check-in" cron stays — it is Tiger's
 *   *narrative* status report; this is the *mechanical* dispatcher.
 *
 * INBOX line contract (inside TASKS.md):
 *   - [ ] research BESS tender pipeline in Gujarat        ← pending
 *   - [⏳ exec_ab12cd → ethan] research BESS tender ...   ← dispatched
 * The drainer only ever touches `- [ ]` lines, one per cycle.
 */

import { writeFileSync, unlinkSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { classifyAgent } from "./llm.js";
import { spawnTask } from "../routes/spawn.js";

const execAsync = promisify(exec);

const DOCKER_CONTAINER = "tiger-openclaw";
const TASKS_PATH = "/home/node/.openclaw/workspace/TASKS.md";
const INBOX_HEADER = "## 📥 INBOX";
/** Check every 30 minutes, only act inside working hours (IST). */
const DRAIN_INTERVAL_MS = 30 * 60 * 1000;
const WORK_HOURS_IST = { start: 9, end: 20 };

const PENDING_LINE = /^- \[ \] (.+)$/;

let draining = false;

function istHour(): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
}

async function readTasksFile(): Promise<string> {
  const { stdout } = await execAsync(
    `docker exec ${DOCKER_CONTAINER} cat ${TASKS_PATH}`,
    { timeout: 10_000, maxBuffer: 1024 * 1024 },
  );
  return stdout;
}

async function writeTasksFile(content: string): Promise<void> {
  // docker cp (same escaping-proof transport as spawn/telegram message passing)
  const tmp = `/tmp/tasks_inbox_${Date.now()}.md`;
  writeFileSync(tmp, content, "utf-8");
  try {
    await execAsync(`docker cp ${tmp} ${DOCKER_CONTAINER}:${TASKS_PATH}`, {
      timeout: 10_000,
    });
  } finally {
    unlinkSync(tmp);
  }
}

/**
 * One drain cycle: dispatch at most ONE pending inbox item.
 * Exported so routes can trigger it manually (POST /tiger/inbox/drain).
 * Returns a human-readable outcome for logs/API.
 */
export async function drainInboxOnce(force = false): Promise<string> {
  if (draining) return "skipped: drain already in progress";
  const hour = istHour();
  if (!force && (hour < WORK_HOURS_IST.start || hour >= WORK_HOURS_IST.end)) {
    return `skipped: outside work hours (IST hour ${hour})`;
  }

  draining = true;
  try {
    let content: string;
    try {
      content = await readTasksFile();
    } catch {
      return "skipped: TASKS.md not readable";
    }

    const lines = content.split("\n");
    const headerIdx = lines.findIndex((l) => l.trim().startsWith(INBOX_HEADER));
    if (headerIdx === -1) return "skipped: no INBOX section in TASKS.md";

    // Scan from the header to the next section header (or EOF).
    let target = -1;
    let taskText = "";
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("## ")) break; // next section — inbox ended
      const m = line.match(PENDING_LINE);
      if (m) {
        target = i;
        taskText = m[1].trim();
        break;
      }
    }
    if (target === -1) return "ok: inbox empty";

    // Route → spawn → mark, in that order. If classify fails (e.g. the LLM
    // gateway is down) we leave the line untouched and retry next cycle.
    const { agent: agentId, reason } = await classifyAgent(taskText);
    const spawnable = agentId === "tiger" ? "elon" : agentId; // orchestrator work → PM
    const ticket = spawnTask({ agentId: spawnable, task: taskText });

    lines[target] = `- [⏳ ${ticket.runId} → ${ticket.agent.id}] ${taskText}`;
    await writeTasksFile(lines.join("\n"));

    console.log(
      `[inbox] dispatched "${taskText.slice(0, 60)}" → ${ticket.agent.id} ` +
        `(${ticket.runId}; classifier said ${agentId}: ${reason.slice(0, 80)})`,
    );
    return `dispatched: ${ticket.runId} → ${ticket.agent.id}`;
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    console.error("[inbox] drain failed:", m);
    return `error: ${m}`;
  } finally {
    draining = false;
  }
}

/** Call once from index.ts at startup. */
export function startInboxScheduler(): void {
  setInterval(() => {
    void drainInboxOnce();
  }, DRAIN_INTERVAL_MS);
  console.log(
    `[inbox] scheduler started — every ${DRAIN_INTERVAL_MS / 60000}min, ` +
      `${WORK_HOURS_IST.start}:00–${WORK_HOURS_IST.end}:00 IST`,
  );
}
