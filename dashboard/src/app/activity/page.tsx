"use client"

import { useEffect, useState } from "react"
import { ScrollText } from "lucide-react"

interface ActivityEntry {
  id: string
  type: string
  timestamp: string
  description: string
  source: string
}

export default function ActivityPage() {
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/activity?limit=20")
      .then(r => r.json())
      .then(data => {
        if (data?.entries) {
          setEntries(data.entries)
        }
        setLoading(false)
      })
      .catch(e => {
        console.error("Failed to load:", e)
        setError(e.message)
        setLoading(false)
      })
  }, [])

  const formatDate = (ts: string) => {
    if (!ts) return ""
    return new Date(ts).toLocaleString()
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case "heartbeat": return "text-green-500"
      case "chat": return "text-blue-500"
      case "config": return "text-yellow-500"
      case "memory": return "text-purple-500"
      case "system": return "text-orange-500"
      case "cron": return "text-cyan-500"
      default: return "text-muted-foreground"
    }
  }

  const getSourceLabel = (source: string) => {
    switch (source) {
      case "main": return "🐅 Tiger"
      case "coder": return "📦 Cody"
      case "researcher": return "🔬 Ethan"
      case "pm": return "📋 Elon"
      default: return source || "🤖"
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <ScrollText className="h-5 w-5" />
          <h1 className="text-2xl font-bold">Activity</h1>
        </div>
        <div className="text-muted-foreground">Loading activity log...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <ScrollText className="h-5 w-5" />
          <h1 className="text-2xl font-bold">Activity</h1>
        </div>
        <div className="text-red-500">Failed to load activity log</div>
        <div className="text-sm text-muted-foreground mt-2">{error}</div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <ScrollText className="h-5 w-5" />
        <h1 className="text-2xl font-bold">Activity</h1>
        <span className="text-muted-foreground text-sm">({entries.length} entries)</span>
      </div>

      <div className="space-y-2">
        {entries.map((entry, i) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-card/30">
            <div className="text-lg">{getSourceLabel(entry.source)}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{entry.description}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={getTypeColor(entry.type)}>{entry.type}</span>
                <span>•</span>
                <span>{formatDate(entry.timestamp)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}