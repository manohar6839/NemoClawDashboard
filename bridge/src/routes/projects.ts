/**
 * routes/projects.ts — Project CRUD routes for Tiger Bridge
 *
 * Endpoints:
 *   GET    /tiger/projects           — list all projects
 *   POST   /tiger/projects           — create project
 *   GET    /tiger/projects/:id      — get project + its tasks
 *   PUT    /tiger/projects/:id      — update project
 *   DELETE /tiger/projects/:id      — delete project
 *   GET    /tiger/projects/:id/tasks — list tasks for project
 *   POST   /tiger/projects/:id/tasks — create task in project
 */

import { Router } from "express";
import { projects, tasks } from "../db.js";

const router = Router();

// List all projects
router.get("/", (req, res) => {
  const all = projects.findAll();
  res.json({ ok: true, projects: all });
});

// Create project
router.post("/", (req, res) => {
  const { name, description, priority } = req.body;
  if (!name) {
    return res.status(400).json({ ok: false, error: "name is required" });
  }
  const created = projects.create({ name, description, priority });
  res.status(201).json({ ok: true, project: created });
});

// Get project with tasks
router.get("/:id", (req, res) => {
  const { id } = req.params;
  const project = projects.getWithTasks(id);
  if (!project) {
    return res.status(404).json({ ok: false, error: "Project not found" });
  }
  res.json({ ok: true, project });
});

// Update project
router.put("/:id", (req, res) => {
  const { id } = req.params;
  const { name, description, status, priority } = req.body;
  const updated = projects.update(id, { name, description, status, priority });
  if (!updated) {
    return res.status(404).json({ ok: false, error: "Project not found" });
  }
  res.json({ ok: true, project: updated });
});

// Delete project
router.delete("/:id", (req, res) => {
  const { id } = req.params;
  const deleted = projects.delete(id);
  if (!deleted) {
    return res.status(404).json({ ok: false, error: "Project not found" });
  }
  res.json({ ok: true });
});

// List tasks for project
router.get("/:id/tasks", (req, res) => {
  const { id } = req.params;
  const projectTasks = tasks.findAll({ project: id });
  res.json({ ok: true, tasks: projectTasks });
});

// Create task in project
router.post("/:id/tasks", (req, res) => {
  const { id: project_id } = req.params;
  const { title, description, priority, assigned_agent, parent_task_id } = req.body;
  if (!title) {
    return res.status(400).json({ ok: false, error: "title is required" });
  }
  const created = tasks.create({
    project_id,
    title,
    description,
    priority,
    assigned_agent,
    parent_task_id,
  });
  res.status(201).json({ ok: true, task: created });
});

export default router;