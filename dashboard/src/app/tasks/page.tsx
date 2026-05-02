"use client"

/**
 * /tasks — Dual-source task view
 *
 * PRIMARY  → Tiger's TASKS.md (source of truth, read-only)
 *            fetched via /api/tiger/file-tasks
 * SECONDARY → SQLite dispatch queue (status=backlog only)
 *            fetched via /api/tiger/tasks
 *            These are dashboard-queued items Tiger hasn't touched yet.
 *
 * Tiger owns TASKS.md entirely. Dashboard-queued items graduate to TASKS.md
 * once Tiger picks them up; the watcher marks them done in SQLite.
 */

import * as React from "react"
import useSWR from "swr"
import {
  CheckSquare, GitBranch, Bot, Clock,
  AlertTriangle, Loader2, FolderOpen, Inbox,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

// Tiger's TASKS.md task (from file-tasks route)
interface FileTask {
  id: string
  title: string
  status: string
  status_raw: string
  section: string
  assigned_agent: string
  project: string
  description: string
}

// SQLite dispatch queue task
interface QueueTask {
  id: string
  project_id: string | null
  title: string
  status: string
  priority: string
  assigned_agent: string | null
  agent_reason: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTION_ORDER = ["in-progress", "review", "ready", "backlog", "done"]
const SECTION_LABELS: Record<string, string> = {
  "in-progress": "In Progress",
  review: "Review",
  ready: "Ready",
  backlog: "Backlog",
  done: "Done",
}
const SECTION_COLORS: Record<string, string> = {
  "in-progress": "text-amber-400",
  review: "text-purple-400",
  ready: "text-blue-400",
  backlog: "text-zinc-400",
  done: "text-emerald-400",
}
const PRIORITY_COLORS: Record<string, string> = {
  low:    "bg-gray-500/10 text-gray-400 border-gray-500/20",
  medium: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  high:   "bg-amber-500/10 text-amber-400 border-amber-500/20",
  urgent: "bg-red-500/10 text-red-400 border-red-500/20",
}
const AGENT_EMOJI: Record<string, string> = {
  tiger: "🐯", main: "🐯",
  cody: "💻", coder: "💻",
  ethan: "🔍", researcher: "🔍",
  cathy: "✍️", writer: "✍️",
  elon: "📊", pm: "📊",
}
const AGENT_COLORS: Record<string, string> = {
  tiger: "text-orange-400", main: "text-orange-400",
  cody: "text-blue-400",   coder: "text-blue-400",
  ethan: "text-green-400", researcher: "text-green-400",
  cathy: "text-pink-400",  writer: "text-pink-400",
  elon: "text-violet-400", pm: "text-violet-400",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function isRouterFailure(reason: string | null) {
  return !!reason && reason.startsWith("router_")
}

// ─── File task row (Tiger's TASKS.md) ─────────────────────────────────────────

function FileTaskRow({ task }: { task: FileTask }) {
  const agentKey = task.assigned_agent?.toLowerCase() ?? ""
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-muted/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate text-foreground/90">{task.title}</div>
        {task.project && (
          <div className="text-xs text-muted-foreground truncate mt-0.5">{task.project}</div>
        )}
      </div>
      {agentKey && (
        <span className={cn("text-xs font-medium shrink-0", AGENT_COLORS[agentKey] ?? "text-muted-foreground")}>
          {AGENT_EMOJI[agentKey] ?? ""} <span className="hidden sm:inline">{agentKey}</span>
        </span>
      )}
      <span className="text-xs text-muted-foreground shrink-0 italic">{task.status_raw}</span>
    </div>
  )
}

// ─── Section (Tiger's tasks grouped by status) ────────────────────────────────

function FileTaskSection({ status, tasks }: { status: string; tasks: FileTask[] }) {
  const [collapsed, setCollapsed] = React.useState(status === "done")
  if (tasks.length === 0) return null
  return (
    <div>
      <button
        className="flex items-center gap-2 w-full text-left mb-2 group"
        onClick={() => setCollapsed((v) => !v)}
      >
        <span className={cn("text-xs font-semibold uppercase tracking-widest", SECTION_COLORS[status] ?? "text-zinc-400")}>
          {SECTION_LABELS[status] ?? status}
        </span>
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0 rounded-full">{tasks.length}</span>
        <span className="text-xs text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
          {collapsed ? "expand" : "collapse"}
        </span>
      </button>
      {!collapsed && (
        <div className="space-y-0.5">
          {tasks.map((t) => <FileTaskRow key={t.id} task={t} />)}
        </div>
      )}
      <div className="mt-4" />
    </div>
  )
}

// ─── Queue task row (SQLite dispatch queue) ───────────────────────────────────

function QueueTaskRow({ task }: { task: QueueTask }) {
  const warn = isRouterFailure(task.agent_reason)
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-muted/30 transition-colors border border-dashed border-border/40">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate text-foreground/70">{task.title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">Queued — waiting for Tiger</div>
      </div>
      {warn && (
        <span title={task.agent_reason ?? ""} className="shrink-0">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400/80" />
        </span>
      )}
      <Badge className={cn("text-[10px] px-1.5 py-0 shrink-0", PRIORITY_COLORS[task.priority ?? "medium"])}>
        {task.priority}
      </Badge>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const { data: fileData, isLoading: fileLoading } = useSWR<{ ok: boolean; tasks: FileTask[] }>(
    "/api/tiger/file-tasks",
    fetcher,
    { refreshInterval: 60_000 }
  )
  const { data: queueData, isLoading: queueLoading } = useSWR<{ ok: boolean; tasks: QueueTask[] }>(
    "/api/tiger/tasks",
    fetcher,
    { refreshInterval: 30_000 }
  )

  const fileTasks = fileData?.tasks ?? []
  // Only show SQLite tasks that are still in backlog (Tiger hasn't processed yet)
  const queueTasks = (queueData?.tasks ?? []).filter((t) => t.status === "backlog")

  // Group Tiger's tasks by status
  const grouped = React.useMemo(() => {
    const g: Record<string, FileTask[]> = {}
    for (const t of fileTasks) {
      if (!g[t.status]) g[t.status] = []
      g[t.status].push(t)
    }
    return g
  }, [fileTasks])

  const knownStatuses = new Set(SECTION_ORDER)
  const otherStatuses = Object.keys(grouped).filter((s) => !knownStatuses.has(s))
  const orderedStatuses = [...SECTION_ORDER, ...otherStatuses]

  const inProgress = (grouped["in-progress"] ?? []).length
  const inReview   = (grouped["review"] ?? []).length
  const done       = (grouped["done"] ?? []).length
  const queued     = queueTasks.length

  const isLoading = fileLoading || queueLoading

  return (
    <div className="space-y-6 max-w-3xl mx-auto w-full p-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CheckSquare className="h-6 w-6 text-primary" />
          Tasks
        </h1>
        <p className="text-sm text-muted-foreground">
          Tiger's active work from <span className="font-mono text-xs">TASKS.md</span> — plus any dashboard-queued items waiting for pickup.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {[
          { label: "In Progress", value: inProgress, icon: GitBranch, color: "text-amber-400" },
          { label: "In Review",   value: inReview,   icon: Bot,        color: "text-purple-400" },
          { label: "Done",        value: done,        icon: CheckSquare,color: "text-emerald-400" },
          { label: "Queued",      value: queued,      icon: Inbox,      color: "text-blue-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="bg-card/40">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-xl font-bold tabular-nums">{isLoading ? "—" : value}</p>
                </div>
                <Icon className={cn("h-4 w-4", color)} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div>
          {/* Primary: Tiger's TASKS.md */}
          {fileTasks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckSquare className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Tiger's task list is empty — no active work tracked in TASKS.md.</p>
            </div>
          ) : (
            orderedStatuses.map((status) =>
              grouped[status]?.length ? (
                <FileTaskSection key={status} status={status} tasks={grouped[status]} />
              ) : null
            )
          )}

          {/* Secondary: Dashboard dispatch queue */}
          {queueTasks.length > 0 && (
            <div className="mt-6 pt-6 border-t border-border/40">
              <div className="flex items-center gap-2 mb-3">
                <Inbox className="h-4 w-4 text-blue-400" />
                <span className="text-xs font-semibold uppercase tracking-widest text-blue-400">
                  Dashboard Queue
                </span>
                <span className="text-xs text-muted-foreground bg-muted px-1.5 rounded-full">
                  {queueTasks.length}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Dispatched from dashboard — waiting for Tiger to pick up.
              </p>
              <div className="space-y-1.5">
                {queueTasks.map((t) => <QueueTaskRow key={t.id} task={t} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
