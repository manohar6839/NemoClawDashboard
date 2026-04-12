/**
 * Projects Page — Project management with tasks
 *
 * Lists projects as cards and provides project detail view with Kanban.
 */

"use client"

import * as React from "react"
import { FolderOpen, Plus, Loader2, MoreVertical, Pencil, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useBridgeRequest } from "@/hooks/use-bridge"
import { cn } from "@/lib/utils"

interface Project {
  id: string
  name: string
  description: string
  status: string
  priority: string
  created_at: string
  updated_at: string
}

interface Task {
  id: string
  project_id: string
  title: string
  description: string
  status: string
  priority: string
  assigned_agent: string | null
  progress: number
  created_at: string
  updated_at: string
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  medium: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  high: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  urgent: "bg-red-500/10 text-red-400 border-red-500/20",
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/10 text-green-400 border-green-500/20",
  paused: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  archived: "bg-gray-500/10 text-gray-400 border-gray-500/20",
}

export default function ProjectsPage() {
  const { request } = useBridgeRequest()
  const [projects, setProjects] = React.useState<Project[]>([])
  const [selectedProject, setSelectedProject] = React.useState<Project | null>(null)
  const [tasks, setTasks] = React.useState<Task[]>([])
  const [loading, setLoading] = React.useState(false)
  const [loadingTasks, setLoadingTasks] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = React.useState(false)
  const [newProjectName, setNewProjectName] = React.useState("")
  const [newProjectDesc, setNewProjectDesc] = React.useState("")
  const [newProjectPriority, setNewProjectPriority] = React.useState("medium")
  const [creating, setCreating] = React.useState(false)

  // Load projects
  const loadProjects = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await request("/api/tiger/projects") as { ok: boolean; projects?: Project[] }
      if (data.ok && data.projects) {
        setProjects(data.projects)
      } else {
        setError("Failed to load projects")
      }
    } catch (e: unknown) {
      setError("Failed to load projects")
    } finally {
      setLoading(false)
    }
  }, [request])

  // Load tasks for selected project
  const loadTasks = React.useCallback(async (projectId: string) => {
    setLoadingTasks(true)
    try {
      const data = await request("/api/tiger/projects") as { ok: boolean; projects?: Project[] }
      // Get tasks from project
      const projectData = await request(`/api/tiger/projects/${projectId}`) as { ok: boolean; project?: { tasks?: Task[] } }
      if (projectData.ok && projectData.project?.tasks) {
        setTasks(projectData.project.tasks)
      } else {
        // Fallback: get all tasks and filter
        const allTasks = await request("/api/tiger/tasks") as { ok: boolean; tasks?: Task[] }
        if (allTasks.ok && allTasks.tasks) {
          setTasks(allTasks.tasks.filter(t => t.project_id === projectId))
        }
      }
    } catch (e: unknown) {
      console.error("Failed to load tasks:", e)
    } finally {
      setLoadingTasks(false)
    }
  }, [request])

  React.useEffect(() => {
    loadProjects()
  }, [loadProjects])

  React.useEffect(() => {
    if (selectedProject) {
      loadTasks(selectedProject.id)
    }
  }, [selectedProject, loadTasks])

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return
    setCreating(true)
    try {
      await request("/api/tiger/projects", "POST", {
        name: newProjectName,
        description: newProjectDesc,
        priority: newProjectPriority,
      })
      setNewProjectName("")
      setNewProjectDesc("")
      setNewProjectPriority("medium")
      setIsCreateOpen(false)
      loadProjects()
    } catch (e: unknown) {
      console.error("Failed to create project:", e)
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteProject = async (id: string) => {
    try {
      await request("/api/tiger/projects", "POST", { _method: "DELETE", id })
      loadProjects()
      if (selectedProject?.id === id) {
        setSelectedProject(null)
        setTasks([])
      }
    } catch (e: unknown) {
      console.error("Failed to delete project:", e)
    }
  }

  // Group tasks by status
  const tasksByStatus = React.useMemo(() => {
    const grouped: Record<string, Task[]> = {
      backlog: [],
      ready: [],
      "in-progress": [],
      review: [],
      done: [],
    }
    tasks.forEach(task => {
      if (grouped[task.status]) {
        grouped[task.status].push(task)
      }
    })
    return grouped
  }, [tasks])

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FolderOpen className="h-6 w-6 text-primary" />
            Projects
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage projects and track tasks across your team
          </p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Project</DialogTitle>
              <DialogDescription>Create a new project to organize tasks.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Project name"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Input
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  placeholder="Project description"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Priority</label>
                <select
                  value={newProjectPriority}
                  onChange={(e) => setNewProjectPriority(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-md border bg-background"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <Button onClick={handleCreateProject} disabled={creating || !newProjectName.trim()}>
                {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Project
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      {/* Projects Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-20" />
          <p>No projects yet. Create your first project to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card
              key={project.id}
              className={cn(
                "cursor-pointer hover:bg-muted/50 transition-colors",
                selectedProject?.id === project.id && "ring-2 ring-primary"
              )}
              onClick={() => setSelectedProject(project)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">{project.name}</CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation()
                        // TODO: Edit project
                      }}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteProject(project.id)
                      }} className="text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <CardDescription className="line-clamp-2">
                  {project.description || "No description"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Badge className={cn("text-xs", PRIORITY_COLORS[project.priority])}>
                    {project.priority}
                  </Badge>
                  <Badge className={cn("text-xs", STATUS_COLORS[project.status])}>
                    {project.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Project Detail with Tasks */}
      {selectedProject && (
        <div className="mt-8">
          <div className="flex items-center gap-4 mb-4">
            <Button variant="ghost" onClick={() => setSelectedProject(null)}>
              ← Back
            </Button>
            <h2 className="text-xl font-bold">{selectedProject.name}</h2>
            <Badge className={cn(PRIORITY_COLORS[selectedProject.priority])}>
              {selectedProject.priority}
            </Badge>
          </div>

          {/* Simple Kanban - Tasks by Status */}
          {loadingTasks ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-5">
              {(["backlog", "ready", "in-progress", "review", "done"] as const).map((status) => (
                <div key={status} className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider px-2">
                    {status.replace("-", " ")} ({tasksByStatus[status].length})
                  </div>
                  <div className="space-y-2">
                    {tasksByStatus[status].map((task) => (
                      <Card key={task.id} className="p-3 cursor-pointer hover:bg-muted/50">
                        <div className="font-medium text-sm">{task.title}</div>
                        {task.description && (
                          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {task.description}
                          </div>
                        )}
                        {task.assigned_agent && (
                          <Badge variant="outline" className="mt-2 text-xs">
                            {task.assigned_agent}
                          </Badge>
                        )}
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}