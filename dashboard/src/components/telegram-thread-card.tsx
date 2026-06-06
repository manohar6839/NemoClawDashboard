"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Send } from "lucide-react"

interface TelegramMessage {
  role: string
  content: string
  timestamp: number
  meta?: Record<string, unknown>
}

export function TelegramThreadCard() {
  const [messages, setMessages] = useState<TelegramMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/chat/history?limit=5")
      .then(r => r.json())
      .then(data => {
        if (data?.messages) {
          setMessages(data.messages.slice(-5).reverse())
        }
        setLoading(false)
      })
      .catch(e => {
        console.error("Failed to load:", e)
        setError(e.message)
        setLoading(false)
      })
  }, [])

  const hasData = messages.length > 0

  // Simple timestamp formatter
  const formatTime = (ts: number) => {
    if (!ts) return ""
    const diff = Date.now() - ts
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return "just now"
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return new Date(ts).toLocaleDateString()
  }

  // Simple truncate
  const truncate = (text: string, max = 40) => {
    if (!text) return ""
    return text.length > max ? text.slice(0, max) + "..." : text
  }

  if (loading) {
    return (
      <Card className="bg-card/40 p-4 flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <Send className="h-4 w-4 text-primary" />
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground/80">Telegram thread</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="bg-card/40 p-4 flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <Send className="h-4 w-4 text-primary" />
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground/80">Telegram thread</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-sm text-red-500">Error: {error}</span>
        </div>
      </Card>
    )
  }

  return (
    <Card className="bg-card/40 p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 text-primary" />
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground/80">Chat history</span>
        </div>
        <a href="/chat?session=telegram" className="text-xs text-primary hover:underline">Open chat →</a>
      </div>

      {hasData ? (
        <ul className="space-y-2 flex-1">
          {messages.map((msg, i) => (
            <li key={i} className="text-sm">
              <div className="flex items-baseline gap-2">
                <span className="font-medium text-xs">
                  {msg.role === "user" ? "You" : "Tiger"}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {formatTime(msg.timestamp)}
                </span>
              </div>
              <div className="text-xs text-muted-foreground/80 truncate">
                {truncate(msg.content)}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-6 px-2">
          <Send className="h-8 w-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">No messages yet.</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1 max-w-[260px]">
            Start a conversation to see messages here.
          </p>
        </div>
      )}
    </Card>
  )
}