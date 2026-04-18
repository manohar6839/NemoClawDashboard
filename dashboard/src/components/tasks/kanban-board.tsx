"use client"

import { useState, useEffect, useCallback } from "react"
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  defaultDropAnimationSideEffects,
  DropAnimation
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { TaskCard } from "./task-card"
import { TaskDialog } from "./task-dialog"
import { Button } from "@/components/ui/button"
import { Plus, Filter, Search, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useBridgeRequest } from "@/hooks/use-bridge"

type TaskStatus = "backlog" | "ready" | "in-progress" | "review" | "done"

interface Task {
  id: string
  project_id: string | null
  title: string
  description: string
  status: TaskStatus
  priority: string
  assigned_agent: string | null
  progress: number
  tags: string[]
  created_at: string
  updated_at: string
}

const COLUMNS: TaskStatus[] = ["backlog", "ready", "in-progress", "review", "done"]

const STATUS_LABELS: Record<TaskStatus, string> = {
  "backlog": "Backlog",
  "ready": "Ready",
  "in-progress": "In Progress",
  "review": "Review",
  "done": "Done",
}

export function KanbanBoard() {
  const { request } = useBridgeRequest()
  const [tasks, setTasks] = useState<Task[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterPriority, setFilterPriority] = useState<Set<string>>(new Set())
  const [filterAgent, setFilterAgent] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Load tasks from API
  const loadTasks = useCallback(async () => {
    setLoading(true)
    try {
      const data = await request("/api/tiger/tasks") as { ok: boolean; tasks?: Task[] }
      if (data.ok && data.tasks) {
        setTasks(data.tasks.map((t: Task) => ({
          ...t,
          tags: typeof t.tags === "string" ? JSON.parse(t.tags || "[]") : t.tags || [],
        })))
      }
    } catch (e) {
      console.error("Failed to load tasks:", e)
    } finally {
      setLoading(false)
    }
  }, [request])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  // Update task status when dragged
  const updateTaskStatus = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    setSaving(true)
    try {
      await request(`/api/tiger/tasks/${taskId}`, "POST", { status: newStatus })
      setTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, status: newStatus, updated_at: new Date().toISOString() } : t
      ))
    } catch (e) {
      console.error("Failed to update task:", e)
    } finally {
      setSaving(false)
    }
  }, [request])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const activeTask = tasks.find(t => t.id === activeId)
    if (!activeTask) return

    // If dragging over a column
    if (COLUMNS.includes(overId as TaskStatus)) {
      if (activeTask.status !== overId) {
        setTasks(prev => prev.map(t =>
          t.id === activeId ? { ...t, status: overId as TaskStatus } : t
        ))
      }
      return
    }

    // If dragging over another task
    const overTask = tasks.find(t => t.id === overId)
    if (overTask && activeTask.status !== overTask.status) {
      setTasks(prev => prev.map(t =>
        t.id === activeId ? { ...t, status: overTask.status } : t
      ))
    }
  }, [tasks])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    if (activeId === overId) return

    // Find the task and its new status
    const activeTask = tasks.find(t => t.id === activeId)
    if (!activeTask) return

    let newStatus: TaskStatus = activeTask.status

    if (COLUMNS.includes(overId as TaskStatus)) {
      newStatus = overId as TaskStatus
    } else {
      const overTask = tasks.find(t => t.id === overId)
      if (overTask) {
        newStatus = overTask.status
      }
    }

    // Persist to API
    if (newStatus !== activeTask.status) {
      updateTaskStatus(activeId, newStatus)
    }

    // Reorder within column
    setTasks(prev => {
      const oldIndex = prev.findIndex(t => t.id === activeId)
      const newIndex = prev.findIndex(t => t.id === overId)
      if (oldIndex !== -1 && newIndex !== -1) {
        return arrayMove(prev, oldIndex, newIndex)
      }
      return prev
    })
  }, [tasks, updateTaskStatus])

  const handleAddTask = useCallback(async (taskData: Partial<Task>) => {
    try {
      const result = await request("/api/tiger/tasks", "POST", {
        title: taskData.title,
        description: taskData.description,
        priority: taskData.priority || "medium",
        status: taskData.status || "backlog",
        assigned_agent: taskData.assigned_agent,
      }) as { ok: boolean; task?: Task }

      if (result.ok && result.task) {
        setTasks(prev => [result.task!, ...prev])
      }
      setIsDialogOpen(false)
    } catch (e) {
      console.error("Failed to create task:", e)
    }
  }, [request])

  const handleUpdateTask = useCallback(async (taskData: Partial<Task>) => {
    if (!editingTask) return

    try {
      const result = await request(`/api/tiger/tasks/${editingTask.id}`, "POST", taskData) as { ok: boolean; task?: Task }

      if (result.ok && result.task) {
        setTasks(prev => prev.map(t =>
          t.id === editingTask.id ? { ...result.task!, tags: typeof result.task!.tags === "string" ? JSON.parse(result.task!.tags || "[]") : result.task!.tags || [] } : t
        ))
      }
      setIsDialogOpen(false)
      setEditingTask(null)
    } catch (e) {
      console.error("Failed to update task:", e)
    }
  }, [editingTask, request])

  const handleDeleteTask = useCallback(async (taskId: string) => {
    try {
      await request(`/api/tiger/tasks/${taskId}`, "POST", { _method: "DELETE" })
      setTasks(prev => prev.filter(t => t.id !== taskId))
      setIsDialogOpen(false)
      setEditingTask(null)
    } catch (e) {
      console.error("Failed to delete task:", e)
    }
  }, [request])

  const handleEditTask = useCallback((task: Task) => {
    setEditingTask(task)
    setIsDialogOpen(true)
  }, [])

  const handleRunTask = useCallback(async (taskId: string) => {
    try {
      const result = await request(`/api/tiger/dispatch`, "POST", { taskId }) as { ok: boolean; message?: string }
      if (result.ok) {
        console.log("Task dispatched:", result.message)
      }
    } catch (e) {
      console.error("Failed to run task:", e)
    }
  }, [request])

  // Filter tasks
  const filteredTasks = tasks.filter(task => {
    if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !task.description.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }
    if (filterPriority.size > 0 && !filterPriority.has(task.priority)) {
      return false
    }
    if (filterAgent.size > 0 && (!task.assigned_agent || !filterAgent.has(task.assigned_agent))) {
      return false
    }
    return true
  })

  const activeTask = activeId ? tasks.find(t => t.id === activeId) : null

  const dropAnimation: DropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: "0.5",
        },
      },
    }),
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => {
          setEditingTask(null)
          setIsDialogOpen(true)
        }}>
          <Plus className="h-4 w-4 mr-2" />
          New Task
        </Button>

        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              Priority
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {["low", "medium", "high", "urgent"].map(priority => (
              <DropdownMenuCheckboxItem
                key={priority}
                checked={filterPriority.has(priority)}
                onCheckedChange={(checked) => {
                  const newSet = new Set(filterPriority)
                  if (checked) newSet.add(priority)
                  else newSet.delete(priority)
                  setFilterPriority(newSet)
                }}
              >
                {priority.charAt(0).toUpperCase() + priority.slice(1)}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              Agent
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {["manual", "coder", "researcher", "writer", "pm"].map(agent => (
              <DropdownMenuCheckboxItem
                key={agent}
                checked={filterAgent.has(agent)}
                onCheckedChange={(checked) => {
                  const newSet = new Set(filterAgent)
                  if (checked) newSet.add(agent)
                  else newSet.delete(agent)
                  setFilterAgent(newSet)
                }}
              >
                {agent.charAt(0).toUpperCase() + agent.slice(1)}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Saving indicator */}
      {saving && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving changes...
        </div>
      )}

      {/* Kanban Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 min-h-[500px]">
          {COLUMNS.map(status => (
            <div key={status} className="min-w-[200px]">
              <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider px-2 mb-2">
                {STATUS_LABELS[status]} ({filteredTasks.filter(t => t.status === status).length})
              </div>
              <SortableContext items={filteredTasks.filter(t => t.status === status).map(t => t.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {filteredTasks.filter(t => t.status === status).map(task => (
                    <TaskCard
                      key={task.id}
                      task={{
                        id: task.id,
                        title: task.title,
                        description: task.description,
                        status: task.status,
                        priority: task.priority,
                        assigned_agent: task.assigned_agent,
                        progress: task.progress,
                        tags: task.tags,
                      }}
                      onEdit={() => handleEditTask(task)}
                    />
                  ))}
                </div>
              </SortableContext>
            </div>
          ))}
        </div>

        <DragOverlay dropAnimation={dropAnimation}>
          {activeTask ? (
            <TaskCard
              task={{
                id: activeTask.id,
                title: activeTask.title,
                description: activeTask.description,
                status: activeTask.status,
                priority: activeTask.priority,
                assigned_agent: activeTask.assigned_agent,
                progress: activeTask.progress,
                tags: activeTask.tags,
              }}
              isOverlay
              onEdit={() => {}}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Task Dialog */}
      <TaskDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        task={editingTask ? {
          id: editingTask.id,
          title: editingTask.title,
          description: editingTask.description,
          status: editingTask.status as string,
          priority: editingTask.priority,
          assigned_agent: editingTask.assigned_agent,
          progress: editingTask.progress,
          tags: editingTask.tags,
        } : null}
        onSubmit={editingTask ? handleUpdateTask as any : handleAddTask}
        onDelete={editingTask ? () => handleDeleteTask(editingTask.id) : undefined}
        onRun={editingTask ? () => handleRunTask(editingTask.id) : undefined}
      />
    </div>
  )
}