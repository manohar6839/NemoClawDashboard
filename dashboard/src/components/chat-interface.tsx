"use client"

import * as React from "react"
import { Send, Square, Bot, User, AlertCircle, Loader2 } from "lucide-react"
import ReactMarkdown from "react-markdown"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useGatewayRequest, useGatewayEvents } from "@/hooks/use-gateway"

type Message = {
  id: string
  role: "user" | "agent" | "system"
  content: string
  streaming?: boolean
  timestamp: number
}

function extractContent(content: unknown): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((block: unknown) => {
        if (typeof block === "string") return block
        if (block && typeof block === "object" && "text" in block) return String((block as { text: string }).text)
        return ""
      })
      .filter(Boolean)
      .join("\n")
  }
  if (content && typeof content === "object") {
    const obj = content as Record<string, unknown>
    if ("text" in obj) return String(obj.text)
    if ("content" in obj) return extractContent(obj.content)
  }
  return ""
}

export function ChatInterface({ className, ...props }: React.ComponentProps<typeof Card>) {
  const [input, setInput] = React.useState("")
  const [messages, setMessages] = React.useState<Message[]>([])
  const [sending, setSending] = React.useState(false)
  const [agentTyping, setAgentTyping] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const { request } = useGatewayRequest()
  const streamingContentRef = React.useRef("")

  // Load chat history on mount
  React.useEffect(() => {
    request("chat.history", { sessionKey: "agent:main:main", limit: 50 })
      .then((data: unknown) => {
        const history = data as { messages?: Array<{ role: string; content: unknown; ts?: number }> }
        if (history?.messages?.length) {
          setMessages(
            history.messages.map((m, i) => ({
              id: `hist-${i}`,
              role: m.role === "user" ? "user" : "agent",
              content: extractContent(m.content),
              timestamp: m.ts || Date.now(),
            }))
          )
        }
      })
      .catch(() => {
        setMessages([{
          id: "welcome",
          role: "agent",
          content: "Connected to Tarzan via gateway. Send a message to start chatting.",
          timestamp: Date.now(),
        }])
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Subscribe to gateway events for streaming responses
  const { connected } = useGatewayEvents((event, payload) => {
    const data = payload as Record<string, unknown>

    if (event === "chat") {
      // Incoming chat message (from other channels or agent completion)
      const role = (data.role as string) === "user" ? "user" : "agent"
      const content = extractContent(data.text || data.content || "")
      if (!content) return

      setMessages(prev => {
        // Remove any streaming message and add final
        const filtered = prev.filter(m => !m.streaming)
        return [...filtered, {
          id: `chat-${Date.now()}`,
          role,
          content,
          timestamp: Date.now(),
        }]
      })
      setAgentTyping(false)
      streamingContentRef.current = ""
    }

    if (event === "agent") {
      // Streaming agent response chunks
      const chunk = data.chunk as string | undefined
      const done = data.done as boolean | undefined
      const text = data.text as string | undefined

      if (chunk || text) {
        streamingContentRef.current += (chunk || text || "")
        setAgentTyping(true)

        setMessages(prev => {
          const filtered = prev.filter(m => !m.streaming)
          return [...filtered, {
            id: "streaming",
            role: "agent",
            content: streamingContentRef.current,
            streaming: true,
            timestamp: Date.now(),
          }]
        })
      }

      if (done) {
        setAgentTyping(false)
        setSending(false)
        // Finalize streaming message
        if (streamingContentRef.current) {
          setMessages(prev => {
            const filtered = prev.filter(m => !m.streaming)
            return [...filtered, {
              id: `agent-${Date.now()}`,
              role: "agent",
              content: streamingContentRef.current,
              timestamp: Date.now(),
            }]
          })
        }
        streamingContentRef.current = ""
      }
    }
  }, [])

  // Auto-scroll to bottom
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
    streamingContentRef.current = ""

    // Add user message immediately
    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
    }])

    try {
      await request("chat.send", {
        sessionKey: "agent:main:main",
        message: text,
        idempotencyKey: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      })
      // Response will come via SSE events (agent/chat events)
    } catch {
      setSending(false)
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: "system",
        content: "Failed to send message. Is the gateway running?",
        timestamp: Date.now(),
      }])
    }
  }

  const handleAbort = async () => {
    try {
      await request("chat.abort", { sessionKey: "agent:main:main" })
    } catch {
      // ignore
    }
    setSending(false)
    setAgentTyping(false)
  }

  return (
    <Card className={cn("w-full flex flex-col", className)} {...props}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-5 w-5" />
          Chat
          <span className={cn(
            "ml-auto h-2 w-2 rounded-full",
            connected ? "bg-green-500" : "bg-red-500"
          )} />
        </CardTitle>
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
                <div
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : message.role === "system"
                      ? "bg-destructive/10 text-destructive flex items-center gap-2 w-full justify-center"
                      : "bg-muted",
                    message.streaming ? "border border-primary/30" : ""
                  )}
                >
                  {message.role === "system" && <AlertCircle className="h-3 w-3" />}
                  {message.role === "agent" ? (
                    <div className="prose prose-sm prose-invert max-w-none [&>p]:m-0">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  ) : (
                    message.content
                  )}
                  {message.streaming && (
                    <span className="inline-block w-1.5 h-4 bg-primary/70 animate-pulse ml-0.5" />
                  )}
                </div>
              </div>
            ))}
            {agentTyping && !messages.some(m => m.streaming) && (
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
            placeholder={connected ? "Message Tarzan..." : "Gateway offline..."}
            className="flex-1"
            autoComplete="off"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!connected || sending}
          />
          {sending ? (
            <Button type="button" size="icon" variant="destructive" onClick={handleAbort}>
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim() || !connected}>
              <Send className="h-4 w-4" />
            </Button>
          )}
        </form>
      </CardFooter>
    </Card>
  )
}
