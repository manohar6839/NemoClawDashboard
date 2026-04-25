"use client"

/**
 * ChatContext — chat state that persists across route changes AND across
 * hard refreshes (via the server-side /api/chat/history endpoint).
 *
 * THREE LAYERS OF STATE:
 *   1. React Context        — survives client-side navigation between routes
 *   2. localStorage         — remembers which sessionKey was active across reloads
 *   3. Server-side history  — sqlite in bridge; survives device change, tab close
 *
 * SESSION MODEL (post WS-migration):
 *   Each chat is keyed by a `sessionKey` like:
 *     - "agent:main:main"               → the default Tiger conversation
 *     - "agent:main:webchat-<8hex>"     → a fresh session created via "+ New"
 *   The sessionKey is passed to /api/chat so the gateway routes to the right
 *   conversation memory. It's also passed to /api/chat/history?sessionId=<key>.
 *
 * FLOW:
 *   Mount   → load sessions list   → load history for current sessionKey
 *   New     → POST /api/chat/sessions → set as current, clear messages
 *   Switch  → set current → load history
 *   Send    → optimistic UI → POST /api/chat with current sessionKey
 *   Clear   → DELETE /api/chat/history?sessionId=<current>
 *   Delete  → DELETE /api/chat/sessions?key=<x> → drop, switch to Main
 */
import * as React from "react"

const DEFAULT_SESSION_KEY = "agent:main:main"
const STORAGE_KEY = "tiger.currentSessionKey"

export type ChatMessage = {
  id: string
  role: "user" | "agent" | "system"
  content: string
  streaming?: boolean
  timestamp: number
}

export type ChatSession = {
  key: string
  label: string
  updatedAt: number | null
  messageCount: number
  isDefault: boolean
}

const DEFAULT_WELCOME: ChatMessage = {
  id: "welcome",
  role: "agent",
  content: "Hey! I am Tiger, your AI assistant. Send me a message to get started.",
  timestamp: 0,
}

type ChatContextValue = {
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  loading: boolean
  /** The sessionKey currently being chatted with — sent to /api/chat. */
  currentSessionKey: string
  /** All webchat-visible sessions (from gateway sessions.list). */
  sessions: ChatSession[]
  /** Switch to an existing session — loads its history. */
  selectSession: (key: string) => Promise<void>
  /** Mint and switch to a brand-new session — clears messages. */
  newSession: () => Promise<void>
  /** Delete a non-default session — switches to Main if the active one is removed. */
  deleteSession: (key: string) => Promise<void>
  /** Wipe the *current* session's history (keeps the session itself). */
  clearChat: () => Promise<void>
  /** Force-refresh the sessions list (e.g., after a send so updatedAt updates). */
  refreshSessions: () => Promise<void>
}

const ChatContext = React.createContext<ChatContextValue | null>(null)

/** Read the saved sessionKey from localStorage (SSR-safe). */
function readPersistedKey(): string {
  if (typeof window === "undefined") return DEFAULT_SESSION_KEY
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_SESSION_KEY
  } catch {
    return DEFAULT_SESSION_KEY
  }
}

function writePersistedKey(key: string): void {
  if (typeof window === "undefined") return
  try { localStorage.setItem(STORAGE_KEY, key) } catch { /* quota / private mode */ }
}

/** Fetch history for a sessionKey, returning hydrated messages (welcome first). */
async function loadHistoryFor(sessionKey: string): Promise<ChatMessage[]> {
  try {
    const r = await fetch(`/api/chat/history?sessionId=${encodeURIComponent(sessionKey)}`, { cache: "no-store" })
    if (!r.ok) throw new Error(`history ${r.status}`)
    const data = await r.json()
    if (!data?.ok || !Array.isArray(data.messages)) return [DEFAULT_WELCOME]
    return [
      DEFAULT_WELCOME,
      ...data.messages.map((m: any) => ({
        id: String(m.id),
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      })),
    ]
  } catch (err) {
    console.warn("[chat] could not load history for", sessionKey, err)
    return [DEFAULT_WELCOME]
  }
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([DEFAULT_WELCOME])
  const [loading, setLoading] = React.useState(true)
  const [currentSessionKey, setCurrentSessionKey] = React.useState<string>(DEFAULT_SESSION_KEY)
  const [sessions, setSessions] = React.useState<ChatSession[]>([])

  const refreshSessions = React.useCallback(async () => {
    try {
      const r = await fetch("/api/chat/sessions", { cache: "no-store" })
      if (!r.ok) return
      const data = await r.json()
      if (data?.ok && Array.isArray(data.sessions)) setSessions(data.sessions)
    } catch (err) {
      console.warn("[chat] sessions list failed:", err)
    }
  }, [])

  // Initial mount: pick stored sessionKey, load its history, fetch sessions list.
  React.useEffect(() => {
    let cancelled = false
    async function init() {
      const persisted = readPersistedKey()
      if (cancelled) return
      setCurrentSessionKey(persisted)
      const [hist] = await Promise.all([loadHistoryFor(persisted), refreshSessions()])
      if (!cancelled) {
        setMessages(hist)
        setLoading(false)
      }
    }
    init()
    return () => { cancelled = true }
  }, [refreshSessions])

  const selectSession = React.useCallback(async (key: string) => {
    if (key === currentSessionKey) return
    setLoading(true)
    setCurrentSessionKey(key)
    writePersistedKey(key)
    const hist = await loadHistoryFor(key)
    setMessages(hist)
    setLoading(false)
  }, [currentSessionKey])

  const newSession = React.useCallback(async () => {
    try {
      const r = await fetch("/api/chat/sessions", { method: "POST" })
      const data = await r.json()
      if (!r.ok || !data?.ok || !data.session?.key) {
        console.warn("[chat] new session failed:", data)
        return
      }
      const key = data.session.key as string
      setCurrentSessionKey(key)
      writePersistedKey(key)
      setMessages([DEFAULT_WELCOME])
      // Add to local list optimistically; full refresh happens after first send
      setSessions(prev => {
        if (prev.find(s => s.key === key)) return prev
        return [...prev, data.session as ChatSession]
      })
    } catch (err) {
      console.warn("[chat] new session error:", err)
    }
  }, [])

  const deleteSession = React.useCallback(async (key: string) => {
    if (key === DEFAULT_SESSION_KEY) return
    try {
      await fetch(`/api/chat/sessions?key=${encodeURIComponent(key)}`, { method: "DELETE" })
    } catch (err) {
      console.warn("[chat] delete session failed:", err)
    }
    setSessions(prev => prev.filter(s => s.key !== key))
    // If the deleted session was active, fall back to Main.
    if (key === currentSessionKey) {
      setCurrentSessionKey(DEFAULT_SESSION_KEY)
      writePersistedKey(DEFAULT_SESSION_KEY)
      const hist = await loadHistoryFor(DEFAULT_SESSION_KEY)
      setMessages(hist)
    }
  }, [currentSessionKey])

  const clearChat = React.useCallback(async () => {
    setMessages([DEFAULT_WELCOME])
    try {
      await fetch(`/api/chat/history?sessionId=${encodeURIComponent(currentSessionKey)}`, { method: "DELETE" })
    } catch (err) {
      console.warn("[chat] clear server failed (local cleared):", err)
    }
  }, [currentSessionKey])

  return (
    <ChatContext.Provider value={{
      messages, setMessages, loading,
      currentSessionKey, sessions,
      selectSession, newSession, deleteSession,
      clearChat, refreshSessions,
    }}>
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
