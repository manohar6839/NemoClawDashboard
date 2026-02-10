import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import os from "os"

interface ActivityEntry {
  id: string
  type: "heartbeat" | "chat" | "config" | "memory" | "system" | "cron"
  timestamp: string
  description: string
  source?: string
}

function parseCommandsLog(logPath: string): ActivityEntry[] {
  const entries: ActivityEntry[] = []
  try {
    const content = fs.readFileSync(logPath, "utf-8").trim()
    if (!content) return entries
    for (const line of content.split("\n")) {
      try {
        const data = JSON.parse(line) as {
          timestamp: string
          action: string
          sessionKey: string
          senderId: string
          source: string
        }
        const actionLabels: Record<string, string> = {
          new: "New chat session",
          reset: "Session reset",
          delete: "Session deleted",
        }
        const sourceLabels: Record<string, string> = {
          webchat: "Web Chat",
          telegram: "Telegram",
          whatsapp: "WhatsApp",
          cli: "CLI",
        }
        const actionLabel = actionLabels[data.action] || data.action
        const sourceLabel = sourceLabels[data.source] || data.source
        entries.push({
          id: `cmd-${data.timestamp}-${data.action}`,
          type: "chat",
          timestamp: data.timestamp,
          description: `${actionLabel} via ${sourceLabel}`,
          source: data.source,
        })
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    // file not found
  }
  return entries
}

function parseGatewayLog(logPath: string): ActivityEntry[] {
  const entries: ActivityEntry[] = []
  try {
    const content = fs.readFileSync(logPath, "utf-8")
    const lines = content.split("\n")

    // Track seen heartbeat dates to deduplicate (only first per gateway restart)
    let lastHeartbeatDay = ""

    for (const line of lines) {
      if (!line.trim()) continue

      // Parse timestamp from start of line: "2026-01-27T02:35:09.747Z [tag] message"
      const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s+(.*)$/)
      if (!match) continue

      const timestamp = match[1]
      const rest = match[2]

      // Heartbeat events - only include first per gateway restart (not every "started")
      if (rest.startsWith("[heartbeat]")) {
        const msg = rest.replace("[heartbeat]", "").trim()
        // Skip repetitive "started" - only keep once per gateway boot
        if (msg === "started") {
          const day = timestamp.slice(0, 10)
          if (day === lastHeartbeatDay) continue
          lastHeartbeatDay = day
          entries.push({
            id: `gw-hb-${timestamp}`,
            type: "heartbeat",
            timestamp,
            description: "Heartbeat service started",
          })
        } else {
          // Non-"started" heartbeat messages are meaningful
          entries.push({
            id: `gw-hb-${timestamp}`,
            type: "heartbeat",
            timestamp,
            description: `Heartbeat: ${msg}`,
          })
        }
        continue
      }

      // Config reload events
      if (rest.startsWith("[reload]")) {
        const msg = rest.replace("[reload]", "").trim()
        const changedMatch = msg.match(/evaluating reload \((.+)\)/)
        const changed = changedMatch ? changedMatch[1] : msg
        entries.push({
          id: `gw-reload-${timestamp}`,
          type: "config",
          timestamp,
          description: `Config reload: ${changed}`,
        })
        continue
      }

      // Gateway startup/lifecycle - only truly significant events
      if (rest.startsWith("[gateway]")) {
        const msg = rest.replace("[gateway]", "").trim()
        if (msg.startsWith("listening on")) {
          // Reset heartbeat dedup on new gateway start
          lastHeartbeatDay = ""
          entries.push({
            id: `gw-sys-${timestamp}`,
            type: "system",
            timestamp,
            description: `Gateway started: ${msg}`,
          })
        } else if (msg.startsWith("agent model:")) {
          entries.push({
            id: `gw-sys-${timestamp}`,
            type: "system",
            timestamp,
            description: `Active model: ${msg.replace("agent model:", "").trim()}`,
          })
        } else if (msg.includes("signal")) {
          entries.push({
            id: `gw-sys-${timestamp}`,
            type: "system",
            timestamp,
            description: msg,
          })
        }
        continue
      }

      // Telegram provider start (only once per restart)
      if (rest.startsWith("[telegram]") && rest.includes("starting provider")) {
        const botMatch = rest.match(/\(@[^)]+\)/)
        entries.push({
          id: `gw-tg-${timestamp}`,
          type: "system",
          timestamp,
          description: `Telegram provider started ${botMatch?.[0] || ""}`.trim(),
        })
        continue
      }

      // Cron execution events
      if (rest.includes("cron.run") && rest.includes("[ws]") && rest.includes("res ✓")) {
        entries.push({
          id: `gw-cron-${timestamp}`,
          type: "cron",
          timestamp,
          description: "Cron job executed",
        })
        continue
      }
    }
  } catch {
    // file not found
  }
  return entries
}

function parseMemoryFiles(memoryDir: string): ActivityEntry[] {
  const entries: ActivityEntry[] = []
  try {
    const files = fs.readdirSync(memoryDir).filter((f) => f.endsWith(".md"))
    for (const file of files) {
      const filePath = path.join(memoryDir, file)
      const stat = fs.statSync(filePath)
      const slug = file.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "")
      const title = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      entries.push({
        id: `mem-${file}`,
        type: "memory",
        timestamp: stat.mtime.toISOString(),
        description: `Memory saved: ${title}`,
      })
    }
  } catch {
    // directory not found
  }
  return entries
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const limit = parseInt(url.searchParams.get("limit") || "200", 10)

    const clawdbotLogsDir = path.join(os.homedir(), ".clawdbot", "logs")
    const workspace = "/Users/manohar_air/clawd"
    const memoryDir = path.join(workspace, "memory")

    // Aggregate from all sources
    const commandEntries = parseCommandsLog(path.join(clawdbotLogsDir, "commands.log"))
    const gatewayEntries = parseGatewayLog(path.join(clawdbotLogsDir, "gateway.log"))
    const memoryEntries = parseMemoryFiles(memoryDir)

    // Merge and sort by timestamp descending
    const allEntries = [...commandEntries, ...gatewayEntries, ...memoryEntries]
    allEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    // Apply limit
    const entries = allEntries.slice(0, limit)

    return NextResponse.json({
      entries,
      total: allEntries.length,
    })
  } catch {
    return NextResponse.json({ error: "Failed to fetch activity" }, { status: 500 })
  }
}
