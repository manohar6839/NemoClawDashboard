/**
 * health.ts — GET /tiger/health
 *
 * Self-healing health checks. Returns system status and can trigger
 * auto-restart if critical services are down.
 *
 * GET /tiger/health?check=true — run full check and restart if needed
 * GET /tiger/health         — just return status
 */

import { Router, Request, Response } from "express";
import { execInSandbox } from "../tiger.js";

const router = Router();

// Service check definitions
const services = [
  { name: "gateway", port: 18789, path: "/health" },
  { name: "bridge", port: 3456, path: "/tiger/status" },
]

async function checkService(name: string, port: number, path: string): Promise<{
  name: string
  status: "ok" | "error"
  response?: string
}> {
  try {
    const portMap: Record<number, string> = {
      18789: "http://127.0.0.1",
      3456: "http://127.0.0.1",
    }
    const baseUrl = portMap[port] || `http://127.0.0.1:${port}`
    const res = await fetch(`${baseUrl}${path}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      return { name, status: "ok" }
    }
    return { name, status: "error", response: `HTTP ${res.status}` }
  } catch (err: any) {
    return { name, status: "error", response: err.message }
  }
}

router.get("/", async (_req: Request, res: Response) => {
  const shouldRestart = _req.query.check === "true"
  
  const results = await Promise.all(
    services.map((s) => checkService(s.name, s.port, s.path))
  )
  
  const allHealthy = results.every((r) => r.status === "ok")
  
  const response = {
    ok: true,
    timestamp: new Date().toISOString(),
    status: allHealthy ? "healthy" : "degraded",
    services: results,
  }
  
  // Auto-restart if requested and services are down
  if (shouldRestart && !allHealthy) {
    const failed = results.filter((r) => r.status === "error").map((r) => r.name)
    console.log(`[health] Services down: ${failed.join(", ")}. Triggering restart.`)
    
    // Trigger restart but don't wait
    execInSandbox("docker restart tiger-openclaw 2>/dev/null || true")
      .then(() => console.log("[health] Restart triggered"))
      .catch(() => console.log("[health] Restart failed"))
  }
  
  res.json(response)
})

export default router