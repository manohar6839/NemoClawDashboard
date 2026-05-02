/**
 * routes/tasks-file.ts — Read tasks and projects from Tiger's markdown files
 *
 * Endpoints:
 *   GET /tiger/file-tasks              — all tasks from TASKS.md
 *   GET /tiger/file-tasks/active       — only active/pending-action tasks
 *   GET /tiger/file-tasks/completed    — only completed tasks
 *   GET /tiger/file-tasks/projects     — all projects from PROJECTS.md
 *
 * Parser contract (TASKS.md):
 *   Tiger maintains a fenced ```json TASKS ... ``` block at the bottom of
 *   TASKS.md. The parser reads ONLY from that block — no regex over markdown.
 *   If the block is absent, the endpoint returns HTTP 502 with a clear error.
 *   Tiger's MEMORY.md contains the rule: always emit the TASKS_JSON block
 *   on every TASKS.md write.
 *
 * Task JSON schema per entry:
 *   { id, title, agent, status, section, note?, age?, project? }
 *   section values: "pending-action" | "in-progress" | "completed"
 *   status values:  "pending-action" | "in-progress" | "blocked" | "done"
 */

import { Router, Request, Response } from "express";
import { execInSandbox } from "../tiger.js";

const router = Router();

// ── Parser: read TASKS_JSON fenced block from TASKS.md ───────────────────────
function parseTasksJsonBlock(stdout: string): any[] {
  // Match: ```json\nTASKS\n<json>\n```
  const match = stdout.match(/```json\s+TASKS\s*\n([\s\S]+?)\n```/);
  if (!match) {
    throw new Error(
      "TASKS.md missing TASKS_JSON block. Tiger must emit:\n" +
      "```json\nTASKS\n[...]\n```\n" +
      "at the bottom of every TASKS.md write."
    );
  }
  try {
    return JSON.parse(match[1]);
  } catch (e: any) {
    throw new Error(`TASKS_JSON block is not valid JSON: ${e.message}`);
  }
}

// ── Parser: projects from PROJECTS.md ────────────────────────────────────────
function parseProjectsMarkdown(stdout: string) {
  const projects: any[] = [];
  const lines = stdout.split("\n");
  let inActive = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## Active Projects")) { inActive = true; continue; }
    if (trimmed.startsWith("## Completed Projects")) break;

    if (inActive && trimmed.match(/^\| \d/)) {
      const cols = trimmed.split("|").map((c: string) => c.trim()).filter(Boolean);
      if (cols.length >= 5) {
        projects.push({
          id: cols[0],
          name: cols[1],
          description: cols[2],
          created: cols[3],
          tasks_count: cols[4],
          status: cols[5] || "active",
        });
      }
    }
  }

  return projects;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /tiger/file-tasks — all tasks
router.get("/", async (req: Request, res: Response) => {
  try {
    const { stdout } = await execInSandbox("cat /home/node/.openclaw/workspace/TASKS.md");
    const allTasks = parseTasksJsonBlock(stdout);
    const projectFilter = (req.query.project as string || "").trim().toLowerCase();
    const filtered = projectFilter
      ? allTasks.filter((t: any) => t.project?.toLowerCase().includes(projectFilter))
      : allTasks;
    res.json({ ok: true, source: "TASKS.md", count: filtered.length, tasks: filtered });
  } catch (err: any) {
    const status = err.message?.includes("missing TASKS_JSON") ? 502 : 500;
    res.status(status).json({ ok: false, error: err.message });
  }
});

// GET /tiger/file-tasks/active — active + pending-action tasks only
router.get("/active", async (_req: Request, res: Response) => {
  try {
    const { stdout } = await execInSandbox("cat /home/node/.openclaw/workspace/TASKS.md");
    const tasks = parseTasksJsonBlock(stdout).filter(
      (t: any) => t.section === "in-progress" || t.section === "pending-action"
    );
    res.json({ ok: true, source: "TASKS.md", count: tasks.length, tasks });
  } catch (err: any) {
    const status = err.message?.includes("missing TASKS_JSON") ? 502 : 500;
    res.status(status).json({ ok: false, error: err.message });
  }
});

// GET /tiger/file-tasks/completed — completed tasks only
router.get("/completed", async (_req: Request, res: Response) => {
  try {
    const { stdout } = await execInSandbox("cat /home/node/.openclaw/workspace/TASKS.md");
    const tasks = parseTasksJsonBlock(stdout).filter((t: any) => t.section === "completed");
    res.json({ ok: true, source: "TASKS.md", count: tasks.length, tasks });
  } catch (err: any) {
    const status = err.message?.includes("missing TASKS_JSON") ? 502 : 500;
    res.status(status).json({ ok: false, error: err.message });
  }
});

// GET /tiger/file-tasks/projects — all projects
router.get("/projects", async (_req: Request, res: Response) => {
  try {
    const { stdout } = await execInSandbox("cat /home/node/.openclaw/workspace/PROJECTS.md");
    const projects = parseProjectsMarkdown(stdout);
    res.json({ ok: true, source: "PROJECTS.md", count: projects.length, projects });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
