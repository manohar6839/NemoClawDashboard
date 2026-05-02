/**
 * routes/tasks.ts — Task CRUD routes for Tiger Bridge
 *
 * Endpoints:
 *   GET    /tiger/tasks              — list all tasks (with filters)
 *   GET    /tiger/tasks/:id          — get task + executions + outputs
 *   PUT    /tiger/tasks/:id          — update task
 *   DELETE /tiger/tasks/:id          — delete task
 *   POST   /tiger/tasks/:id/execute  — trigger execution
 */

import { Router } from "express";
import { tasks, executions } from "../db.js";

const router = Router();

// List all tasks (with optional filters)
router.get("/", (req, res) => {
  const { status, project, agent } = req.query;
  const all = tasks.findAll({
    status: status as string,
    project: project as string,
    agent: agent as string,
  });
  res.json({ ok: true, tasks: all });
});

// Get task with executions and outputs
router.get("/:id", (req, res) => {
  const { id } = req.params;
  const task = tasks.getWithExecutions(id);
  if (!task) {
    return res.status(404).json({ ok: false, error: "Task not found" });
  }
  res.json({ ok: true, task });
});

// Update task
router.put("/:id", (req, res) => {
  const { id } = req.params;
  const {
    title,
    description,
    status,
    priority,
    assigned_agent,
    progress,
    tags,
    notes,
    due_date,
  } = req.body;

  const updated = tasks.update(id, {
    title,
    description,
    status,
    priority,
    assigned_agent,
    progress,
    tags: tags ? JSON.stringify(tags) : undefined,
    notes,
    due_date,
  });

  if (!updated) {
    return res.status(404).json({ ok: false, error: "Task not found" });
  }
  res.json({ ok: true, task: updated });
});

// Delete task
router.delete("/:id", (req, res) => {
  const { id } = req.params;
  const deleted = tasks.delete(id);
  if (!deleted) {
    return res.status(404).json({ ok: false, error: "Task not found" });
  }
  res.json({ ok: true });
});

// Trigger execution (writes task file to sandbox for Tiger to pick up)
router.post("/:id/execute", async (req, res) => {
  const { id } = req.params;
  const task = tasks.findById(id) as { id: string; title: string; description: string; assigned_agent: string } | undefined;

  if (!task) {
    return res.status(404).json({ ok: false, error: "Task not found" });
  }

  // Prepare task data for dispatch
  const taskData = {
    id: id,
    title: task.title,
    description: task.description || "",
    assignedAgent: task.assigned_agent || "manual",
    context: "",
    createdAt: new Date().toISOString(),
    status: "pending",
  };

  // Write task JSON to container's inbox via docker exec
  const inboxPath = "/home/node/.openclaw/workspace/tasks/inbox";
  const taskFile = `task_${id}.json`;

  // Import execInSandbox dynamically to avoid circular deps
  const { execInSandbox } = await import("../tiger.js");

  try {
    // Write task JSON via temp file (avoids ALL shell escaping issues)
    const taskJson = JSON.stringify(taskData, null, 2);
    const { writeFileSync: wfs, unlinkSync: uls } = await import("fs");
    const { execSync: exs } = await import("child_process");
    const tmpHost = `/tmp/task_${id}_${Date.now()}.json`;
    try {
      wfs(tmpHost, taskJson, "utf-8");
      exs(`docker cp ${tmpHost} tiger-openclaw:${tmpHost}`, { timeout: 5000 });
      uls(tmpHost);
    } catch (copyErr: any) {
      throw new Error(`Failed to copy task to container: ${copyErr.message}`);
    }
    await execInSandbox(`mkdir -p ${inboxPath} && mv ${tmpHost} ${inboxPath}/${taskFile}`);

    // Create execution record
    const execution = executions.create({
      task_id: id,
      agent: taskData.assignedAgent,
      command: `dispatch task ${id} to ${taskData.assignedAgent}`,
    });

    // Update task status
    tasks.update(id, { status: "in-progress" });

    res.json({
      ok: true,
      execution,
      message: `Task ${id} dispatched to Tiger inbox`,
    });
  } catch (err) {
    console.error("Execute error:", err);
    res.status(500).json({ ok: false, error: "Failed to dispatch task" });
  }
});

export default router;