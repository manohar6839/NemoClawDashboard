"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { X, Plus, Trash2, Play } from "lucide-react"
import { cn } from "@/lib/utils"

interface TaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: {
    id?: string
    title: string
    description?: string
    status: string
    priority: string
    assigned_agent?: string | null
    progress?: number
    tags?: string[]
    due_date?: string
    notes?: string
  } | null
  onSubmit: (data: {
    title: string
    description?: string
    status?: string
    priority?: string
    assigned_agent?: string | null
    progress?: number
    tags?: string[]
    due_date?: string
    notes?: string
  }) => void
  onDelete?: () => void
  onRun?: () => void
}

const STATUS_OPTIONS = [
  { value: "backlog", label: "Backlog" },
  { value: "ready", label: "Ready" },
  { value: "in-progress", label: "In Progress" },
  { value: "review", label: "Review" },
  { value: "done", label: "Done" },
]

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
]

const AGENT_OPTIONS = [
  { value: "manual", label: "Manual (unassigned)" },
  { value: "coder", label: "Coder" },
  { value: "researcher", label: "Researcher" },
  { value: "writer", label: "Writer" },
  { value: "pm", label: "Project Manager" },
]

export function TaskDialog({ open, onOpenChange, task, onSubmit, onDelete, onRun }: TaskDialogProps) {
  const isEditing = !!task?.id

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState("backlog")
  const [priority, setPriority] = useState("medium")
  const [assignedAgent, setAssignedAgent] = useState("manual")
  const [dueDate, setDueDate] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState("")
  const [progress, setProgress] = useState(0)
  const [notes, setNotes] = useState("")

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (task) {
        setTitle(task.title || "")
        setDescription(task.description || "")
        setStatus(task.status || "backlog")
        setPriority(task.priority || "medium")
        setAssignedAgent(task.assigned_agent || "manual")
        setDueDate(task.due_date ? task.due_date.split("T")[0] : "")
        setTags(typeof task.tags === "string" ? JSON.parse(task.tags || "[]") : (task.tags || []))
        setProgress(task.progress || 0)
        setNotes(task.notes || "")
      } else {
        setTitle("")
        setDescription("")
        setStatus("backlog")
        setPriority("medium")
        setAssignedAgent("manual")
        setDueDate("")
        setTags([])
        setNewTag("")
        setProgress(0)
        setNotes("")
      }
    }
  }, [open, task])

  const handleSubmit = () => {
    if (!title.trim()) return

    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      status,
      priority,
      assigned_agent: assignedAgent !== "manual" ? assignedAgent : undefined,
      progress,
      tags,
      due_date: dueDate || undefined,
      notes: notes.trim() || undefined,
    })
  }

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()])
      setNewTag("")
    }
  }

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Task" : "Create New Task"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update task details and progress" : "Add a new task to your board"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="Task title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe the task..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {/* Status & Priority Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Assigned Agent */}
          <div className="space-y-2">
            <Label>Assign To</Label>
            <Select value={assignedAgent} onValueChange={(v) => setAssignedAgent(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGENT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Select an AI agent to delegate this task to, or keep it manual.
            </p>
          </div>

          {/* Due Date & Progress */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Progress</Label>
              <div className="flex items-center gap-2">
                <Progress value={progress} className="flex-1" />
                <span className="text-sm text-muted-foreground w-10">{progress}%</span>
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add tag..."
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addTag()
                  }
                }}
              />
              <Button type="button" variant="outline" size="icon" onClick={addTag}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {tags.map(tag => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <button onClick={() => removeTag(tag)} className="hover:text-red-400">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Additional notes, sub-tasks, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          {isEditing && onDelete && (
            <Button variant="destructive" onClick={onDelete} className="mr-auto">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          )}
          {isEditing && onRun && (
            <Button variant="outline" onClick={onRun} className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
              <Play className="h-4 w-4 mr-2" />
              Run with Tiger
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!title.trim()}>
            {isEditing ? "Save Changes" : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}