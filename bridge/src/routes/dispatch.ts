/**
 * routes/dispatch.ts — Task dispatch to Tiger sandbox
 *
 * POST /tiger/dispatch
 * Body: { taskId, title, description, assignedAgent, context }
 *
 * Writes a JSON task file to the sandbox's task inbox:
 * /sandbox/.openclaw-data/workspace/tasks/inbox/task_{id}.json
 */

import { Router } from "express";
import { tasks, executions } from "../db.js";
import { classifyAgent } from "../lib/llm.js";
import { execInSandbox } from "../tiger.js";

const router = Router();

router.post("/", async (req, res) => {
  const { taskId, title, description, assignedAgent, context } = req.body;

  if (!taskId || !title) {
    return res.status(400).json({ ok: false, error: "taskId and title are required" });
  }

  try {
    // Find the task in SQLite
    const task = tasks.findById(taskId) as { id: string; title: string; description: string; assigned_agent: string } | undefined;

    if (!task) {
      return res.status(404).json({ ok: false, error: "Task not found" });
    }

    // ── Agent classification ───────────────────────────────────────────────────
    // classifyAgent never throws — falls back to { agent:'tiger', reason:'router_unavailable:...' }
    // so dispatch is safe even when the router LLM is offline.
    let resolvedAgent: string;
    let agentReason: string;

    if (assignedAgent) {
      // Caller explicitly chose an agent — skip LLM, mark as manual.
      resolvedAgent = assignedAgent;
      agentReason = "manual";
    } else {
      const classifyInput = `${task.title}\n\n${task.description || ""}`.slice(0, 2000);
      const classification = await classifyAgent(classifyInput);
      resolvedAgent = classification.agent;
      agentReason = classification.reason;
    }

    // Persist resolved agent + reason back to the task row before dispatch.
    tasks.update(taskId, { assigned_agent: resolvedAgent, agent_reason: agentReason });

    // Prepare task data
    const taskData = {
      id: taskId,
      title: task.title,
      description: task.description || description || "",
      assignedAgent: resolvedAgent,
      agentReason,
      context: context || "",
      createdAt: new Date().toISOString(),
      status: "pending",
    };

    // Write task JSON to container's inbox via docker exec
    // Tiger reads from the OpenClaw workspace tasks inbox
    const inboxPath = "/home/node/.openclaw/workspace/tasks/inbox";
    const taskFile = `task_${taskId}.json`;

    // First ensure the directory exists inside the container
    await execInSandbox(`mkdir -p ${inboxPath}`);

    // Write task JSON via temp file (avoids ALL shell escaping issues)
    const taskJson = JSON.stringify(taskData, null, 2);
    const { writeFileSync, unlinkSync } = await import("fs");
    const { execSync } = await import("child_process");
    const tmpHost = `/tmp/task_${taskId}_${Date.now()}.json`;
    try {
      writeFileSync(tmpHost, taskJson, "utf-8");
      execSync(`docker cp ${tmpHost} tiger-openclaw:${tmpHost}`, { timeout: 5000 });
      unlinkSync(tmpHost);
    } catch (copyErr: any) {
      throw new Error(`Failed to copy task to container: ${copyErr.message}`);
    }
    await execInSandbox(`mkdir -p ${inboxPath} && mv ${tmpHost} ${inboxPath}/${taskFile}`);

    // Create execution record
    const execution = executions.create({
      task_id: taskId,
      agent: taskData.assignedAgent,
      command: `dispatch task ${taskId} to ${taskData.assignedAgent}`,
    });

    // Update task status
    tasks.update(taskId, { status: "in-progress" });

    res.json({
      ok: true,
      message: "Task dispatched to Tiger",
      taskId,
      executionId: (execution as { id: string }).id,
      taskFile: `${inboxPath}/${taskFile}`,
    });
  } catch (err) {
    console.error("Dispatch error:", err);
    res.status(500).json({ ok: false, error: "Failed to dispatch task" });
  }
});

// Get dispatch status (check task file status)
router.get("/status/:taskId", async (req, res) => {
  const { taskId } = req.params;

  try {
    // Check which directory the task is in (inbox, active, completed, failed)
    const directories = ["inbox", "active", "completed", "failed"];

    for (const dir of directories) {
      const taskPath = `/sandbox/.openclaw-data/workspace/tasks/${dir}/task_${taskId}.json`;
      try {
        const content = await execInSandbox(`cat ${taskPath} 2>/dev/null || true`);
        if (content && content.stdout && content.stdout.trim()) {
          const taskData = JSON.parse(content.stdout);
          return res.json({
            ok: true,
            status: dir,
            task: taskData,
          });
        }
      } catch {
        // File doesn't exist in this directory, continue
      }
    }

    res.json({ ok: true, status: "unknown" });
  } catch (err) {
    console.error("Status check error:", err);
    res.status(500).json({ ok: false, error: "Failed to check task status" });
  }
});

export default router;