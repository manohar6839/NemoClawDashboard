"use client"

import { CommandBar } from "@/components/command-bar"
import { AgentStrip } from "@/components/agent-strip"
import { DigestCard } from "@/components/digest-card"
import { TelegramThreadCard } from "@/components/telegram-thread-card"
import { StatusFooter } from "@/components/status-footer"
import { ScheduleCard } from "@/components/schedule-card"
import { HealthBanner } from "@/components/health-banner"

export default function HomePage() {
  return (
    <div className="flex flex-col gap-5 max-w-5xl mx-auto w-full">
      {/* HEALTH — invisible when healthy; impossible to miss when not. */}
      <HealthBanner />

      {/* HERO — the command bar is the front door of Tiger. */}
      <CommandBar />

      {/* AGENTS — one strip, all 5 agents, live state at a glance. */}
      <AgentStrip />

      {/* CONTEXT ROW — digest (left) + Telegram thread (right) */}
      <div className="grid gap-4 md:grid-cols-2">
        <DigestCard />
        <TelegramThreadCard />
      </div>

      {/* SCHEDULE ROW — Tiger's cron jobs + next-run times */}
      <ScheduleCard />

      {/* FOOTER — system health strip. Becomes a banner on crash. */}
      <StatusFooter />
    </div>
  )
}
