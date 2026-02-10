"use client"

import * as React from "react"
import { Clock, Plus, Save, Trash2, Search, Play, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useGatewayRequest } from "@/hooks/use-gateway"

interface CronJob {
  id: string
  name: string
  schedule: string
  command: string
  description: string
  enabled: boolean
}

export default function CronPage() {
  const { request } = useGatewayRequest()
  const [jobs, setJobs] = React.useState<CronJob[]>([])
  const [selectedJobId, setSelectedJobId] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [isCreating, setIsCreating] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [runningJobId, setRunningJobId] = React.useState<string | null>(null)

  const loadJobs = React.useCallback(async () => {
    try {
      const data = await request("cron.list") as CronJob[] | { jobs: CronJob[] }
      const list = Array.isArray(data) ? data : (data as { jobs: CronJob[] })?.jobs || []
      setJobs(list)
    } catch {
      // Fall back to local API
      try {
        const res = await fetch("/api/cron")
        const data = await res.json()
        setJobs(data.jobs || [])
      } catch { /* ignore */ }
    } finally {
      setLoading(false)
    }
  }, [request])

  React.useEffect(() => { loadJobs() }, [loadJobs])

  const selectedJob = jobs.find(j => j.id === selectedJobId)

  const handleRunNow = async (jobId: string) => {
    setRunningJobId(jobId)
    try {
      await request("cron.run", { id: jobId })
    } catch (e) {
      console.error("Failed to run job:", e)
    } finally {
      setRunningJobId(null)
    }
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cron Jobs</h1>
          <p className="text-muted-foreground">Manage scheduled tasks via gateway.</p>
        </div>
        <Button onClick={() => { setSelectedJobId(null); setIsCreating(true) }}>
          <Plus className="mr-2 h-4 w-4" /> New Job
        </Button>
      </div>

      <div className="flex flex-1 min-h-0 items-stretch border rounded-lg overflow-hidden">
        {/* Left Panel */}
        <div className="w-[300px] flex-none border-r bg-muted/10 flex flex-col min-h-0">
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search jobs..." className="pl-8 bg-background" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="flex flex-col gap-2 p-4">
              <div className="text-xs font-semibold text-muted-foreground mb-2">
                SCHEDULED TASKS ({jobs.length})
              </div>
              {loading && <Loader2 className="h-5 w-5 animate-spin mx-auto mt-4" />}
              {jobs.filter(j => j.name.toLowerCase().includes(search.toLowerCase())).map(job => (
                <button
                  key={job.id}
                  className={cn(
                    "flex flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm transition-all hover:bg-accent",
                    selectedJobId === job.id && !isCreating && "bg-accent border-primary"
                  )}
                  onClick={() => { setSelectedJobId(job.id); setIsCreating(false) }}
                >
                  <div className="flex w-full flex-col gap-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <Clock className="h-4 w-4 shrink-0" />
                        <div className="font-semibold truncate">{job.name}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          className="p-1 hover:bg-muted rounded"
                          title="Run now"
                          onClick={(e) => { e.stopPropagation(); handleRunNow(job.id) }}
                        >
                          {runningJobId === job.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                        </button>
                        {job.enabled && <span className="flex h-2 w-2 rounded-full bg-green-500 shrink-0" />}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono truncate">{job.schedule}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="flex-1 min-w-0 bg-background flex flex-col">
          {selectedJob || isCreating ? (
            <CronEditor key={selectedJobId || "new"} job={selectedJob} isNew={isCreating} onSave={() => { loadJobs(); setIsCreating(false) }} />
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center text-muted-foreground">
              <div>
                <Clock className="mx-auto h-12 w-12 opacity-50 mb-4" />
                <h3 className="text-lg font-semibold">No Job Selected</h3>
                <p>Select a job to edit or create a new one.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CronEditor({ job, isNew, onSave }: { job?: CronJob; isNew: boolean; onSave: () => void }) {
  const { request } = useGatewayRequest()
  const [formData, setFormData] = React.useState<Partial<CronJob>>(
    job || { name: "", schedule: "0 * * * *", command: "", description: "", enabled: true }
  )
  const [saving, setSaving] = React.useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (isNew) {
        await request("cron.add", formData)
      } else {
        await request("cron.update", { id: job?.id, ...formData })
      }
      onSave()
    } catch {
      // Fall back to local API
      try {
        const url = isNew ? "/api/cron" : `/api/cron/${job?.id}`
        await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(formData) })
        onSave()
      } catch (e) { console.error(e) }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm("Delete this job?")) return
    setSaving(true)
    try {
      await request("cron.remove", { id: job?.id })
      onSave()
    } catch {
      try {
        await fetch(`/api/cron/${job?.id}`, { method: "DELETE" })
        onSave()
      } catch (e) { console.error(e) }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full flex flex-col min-w-0 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b bg-muted/40 h-[52px]">
        <h2 className="font-semibold">{isNew ? "Create New Job" : "Edit Job"}</h2>
        {!isNew && (
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={saving}>
            <Trash2 className="h-4 w-4 mr-2" /> Delete
          </Button>
        )}
      </div>
      <ScrollArea className="flex-1">
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-w-2xl">
          <div className="space-y-2">
            <Label htmlFor="name">Job Name</Label>
            <Input id="name" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Morning Briefing" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="schedule">Schedule (Cron)</Label>
              <Input id="schedule" value={formData.schedule} onChange={e => setFormData({ ...formData, schedule: e.target.value })} placeholder="0 9 * * *" className="font-mono" required />
            </div>
            <div className="space-y-2 flex flex-col justify-end pb-2">
              <div className="text-xs text-muted-foreground">Format: min hour day month day-of-week</div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="command">Command / Skill</Label>
            <Input id="command" value={formData.command} onChange={e => setFormData({ ...formData, command: e.target.value })} placeholder="skill:name or system:command" className="font-mono" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="What does this job do?" />
          </div>
          <div className="flex items-center space-x-2">
            <Switch id="enabled" checked={formData.enabled} onCheckedChange={checked => setFormData({ ...formData, enabled: checked })} />
            <Label htmlFor="enabled">Enable this job</Label>
          </div>
          <div className="pt-4">
            <Button type="submit" disabled={saving}>
              <Save className="mr-2 h-4 w-4" /> {saving ? "Saving..." : "Save Job"}
            </Button>
          </div>
        </form>
      </ScrollArea>
    </div>
  )
}
