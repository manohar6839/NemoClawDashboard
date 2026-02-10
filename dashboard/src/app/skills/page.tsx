"use client"

import * as React from "react"
import useSWR from "swr"
import { Bot, Save, Search, Code2, Eye, Edit2, Package, Wrench, Loader2 } from "lucide-react"
import ReactMarkdown from 'react-markdown'

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useGatewayRequest } from "@/hooks/use-gateway"

interface Skill {
  name: string
  path: string
  description: string
}

interface BuiltInSkill {
  name: string
  description?: string
  version?: string
  enabled?: boolean
  type?: string
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function SkillsPage() {
  const { data: skillsData } = useSWR("/api/skills", fetcher)
  const { request } = useGatewayRequest()
  const [selectedSkill, setSelectedSkill] = React.useState<string | null>(null)
  const [selectedBuiltIn, setSelectedBuiltIn] = React.useState<BuiltInSkill | null>(null)
  const [search, setSearch] = React.useState("")
  const [tab, setTab] = React.useState<"custom" | "builtin">("custom")
  const [builtInSkills, setBuiltInSkills] = React.useState<BuiltInSkill[]>([])
  const [loadingBuiltIn, setLoadingBuiltIn] = React.useState(false)

  React.useEffect(() => {
    setLoadingBuiltIn(true)
    request("skills.status", {})
      .then((data: unknown) => {
        const result = data as Record<string, unknown>
        const skills = (result?.skills || result?.installed || []) as BuiltInSkill[]
        if (Array.isArray(skills)) {
          setBuiltInSkills(skills.map((s: unknown) => {
            if (typeof s === "string") return { name: s }
            const obj = s as Record<string, unknown>
            return {
              name: String(obj.name || obj.id || ""),
              description: String(obj.description || obj.summary || ""),
              version: String(obj.version || ""),
              enabled: obj.enabled !== false,
              type: String(obj.type || "built-in"),
            }
          }))
        }
      })
      .catch(() => {})
      .finally(() => setLoadingBuiltIn(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredCustom = skillsData?.skills?.filter((s: Skill) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  ) || []

  const filteredBuiltIn = builtInSkills.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.description || "").toLowerCase().includes(search.toLowerCase())
  )

  const handleSelectCustom = (name: string) => {
    setSelectedSkill(name)
    setSelectedBuiltIn(null)
  }

  const handleSelectBuiltIn = (skill: BuiltInSkill) => {
    setSelectedBuiltIn(skill)
    setSelectedSkill(null)
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
       <div className="flex items-center justify-between p-4 border-b">
         <div>
            <h1 className="text-2xl font-bold tracking-tight">Skills</h1>
            <p className="text-muted-foreground">Manage agent capabilities and integrations.</p>
         </div>
       </div>

       <div className="flex flex-1 min-h-0 items-stretch border rounded-lg overflow-hidden">

          {/* Left Panel: Skill List */}
          <div className="w-[300px] flex-none border-r bg-muted/10 flex flex-col min-h-0">
               <div className="p-4 border-b space-y-3">
                 <div className="relative">
                   <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                   <Input
                     placeholder="Search skills..."
                     className="pl-8 bg-background"
                     value={search}
                     onChange={(e) => setSearch(e.target.value)}
                   />
                 </div>
                 <div className="flex gap-1 bg-muted rounded-md p-1">
                   <button
                     className={cn(
                       "flex-1 text-xs font-medium py-1.5 px-2 rounded transition-colors flex items-center justify-center gap-1",
                       tab === "custom" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                     )}
                     onClick={() => setTab("custom")}
                   >
                     <Wrench className="h-3 w-3" />
                     Custom ({skillsData?.count || 0})
                   </button>
                   <button
                     className={cn(
                       "flex-1 text-xs font-medium py-1.5 px-2 rounded transition-colors flex items-center justify-center gap-1",
                       tab === "builtin" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                     )}
                     onClick={() => setTab("builtin")}
                   >
                     <Package className="h-3 w-3" />
                     Built-in ({builtInSkills.length})
                   </button>
                 </div>
               </div>
               <div className="flex-1 overflow-y-auto min-h-0">
                 <div className="flex flex-col gap-2 p-4">
                    {tab === "custom" && (
                      <>
                        {filteredCustom.length === 0 ? (
                          <div className="text-xs text-muted-foreground text-center py-4">No custom skills found.</div>
                        ) : (
                          filteredCustom.map((skill: Skill) => (
                            <button
                              key={skill.name}
                              className={cn(
                                "flex flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm transition-all hover:bg-accent",
                                selectedSkill === skill.name && "bg-accent border-primary"
                              )}
                              onClick={() => handleSelectCustom(skill.name)}
                            >
                              <div className="flex w-full flex-col gap-1 min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Wrench className="h-4 w-4 shrink-0 text-primary" />
                                  <div className="font-semibold truncate">{skill.name}</div>
                                </div>
                                <div className="line-clamp-2 text-xs text-muted-foreground break-words">
                                  {skill.description}
                                </div>
                              </div>
                            </button>
                          ))
                        )}
                      </>
                    )}

                    {tab === "builtin" && (
                      <>
                        {loadingBuiltIn ? (
                          <div className="flex justify-center py-8">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : filteredBuiltIn.length === 0 ? (
                          <div className="text-xs text-muted-foreground text-center py-4">No built-in skills found.</div>
                        ) : (
                          filteredBuiltIn.map((skill) => (
                            <button
                              key={skill.name}
                              className={cn(
                                "flex flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm transition-all hover:bg-accent",
                                selectedBuiltIn?.name === skill.name && "bg-accent border-primary"
                              )}
                              onClick={() => handleSelectBuiltIn(skill)}
                            >
                              <div className="flex w-full flex-col gap-1 min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Package className="h-4 w-4 shrink-0 text-blue-400" />
                                  <div className="font-semibold truncate">{skill.name}</div>
                                  {skill.version && (
                                    <span className="ml-auto text-[10px] text-muted-foreground shrink-0">v{skill.version}</span>
                                  )}
                                </div>
                                {skill.description && (
                                  <div className="line-clamp-2 text-xs text-muted-foreground break-words">
                                    {skill.description}
                                  </div>
                                )}
                              </div>
                            </button>
                          ))
                        )}
                      </>
                    )}
                 </div>
               </div>
          </div>

          {/* Right Panel */}
          <div className="flex-1 min-w-0 bg-background flex flex-col">
            <div className="h-full w-full">
                {selectedSkill ? (
                    <SkillEditor skillName={selectedSkill} />
                ) : selectedBuiltIn ? (
                    <BuiltInSkillView skill={selectedBuiltIn} />
                ) : (
                    <div className="flex h-full items-center justify-center p-8 text-center text-muted-foreground">
                        <div>
                            <Bot className="mx-auto h-12 w-12 opacity-50 mb-4" />
                            <h3 className="text-lg font-semibold">No Skill Selected</h3>
                            <p>Select a skill from the list to view or edit its documentation.</p>
                        </div>
                    </div>
                )}
            </div>
          </div>
       </div>
    </div>
  )
}

function BuiltInSkillView({ skill }: { skill: BuiltInSkill }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b bg-muted/40 h-[52px]">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-blue-400" />
          <span className="font-medium">{skill.name}</span>
          {skill.version && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">v{skill.version}</span>
          )}
        </div>
        <span className={cn(
          "text-xs px-2 py-0.5 rounded-full",
          skill.enabled !== false ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
        )}>
          {skill.enabled !== false ? "Enabled" : "Disabled"}
        </span>
      </div>
      <div className="flex-1 p-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-1">Name</h3>
            <p className="text-sm">{skill.name}</p>
          </div>
          {skill.description && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">Description</h3>
              <p className="text-sm">{skill.description}</p>
            </div>
          )}
          {skill.type && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">Type</h3>
              <p className="text-sm">{skill.type}</p>
            </div>
          )}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-1">Source</h3>
            <p className="text-sm text-blue-400">Gateway built-in skill</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function SkillEditor({ skillName }: { skillName: string }) {
    const { data, error, mutate } = useSWR(`/api/skills/${skillName}`, fetcher)
    const [content, setContent] = React.useState("")
    const [isDirty, setIsDirty] = React.useState(false)
    const [saving, setSaving] = React.useState(false)

    const [viewMode, setViewMode] = React.useState<"edit" | "preview">("preview")

    React.useEffect(() => {
        if (data && data.content !== undefined) {
            setContent(data.content)
            setIsDirty(false)
        }
    }, [data, skillName])

    const handleSave = async () => {
        setSaving(true)
        try {
            await fetch(`/api/skills/${skillName}`, {
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

    if (!data && !error) return <div className="p-8">Loading skill content...</div>
    if (error) return <div className="p-8 text-destructive">Error loading skill.</div>

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-4 border-b bg-muted/40 h-[52px]">
                <div className="flex items-center gap-2">
                    <Code2 className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{skillName}/SKILL.md</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center border rounded-md overflow-hidden mr-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn("h-7 rounded-none", viewMode === "edit" && "bg-accent")}
                            onClick={() => setViewMode("edit")}
                        >
                            <Edit2 className="h-3 w-3 mr-1" /> Edit
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn("h-7 rounded-none", viewMode === "preview" && "bg-accent")}
                            onClick={() => setViewMode("preview")}
                        >
                            <Eye className="h-3 w-3 mr-1" /> Preview
                        </Button>
                    </div>
                    <Button size="sm" onClick={handleSave} disabled={!isDirty || saving}>
                        <Save className="mr-2 h-4 w-4" />
                        {saving ? "Saving..." : "Save Changes"}
                    </Button>
                </div>
            </div>
            <div className="flex-1 bg-background relative overflow-hidden min-w-0">
                {viewMode === "edit" ? (
                    <textarea
                        className="w-full h-full p-4 font-mono text-sm bg-transparent resize-none focus:outline-none"
                        value={content}
                        onChange={(e) => {
                            setContent(e.target.value)
                            setIsDirty(true)
                        }}
                        spellCheck={false}
                    />
                ) : (
                    <ScrollArea className="h-full w-full">
                        <div className="prose prose-invert max-w-none p-6 break-words overflow-wrap-anywhere">
                            <ReactMarkdown
                                components={{
                                    pre: ({node, ...props}) => <pre className="overflow-x-auto whitespace-pre-wrap max-w-full" {...props} />,
                                    code: ({node, ...props}) => <code className="break-words whitespace-pre-wrap" {...props} />
                                }}
                            >
                                {content}
                            </ReactMarkdown>
                        </div>
                    </ScrollArea>
                )}
            </div>
        </div>
    )
}
