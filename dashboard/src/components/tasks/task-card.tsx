"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Clock,
  MoreHorizontal,
  Tag
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"

interface TaskCardProps {
  task: {
    id: string
    title: string
    description?: string
    status: string
    priority: string
    assigned_agent?: string | null
    progress?: number
    tags?: string[]
    dueDate?: string
    subAgentStatus?: string
  }
  isOverlay?: boolean
  onEdit: () => void
  onSpawn?: () => void
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  medium: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  high: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  urgent: "bg-red-500/10 text-red-400 border-red-500/20",
}

const AGENT_ICONS: Record<string, string> = {
  "gemini-flash": "⚡",
  "claude-opus": "🧠",
  "claude-sonnet": "💭",
  "gpt-4o": "🤖",
  "kimi-k2.5": "🔮",
  "coder": "💻",
  "researcher": "🔬",
  "writer": "📝",
  "pm": "📋",
  "auto": "🎲",
  "manual": "👤"
}

export function TaskCard({ task, isOverlay, onEdit, onSpawn }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: task.id, data: { task } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isOverlay ? 50 : undefined,
    cursor: isDragging ? "grabbing" : "grab"
  }

  const tags = typeof task.tags === "string" ? JSON.parse(task.tags || "[]") : (task.tags || [])
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "done"

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "bg-card hover:bg-card/80 transition-colors border-border/50",
        isOverlay && "shadow-lg ring-2 ring-primary rotate-2 cursor-grabbing"
      )}
    >
      <CardContent className="p-3 space-y-2">
        {/* Header: Title + Menu */}
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-medium leading-tight flex-1 line-clamp-2">
            {task.title}
          </h4>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 -mr-1 -mt-1">
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit() }}>
                Edit Task
              </DropdownMenuItem>
              {onSpawn && task.status !== "done" && task.assigned_agent && task.assigned_agent !== "manual" && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSpawn() }}>
                  Run with Tiger
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Description preview */}
        {task.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {task.description}
          </p>
        )}

        {/* Progress bar */}
        {task.status === "in-progress" && (
          <Progress value={task.progress || 0} className="h-1" />
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag: string) => (
              <Badge key={tag} variant="secondary" className="text-[10px] px-1 py-0 h-4">
                <Tag className="h-2 w-2 mr-1" />
                {tag}
              </Badge>
            ))}
            {tags.length > 3 && (
              <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                +{tags.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Footer: Priority + Due Date + Agent */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5">
            {/* Priority Badge */}
            <Badge className={cn("text-[10px] px-1.5 py-0 h-5 capitalize", PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium)}>
              {task.priority}
            </Badge>

            {/* Sub-agent status */}
            {task.subAgentStatus && task.subAgentStatus !== "idle" && (
              <span className="text-xs">
                {task.subAgentStatus === "running" && <span className="text-blue-400">●</span>}
                {task.subAgentStatus === "completed" && <span className="text-emerald-400">✓</span>}
                {task.subAgentStatus === "failed" && <span className="text-red-400">✕</span>}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Due date */}
            {task.dueDate && (
              <span className={cn(
                "text-[10px] flex items-center gap-0.5",
                isOverdue ? "text-red-400" : "text-muted-foreground"
              )}>
                <Clock className="h-3 w-3" />
                {new Date(task.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            )}

            {/* Agent indicator */}
            {task.assigned_agent && (
              <span className="text-xs" title={task.assigned_agent}>
                {AGENT_ICONS[task.assigned_agent] || "🤖"}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}