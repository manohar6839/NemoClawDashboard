/**
 * Workspace Page — File browser for Tiger agent's workspace
 *
 * Lists files from the Tiger Bridge's workspace API and provides
 * a file viewer for reading file contents.
 */

"use client"

import * as React from "react"
import { Folder, FileText, ChevronRight, Home, ArrowLeft, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useBridgeRequest } from "@/hooks/use-bridge"
import { cn } from "@/lib/utils"

interface WorkspaceFile {
  name: string
  type: "file" | "directory"
  size?: number
  modified?: string
}

interface FileContent {
  ok: boolean
  path: string
  content: string
  size: number
}

function formatSize(bytes?: number): string {
  if (!bytes) return "—"
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase()
  const codeExts = ["ts", "tsx", "js", "jsx", "py", "sh", "json", "md", "yaml", "yml", "toml"]
  if (ext && codeExts.includes(ext)) return "code"
  if (ext === "md") return "markdown"
  return "text"
}

export default function WorkspacePage() {
  const { request, loading } = useBridgeRequest()
  const [currentPath, setCurrentPath] = React.useState("")
  const [files, setFiles] = React.useState<WorkspaceFile[]>([])
  const [selectedFile, setSelectedFile] = React.useState<string | null>(null)
  const [fileContent, setFileContent] = React.useState<FileContent | null>(null)
  const [loadingFiles, setLoadingFiles] = React.useState(false)
  const [loadingContent, setLoadingContent] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Load directory contents
  const loadDirectory = React.useCallback(async (path: string) => {
    setLoadingFiles(true)
    setError(null)
    try {
      const url = path ? `/api/tiger/workspace?path=${encodeURIComponent(path)}` : "/api/tiger/workspace"
      const data = await request(url) as { ok: boolean; files?: WorkspaceFile[] }
      if (data.ok && data.files) {
        setFiles(data.files)
        setCurrentPath(path)
      } else {
        setError("Failed to load directory")
      }
    } catch (e: unknown) {
      setError("Failed to load workspace")
    } finally {
      setLoadingFiles(false)
    }
  }, [request])

  // Load file content
  const loadFile = React.useCallback(async (filename: string) => {
    setLoadingContent(true)
    setSelectedFile(filename)
    try {
      // Need full path including current directory
      const fullPath = currentPath ? `${currentPath}/${filename}` : filename
      const url = `/api/tiger/workspace?path=${encodeURIComponent(fullPath)}&read=true`
      const data = await request(url) as FileContent
      setFileContent(data)
    } catch (e: unknown) {
      setFileContent({ ok: false, path: filename, content: "Failed to load file", size: 0 })
    } finally {
      setLoadingContent(false)
    }
  }, [request, currentPath])

  // Initial load
  React.useEffect(() => {
    loadDirectory("")
  }, [loadDirectory])

  const navigateTo = (path: string) => {
    setSelectedFile(null)
    setFileContent(null)
    loadDirectory(path)
  }

  // Build breadcrumb path
  const breadcrumbs = currentPath ? currentPath.split("/").filter(Boolean) : []

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Workspace</h1>
          <p className="text-sm text-muted-foreground">
            Browse files in Tiger's workspace
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigateTo("")}
          disabled={!currentPath}
        >
          <Home className="h-4 w-4 mr-2" />
          Root
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      <div className="flex-1 grid grid-cols-3 gap-4 min-h-0">
        {/* File List */}
        <Card className="col-span-1 bg-card/40 flex flex-col min-h-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Files</CardTitle>
            {/* Breadcrumb */}
            {breadcrumbs.length > 0 && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <button onClick={() => navigateTo("")} className="hover:text-foreground">root</button>
                {breadcrumbs.map((crumb, i) => (
                  <React.Fragment key={i}>
                    <ChevronRight className="h-3 w-3" />
                    <button onClick={() => navigateTo(breadcrumbs.slice(0, i + 1).join("/"))} className="hover:text-foreground">
                      {crumb}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            {loadingFiles ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : files.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">No files</div>
            ) : (
              <div className="space-y-1">
                {/* Parent directory */}
                {currentPath && (
                  <button
                    onClick={() => navigateTo(breadcrumbs.slice(0, -1).join("/"))}
                    className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-muted text-left"
                  >
                    <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">..</span>
                  </button>
                )}
                {files.map((file) => (
                  <button
                    key={file.name}
                    onClick={() => file.type === "directory" ? navigateTo(currentPath ? `${currentPath}/${file.name}` : file.name) : loadFile(file.name)}
                    className={cn(
                      "w-full flex items-center gap-2 p-2 rounded-md hover:bg-muted text-left",
                      selectedFile === file.name && "bg-muted"
                    )}
                  >
                    {file.type === "directory" ? (
                      <Folder className="h-4 w-4 text-amber-400" />
                    ) : (
                      <FileText className={cn(
                        "h-4 w-4",
                        getFileIcon(file.name) === "code" ? "text-blue-400" :
                        getFileIcon(file.name) === "markdown" ? "text-purple-400" :
                        "text-muted-foreground"
                      )} />
                    )}
                    <span className="text-sm truncate flex-1">{file.name}</span>
                    {file.size && <span className="text-xs text-muted-foreground">{formatSize(file.size)}</span>}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* File Viewer */}
        <Card className="col-span-2 bg-card/40 flex flex-col min-h-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {selectedFile || "Select a file to view"}
            </CardTitle>
            {fileContent && (
              <div className="text-xs text-muted-foreground">
                {formatSize(fileContent.size)}
              </div>
            )}
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            {loadingContent ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !selectedFile ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                Click a file to view its contents
              </div>
            ) : fileContent ? (
              <pre className={cn(
                "text-xs font-mono whitespace-pre-wrap break-all p-3 rounded-md border",
                fileContent.ok ? "bg-background/50" : "bg-destructive/10 border-destructive"
              )}>
                {fileContent.content}
              </pre>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}