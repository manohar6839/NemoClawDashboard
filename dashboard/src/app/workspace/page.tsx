/**
 * workspace/page.tsx — Per-agent file browser with preview
 *
 * Layout:
 *   Agent chip row (top)
 *   Tabs: [Files] [Activity]
 *     Files: split-pane — file tree (left) + file preview (right)
 *     Activity: recent cross-agent changes feed
 */

"use client"

import * as React from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AgentChipRow, AgentInfo } from "@/components/workspace/agent-chip-row"
import { FileTree, FileItem } from "@/components/workspace/file-tree"
import { FilePreview } from "@/components/workspace/file-preview"
import { ActivityFeed, ActivityEvent } from "@/components/workspace/activity-feed"

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileContent {
  ok: boolean
  path: string
  content: string
  encoding: "utf8" | "base64"
  size: number
  mime: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  // Agent list
  const [agents, setAgents] = React.useState<AgentInfo[]>([])
  const [agentsLoading, setAgentsLoading] = React.useState(true)

  // Active agent selection (null = "All" → show Tiger/main)
  const [activeAgentId, setActiveAgentId] = React.useState<string | null>(null)

  // File tree state
  const [treeItems, setTreeItems] = React.useState<FileItem[]>([])
  const [currentPath, setCurrentPath] = React.useState("")
  const [treeLoading, setTreeLoading] = React.useState(false)

  // File preview state
  const [selectedFile, setSelectedFile] = React.useState<string | null>(null)
  const [fileContent, setFileContent] = React.useState<FileContent | null>(null)
  const [previewLoading, setPreviewLoading] = React.useState(false)

  // Activity feed
  const [activityEvents, setActivityEvents] = React.useState<ActivityEvent[]>([])
  const [activityLoading, setActivityLoading] = React.useState(false)

  // ── Load agents on mount ──────────────────────────────────────────────────
  React.useEffect(() => {
    setAgentsLoading(true)
    apiFetch<{ ok: boolean; agents: AgentInfo[] }>("/api/tiger/agents")
      .then((data) => { if (data.ok) setAgents(data.agents) })
      .catch(console.error)
      .finally(() => setAgentsLoading(false))
  }, [])

  // Derived: the "effective" agent to browse
  // "All" defaults to showing the orchestrator (main/Tiger)
  const effectiveAgentId = activeAgentId ?? "main"

  // ── Load file tree when agent or path changes ─────────────────────────────
  const loadTree = React.useCallback((agentId: string, path: string) => {
    setTreeLoading(true)
    setSelectedFile(null)
    setFileContent(null)
    const url = path
      ? `/api/tiger/agents/${agentId}/files?path=${encodeURIComponent(path)}`
      : `/api/tiger/agents/${agentId}/files`
    apiFetch<{ ok: boolean; items: FileItem[] }>(url)
      .then((data) => { if (data.ok) setTreeItems(data.items) })
      .catch(console.error)
      .finally(() => setTreeLoading(false))
  }, [])

  React.useEffect(() => {
    loadTree(effectiveAgentId, currentPath)
  }, [effectiveAgentId, currentPath, loadTree])

  // Reset path when agent changes
  const handleAgentChange = (id: string | null) => {
    setActiveAgentId(id)
    setCurrentPath("")
    setSelectedFile(null)
    setFileContent(null)
  }

  // ── Navigate into a directory ─────────────────────────────────────────────
  const handleNavigate = (path: string) => {
    setCurrentPath(path)
  }

  // ── Load file content on selection ───────────────────────────────────────
  const handleSelectFile = React.useCallback((filePath: string) => {
    setSelectedFile(filePath)
    setPreviewLoading(true)
    const url = `/api/tiger/agents/${effectiveAgentId}/file?path=${encodeURIComponent(filePath)}`
    apiFetch<FileContent>(url)
      .then((data) => setFileContent(data))
      .catch(console.error)
      .finally(() => setPreviewLoading(false))
  }, [effectiveAgentId])

  // ── Load activity feed ────────────────────────────────────────────────────
  const loadActivity = React.useCallback(() => {
    setActivityLoading(true)
    apiFetch<{ ok: boolean; events: ActivityEvent[] }>("/api/tiger/activity?limit=50")
      .then((data) => { if (data.ok) setActivityEvents(data.events) })
      .catch(console.error)
      .finally(() => setActivityLoading(false))
  }, [])

  // Recently active agent ids (activity within last hour) for badge highlighting
  const recentIds = React.useMemo(() => {
    const cutoff = Date.now() - 60 * 60 * 1000
    return new Set(activityEvents.filter((e) => e.ts > cutoff).map((e) => e.agentId))
  }, [activityEvents])

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] gap-3 p-4">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Workspace</h1>
        <p className="text-sm text-muted-foreground">Browse agent files and recent activity</p>
      </div>

      {/* Agent chip row */}
      <AgentChipRow
        agents={agents}
        activeId={activeAgentId}
        onChange={handleAgentChange}
        recentIds={recentIds}
      />

      {/* Tabs: Files | Activity */}
      <Tabs
        defaultValue="files"
        className="flex-1 flex flex-col min-h-0"
        onValueChange={(v) => { if (v === "activity") loadActivity() }}
      >
        <TabsList className="self-start">
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {/* ── Files tab ─────────────────────────────────────────────────── */}
        <TabsContent value="files" className="flex-1 flex min-h-0 mt-2">
          <div className="flex-1 grid grid-cols-1 md:grid-cols-[280px_1fr] gap-3 min-h-0">
            {/* File tree panel */}
            <div className="border rounded-lg bg-card/40 flex flex-col min-h-0 overflow-hidden">
              <div className="px-3 py-2 border-b shrink-0">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {agents.find((a) => a.id === effectiveAgentId)?.emoji}{" "}
                  {agents.find((a) => a.id === effectiveAgentId)?.name ?? "Tiger"}
                </span>
              </div>
              <ScrollArea className="flex-1 p-2">
                <FileTree
                  items={treeItems}
                  currentPath={currentPath}
                  selectedFile={selectedFile}
                  onNavigate={handleNavigate}
                  onSelectFile={handleSelectFile}
                  loading={treeLoading}
                />
              </ScrollArea>
            </div>

            {/* Preview panel */}
            <div className="border rounded-lg bg-card/40 flex flex-col min-h-0 overflow-hidden">
              <FilePreview
                path={selectedFile}
                content={fileContent?.content ?? null}
                encoding={fileContent?.encoding ?? null}
                mime={fileContent?.mime ?? null}
                size={fileContent?.size ?? 0}
                loading={previewLoading}
                agentId={effectiveAgentId}
                onSaved={(_p, newContent) => {
                  // Update cached content so the view reflects the save immediately
                  setFileContent((prev) => prev ? { ...prev, content: newContent } : prev)
                }}
              />
            </div>
          </div>
        </TabsContent>

        {/* ── Activity tab ──────────────────────────────────────────────── */}
        <TabsContent value="activity" className="flex-1 min-h-0 mt-2">
          <div className="border rounded-lg bg-card/40 h-full overflow-hidden">
            <div className="px-3 py-2 border-b">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Recent changes — all agents
              </span>
            </div>
            <ScrollArea className="h-[calc(100%-2.5rem)]">
              <div className="p-2">
                <ActivityFeed events={activityEvents} loading={activityLoading} />
              </div>
            </ScrollArea>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
