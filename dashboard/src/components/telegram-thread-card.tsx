"use client"

/**
 * TelegramThreadCard — live mirror of the Telegram conversation with Tiger.
 *
 * Data source: /api/chat/telegram-thread → bridge /tiger/chat/telegram, which
 * reads OpenClaw's native session transcript (the same file Tiger's context
 * comes from). Both directions, full history, in sync by construction.
 *
 * Behaviour:
 *   - loads the newest page, scrolled to the bottom (like Telegram itself)
 *   - "Load older" at the top pages backwards through the entire history
 *   - polls for new messages every 15s; only repaints when something changed
 *   - preserves scroll position when older messages are prepended
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Send, ChevronUp, RefreshCw } from "lucide-react"

interface ThreadMessage {
  seq: number
  role: "user" | "agent"
  text: string
  timestamp: string
}

interface ThreadResponse {
  ok: boolean
  messages?: ThreadMessage[]
  hasMore?: boolean
  error?: string
}

const PAGE_SIZE = 40
const POLL_MS = 15_000

export function TelegramThreadCard() {
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  // Tracks whether the user is parked at the bottom — only then do we
  // auto-scroll on new messages, so reading history is never interrupted.
  const stickToBottom = useRef(true)

  const fetchPage = useCallback(
    async (before?: number): Promise<ThreadResponse> => {
      const qs = new URLSearchParams({ limit: String(PAGE_SIZE) })
      if (before) qs.set("before", String(before))
      const r = await fetch(`/api/chat/telegram-thread?${qs.toString()}`)
      return r.json()
    },
    [],
  )

  // Initial load
  useEffect(() => {
    fetchPage()
      .then((data) => {
        if (data.ok && data.messages) {
          setMessages(data.messages)
          setHasMore(Boolean(data.hasMore))
        } else {
          setError(data.error || "No data")
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [fetchPage])

  // Poll for new messages
  useEffect(() => {
    const t = setInterval(() => {
      fetchPage()
        .then((data) => {
          if (!data.ok || !data.messages) return
          setMessages((prev) => {
            const newest = data.messages!
            if (
              prev.length > 0 &&
              newest.length > 0 &&
              prev[prev.length - 1].seq === newest[newest.length - 1].seq
            ) {
              return prev // nothing new — keep referential equality, no repaint
            }
            // Merge: keep any older pages we already loaded, append the fresh tail.
            const known = new Set(prev.map((m) => m.seq))
            const fresh = newest.filter((m) => !known.has(m.seq))
            return fresh.length > 0 ? [...prev, ...fresh] : prev
          })
        })
        .catch(() => { /* transient poll errors are fine — next tick retries */ })
    }, POLL_MS)
    return () => clearInterval(t)
  }, [fetchPage])

  // Auto-scroll to bottom on new tail messages (only if user was at bottom)
  useEffect(() => {
    const el = scrollRef.current
    if (el && stickToBottom.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    stickToBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  const loadOlder = async () => {
    if (loadingOlder || messages.length === 0) return
    setLoadingOlder(true)
    const el = scrollRef.current
    const prevHeight = el?.scrollHeight ?? 0
    try {
      const data = await fetchPage(messages[0].seq)
      if (data.ok && data.messages && data.messages.length > 0) {
        setMessages((prev) => [...data.messages!, ...prev])
        setHasMore(Boolean(data.hasMore))
        // Keep the viewport anchored on the message the user was reading.
        requestAnimationFrame(() => {
          if (el) el.scrollTop = el.scrollHeight - prevHeight
        })
      } else {
        setHasMore(false)
      }
    } finally {
      setLoadingOlder(false)
    }
  }

  const formatTime = (iso: string) => {
    if (!iso) return ""
    const d = new Date(iso)
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    return sameDay
      ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString([], { day: "numeric", month: "short" }) +
          " " +
          d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }

  return (
    <Card className="bg-card/40 p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Send className="h-4 w-4 text-primary" />
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
          Telegram thread
        </span>
        {!loading && !error && (
          <span className="ml-auto text-[10px] text-muted-foreground/60 flex items-center gap-1">
            <RefreshCw className="h-3 w-3" /> live
          </span>
        )}
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center h-80">
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      )}

      {error && (
        <div className="flex-1 flex items-center justify-center h-80">
          <span className="text-sm text-red-500">Error: {error}</span>
        </div>
      )}

      {!loading && !error && (
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="h-80 overflow-y-auto pr-1 flex flex-col gap-2"
        >
          {hasMore && (
            <button
              onClick={loadOlder}
              disabled={loadingOlder}
              className="self-center text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 py-1 px-2 rounded hover:bg-muted/40 transition-colors"
            >
              <ChevronUp className="h-3 w-3" />
              {loadingOlder ? "Loading..." : "Load older"}
            </button>
          )}

          {messages.length === 0 && (
            <div className="flex-1 flex items-center justify-center">
              <span className="text-sm text-muted-foreground">
                No messages yet
              </span>
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.seq}
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                m.role === "user"
                  ? "self-end bg-primary/15 text-foreground"
                  : "self-start bg-muted/50 text-foreground"
              }`}
            >
              <div>{m.text}</div>
              <div className="mt-1 text-[10px] text-muted-foreground/70 text-right">
                {m.role === "user" ? "you" : "tiger"} · {formatTime(m.timestamp)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
