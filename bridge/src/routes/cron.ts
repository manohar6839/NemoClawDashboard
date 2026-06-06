import { Router, Request, Response } from "express";
import { execInSandbox } from "../tiger.js";

const router = Router();

// cron/jobs.json lives inside the container at a known path.
// We read it directly — openclaw cron list --json requires an active gateway
// WebSocket which may not always be up.
const CRON_JOBS_PATH = "/home/node/.openclaw/cron/jobs.json";

function formatCronJobs(raw: any): any[] {
  const jobs = raw?.jobs ?? [];
  return jobs.map((j: any) => ({
    id:      j.id,
    name:    j.name ?? j.id,
    schedule: j.schedule?.expr ?? "",
    tz:      j.schedule?.tz ?? "UTC",
    enabled: j.enabled ?? true,
    agentId: j.agentId ?? "main",
    lastRun: j.state?.lastRunAtMs
      ? {
          at:     new Date(j.state.lastRunAtMs).toISOString(),
          status: j.state.lastRunStatus ?? j.state.lastStatus ?? "unknown",
          durationMs: j.state.lastDurationMs,
          errors: j.state.consecutiveErrors ?? 0,
          lastError: j.state.lastError ?? null,
        }
      : null,
    nextRun: j.state?.nextRunAtMs
      ? new Date(j.state.nextRunAtMs).toISOString()
      : null,
    message: j.payload?.message?.slice(0, 120) ?? "",
  }));
}

// GET /tiger/cron — list cron jobs directly from jobs.json
router.get("/", async (_req: Request, res: Response) => {
  try {
    const { stdout } = await execInSandbox(`cat ${CRON_JOBS_PATH} 2>/dev/null || echo '{}'`);
    let raw: any = {};
    try { raw = JSON.parse(stdout.trim() || "{}"); } catch { raw = {}; }

    const jobs = formatCronJobs(raw);

    // Scheduler meta: enabled + nextWakeAt (from first job with nextRunAtMs)
    const nextWake = jobs.find((j) => j.nextRun)?.nextRun ?? null;
    const hasErrors = jobs.some((j) => (j.lastRun?.errors ?? 0) > 0);

    res.json({
      ok: true,
      jobs,
      status: {
        enabled: true,
        jobCount: jobs.length,
        nextWake,
        hasErrors,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /tiger/cron/:id/run — trigger a cron job immediately via gateway
router.post("/:id/run", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const { stdout, stderr } = await execInSandbox(
      `openclaw cron run ${id} 2>&1 || true`
    );
    res.json({ ok: true, output: (stdout || stderr).slice(0, 500) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
