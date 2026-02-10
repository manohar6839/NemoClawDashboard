"use client"

import { ChatInterface } from "@/components/chat-interface"

export default function ChatPage() {
  return (
    <div className="h-full w-full flex flex-col">
      <ChatInterface className="flex-1 bg-card/40 border-primary/20" />
    </div>
  )
}
