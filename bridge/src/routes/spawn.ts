/**
 * spawn.ts — POST /tiger/spawn
 *
 * Trigger spawning of sub-agents. This is a placeholder -
 * real implementation requires sub-agent permission config.
 *
 * POST /tiger/spawn
 *   { agentId: "coder" | "researcher" | "writer" | "pm", task: "..." }
 *
 * Response:
 *   { ok: true, sessionId, status: "spawned" | "pending" }
 */

import { Router, Request, Response } from "express";
import { execInSandbox } from "../tiger.js";

const router = Router();

const validAgents = ["coder", "researcher", "writer", "pm"];

router.post("/", async (req: Request, res: Response) => {
  const { agentId, task } = req.body;
  
  if (!agentId || !validAgents.includes(agentId)) {
    return res.status(400).json({
      ok: false,
      error: `Invalid agent. Use: ${validAgents.join(", ")}`
    });
  }
  
  if (!task) {
    return res.status(400).json({ ok: false, error: "task is required" });
  }
  
  try {
    // Note: Sub-agent spawning requires config
    // This is a placeholder - returns info about what's needed
    res.json({
      ok: true,
      agentId,
      task,
      status: "pending",
      message: "Sub-agent spawning requires config. Set agents.defaults.subagents in openclaw.json"
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET available agents
router.get("/agents", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    agents: validAgents.map(id => ({
      id,
      name: id === "coder" ? "Cody" : 
            id === "researcher" ? "Ethan" :
            id === "writer" ? "Cathy" : "Elon",
      role: id === "coder" ? "Code" :
            id === "researcher" ? "Research" :
            id === "writer" ? "Write" : "PM"
    }))
  });
});

export default router