/**
 * alerts.ts — GET /tiger/alerts
 *
 * Returns active alerts and allows configuring proactive notifications.
 * 
 * GET /tiger/alerts              — get active alerts
 * GET /tiger/alerts?check=true  — run check and return fresh alerts
 *
 * Response:
 *   { ok: true, alerts: [{ type, message, priority, timestamp }] }
 */

import { Router, Request, Response } from "express";
import { execInSandbox } from "../tiger.js";

const router = Router();

interface Alert {
  type: string
  message: string
  priority: "high" | "medium" | "low"
  timestamp: string
}

async function checkSystemAlerts(): Promise<Alert[]> {
  const alerts: Alert[] = []
  const now = new Date().toISOString()
  
  try {
    // Check memory usage
    const memResult = await execInSandbox("cat /proc/meminfo | grep MemAvailable")
    if (memResult.stdout.includes("MemAvailable")) {
      const match = memResult.stdout.match(/(\d+)/)
      if (match) {
        const availableMB = parseInt(match[1]) / 1024
        if (availableMB < 500) {
          alerts.push({
            type: "memory",
            message: `Low memory: ${Math.round(availableMB)}MB available`,
            priority: "high",
            timestamp: now
          })
        }
      }
    }
    
    // Check disk usage
    const diskResult = await execInSandbox("df -h / | tail -1")
    if (diskResult.stdout.includes("%")) {
      const match = diskResult.stdout.match(/(\d+)%/)
      if (match) {
        const usage = parseInt(match[1])
        if (usage > 85) {
          alerts.push({
            type: "disk",
            message: `High disk usage: ${usage}%`,
            priority: usage > 95 ? "high" : "medium",
            timestamp: now
          })
        }
      }
    }
    
  } catch (e) {
    // System check failed
  }
  
  return alerts
}

router.get("/", async (req: Request, res: Response) => {
  const doCheck = req.query.check === "true"
  
  let alerts: Alert[] = []
  
  if (doCheck) {
    alerts = await checkSystemAlerts()
  }
  
  res.json({
    ok: true,
    alerts,
    lastCheck: new Date().toISOString(),
    count: alerts.length
  })
})

export default router