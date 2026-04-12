/**
 * output-viewer.tsx — Rich file viewer for task outputs
 *
 * Renders different file types appropriately:
 * - Markdown: rendered with react-markdown
 * - Code: syntax highlighted with prism-react-renderer
 * - JSON: collapsible tree view
 * - HTML: sandboxed iframe
 * - Plain text: preformatted block
 * - Binary: download link
 */

"use client"

import * as React from "react"
import { Download, FileText, Code, FileJson, Image as ImageIcon, File } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface OutputViewerProps {
  filename: string
  fileType: string
  content: string
  filePath?: string
  size?: number
}

function getFileCategory(filename: string, fileType: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || ""
  const type = fileType.toLowerCase()

  if (type.includes("markdown") || ext === "md") return "markdown"
  if (type.includes("html") || ext === "html" || ext === "htm") return "html"
  if (type.includes("json") || ext === "json") return "json"
  if (["js", "ts", "jsx", "tsx", "py", "sh", "bash", "go", "rs", "java"].includes(ext)) return "code"
  if (type.includes("image")) return "image"
  if (type.includes("pdf")) return "pdf"
  if (type.includes("text") || type === "application/octet-stream") return "text"

  return "unknown"
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Simple JSON tree component
function JsonTree({ data, depth = 0 }: { data: unknown; depth?: number }) {
  const [collapsed, setCollapsed] = React.useState(false)

  if (depth > 5) return <span>{JSON.stringify(data)}</span>

  if (data === null) return <span className="text-yellow-400">null</span>
  if (data === undefined) return <span className="text-gray-400">undefined</span>

  if (typeof data === "boolean") {
    return <span className={data ? "text-green-400" : "text-red-400"}>{String(data)}</span>
  }

  if (typeof data === "number") {
    return <span className="text-blue-400">{data}</span>
  }

  if (typeof data === "string") {
    return <span className="text-green-300">"{data}"</span>
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return <span>[]</span>
    return (
      <span>
        <button onClick={() => setCollapsed(!collapsed)} className="hover:text-foreground">
          [{collapsed ? `...${data.length} items]` : ""}
        </button>
        {!collapsed && (
          <span className="ml-2">
            {data.map((item, i) => (
              <div key={i} className="ml-4">
                <JsonTree data={item} depth={depth + 1} />
              </div>
            ))}
          </span>
        )}
      </span>
    )
  }

  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>)
    if (entries.length === 0) return <span>{"{}"}</span>
    return (
      <span>
        <button onClick={() => setCollapsed(!collapsed)} className="hover:text-foreground">
          {"{"}{collapsed ? `...${entries.length} keys}` : ""}
        </button>
        {!collapsed && (
          <span className="ml-2">
            {entries.map(([key, value]) => (
              <div key={key} className="ml-4">
                <span className="text-blue-300">{key}</span>
                <span className="text-muted-foreground">: </span>
                <JsonTree data={value} depth={depth + 1} />
              </div>
            ))}
          </span>
        )}
      </span>
    )
  }

  return <span>{String(data)}</span>
}

export function OutputViewer({ filename, fileType, content, filePath, size }: OutputViewerProps) {
  const category = getFileCategory(filename, fileType)

  return (
    <Card className="bg-card/50">
      <CardContent className="p-4">
        {/* File header */}
        <div className="flex items-center justify-between mb-4 pb-2 border-b">
          <div className="flex items-center gap-2">
            {category === "markdown" && <FileText className="h-4 w-4 text-purple-400" />}
            {category === "code" && <Code className="h-4 w-4 text-blue-400" />}
            {category === "json" && <FileJson className="h-4 w-4 text-amber-400" />}
            {category === "html" && <FileText className="h-4 w-4 text-orange-400" />}
            {category === "image" && <ImageIcon className="h-4 w-4 text-green-400" />}
            {category === "text" && <FileText className="h-4 w-4 text-muted-foreground" />}
            {category === "unknown" && <File className="h-4 w-4 text-muted-foreground" />}

            <span className="font-medium text-sm">{filename}</span>
            {size && <span className="text-xs text-muted-foreground">({formatSize(size)})</span>}
          </div>

          {filePath && (
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/tiger/files?path=${encodeURIComponent(filePath)}`} download>
                <Download className="h-4 w-4 mr-2" />
                Download
              </a>
            </Button>
          )}
        </div>

        {/* Content based on category */}
        <div className="max-h-[500px] overflow-auto">
          {category === "json" && (
            <pre className="text-xs font-mono bg-muted/50 p-3 rounded-md overflow-x-auto">
              <JsonTree data={(() => { try { return JSON.parse(content) } catch { return content } })()} />
            </pre>
          )}

          {category === "code" && (
            <pre className="text-xs font-mono bg-muted/50 p-3 rounded-md overflow-x-auto whitespace-pre-wrap break-all">
              {content}
            </pre>
          )}

          {category === "text" && (
            <pre className="text-xs font-mono bg-muted/50 p-3 rounded-md whitespace-pre-wrap break-all">
              {content}
            </pre>
          )}

          {category === "markdown" && (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <pre className="text-sm whitespace-pre-wrap">{content}</pre>
            </div>
          )}

          {category === "html" && (
            <iframe
              srcDoc={content}
              className="w-full h-[400px] border rounded-md"
              sandbox="allow-scripts"
              title={filename}
            />
          )}

          {category === "image" && (
            <div className="flex justify-center">
              <img
                src={`data:${fileType};base64,${content}`}
                alt={filename}
                className="max-w-full h-auto rounded-md"
              />
            </div>
          )}

          {category === "unknown" && (
            <div className="text-center py-8 text-muted-foreground">
              <File className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Cannot preview this file type</p>
              <p className="text-xs">{fileType}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Multi-file viewer with button tabs
interface MultiOutputViewerProps {
  outputs: Array<{
    id: string
    filename: string
    file_type: string
    file_path: string
    size_bytes: number
    content?: string
  }>
}

export function MultiOutputViewer({ outputs }: MultiOutputViewerProps) {
  const [selected, setSelected] = React.useState(0)

  if (outputs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <File className="h-12 w-12 mx-auto mb-2 opacity-30" />
        <p>No outputs to display</p>
      </div>
    )
  }

  if (outputs.length === 1) {
    return (
      <OutputViewer
        filename={outputs[0].filename}
        fileType={outputs[0].file_type}
        content={outputs[0].content || ""}
        filePath={outputs[0].file_path}
        size={outputs[0].size_bytes}
      />
    )
  }

  return (
    <div>
      {/* Simple tab buttons */}
      <div className="flex gap-1 mb-2 flex-wrap">
        {outputs.map((output, i) => (
          <Button
            key={output.id}
            variant={selected === i ? "default" : "outline"}
            size="sm"
            onClick={() => setSelected(i)}
            className="text-xs"
          >
            {output.filename}
          </Button>
        ))}
      </div>
      <OutputViewer
        filename={outputs[selected].filename}
        fileType={outputs[selected].file_type}
        content={outputs[selected].content || ""}
        filePath={outputs[selected].file_path}
        size={outputs[selected].size_bytes}
      />
    </div>
  )
}