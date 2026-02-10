"use client"

import * as React from "react"
import { Users, Search, MessageSquare, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
// import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useGatewayRequest } from "@/hooks/use-gateway"

interface Session {
  id: string
  title?: string
  created_at?: string
  updated_at?: string
  model?: string
}

export default function SessionsPage() {
  const { request } = useGatewayRequest()
  const [sessions, setSessions] = React.useState<Session[]>([])
  const [selectedSessionId, setSelectedSessionId] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [loading, setLoading] = React.useState(true)

  const loadSessions = React.useCallback(async () => {
    try {
      const data = await request("sessions.list", {})
      // Handle both array and object response formats
      const list = (Array.isArray(data) ? data : (data as { sessions: Session[] })?.sessions || []) as Session[]
      setSessions(list)
    } catch (e) {
      console.error("Failed to load sessions", e)
    } finally {
      setLoading(false)
    }
  }, [request])

  React.useEffect(() => { loadSessions() }, [loadSessions])

  const filtered = sessions.filter(s => 
      (s.id || "").toLowerCase().includes(search.toLowerCase()) || 
      (s.title || "").toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
       <div className="flex items-center justify-between p-4 border-b">
         <div>
            <h1 className="text-2xl font-bold tracking-tight">Sessions</h1>
            <p className="text-muted-foreground">View active and past conversation sessions.</p>
         </div>
       </div>

       <div className="flex flex-1 min-h-0 items-stretch border rounded-lg overflow-hidden">
          
          {/* Left Panel: Session List */}
          <div className="w-[300px] flex-none border-r bg-muted/10 flex flex-col min-h-0">
               <div className="p-4 border-b">
                 <div className="relative">
                   <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                   <Input 
                     placeholder="Search sessions..." 
                     className="pl-8 bg-background" 
                     value={search}
                     onChange={(e) => setSearch(e.target.value)}
                   />
                 </div>
               </div>
               <div className="flex-1 overflow-y-auto min-h-0">
                 <div className="flex flex-col gap-2 p-4">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">
                        SESSIONS ({sessions.length})
                    </div>
                    {loading && <Loader2 className="h-5 w-5 animate-spin mx-auto mt-4" />}
                    {filtered.map((session) => (
                        <button
                            key={session.id}
                            onClick={() => setSelectedSessionId(session.id)}
                            className={cn(
                                "flex flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm transition-all hover:bg-accent",
                                selectedSessionId === session.id && "bg-accent border-primary"
                            )}
                        >
                            <div className="flex w-full flex-col gap-1 min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                    <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <div className="font-semibold truncate">{session.title || session.id}</div>
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                    {session.model || "Unknown model"}
                                </div>
                            </div>
                        </button>
                    ))}
                 </div>
               </div>
            </div>
          
          {/* Right Panel: Placeholder for Chat/Logs */}
          <div className="flex-1 min-w-0 bg-background flex flex-col">
            <div className="h-full w-full bg-background relative overflow-hidden min-w-0">
                {selectedSessionId ? (
                    <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
                        <MessageSquare className="mx-auto h-12 w-12 opacity-50 mb-4" />
                        <h3 className="text-lg font-semibold">Session: {selectedSessionId}</h3>
                        <p>Chat history and logs for this session will appear here.</p>
                        <p className="text-xs mt-2 text-muted-foreground">(Coming soon)</p>
                    </div>
                ) : (
                    <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
                        <Users className="mx-auto h-12 w-12 opacity-50 mb-4" />
                        <h3 className="text-lg font-semibold">No Session Selected</h3>
                        <p>Select a session to view its details.</p>
                    </div>
                )}
            </div>
          </div>
       </div>
    </div>
  )
}
