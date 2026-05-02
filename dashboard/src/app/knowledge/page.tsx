"use client"

/**
 * /knowledge — Tiger's brain (Phase 1 hub)
 *
 * Absorbs four orphans that previously had no sidebar entry:
 *   /memory    — SOUL.md, USER.md, IDENTITY.md, MEMORY.md content
 *   /skills    — registry of skills
 *   /activity  — agent file-write timeline
 *   /cron      — scheduled tasks
 *
 * For Phase 1 this is a hub that links into each existing page. Phase 6
 * will fold all four into tabs on this page.
 */

import { Brain, ScrollText, Wrench, Activity, Clock } from "lucide-react"
import { Card } from "@/components/ui/card"

const sections = [
  {
    title: "Memory",
    href: "/memory",
    icon: ScrollText,
    description:
      "Tiger's persistent memory — SOUL.md, USER.md, IDENTITY.md, MEMORY.md. " +
      "Edit these files to teach Tiger about you and itself.",
  },
  {
    title: "Skills",
    href: "/skills",
    icon: Wrench,
    description:
      "Registry of capabilities Tiger can invoke. Skills are reusable " +
      "instruction sets that ship with the openclaw runtime.",
  },
  {
    title: "Activity",
    href: "/activity",
    icon: Activity,
    description:
      "Timeline of every workspace file write across all agents. Useful for " +
      "auditing what Tiger and the sub-agents have been doing.",
  },
  {
    title: "Scheduled jobs",
    href: "/cron",
    icon: Clock,
    description:
      "Cron-scheduled agent runs. Things like 'morning digest at 8am' or " +
      "'pull RE news daily' live here.",
  },
]

export default function KnowledgePage() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto w-full">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Brain className="h-6 w-6 text-primary" />
          Knowledge
        </h1>
        <p className="text-muted-foreground text-sm">
          Tiger's brain — what it remembers, what it can do, what it's done,
          and what it'll do next.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {sections.map(({ title, href, icon: Icon, description }) => (
          <a key={title} href={href} className="contents">
            <Card className="bg-card/40 p-5 hover:bg-card/60 hover:border-primary/30 transition-colors cursor-pointer">
              <div className="flex items-start gap-3 mb-2">
                <div className="shrink-0 h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <h2 className="font-semibold text-lg leading-snug">{title}</h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {description}
              </p>
              <div className="mt-3 text-xs text-primary">
                Open {title.toLowerCase()} →
              </div>
            </Card>
          </a>
        ))}
      </div>
    </div>
  )
}
