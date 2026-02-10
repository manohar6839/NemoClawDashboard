
"use client"

import * as React from "react"
import useSWR from "swr"
import { BrainCircuit, Save, Search, FileText } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"


interface MemoryFile {
  name: string
  path: string
  date?: string
  type?: "core" | "daily"
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function MemoryPage() {
  const { data: memoryData, mutate } = useSWR("/api/memory", fetcher)
  const [selectedFile, setSelectedFile] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
       <div className="flex items-center justify-between p-4 border-b">
         <div>
            <h1 className="text-2xl font-bold tracking-tight">Memory</h1>
            <p className="text-muted-foreground">View and edit agent memories and logs.</p>
         </div>
       </div>

       <div className="flex flex-1 min-h-0 items-stretch border rounded-lg overflow-hidden">
          
          {/* Left Panel: File List */}
          <div className="w-[300px] flex-none border-r bg-muted/10 flex flex-col min-h-0">
               <div className="p-4 border-b">
                 <div className="relative">
                   <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                   <Input 
                     placeholder="Search memory..." 
                     className="pl-8 bg-background" 
                     value={search}
                     onChange={(e) => setSearch(e.target.value)}
                   />
                 </div>
               </div>
               <div className="flex-1 overflow-y-auto min-h-0">
                 <div className="flex flex-col gap-2 p-4">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">
                        FILES ({memoryData?.count || 0})
                    </div>
                    {memoryData?.files
                        ?.filter((f: MemoryFile) => f.name.toLowerCase().includes(search.toLowerCase()))
                        .map((file: MemoryFile) => (
                        <button
                            key={file.name}
                            className={cn(
                                "flex flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm transition-all hover:bg-accent",
                                selectedFile === file.name && "bg-accent border-primary",
                                file.type === "core" && "border-l-4 border-l-primary bg-primary/5"
                            )}
                            onClick={() => setSelectedFile(file.name)}
                        >
                            <div className="flex w-full flex-col gap-1 min-w-0">
                                <div className="flex items-center">
                                    <div className="flex items-center gap-2 min-w-0">
                                        {file.type === "core" ? (
                                            <BrainCircuit className="h-4 w-4 shrink-0 text-primary" />
                                        ) : (
                                            <FileText className="h-4 w-4 shrink-0" />
                                        )}
                                        <div className="font-semibold truncate">{file.name}</div>
                                    </div>
                                </div>
                                {file.type === "core" && (
                                    <div className="text-xs text-muted-foreground">
                                        Permanent Context
                                    </div>
                                )}
                            </div>
                        </button>
                    ))}
                 </div>
               </div>
            </div>
          
          {/* Right Panel: Editor */}
          <div className="flex-1 min-w-0 bg-background flex flex-col">
            <div className="h-full w-full">
                {selectedFile ? (
                    <MemoryEditor fileName={selectedFile} />
                ) : (
                    <div className="flex h-full items-center justify-center p-8 text-center text-muted-foreground">
                        <div>
                            <BrainCircuit className="mx-auto h-12 w-12 opacity-50 mb-4" />
                            <h3 className="text-lg font-semibold">No File Selected</h3>
                            <p>Select a memory file to view its content.</p>
                        </div>
                    </div>
                )}
            </div>
          </div>
       </div>
    </div>
  )
}

function MemoryEditor({ fileName }: { fileName: string }) {
    const { data, error, mutate } = useSWR(`/api/memory/${fileName}`, fetcher)
    const [content, setContent] = React.useState("")
    const [isDirty, setIsDirty] = React.useState(false)
    const [saving, setSaving] = React.useState(false)

    React.useEffect(() => {
        if (data && data.content !== undefined) {
            setContent(data.content)
            setIsDirty(false)
        }
    }, [data, fileName])

    const handleSave = async () => {
        setSaving(true)
        try {
            await fetch(`/api/memory/${fileName}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content })
            })
            setIsDirty(false)
            mutate()
        } catch (e) {
            console.error("Failed to save", e)
        } finally {
            setSaving(false)
        }
    }

    if (!data && !error) return <div className="p-8">Loading content...</div>
    if (error) return <div className="p-8 text-destructive">Error loading file.</div>

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-4 border-b bg-muted/40 h-[52px]">
                <div className="flex items-center gap-2">
                    <BrainCircuit className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">memory/{fileName}</span>
                </div>
                <Button size="sm" onClick={handleSave} disabled={!isDirty || saving}>
                    <Save className="mr-2 h-4 w-4" />
                    {saving ? "Saving..." : "Save Changes"}
                </Button>
            </div>
            <div className="flex-1 bg-background relative min-w-0 overflow-hidden">
                <textarea 
                    className="w-full h-full p-4 font-mono text-sm bg-transparent resize-none focus:outline-none"
                    value={content}
                    onChange={(e) => {
                        setContent(e.target.value)
                        setIsDirty(true)
                    }}
                    spellCheck={false}
                />
            </div>
        </div>
    )
}
