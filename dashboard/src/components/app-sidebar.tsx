"use client"

/**
 * app-sidebar.tsx — Tiger Command Center sidebar
 *
 * Phase 1 redesign. The new IA is built around the way YOU actually work:
 *  Home      — command + live state (the new front door)
 *  Chat      — unified web + Telegram thread (Phase 4 will wire Telegram)
 *  Projects  — orchestration containers; click a project to see tasks + agents
 *  Agents    — per-sub-agent detail and (Phase 3) per-agent model overrides
 *  Knowledge — Tiger's brain: memory, skills, activity, scheduled jobs
 *  Workspace — file tree of /sandbox + diffs
 *  Cost      — finance-grade cost dashboard
 *  Logs      — raw streaming logs (dev drill-down)
 *  Settings
 *
 * Key change from the previous sidebar: no orphan pages. Memory, Sessions,
 * Skills, Activity, and Cron are now reachable through Knowledge / Agents /
 * Chat instead of being floating routes nobody could navigate to.
 */

import * as React from "react"
import {
  Home,
  MessageSquare,
  Briefcase,
  Bot,
  Brain,
  FolderOpen,
  DollarSign,
  ScrollText,
  Settings2,
} from "lucide-react"
import { useTigerLogs } from "@/hooks/use-bridge"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

// Primary navigation — the main verbs of using Tiger.
// Ordered by frequency-of-use so the most-tapped items sit at the top.
const navMain = [
  { title: "Home",      url: "/",          icon: Home },
  { title: "Chat",      url: "/chat",      icon: MessageSquare },
  { title: "Projects",  url: "/projects",  icon: Briefcase },
  { title: "Agents",    url: "/agents",    icon: Bot },
  { title: "Knowledge", url: "/knowledge", icon: Brain },
  { title: "Workspace", url: "/workspace", icon: FolderOpen },
  { title: "Activity", url: "/activity",  icon: ScrollText },
  { title: "Cost",      url: "/cost",      icon: DollarSign },
  { title: "Logs",      url: "/logs",      icon: ScrollText },
]

// Secondary navigation — sits in the footer, less-frequent admin stuff.
const navSecondary = [
  { title: "Settings", url: "/settings", icon: Settings2 },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  // Use the existing log stream as a heartbeat — if it's connected, the bridge
  // is reachable, so we're "Live". If not, the dot goes red.
  const { connected } = useTigerLogs({ lines: 1, maxLines: 1 })

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="/">
                {/* Tiger badge — same gradient T as the favicon for brand consistency */}
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-orange-500/15 border border-orange-500/30">
                  <span className="text-orange-400 font-bold text-base">T</span>
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="text-sm font-semibold">Tiger</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      connected ? "bg-green-500 animate-pulse" : "bg-red-500"
                    }`} />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      {connected ? "Live" : "Offline"}
                    </span>
                  </div>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu className="gap-1 p-2">
          {navMain.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild tooltip={item.title}>
                <a href={item.url}>
                  <item.icon />
                  <span>{item.title}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {navSecondary.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild size="sm" tooltip={item.title}>
                <a href={item.url}>
                  <item.icon />
                  <span>{item.title}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
