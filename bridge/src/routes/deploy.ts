/**
 * deploy.ts — POST /tiger/deploy-dashboard
 *
 * Triggers a full dashboard rebuild + service restart on the host.
 * Called by Tiger (from inside container) after editing dashboard source files.
 *
 * Flow:
 *   Tiger edits /home/node/dashboard/... (bind-mounted from /root/OpenClawDashboard)
 *   Tiger calls POST /tiger/deploy-dashboard
 *   Bridge runs /root/scripts/rebuild-dashboard.sh on HOST
 *   Returns build output so Tiger can confirm success or report errors
 */

import { Router } from 'express';
import { execOnHost } from '../tiger.js';

const router = Router();

router.post('/', async (_req, res) => {
  try {
    console.log('[deploy] Dashboard deploy triggered by Tiger');
    const result = await execOnHost(
      '/root/scripts/rebuild-dashboard.sh',
      120_000  // 2 min timeout — Next.js builds can be slow
    );
    const success = result.exitCode === 0;
    res.json({
      ok: success,
      message: success ? 'Dashboard deployed successfully' : 'Deploy failed',
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    });
  } catch (err: any) {
    console.error('[deploy] Error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
