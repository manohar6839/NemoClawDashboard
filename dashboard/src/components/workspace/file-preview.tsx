"use client"
/**
 * file-preview.tsx — Multi-mode file viewer/editor
 *
 * Mode is derived from file extension + mime type:
 *
 *  EDIT_SAVE  .md .txt              → textarea editor, Save/Cancel in toolbar
 *  HTML_RENDER .html .htm           → sandboxed <iframe srcdoc>, "View Source" toggle
 *  CODE_VIEW  .ts .tsx .js .jsx     → read-only <pre> with token colouring
 *             .py .sh .json .yaml
 *             .yml .toml .css .xml
 *  IMAGE      image/*               → <img> from base64 data-URI
 *  BINARY     everything else       → "Download" only, no content shown
 */

import * as React from "react"
import ReactMarkdown from "react-markdown"
import {
  Download, Edit3, Save, X, Code, Eye, Loader2, AlertCircle
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  agentId: string | null
  path: string | null
  content: string | null
  encoding: "utf8" | "base64" | null
  mime: string | null
  size: number
  loading?: boolean
  /** Called after a successful save so the parent can refresh if needed */
  onSaved?: (path: string, newContent: string) => void
}

type ViewMode = "edit_save" | "html_render" | "code_view" | "image" | "binary"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectMode(path: string | null, mime: string | null): ViewMode {
  const ext = path?.split(".").pop()?.toLowerCase() ?? ""
  if (["md", "txt"].includes(ext)) return "edit_save"
  if (["html", "htm"].includes(ext)) return "html_render"
  if (
    ["ts", "tsx", "js", "jsx", "py", "sh", "json", "yaml", "yml",
     "toml", "css", "xml", "env", "conf", "ini", "sql", "rs", "go",
     "java", "c", "cpp", "h"].includes(ext)
  ) return "code_view"
  if (mime?.startsWith("image/")) return "image"
  if (mime?.startsWith("text/") || mime?.includes("json") || mime?.includes("xml")) return "code_view"
  return "binary"
}

function formatSize(bytes: number) {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

/** Very lightweight syntax token colouring — no deps, pure CSS classes via regex spans */
function tokenise(code: string, ext: string): string {
  // Escape HTML first
  const escaped = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  const isJS = ["ts", "tsx", "js", "jsx"].includes(ext)
  const isPy = ext === "py"
  const isJSON = ext === "json"

  if (isJSON) {
    return escaped
      .replace(/("(?:[^"\\]|\\.)*")(\s*:)/g, '<span class="tk-key">$1</span>$2')
      .replace(/:\s*("(?:[^"\\]|\\.)*")/g, ': <span class="tk-str">$1</span>')
      .replace(/\b(true|false|null)\b/g, '<span class="tk-kw">$1</span>')
      .replace(/\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g, '<span class="tk-num">$1</span>')
  }

  if (isJS || isPy) {
    const kwJS = "const|let|var|function|return|import|export|from|default|class|extends|new|if|else|for|while|async|await|try|catch|throw|typeof|interface|type|enum"
    const kwPy = "def|class|return|import|from|if|elif|else|for|while|try|except|raise|with|as|pass|lambda|yield|async|await|None|True|False"
    const kw = isPy ? kwPy : kwJS
    return escaped
      .replace(/(\/\/[^\n]*|#[^\n]*)/g, '<span class="tk-comment">$1</span>')
      .replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, '<span class="tk-str">$1</span>')
      .replace(new RegExp(`\\b(${kw})\\b`, "g"), '<span class="tk-kw">$1</span>')
      .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tk-num">$1</span>')
  }

  return escaped
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Toolbar shown at top of the pane */
function Toolbar({
  path, size, mode, editing, dirty, saving, saveError,
  onEdit, onSave, onCancel, onDownload, showSource, onToggleSource,
}: {
  path: string | null; size: number; mode: ViewMode; editing: boolean
  dirty: boolean; saving: boolean; saveError: string | null
  onEdit: () => void; onSave: () => void; onCancel: () => void
  onDownload: () => void; showSource: boolean; onToggleSource: () => void
}) {
  const filename = path?.split("/").pop() ?? ""
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b shrink-0 gap-2 flex-wrap">
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium truncate">{filename || "No file selected"}</span>
        {path && (
          <span className="text-xs text-muted-foreground truncate max-w-xs">{path}</span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {saveError && (
          <span className="flex items-center gap-1 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5" /> {saveError}
          </span>
        )}
        {size > 0 && !editing && (
          <span className="text-xs text-muted-foreground">{formatSize(size)}</span>
        )}

        {/* HTML: source toggle */}
        {mode === "html_render" && path && (
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onToggleSource}>
            {showSource ? <Eye className="h-3.5 w-3.5 mr-1" /> : <Code className="h-3.5 w-3.5 mr-1" />}
            {showSource ? "Render" : "Source"}
          </Button>
        )}

        {/* Edit/Save/Cancel for edit_save mode */}
        {mode === "edit_save" && path && !editing && (
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onEdit}>
            <Edit3 className="h-3.5 w-3.5 mr-1" /> Edit
          </Button>
        )}
        {mode === "edit_save" && editing && (
          <>
            <Button
              variant="ghost" size="sm"
              className="h-7 px-2 text-muted-foreground"
              onClick={onCancel} disabled={saving}
            >
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
            <Button
              variant={dirty ? "default" : "ghost"} size="sm"
              className="h-7 px-2"
              onClick={onSave} disabled={saving || !dirty}
            >
              {saving
                ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                : <Save className="h-3.5 w-3.5 mr-1" />}
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        )}

        {/* Download always available when we have content */}
        {path && mode !== "edit_save" && (
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onDownload}>
            <Download className="h-3.5 w-3.5 mr-1" /> Download
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FilePreview({ agentId, path, content, encoding, mime, size, loading, onSaved }: Props) {
  const mode = detectMode(path, mime)
  const ext = path?.split(".").pop()?.toLowerCase() ?? ""

  // Edit state (edit_save mode)
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const [savedOk, setSavedOk] = React.useState(false)

  // HTML mode: show source vs rendered
  const [showSource, setShowSource] = React.useState(false)

  // Reset edit state when file changes
  React.useEffect(() => {
    setEditing(false)
    setDraft(content ?? "")
    setSaveError(null)
    setSavedOk(false)
    setShowSource(false)
  }, [path, content])

  const dirty = draft !== (content ?? "")

  // ── Edit handlers ──────────────────────────────────────────────────────────

  const handleEdit = () => {
    setDraft(content ?? "")
    setSaveError(null)
    setSavedOk(false)
    setEditing(true)
  }

  const handleCancel = () => {
    setDraft(content ?? "")
    setEditing(false)
    setSaveError(null)
  }

  const handleSave = async () => {
    if (!agentId || !path) return
    setSaving(true)
    setSaveError(null)
    setSavedOk(false)
    try {
      const res = await fetch(
        `/api/tiger/agents/${agentId}/file?path=${encodeURIComponent(path)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: draft }),
        }
      )
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? "Save failed")
      setSavedOk(true)
      setEditing(false)
      onSaved?.(path, draft)
    } catch (err: any) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Download handler ───────────────────────────────────────────────────────

  const handleDownload = () => {
    if (!content || !path) return
    const filename = path.split("/").pop() ?? "file"
    let url: string
    if (encoding === "base64") {
      url = `data:${mime ?? "application/octet-stream"};base64,${content}`
    } else {
      const blob = new Blob([content], { type: mime ?? "text/plain" })
      url = URL.createObjectURL(blob)
    }
    const a = document.createElement("a")
    a.href = url; a.download = filename; a.click()
    if (encoding !== "base64") URL.revokeObjectURL(url)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <Toolbar
        path={path} size={size} mode={mode}
        editing={editing} dirty={dirty} saving={saving} saveError={saveError}
        onEdit={handleEdit} onSave={handleSave} onCancel={handleCancel}
        onDownload={handleDownload}
        showSource={showSource} onToggleSource={() => setShowSource((v) => !v)}
      />

      {/* Saved banner */}
      {savedOk && (
        <div className="px-3 py-1.5 text-xs text-green-400 bg-green-500/10 border-b shrink-0">
          ✓ Saved successfully
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {/* ── Loading ── */}
        {loading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* ── No file selected ── */}
        {!loading && !path && (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Select a file to preview it
          </div>
        )}

        {/* ── EDIT_SAVE: textarea editor or markdown preview ── */}
        {!loading && path && mode === "edit_save" && (
          editing ? (
            <textarea
              className="w-full h-full resize-none bg-background/50 font-mono text-xs p-3 outline-none border-0 focus:ring-0"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
            />
          ) : (
            <div className={cn(
              "h-full overflow-y-auto p-4",
              ext === "md"
                ? "prose prose-sm prose-invert max-w-none text-foreground prose-headings:text-foreground prose-a:text-primary prose-code:bg-muted/60 prose-code:px-1 prose-code:rounded prose-pre:bg-muted/40 prose-pre:border"
                : "text-sm font-mono whitespace-pre-wrap break-all text-foreground"
            )}>
              {ext === "md"
                ? <ReactMarkdown>{content ?? ""}</ReactMarkdown>
                : <span>{content ?? ""}</span>
              }
            </div>
          )
        )}

        {/* ── HTML_RENDER: iframe or source ── */}
        {!loading && path && mode === "html_render" && (
          showSource ? (
            <div className="h-full overflow-y-auto">
              <style>{`.tk-kw{color:#c792ea}.tk-str{color:#c3e88d}.tk-num{color:#f78c6c}.tk-comment{color:#546e7a;font-style:italic}.tk-key{color:#82aaff}`}</style>
              <pre
                className="text-xs font-mono p-3 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: tokenise(content ?? "", "html") }}
              />
            </div>
          ) : (
            <iframe
              className="w-full h-full border-0 bg-white"
              sandbox="allow-scripts allow-same-origin"
              srcDoc={content ?? ""}
              title={path}
            />
          )
        )}

        {/* ── CODE_VIEW: syntax-highlighted read-only ── */}
        {!loading && path && mode === "code_view" && (
          <div className="h-full overflow-y-auto">
            <style>{`.tk-kw{color:#c792ea}.tk-str{color:#c3e88d}.tk-num{color:#f78c6c}.tk-comment{color:#546e7a;font-style:italic}.tk-key{color:#82aaff}`}</style>
            <pre
              className="text-xs font-mono p-3 leading-relaxed whitespace-pre-wrap break-all"
              dangerouslySetInnerHTML={{ __html: tokenise(content ?? "", ext) }}
            />
          </div>
        )}

        {/* ── IMAGE ── */}
        {!loading && path && mode === "image" && encoding === "base64" && (
          <div className="h-full overflow-auto flex items-start justify-center p-4">
            <img
              src={`data:${mime};base64,${content}`}
              alt={path}
              className="max-w-full rounded-md border"
            />
          </div>
        )}

        {/* ── BINARY: no preview ── */}
        {!loading && path && mode === "binary" && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <span className="text-3xl">📦</span>
            <span className="text-sm">Binary file — {formatSize(size)}</span>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" /> Download
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
