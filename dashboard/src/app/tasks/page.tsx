import { KanbanBoard } from "@/components/tasks/kanban-board"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { CheckSquare, GitBranch, Bot, Clock } from "lucide-react"

export default function TasksPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CheckSquare className="h-6 w-6 text-primary" />
            Task Progress
          </h1>
          <p className="text-muted-foreground">
            Manage and track tasks across your team and AI sub-agents
          </p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-card/40">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Tasks</p>
                <p className="text-2xl font-bold">—</p>
              </div>
              <Clock className="h-5 w-5 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/40">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">In Progress</p>
                <p className="text-2xl font-bold">—</p>
              </div>
              <GitBranch className="h-5 w-5 text-amber-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/40">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">AI Delegated</p>
                <p className="text-2xl font-bold">—</p>
              </div>
              <Bot className="h-5 w-5 text-violet-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/40">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed Today</p>
                <p className="text-2xl font-bold">—</p>
              </div>
              <CheckSquare className="h-5 w-5 text-emerald-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Kanban Board */}
      <Card className="bg-card/40">
        <CardHeader>
          <CardTitle>Task Board</CardTitle>
          <CardDescription>
            Drag and drop tasks between columns. Click a task to edit or assign to an AI agent.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KanbanBoard />
        </CardContent>
      </Card>
    </div>
  )
}
