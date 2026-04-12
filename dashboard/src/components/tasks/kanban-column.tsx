"use client"

import { useDroppable } from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy
} from "@dnd-kit/sortable"
import { Task, TaskStatus, STATUS_COLORS } from "@/lib/tasks"
import { TaskCard } from "./task-card"
import { cn } from "@/lib/utils"

interface KanbanColumnProps {
  status: TaskStatus
  title: string
  tasks: Task[]
  onEditTask: (task: Task) => void
  onSpawnSubAgent: (taskId: string, agentType: string) => void
}

export function KanbanColumn({ status, title, tasks, onEditTask, onSpawnSubAgent }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-shrink-0 w-72 rounded-lg border transition-colors",
        isOver ? "bg-muted/50 border-primary/50" : "bg-card/30 border-border"
      )}
    >
      {/* Column Header */}
      <div className={cn(
        "p-3 border-b rounded-t-lg flex items-center justify-between",
        STATUS_COLORS[status]
      )}>
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{title}</span>
          <span className="text-xs bg-background/50 px-2 py-0.5 rounded-full">
            {tasks.length}
          </span>
        </div>
      </div>

      {/* Column Content */}
      <SortableContext
        items={tasks.map(t => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="p-2 space-y-2 min-h-[100px]">
          {tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={() => onEditTask(task)}
              onSpawn={() => onSpawnSubAgent(task.id, task.assignedAgent || "auto")}
            />
          ))}
          {tasks.length === 0 && (
            <div className="text-center py-8 text-xs text-muted-foreground">
              Drop tasks here
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  )
}
