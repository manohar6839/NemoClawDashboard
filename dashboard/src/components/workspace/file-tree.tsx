"use client"
/**
 * file-tree.tsx — collapsible file/directory tree for one agent
 */

import * as React from "react"
import { Folder, FolderOpen, FileText, FileCode, ChevronRight, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export interface FileItem {
  name: string
  type: "file" | "dir"
  size: number
  modifiedAt: number
}

interface Props {
  items: FileItem[]
  currentPath: string          // relative path being shown (e.g. "deliverables")
  selectedFile: string | null  // full relative path of selected file
  onNavigate: (path: string) => void   // navigate into a dir
  onSelectFile: (path: string) => void // select a file for preview
  loading?: boolean
}

// Extension → colour class mapping
function fileColour(name: string) {
  const ext = name.split(".").pop()?.toLowerCase()
  if (["ts", "tsx", "js", "jsx", "py", "sh"].includes(ext ?? "")) return "text-blue-400"
  if (["md", "txt"].includes(ext ?? "")) return "text-purple-400"
  if (["html", "htm"].includes(ext ?? "")) return "text-orange-400"
  if (["json", "yaml", "yml", "toml"].includes(ext ?? "")) return "text-green-400"
  return "text-muted-foreground"
}

function FileIcon({ name, className }: { name: string; className?: string }) {
  const ext = name.split(".").pop()?.toLowerCase()
  const isCode = ["ts", "tsx", "js", "jsx", "py", "sh", "json", "yaml", "yml", "html", "toml"].includes(ext ?? "")
  return isCode
    ? <FileCode className={cn("h-4 w-4 shrink-0", className)} />
    : <FileText className={cn("h-4 w-4 shrink-0", className)} />
}

function formatSize(bytes: number) {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export function FileTree({ items, currentPath, selectedFile, onNavigate, onSelectFile, loading }: Props) {
  // Split items into dirs first, then files — both sorted alphabetically
  const dirs = items.filter((i) => i.type === "dir").sort((a, b) => a.name.localeCompare(b.name))
  const files = items.filter((i) => i.type === "file").sort((a, b) => a.name.localeCompare(b.name))
  const sorted = [...dirs, ...files]

  // Breadcrumb segments from currentPath
  const crumbs = currentPath ? currentPath.split("/").filter(Boolean) : []

  if (loading) {
    return (
      <div className="space-y-1 p-1">
        {[1,2,3,4].map((i) => (
          <div key={i} className="h-8 rounded-md bg-muted/40 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Breadcrumb nav */}
      {crumbs.length > 0 && (
        <div className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground flex-wrap">
          <button onClick={() => onNavigate("")} className="hover:text-foreground transition-colors">
            root
          </button>
          {crumbs.map((crumb, i) => (
            <React.Fragment key={i}>
              <ChevronRight className="h-3 w-3" />
              <button
                onClick={() => onNavigate(crumbs.slice(0, i + 1).join("/"))}
                className="hover:text-foreground transition-colors"
              >
                {crumb}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {sorted.length === 0 && (
        <div className="text-xs text-muted-foreground text-center py-6">Empty directory</div>
      )}

      {sorted.map((item) => {
        const itemFullPath = currentPath ? `${currentPath}/${item.name}` : item.name
        const isSelected = selectedFile === itemFullPath
        return (
          <button
            key={item.name}
            onClick={() =>
              item.type === "dir" ? onNavigate(itemFullPath) : onSelectFile(itemFullPath)
            }
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors",
              isSelected ? "bg-primary/15 text-foreground" : "hover:bg-muted/60",
            )}
          >
            {item.type === "dir" ? (
              <Folder className="h-4 w-4 shrink-0 text-amber-400" />
            ) : (
              <FileIcon name={item.name} className={fileColour(item.name)} />
            )}
            <span className="truncate flex-1">{item.name}</span>
            {item.type === "file" && item.size > 0 && (
              <span className="text-xs text-muted-foreground shrink-0">{formatSize(item.size)}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
