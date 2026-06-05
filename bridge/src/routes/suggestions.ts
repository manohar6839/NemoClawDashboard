/**
 * suggestions.ts — GET /tiger/suggestions
 *
 * Returns AI-powered suggestions based on current context.
 * This is a placeholder - real implementation would use the LLM.
 *
 * GET /tiger/suggestions
 *   ?context=current_task,project,dashboard
 *
 * Response:
 *   { ok: true, suggestions: [{ text, action, priority }] }
 */

import { Router, Request, Response } from "express";
import { execInSandbox } from "../tiger.js";

const router = Router();

// Default suggestions when no AI
const defaultSuggestions = [
  { text: "Check active tasks", action: "/tasks", priority: "high" },
  { text: "View project status", action: "/projects", priority: "medium" },
  { text: "Check system health", action: "/api/tiger/status", priority: "medium" },
]

router.get("/", async (_req: Request, res: Response) => {
  try {
    // Get active tasks
    const tasksResult = await execInSandbox("cat /home/node/.openclaw/workspace/TASKS.md");
    
    // Count in-progress tasks
    let hasActiveWork = false
    if (tasksResult.stdout.includes("in-progress")) {
      hasActiveWork = true
    }
    
    const suggestions = []
    
    if (hasActiveWork) {
      suggestions.push({
        text: "Continue with active task",
        action: "/projects",
        priority: "high"
      })
    }
    
    // Adddefaults
    suggestions.push(...defaultSuggestions.slice(0, 3))
    
    res.json({
      ok: true,
      suggestions: suggestions.slice(0, 5),
      hasActiveWork
    })
  } catch (err: any) {
    // Fallback to defaults
    res.json({
      ok: true,
      suggestions: defaultSuggestions,
      hasActiveWork: false,
      error: err.message
    })
  }
})

export default router