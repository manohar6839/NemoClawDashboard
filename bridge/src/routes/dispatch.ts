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

    // Prepare task data
    const taskData = {
      id: taskId,
      title: task.title,
      description: task.description || description || "",
      assignedAgent: assignedAgent || task.assigned_agent || "manual",
      context: context || "",
      createdAt: new Date().toISOString(),
      status: "pending",
    };

    // Write task JSON to sandbox's inbox via kubectl exec
    // The sandbox path: /sandbox/.openclaw-data/workspace/tasks/inbox/
    const inboxPath = "/sandbox/.openclaw-data/workspace/tasks/inbox";
    const taskFile = `task_${taskId}.json`;

    // First ensure the directory exists inside the container
    await execInSandbox(`mkdir -p ${inboxPath}`);

    // Write the task file using printf (more reliable than echo with escaping)
    const taskJson = JSON.stringify(taskData, null, 2);
    // Escape single quotes for shell: ' -> '\''
    const escapedJson = taskJson.replace(/'/g, "'\\''");
    await execInSandbox(`printf '%s' '${escapedJson}' > ${inboxPath}/${taskFile}`);

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