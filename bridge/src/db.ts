/**
 * db.ts — SQLite database for Tiger Bridge
 *
 * Manages persistent storage for projects, tasks, executions, and outputs.
 * Database file: /root/clawd-dashboard/data/tiger.db
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Data directory - use env var or fallback to local dev path
// VPS: /root/clawd-dashboard/data (or set TIGER_DB_DIR)
// Dev: ./data (relative to project root)
const DATA_DIR = process.env.TIGER_DB_DIR || path.join(__dirname, "../../data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, "tiger.db");
const db: Database.Database = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma("journal_mode = WAL");

// ─── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    priority TEXT DEFAULT 'medium',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    parent_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'backlog',
    priority TEXT DEFAULT 'medium',
    assigned_agent TEXT,
    progress INTEGER DEFAULT 0,
    tags TEXT DEFAULT '[]',
    notes TEXT DEFAULT '',
    due_date TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'agent', 'system')),
    content TEXT NOT NULL,
    -- 'meta' is optional JSON for things like model used, tokens, duration.
    meta TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
    ON chat_messages (session_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS executions (
    id TEXT PRIMARY KEY,
    task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    agent TEXT,
    command TEXT,
    stdout TEXT DEFAULT '',
    stderr TEXT DEFAULT '',
    exit_code INTEGER,
    cost REAL DEFAULT 0,
    tokens_used INTEGER DEFAULT 0,
    started_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS outputs (
    id TEXT PRIMARY KEY,
    task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    execution_id TEXT REFERENCES executions(id) ON DELETE SET NULL,
    filename TEXT NOT NULL,
    file_type TEXT DEFAULT 'text/plain',
    file_path TEXT NOT NULL,
    size_bytes INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_executions_task ON executions(task_id);
  CREATE INDEX IF NOT EXISTS idx_outputs_task ON outputs(task_id);
`);

// ─── Helper to generate IDs ─────────────────────────────────────────────────

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Project Operations ────────────────────────────────────────────────────

export const projects = {
  findAll(): unknown[] {
    return db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all();
  },

  findById(id: string): unknown | undefined {
    return db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
  },

  create(data: { name: string; description?: string; priority?: string }): unknown {
    const id = generateId("proj");
    db.prepare(`
      INSERT INTO projects (id, name, description, priority)
      VALUES (?, ?, ?, ?)
    `).run(id, data.name, data.description || "", data.priority || "medium");
    return projects.findById(id);
  },

  update(id: string, data: Partial<{ name: string; description: string; status: string; priority: string }>): unknown | undefined {
    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) { updates.push("name = ?"); values.push(data.name); }
    if (data.description !== undefined) { updates.push("description = ?"); values.push(data.description); }
    if (data.status !== undefined) { updates.push("status = ?"); values.push(data.status); }
    if (data.priority !== undefined) { updates.push("priority = ?"); values.push(data.priority); }

    if (updates.length === 0) return projects.findById(id);

    updates.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE projects SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    return projects.findById(id);
  },

  delete(id: string): boolean {
    const result = db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    return result.changes > 0;
  },

  getWithTasks(id: string): unknown {
    const project = projects.findById(id);
    if (!project) return null;
    const tasks = db.prepare("SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC").all(id);
    return { ...project, tasks };
  },
};

// ─── Task Operations ────────────────────────────────────────────────────────

export const tasks = {
  findAll(filters: { status?: string; project?: string; agent?: string } = {}): unknown[] {
    let sql = "SELECT * FROM tasks WHERE 1=1";
    const params: unknown[] = [];

    if (filters.status) { sql += " AND status = ?"; params.push(filters.status); }
    if (filters.project) { sql += " AND project_id = ?"; params.push(filters.project); }
    if (filters.agent) { sql += " AND assigned_agent = ?"; params.push(filters.agent); }

    sql += " ORDER BY updated_at DESC";
    return db.prepare(sql).all(...params);
  },

  findById(id: string): unknown | undefined {
    return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  },

  create(data: {
    project_id: string;
    title: string;
    description?: string;
    priority?: string;
    assigned_agent?: string;
    parent_task_id?: string;
  }): unknown {
    const id = generateId("task");
    db.prepare(`
      INSERT INTO tasks (id, project_id, parent_task_id, title, description, priority, assigned_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.project_id,
      data.parent_task_id || null,
      data.title,
      data.description || "",
      data.priority || "medium",
      data.assigned_agent || null
    );
    return tasks.findById(id);
  },

  update(id: string, data: Partial<{
    title: string;
    description: string;
    status: string;
    priority: string;
    assigned_agent: string;
    progress: number;
    tags: string;
    notes: string;
    due_date: string;
  }>): unknown | undefined {
    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.title !== undefined) { updates.push("title = ?"); values.push(data.title); }
    if (data.description !== undefined) { updates.push("description = ?"); values.push(data.description); }
    if (data.status !== undefined) { updates.push("status = ?"); values.push(data.status); }
    if (data.priority !== undefined) { updates.push("priority = ?"); values.push(data.priority); }
    if (data.assigned_agent !== undefined) { updates.push("assigned_agent = ?"); values.push(data.assigned_agent); }
    if (data.progress !== undefined) { updates.push("progress = ?"); values.push(data.progress); }
    if (data.tags !== undefined) { updates.push("tags = ?"); values.push(data.tags); }
    if (data.notes !== undefined) { updates.push("notes = ?"); values.push(data.notes); }
    if (data.due_date !== undefined) { updates.push("due_date = ?"); values.push(data.due_date); }

    if (updates.length === 0) return tasks.findById(id);

    updates.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    return tasks.findById(id);
  },

  delete(id: string): boolean {
    const result = db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    return result.changes > 0;
  },

  getWithExecutions(id: string): unknown {
    const task = tasks.findById(id);
    if (!task) return null;
    const executions = db.prepare("SELECT * FROM executions WHERE task_id = ? ORDER BY started_at DESC").all(id);
    const outputs = db.prepare("SELECT * FROM outputs WHERE task_id = ? ORDER BY created_at DESC").all(id);
    return { ...task, executions, outputs };
  },
};

// ─── Execution Operations ───────────────────────────────────────────────────

export const executions = {
  findByTaskId(taskId: string): unknown[] {
    return db.prepare("SELECT * FROM executions WHERE task_id = ? ORDER BY started_at DESC").all(taskId);
  },

  create(data: {
    task_id: string;
    agent?: string;
    command: string;
  }): unknown {
    const id = generateId("exec");
    db.prepare(`
      INSERT INTO executions (id, task_id, agent, command)
      VALUES (?, ?, ?, ?)
    `).run(id, data.task_id, data.agent || null, data.command);
    return db.prepare("SELECT * FROM executions WHERE id = ?").get(id);
  },

  complete(id: string, data: {
    stdout?: string;
    stderr?: string;
    exit_code?: number;
    cost?: number;
    tokens_used?: number;
  }): unknown | undefined {
    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.stdout !== undefined) { updates.push("stdout = ?"); values.push(data.stdout); }
    if (data.stderr !== undefined) { updates.push("stderr = ?"); values.push(data.stderr); }
    if (data.exit_code !== undefined) { updates.push("exit_code = ?"); values.push(data.exit_code); }
    if (data.cost !== undefined) { updates.push("cost = ?"); values.push(data.cost); }
    if (data.tokens_used !== undefined) { updates.push("tokens_used = ?"); values.push(data.tokens_used); }

    if (updates.length === 0) return null;

    updates.push("completed_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE executions SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    return db.prepare("SELECT * FROM executions WHERE id = ?").get(id);
  },
};

// ─── Output Operations ──────────────────────────────────────────────────────

export const outputs = {
  findByTaskId(taskId: string): unknown[] {
    return db.prepare("SELECT * FROM outputs WHERE task_id = ? ORDER BY created_at DESC").all(taskId);
  },

  create(data: {
    task_id: string;
    execution_id?: string;
    filename: string;
    file_type?: string;
    file_path: string;
    size_bytes?: number;
  }): unknown {
    const id = generateId("out");
    db.prepare(`
      INSERT INTO outputs (id, task_id, execution_id, filename, file_type, file_path, size_bytes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.task_id,
      data.execution_id || null,
      data.filename,
      data.file_type || "text/plain",
      data.file_path,
      data.size_bytes || 0
    );
    return db.prepare("SELECT * FROM outputs WHERE id = ?").get(id);
  },
};

export default db;