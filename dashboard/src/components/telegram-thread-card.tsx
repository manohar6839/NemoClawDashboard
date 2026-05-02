"use client"

/**
 * telegram-thread-card.tsx — Preview of recent Telegram conversation
 *
 * PHASE 1: Renders an empty state today. Phase 4 of the plan adds a Telegram
 * listener in the bridge that writes inbound/outbound Telegram messages
 * with session_id = "telegram:<chat_id>". When that lands, this component
 * starts populating with zero additional frontend work.
 */

import * as React from "react"
import useSWR from "swr"
import { Card } from "@/components/ui/card"
import { Send } from "lucide-react"

interface TelegramMessage {
  role: "user" | "agent" | "system"
  content: string
  ts: number
}

interface TelegramResponse {
  ok: boolean
  messages: TelegramMessage[]
}

const fetcher = (url: string) =>
  fetch(url).then((r) => (r.ok ? r.json() : { ok: false, messages: [] }))

function relTime(ts: number): string {
  if (!ts) return ""
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60_000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function truncate(s: string, max = 90): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…"
}

export function TelegramThreadCard() {
  const { data } = useSWR<TelegramResponse>(
    "/api/chat?source=telegram&limit=5",
    fetcher,
    { refreshInterval: 60_000, shouldRetryOnError: false }
  )

  const messages = data?.messages ?? []
  const hasData = messages.length > 0

  return (
    <Card className="bg-card/40 p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 text-primary" />
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
            Telegram thread
          </span>
        </div>
        <a href="/chat" className="text-xs text-primary hover:underline">
          Open chat →
        </a>
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
                  {relTime(msg.ts)}
                </span>
              </div>
              <p className="text-foreground/85 text-xs leading-relaxed mt-0.5">
                {truncate(msg.content)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-6 px-2">
          <Send className="h-8 w-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">
            No Telegram messages mirrored yet.
          </p>
          <p className="text-[11px] text-muted-foreground/60 mt-1 max-w-[260px]">
            Phase 4 will sync your @Tiger_4321_bot conversation here so web
            and Telegram share one history.
          </p>
        </div>
      )}
    </Card>
  )
}
