/**
 * health-system.ts — GET /tiger/health/system : layered self-diagnosis
 *
 * Born from a real incident: "⚠️ Tiger timed out or is offline" appeared on
 * Telegram with no way to see WHY from the dashboard. This endpoint checks
 * each layer a message travels through and names the broken one, so the
 * dashboard can show the cause, not just the symptom.
 *
 * Layers checked (cheap, parallel, ~1s worst case):
 *   memory    host RAM + swap from /proc/meminfo (bridge runs on the host)
 *   gateway   LiteLLM liveliness — if this is down, EVERY agent is down
 *   openclaw  container running? (docker inspect)
 *   crons     lastStatus of every job from cron/jobs.json
 *
 * Response:
 *   { ok, verdict: healthy|degraded|critical, issues: string[], checks: {...} }
 *
 * Thresholds (tuned to this 8GB host's observed failure modes):
 *   - MemAvailable < 800MB  → agent turns crawl, cron timeouts follow
 *   - swap used   > 50%     → same, sustained
 */

import { Router, Request, Response } from "express";
import { readFileSync } from "fs";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const router = Router();

const DATA_DIR =
  process.env.OPENCLAW_DATA_DIR ||
  "/var/lib/docker/volumes/tiger_tiger-config/_data";
const GATEWAY_HEALTH_URL =
  (process.env.LLM_GATEWAY_URL || "https://llm.manohargupta.com/v1").replace(/\/v1\/?$/, "") +
  "/health/liveliness";

const MEM_AVAILABLE_FLOOR_MB = 800;
const SWAP_USED_CEILING_PCT = 50;

interface MemoryCheck {
  totalMb: number;
  availableMb: number;
  swapTotalMb: number;
  swapUsedMb: number;
  swapUsedPct: number;
}

function checkMemory(): MemoryCheck | null {
  try {
    const info = readFileSync("/proc/meminfo", "utf-8");
    const grab = (key: string): number => {
      const m = info.match(new RegExp(`^${key}:\\s+(\\d+) kB`, "m"));
      return m ? Math.round(parseInt(m[1], 10) / 1024) : 0;
    };
    const totalMb = grab("MemTotal");
    const availableMb = grab("MemAvailable");
    const swapTotalMb = grab("SwapTotal");
    const swapFreeMb = grab("SwapFree");
    const swapUsedMb = swapTotalMb - swapFreeMb;
    return {
      totalMb,
      availableMb,
      swapTotalMb,
      swapUsedMb,
      swapUsedPct: swapTotalMb > 0 ? Math.round((swapUsedMb / swapTotalMb) * 100) : 0,
    };
  } catch {
    return null;
  }
}

async function checkGateway(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(GATEWAY_HEALTH_URL, { signal: controller.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

async function checkContainer(): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      "docker inspect -f '{{.State.Running}}' tiger-openclaw",
      { timeout: 5000 },
    );
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

interface CronCheck {
  name: string;
  lastStatus: string;
  consecutiveErrors: number;
}

function checkCrons(): CronCheck[] {
  try {
    const raw = JSON.parse(
      readFileSync(join(DATA_DIR, "cron", "jobs.json"), "utf-8"),
    ) as { jobs?: Array<Record<string, any>> };
    return (raw.jobs ?? []).map((j) => ({
      name: String(j.name ?? j.id ?? "unknown"),
      lastStatus: String(j.state?.lastStatus ?? j.lastStatus ?? "unknown"),
      consecutiveErrors: Number(j.state?.consecutiveErrors ?? 0),
    }));
  } catch {
    return [];
  }
}

router.get("/", async (_req: Request, res: Response) => {
  const [memory, gatewayUp, containerUp] = await Promise.all([
    Promise.resolve(checkMemory()),
    checkGateway(),
    checkContainer(),
  ]);
  const crons = checkCrons();

  const issues: string[] = [];
  let verdict: "healthy" | "degraded" | "critical" = "healthy";
  const degrade = () => { if (verdict === "healthy") verdict = "degraded"; };

  if (!containerUp) {
    verdict = "critical";
    issues.push("OpenClaw container is not running — Tiger is offline");
  }
  if (!gatewayUp) {
    verdict = "critical";
    issues.push("LLM gateway unreachable — every agent turn will fail");
  }
  if (memory) {
    if (memory.availableMb < MEM_AVAILABLE_FLOOR_MB) {
      degrade();
      issues.push(
        `Low memory: ${memory.availableMb}MB available (floor ${MEM_AVAILABLE_FLOOR_MB}MB) — expect slow turns and cron timeouts`,
      );
    }
    if (memory.swapUsedPct > SWAP_USED_CEILING_PCT) {
      degrade();
      issues.push(
        `Heavy swapping: ${memory.swapUsedMb}MB (${memory.swapUsedPct}%) of swap in use`,
      );
    }
  } else {
    degrade();
    issues.push("Could not read /proc/meminfo");
  }
  for (const c of crons) {
    if (c.lastStatus === "error") {
      degrade();
      issues.push(
        `Cron "${c.name}" last run failed${c.consecutiveErrors > 1 ? ` (${c.consecutiveErrors} consecutive)` : ""}`,
      );
    }
  }

  res.json({
    ok: true,
    verdict,
    issues,
    checks: {
      memory,
      gateway: { up: gatewayUp, url: GATEWAY_HEALTH_URL },
      openclaw: { running: containerUp },
      crons,
    },
    checkedAt: new Date().toISOString(),
  });
});

export default router;
