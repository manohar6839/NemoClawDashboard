"use client"

import * as React from "react"
import { Send, Square, Bot, User, AlertCircle, Loader2, Eraser } from "lucide-react"
import ReactMarkdown from "react-markdown"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useChatContext } from "@/contexts/chat-context"

export function ChatInterface({ className, ...props }: React.ComponentProps<typeof Card>) {
  const [input, setInput] = React.useState("")
  // Persistent chat state — survives navigation between routes.
  // See contexts/chat-context.tsx for the rationale.
  const { messages, setMessages, clearChat } = useChatContext()
  const [sending, setSending] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const abortRef = React.useRef<AbortController | null>(null)
  const streamingRef = React.useRef("")

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || sending) return

    const text = input.trim()
    setInput("")
    setSending(true)
    streamingRef.current = ""

    // Add user message
    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
    }])

    try {
      const controller = new AbortController()
      abortRef.current = controller

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) throw new Error("Failed to connect")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      // Buffer across reads — a single SSE event ("data: ...\n\n") may be
      // split across TCP chunks. Accumulate, then split on the SSE delimiter.
      let buffer = ""

      const streamId = `streaming-${Date.now()}`

      while (true) {
        const { done: readerDone, value } = await reader.read()
        if (readerDone) break

        // {stream: true} preserves decoder state for multi-byte UTF-8 chars
        // (e.g. emoji) that happen to land across chunk boundaries.
        buffer += decoder.decode(value, { stream: true })

        // SSE events end with a blank line (\n\n). Anything after the last
        // \n\n is a partial event — keep it in `buffer` for the next read.
        const events = buffer.split("\n\n")
        buffer = events.pop() || ""

        for (const eventBlock of events) {
          const dataLine = eventBlock.split("\n").find(l => l.startsWith("data: "))
          if (!dataLine) continue

          let data: { type: string; content?: string }
          try {
            data = JSON.parse(dataLine.slice(6))
          } catch (err) {
            // Don't swallow silently — log so real parse bugs are visible.
            console.warn("[chat] SSE parse error:", err, "line:", dataLine)
            continue
          }

          console.log("[chat] event:", data.type, "content:", data.content?.substring(0, 50))

          if (data.type === "status") {
            // Transient 'Tiger is thinking...' indicator. Do NOT append to
            // the message content — that was Bug A. Just ensure a streaming
            // placeholder exists so the UI shows activity.
            setMessages(prev => {
              if (prev.some(m => m.streaming)) return prev
              return [...prev, {
                id: streamId,
                role: "agent",
                content: "",
                streaming: true,
                timestamp: Date.now(),
              }]
            })
          } else if (data.type === "chunk") {
            streamingRef.current += data.content || ""
            setMessages(prev => {
              const existing = prev.find(m => m.streaming)
              if (existing) {
                return prev.map(m =>
                  m.streaming ? { ...m, content: streamingRef.current } : m
                )
              }
              return [...prev, {
                id: streamId,
                role: "agent",
                content: streamingRef.current,
                streaming: true,
                timestamp: Date.now(),
              }]
            })
          } else if (data.type === "message") {
            // Non-streaming full message
            setMessages(prev => {
              const filtered = prev.filter(m => !m.streaming)
              return [...filtered, {
                id: `agent-${Date.now()}`,
                role: "agent",
                content: data.content || "",
                timestamp: Date.now(),
              }]
            })
          } else if (data.type === "done") {
            // Fall back to data.content if the chunk event somehow didn't
            // land — Bug D. This is a belt-and-suspenders safety.
            const finalContent = streamingRef.current || data.content || ""
            setMessages(prev => {
              const filtered = prev.filter(m => !m.streaming)
              if (!finalContent) return filtered
              return [...filtered, {
                id: `agent-${Date.now()}`,
                role: "agent",
                content: finalContent,
                timestamp: Date.now(),
              }]
            })
            streamingRef.current = ""
            setSending(false)
          } else if (data.type === "error") {
            setMessages(prev => [...prev.filter(m => !m.streaming), {
              id: `err-${Date.now()}`,
              role: "system",
              content: data.content || "Something went wrong",
              timestamp: Date.now(),
            }])
            setSending(false)
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setMessages(prev => [...prev.filter(m => !m.streaming), {
          id: `err-${Date.now()}`,
          role: "system",
          content: "Failed to send message. Is Tiger running?",
          timestamp: Date.now(),
        }])
      }
      setSending(false)
    }

    abortRef.current = null
  }

  const handleAbort = () => {
    abortRef.current?.abort()
    setSending(false)
    streamingRef.current = ""
    setMessages(prev => prev.filter(m => !m.streaming))
  }

  return (
    <Card className={cn("w-full flex flex-col", className)} {...props}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-5 w-5" />
            Chat with Tiger
          </CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearChat}
            className="text-xs text-muted-foreground h-7"
            title="Clear conversation"
          >
            <Eraser className="h-3 w-3 mr-1" />
            Clear
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0 min-h-0">
        <ScrollArea className="h-[500px] px-4" ref={scrollRef}>
          <div className="space-y-4 py-2">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-2 max-w-[85%]",
                  message.role === "user" ? "ml-auto flex-row-reverse" : "",
                  message.role === "system" ? "mx-auto max-w-full" : ""
                )}
              >
                {message.role !== "system" && (
                  <div className={cn(
                    "flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center",
                    message.role === "user" ? "bg-primary" : "bg-muted"
                  )}>
                    {message.role === "user" ? (
                      <User className="h-4 w-4 text-primary-foreground" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                  </div>
                )}
                <div className={cn(
                  "rounded-lg px-3 py-2 text-sm",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : message.role === "system"
                    ? "bg-destructive/10 text-destructive flex items-center gap-2 w-full justify-center"
                    : "bg-muted",
                  message.streaming ? "border border-primary/30" : ""
                )}>
                  {message.role === "system" && <AlertCircle className="h-3 w-3" />}
                  {message.role === "agent" ? (
                    // While streaming: render raw text (cheap, one DOM node update per token).
                    // After streaming completes: render full ReactMarkdown (expensive but
                    // only happens once). This is what makes the typing feel actually show up.
                    message.streaming ? (
                      <div className="whitespace-pre-wrap">{message.content}</div>
                    ) : (
                      <div className="prose prose-sm prose-invert max-w-none [&>p]:m-0">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    )
                  ) : (
                    message.content
                  )}
                  {message.streaming && (
                    <span className="inline-block w-1.5 h-4 bg-primary/70 animate-pulse ml-0.5" />
                  )}
                </div>
              </div>
            ))}
            {sending && !messages.some(m => m.streaming) && (
              <div className="flex gap-2">
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="bg-muted rounded-lg px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="pt-3">
        <form onSubmit={handleSubmit} className="flex w-full items-center space-x-2">
          <Input
            placeholder="Message Tiger..."
            className="flex-1"
            autoComplete="off"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={sending}
          />
          {sending ? (
            <Button type="button" size="icon" variant="destructive" onClick={handleAbort}>
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          )}
        </form>
      </CardFooter>
    </Card>
  )
}
