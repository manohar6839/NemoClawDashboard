// Task management types

export type TaskStatus = "backlog" | "ready" | "in-progress" | "review" | "done"

export type TaskPriority = "low" | "medium" | "high" | "urgent"

export type AgentType = "gemini-flash" | "claude-opus" | "claude-sonnet" | "gpt-4o" | "kimi-k2.5" | "auto" | "manual"

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  createdAt: string
  updatedAt: string
  dueDate?: string
  assignedAgent?: AgentType
  subAgentSessionId?: string
  subAgentStatus?: "idle" | "running" | "completed" | "failed"
  tags: string[]
  progress: number // 0-100
  parentTaskId?: string
  subTasks: string[]
  notes: string
  cost?: number // Tracked cost for this task
  estimatedHours?: number
  actualHours?: number
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "Backlog",
  ready: "Ready",
  "in-progress": "In Progress",
  review: "Review",
  done: "Done"
}

export const STATUS_COLORS: Record<TaskStatus, string> = {
  backlog: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  ready: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "in-progress": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  review: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  done: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
}

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: "bg-slate-500/20 text-slate-400",
  medium: "bg-blue-500/20 text-blue-400",
  high: "bg-orange-500/20 text-orange-400",
  urgent: "bg-red-500/20 text-red-400"
}

export const AGENT_OPTIONS: { value: AgentType; label: string }[] = [
  { value: "manual", label: "Manual (Me)" },
  { value: "auto", label: "Auto-select" },
  { value: "gemini-flash", label: "Gemini Flash" },
  { value: "claude-opus", label: "Claude 3 Opus" },
  { value: "claude-sonnet", label: "Claude 3.5 Sonnet" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "kimi-k2.5", label: "Kimi K2.5" }
]

export function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export function createTask(partial: Partial<Task> = {}): Task {
  const now = new Date().toISOString()
  return {
    id: partial.id || generateTaskId(),
    title: partial.title || "New Task",
    description: partial.description || "",
    status: partial.status || "backlog",
    priority: partial.priority || "medium",
    createdAt: partial.createdAt || now,
    updatedAt: partial.updatedAt || now,
    dueDate: partial.dueDate,
    assignedAgent: partial.assignedAgent,
    subAgentSessionId: partial.subAgentSessionId,
    subAgentStatus: partial.subAgentStatus || "idle",
    tags: partial.tags || [],
    progress: partial.progress ?? 0,
    parentTaskId: partial.parentTaskId,
    subTasks: partial.subTasks || [],
    notes: partial.notes || "",
    cost: partial.cost,
    estimatedHours: partial.estimatedHours,
    actualHours: partial.actualHours
  }
}

// Local storage key
export const TASKS_STORAGE_KEY = "clawd-tasks"

// Helper to load tasks from localStorage (client-side only)
export function loadTasks(): Task[] {
  if (typeof window === "undefined") return []
  try {
    const stored = localStorage.getItem(TASKS_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // Ignore
  }
  return []
}

// Helper to save tasks to localStorage
export function saveTasks(tasks: Task[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks))
  } catch {
    // Ignore
  }
}
