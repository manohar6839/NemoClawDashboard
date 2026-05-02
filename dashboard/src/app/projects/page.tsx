"use client"

/**
 * /projects — Dual-source project view with inline task+agent expansion
 *
 * PRIMARY  → Tiger's PROJECTS.md (source of truth, read-only)
 * SECONDARY → SQLite projects (dashboard-queued, waiting for Tiger)
 *
 * Click any project → expands to show tasks from TASKS.md for that project,
 * each task row showing: stage name, assigned agent (emoji+name), status badge.
 */

import * as React from "react"
import useSWR from "swr"
import {
  FolderOpen, Plus, Loader2, ChevronDown, ChevronRight,
  Inbox, Trash2, MoreVertical,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileProject {
  id: string
  name: string
  description: string
  created: string
  tasks_count: string
  status: string
}

interface FileTask {
  id: string
  title: string
  status: string
  status_raw: string
  assigned_agent: string
  project: string
  isProject?: boolean
  isSubTask?: boolean
  parentId?: string
}

interface DbProject {
  id: string
  name: string
  description: string
  status: string
  priority: string
  created_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  low:    "bg-gray-500/10 text-gray-400 border-gray-500/20",
  medium: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  high:   "bg-amber-500/10 text-amber-400 border-amber-500/20",
  urgent: "bg-red-500/10 text-red-400 border-red-500/20",
}

const TASK_STATUS_COLORS: Record<string, string> = {
  "in-progress": "bg-amber-500/10 text-amber-400",
  review:        "bg-purple-500/10 text-purple-400",
  done:          "bg-emerald-500/10 text-emerald-400",
  backlog:       "bg-zinc-500/10 text-zinc-400",
}

const AGENT_EMOJI: Record<string, string> = {
  tiger: "🐯", main: "🐯",
  cody: "💻",  coder: "💻",
  ethan: "🔍", researcher: "🔍",
  cathy: "✍️", writer: "✍️",
  elon: "📊",  pm: "📊",
}

const AGENT_COLORS: Record<string, string> = {
  tiger: "text-orange-400", main: "text-orange-400",
  cody: "text-blue-400",    coder: "text-blue-400",
  ethan: "text-green-400",  researcher: "text-green-400",
  cathy: "text-pink-400",   writer: "text-pink-400",
  elon: "text-violet-400",  pm: "text-violet-400",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function statusBadgeClass(status: string) {
  const s = status.toLowerCase()
  if (s.includes("progress") || s.includes("active") || s.includes("🔴") || s.includes("🔄"))
    return "bg-green-500/10 text-green-400 border-green-500/20"
  if (s.includes("review"))
    return "bg-purple-500/10 text-purple-400 border-purple-500/20"
  if (s.includes("done") || s.includes("complete") || s.includes("approved"))
    return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
  return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
}

function cleanText(s: string) {
  // Strip emoji and markdown bold markers for display
  return s.replace(/\*\*/g, "").replace(/[✅⏳🔄❌🛢️🔍💻📊✍️🐯]/g, "").trim()
}

// ─── Task row inside expanded project ─────────────────────────────────────────

function TaskRow({ task }: { task: FileTask }) {
  const agentKey = task.assigned_agent?.toLowerCase() ?? ""
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/20 transition-colors">
      {/* Status badge */}
      <span className={cn(
        "text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap",
        TASK_STATUS_COLORS[task.status] ?? "bg-zinc-500/10 text-zinc-400"
      )}>
        {task.status_raw ? cleanText(task.status_raw).slice(0, 20) : task.status}
      </span>

      {/* Stage/task name */}
      <span className="text-sm flex-1 truncate text-foreground/80">
        {cleanText(task.title)}
      </span>

      {/* Agent */}
      {agentKey && agentKey !== "unassigned" && (
        <span className={cn(
          "text-xs font-medium shrink-0 flex items-center gap-1",
          AGENT_COLORS[agentKey] ?? "text-muted-foreground"
        )}>
          <span>{AGENT_EMOJI[agentKey] ?? "🤖"}</span>
          <span className="hidden sm:inline capitalize">{agentKey}</span>
        </span>
      )}
    </div>
  )
}

// ─── Tiger's project card (read-only, with task expand) ───────────────────────

function FileProjectCard({ project }: { project: FileProject }) {
  const [expanded, setExpanded] = React.useState(false)

  // Fetch tasks from TASKS.md filtered to this project name
  const projectName = cleanText(project.name)
  const { data: tasksData, isLoading: tasksLoading } = useSWR<{
    ok: boolean; tasks: FileTask[]
  }>(
    expanded
      ? `/api/tiger/file-tasks?project=${encodeURIComponent(projectName)}`
      : null,
    fetcher
  )

  // Show sub-tasks (stage rows) and the project-level task (agent + status)
  const allTasks = tasksData?.tasks ?? []
  const projectTask = allTasks.find((t) => t.isProject)
  const subTasks    = allTasks.filter((t) => t.isSubTask)

  return (
    <Card className="bg-card/40 transition-colors hover:bg-card/60">
      <CardHeader className="pb-2">
        <div className="flex items-start gap-2">
          {/* Expand toggle + title */}
          <button
            className="flex items-center gap-2 text-left flex-1 min-w-0 group"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded
              ? <ChevronDown  className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
              : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
            }
            <CardTitle className="text-base group-hover:text-primary transition-colors">
              {cleanText(project.name)}
            </CardTitle>
          </button>

          {/* Status badge */}
          <Badge className={cn("text-xs shrink-0", statusBadgeClass(project.status))}>
            {cleanText(project.status).replace(/in progress/i, "Active")}
          </Badge>
        </div>

        {project.description && (
          <CardDescription className="line-clamp-2 ml-6 text-xs">
            {project.description}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {/* Meta row */}
        <div className="flex items-center gap-3 ml-6 text-xs text-muted-foreground">
          <span>Created {project.created}</span>
          <span>·</span>
          <span>{project.tasks_count}</span>
          {/* Show primary agent when collapsed */}
          {!expanded && projectTask?.assigned_agent && (
            <>
              <span>·</span>
              <span className={cn(
                "flex items-center gap-1",
                AGENT_COLORS[projectTask.assigned_agent] ?? "text-muted-foreground"
              )}>
                {AGENT_EMOJI[projectTask.assigned_agent] ?? ""} {projectTask.assigned_agent}
              </span>
            </>
          )}
        </div>

        {/* Expanded task list */}
        {expanded && (
          <div className="mt-4 ml-2 border-t border-border/30 pt-3">
            {tasksLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : allTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground px-3 italic">
                No tasks found in TASKS.md for this project.
              </p>
            ) : (
              <div className="space-y-0.5">
                {/* Project-level agent row */}
                {projectTask && (
                  <div className="flex items-center gap-2 px-3 pb-2 mb-1 border-b border-border/20">
                    <span className="text-xs text-muted-foreground">Lead:</span>
                    <span className={cn(
                      "text-xs font-medium flex items-center gap-1",
                      AGENT_COLORS[projectTask.assigned_agent] ?? "text-muted-foreground"
                    )}>
                      {AGENT_EMOJI[projectTask.assigned_agent] ?? ""}
                      <span className="capitalize">{projectTask.assigned_agent}</span>
                    </span>
                    <span className={cn(
                      "ml-auto text-[10px] px-1.5 py-0.5 rounded-full",
                      TASK_STATUS_COLORS[projectTask.status] ?? "bg-zinc-500/10 text-zinc-400"
                    )}>
                      {cleanText(projectTask.status_raw || projectTask.status)}
                    </span>
                  </div>
                )}

                {/* Sub-task rows (review pipeline stages etc) */}
                {subTasks.length > 0 ? (
                  subTasks.map((t) => <TaskRow key={t.id} task={t} />)
                ) : (
                  <p className="text-xs text-muted-foreground px-3 italic">
                    No task breakdown available — Tiger tracks this at project level.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Dashboard-queued project card ───────────────────────────────────────────

function DbProjectCard({ project, onDelete }: { project: DbProject; onDelete: (id: string) => void }) {
  return (
    <Card className="bg-card/40 border-dashed border-border/60">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base truncate text-foreground/80">{project.name}</CardTitle>
            {project.description && (
              <CardDescription className="line-clamp-2 text-xs mt-1">{project.description}</CardDescription>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onDelete(project.id)} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-2">
          <Badge className={cn("text-xs", PRIORITY_COLORS[project.priority])}>
            {project.priority}
          </Badge>
          <span className="text-xs text-muted-foreground">Queued — waiting for Tiger</span>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { data: fileData, isLoading: fileLoading } = useSWR<{
    ok: boolean; projects: FileProject[]
  }>("/api/tiger/file-tasks/projects", fetcher, { refreshInterval: 60_000 })

  const { data: dbData, isLoading: dbLoading, mutate: mutateDb } = useSWR<{
    ok: boolean; projects: DbProject[]
  }>("/api/tiger/projects", fetcher, { refreshInterval: 60_000 })

  const fileProjects = fileData?.projects ?? []
  const dbProjects   = dbData?.projects ?? []
  const isLoading    = fileLoading || dbLoading

  const [isCreateOpen, setIsCreateOpen] = React.useState(false)
  const [form, setForm] = React.useState({ name: "", seed: "", description: "", priority: "medium" })
  const [creating, setCreating] = React.useState(false)
  const [createError, setCreateError] = React.useState("")

  const handleCreate = async () => {
    const payload: Record<string, string> = { priority: form.priority }
    if (form.name.trim())        payload.name = form.name.trim()
    if (form.seed.trim())        payload.seed = form.seed.trim()
    if (form.description.trim()) payload.description = form.description.trim()
    if (!payload.name && !payload.seed) { setCreateError("Enter a project name or seed text."); return }
    setCreating(true); setCreateError("")
    try {
      const res = await fetch("/api/tiger/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const result = await res.json()
      if (!result.ok) throw new Error(result.error ?? "Failed")
      setForm({ name: "", seed: "", description: "", priority: "medium" })
      setIsCreateOpen(false)
      mutateDb()
    } catch (e: any) { setCreateError(e.message) }
    finally { setCreating(false) }
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/tiger/projects/${id}`, { method: "DELETE" })
    mutateDb()
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FolderOpen className="h-6 w-6 text-primary" />
            Projects
          </h1>
          <p className="text-sm text-muted-foreground">
            Tiger's projects from <span className="font-mono text-xs">PROJECTS.md</span>.
            Click a project to see its tasks and agents.
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New Project</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Queue a Project for Tiger</DialogTitle>
              <DialogDescription>
                Tiger will pick this up and add it to PROJECTS.md.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-sm font-medium">Name</label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. BESS Economics Model" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Seed text <span className="text-muted-foreground font-normal">(Tiger generates title + goal)</span></label>
                <textarea value={form.seed} onChange={(e) => setForm((f) => ({ ...f, seed: e.target.value }))} placeholder="Describe what you want Tiger to work on…" rows={3} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
              </div>
              <div>
                <label className="text-sm font-medium">Priority</label>
                <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-md border bg-background text-sm">
                  {["low", "medium", "high", "urgent"].map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              {createError && <p className="text-xs text-destructive">{createError}</p>}
              <Button onClick={handleCreate} disabled={creating || (!form.name.trim() && !form.seed.trim())} className="w-full">
                {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Queue Project
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Tiger's PROJECTS.md — primary */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <FolderOpen className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Tiger's Projects</span>
              <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">PROJECTS.md</span>
              <span className="text-xs text-muted-foreground bg-muted px-1.5 rounded-full ml-1">{fileProjects.length}</span>
            </div>
            {fileProjects.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No projects in PROJECTS.md yet.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {fileProjects.map((p) => <FileProjectCard key={p.id} project={p} />)}
              </div>
            )}
          </div>

          {/* Dashboard queue — secondary */}
          {dbProjects.length > 0 && (
            <div className="border-t border-border/40 pt-6">
              <div className="flex items-center gap-2 mb-3">
                <Inbox className="h-4 w-4 text-blue-400" />
                <span className="text-sm font-semibold text-blue-400">Dashboard Queue</span>
                <span className="text-xs text-muted-foreground bg-muted px-1.5 rounded-full ml-1">{dbProjects.length}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Projects you've queued — Tiger will add them to PROJECTS.md when he processes them.
              </p>
              <div className="flex flex-col gap-3">
                {dbProjects.map((p) => <DbProjectCard key={p.id} project={p} onDelete={handleDelete} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
