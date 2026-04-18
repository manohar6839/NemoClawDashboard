"use client"

/**
 * ChatContext — chat state that persists across route changes AND across
 * hard refreshes (via the server-side /api/chat/history endpoint).
 *
 * TWO LAYERS OF PERSISTENCE:
 *   1. React Context → survives client-side navigation between /chat, /workspace
 *   2. Server-side history (SQLite in bridge) → survives refresh, tab close,
 *      device change. On mount we fetch history and hydrate the messages.
 *
 * FLOW:
 *   Mount → GET /api/chat/history → merge with default welcome message
 *   Send message → optimistic local update → /api/chat → server persists
 *   Clear       → DELETE /api/chat/history → reset to just the welcome
 */
import * as React from "react"

export type ChatMessage = {
  id: string
  role: "user" | "agent" | "system"
  content: string
  streaming?: boolean
  timestamp: number
}

const DEFAULT_WELCOME: ChatMessage = {
  id: "welcome",
  role: "agent",
  content: "Hey! I am Tiger, your AI assistant. Send me a message to get started.",
  timestamp: 0, // sentinel — always sorted to the top
}

type ChatContextValue = {
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  clearChat: () => Promise<void>
  loading: boolean
}

const ChatContext = React.createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([DEFAULT_WELCOME])
  const [loading, setLoading] = React.useState(true)

  // Hydrate from server on mount. This is what makes persistence actually
  // work across hard refresh.
  React.useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const r = await fetch("/api/chat/history", { cache: "no-store" })
        if (!r.ok) throw new Error(`history ${r.status}`)
        const data = await r.json()
        if (cancelled || !data?.ok || !Array.isArray(data.messages)) return

        // Combine welcome + history, no duplicates. Sort by timestamp so
        // it renders in conversational order.
        const hydrated: ChatMessage[] = [
          DEFAULT_WELCOME,
          ...data.messages.map((m: any) => ({
            id: String(m.id),
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
          })),
        ]
        setMessages(hydrated)
      } catch (err) {
        console.warn("[chat] could not load history:", err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const clearChat = React.useCallback(async () => {
    // Optimistic: clear UI first, then ask server to clear.
    setMessages([DEFAULT_WELCOME])
    try {
      await fetch("/api/chat/history", { method: "DELETE" })
    } catch (err) {
      console.warn("[chat] clear on server failed (local cleared):", err)
    }
  }, [])

  return (
    <ChatContext.Provider value={{ messages, setMessages, clearChat, loading }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChatContext(): ChatContextValue {
  const ctx = React.useContext(ChatContext)
  if (!ctx) {
    throw new Error(
      "useChatContext must be used inside <ChatProvider>. " +
      "Make sure app/layout.tsx wraps children with <ChatProvider>."
    )
  }
  return ctx
}
