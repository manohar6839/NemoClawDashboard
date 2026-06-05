"use client"

import { useEffect, useState, useRef } from "react"
import dynamic from 'next/dynamic'
import { Brain, Search, ScrollText, Wrench, Activity, Clock, Network, MessageSquare } from "lucide-react"

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

interface KnowledgeNode {
  id: string
  type: string
  name: string
  description: string
}

interface FeedbackPref {
  key: string
  value: string
}

interface GraphNode {
  id: string
  name: string
  type: string
  val: number
}

interface GraphLink {
  source: { id: string }
  target: { id: string }
  name: string
}

export default function KnowledgePage() {
  const [nodes, setNodes] = useState<KnowledgeNode[]>([])
  const [prefs, setPrefs] = useState<FeedbackPref[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [showGraph, setShowGraph] = useState(true)
  const graphRef = useRef<any>(null)
  const [error, setError] = useState<string | null>(null)

  const sections = [
    { title: "Memory", href: "/memory", icon: ScrollText, description: "Tiger's persistent memory" },
    { title: "Skills", href: "/skills", icon: Wrench, description: "Registry of capabilities" },
    { title: "Activity", href: "/activity", icon: Activity, description: "Timeline of events" },
    { title: "Schedule", href: "/cron", icon: Clock, description: "Scheduled tasks" },
  ]

  useEffect(() => {
    Promise.all([
      fetch("/api/tiger/knowledge").then(r => r.json()),
      fetch("/api/tiger/knowledge?url=/feedback/prefer").then(r => r.json())
    ]).then(([kg, fp]) => {
      if (kg?.nodes) setNodes(kg.nodes)
      if (fp?.preferences) setPrefs(fp.preferences)
      setLoading(false)
    }).catch(e => {
      setError(e.message)
      setLoading(false)
    })
  }, [])

  const filteredNodes = search 
    ? nodes.filter(n => n.name.toLowerCase().includes(search.toLowerCase()))
    : nodes

  const getTypeColor = (type: string) => {
    switch (type) {
      case "person": return "#60a5fa"
      case "company": return "#4ade80"
      case "concept": return "#c084fc"
      default: return "#94a3b8"
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "person": return "👤"
      case "company": return "🏢"
      case "concept": return "💡"
      default: return "📌"
    }
  }

  // Build graph data from nodes
  const graphNodes: GraphNode[] = nodes.map(n => ({ id: n.id, name: n.name, type: n.type, val: 10 }))
  const graphLinks: GraphLink[] = nodes.flatMap(n => 
    nodes.filter(m => m.id !== n.id).slice(0, 1).map(m => ({
      source: { id: n.id },
      target: { id: m.id },
      name: "related"
    }))
  )

  const connections = [
    { from: "Manohar", rel: "works-at", to: "Renew Power" },
    { from: "Manohar", rel: "interested-in", to: "PE/VC" },
    { from: "Renew Power", rel: "competitor", to: "Adani Green" },
  ]

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="h-5 w-5" />
          <h1 className="text-2xl font-bold">Knowledge</h1>
        </div>
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* TOP - Tiger's Brain */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Brain className="h-5 w-5" />
          <h1 className="text-2xl font-bold">Knowledge</h1>
        </div>
        
        <h2 className="text-lg font-semibold mb-3">Tiger's Brain</h2>
        <div className="grid grid-cols-4 gap-3">
          {sections.map(s => (
            <a key={s.title} href={s.href} className="p-4 rounded-lg border hover:bg-card/50 text-center">
              <s.icon className="h-6 w-6 mx-auto mb-2" />
              <div className="font-medium">{s.title}</div>
              <div className="text-xs text-muted-foreground">{s.description}</div>
            </a>
          ))}
        </div>
      </div>

      {/* BOTTOM */}
      <div className="grid grid-cols-2 gap-6">
        {/* Graph/List Toggle */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4" />
              <h3 className="text-lg font-semibold">Knowledge Graph</h3>
            </div>
            <button 
              onClick={() => setShowGraph(!showGraph)} 
              className="px-3 py-1 text-sm rounded border hover:bg-card/50"
            >
              {showGraph ? "Show List" : "Show Graph"}
            </button>
          </div>

          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full p-2 rounded border"
          />

          {showGraph ? (
            <div className="h-[350px] rounded-lg border overflow-hidden">
              <ForceGraph2D
                ref={graphRef}
                graphData={{ nodes: graphNodes, links: graphLinks }}
                nodeColor={(n: any) => getTypeColor(n.type)}
                nodeLabel={(n: any) => `${n.name} (${n.type})`}
                linkColor={() => "#475569"}
                backgroundColor="#1a1a2e"
                width={500}
                height={350}
              />
            </div>
          ) : (
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {filteredNodes.map(node => (
                <div key={node.id} className="p-3 rounded-lg border bg-card/30">
                  <div className="flex items-center gap-2">
                    <span>{getTypeIcon(node.type)}</span>
                    <span className="font-medium" style={{ color: getTypeColor(node.type) }}>{node.name}</span>
                  </div>
                  {node.description && <div className="text-xs text-muted-foreground mt-1">{node.description}</div>}
                </div>
              ))}
            </div>
          )}

          {/* Legend */}
          <div className="flex gap-4 text-xs">
            <span style={{ color: "#60a5fa" }}>● Person</span>
            <span style={{ color: "#4ade80" }}>● Company</span>
            <span style={{ color: "#c084fc" }}>● Concept</span>
          </div>
        </div>

        {/* Connections + Learned */}
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Network className="h-4 w-4" />
              <h3 className="text-lg font-semibold">Connections</h3>
            </div>
            <div className="p-3 rounded-lg border bg-card/30 space-y-1">
              {connections.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-blue-400">{c.from}</span>
                  <span className="text-muted-foreground">→ {c.rel} →</span>
                  <span className="text-green-400">{c.to}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <h3 className="text-lg font-semibold">Learned Preferences</h3>
          </div>
          <div className="p-3 rounded-lg border bg-card/30">
            {prefs.length === 0 ? (
              <div className="text-sm text-muted-foreground">Correct me to learn</div>
            ) : (
              prefs.map((p, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>{p.key}</span>
                  <span className="font-medium">{p.value}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {error && <div className="text-red-500">Error: {error}</div>}
    </div>
  )
}