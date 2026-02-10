import { NextResponse } from "next/server"
import os from "os"
import fs from "fs"
import path from "path"
import { getGateway } from "@/lib/gateway"

export async function GET() {
  try {
    const freeMem = os.freemem()
    const totalMem = os.totalmem()
    const memUsage = Math.round(((totalMem - freeMem) / totalMem) * 100)

    // Try gateway first for rich data
    try {
      const gw = getGateway()
      if (!gw.isConnected()) await gw.connect()

      const [health, skills, cron, heartbeat, identity, models, config] = await Promise.allSettled([
        gw.request("health"),
        gw.request("skills.status"),
        gw.request("cron.list"),
        gw.request("last-heartbeat"),
        gw.request("agent.identity.get"),
        gw.request("models.list"),
        gw.request("config.get"),
      ])

      const healthData = health.status === "fulfilled" ? health.value as Record<string, unknown> : null
      const skillsData = skills.status === "fulfilled" ? skills.value as Record<string, unknown> : null
      const cronData = cron.status === "fulfilled" ? cron.value as unknown[] : null
      const heartbeatData = heartbeat.status === "fulfilled" ? heartbeat.value as Record<string, unknown> : null
      const identityData = identity.status === "fulfilled" ? identity.value as Record<string, unknown> : null
      const modelsData = models.status === "fulfilled" ? models.value as Record<string, unknown> : null
      const configData = config.status === "fulfilled" ? config.value as Record<string, unknown> : null

      const skillsList = (skillsData?.skills || skillsData?.installed || []) as unknown[]
      const cronList = Array.isArray(cronData) ? cronData : ((cronData as Record<string, unknown> | null)?.jobs as unknown[] | undefined) || []

      // Extract current model from config - try multiple response shapes
      // Gateway config.get may return: raw config, { config: ... }, or nested differently
      const rawConfig = (configData?.config as Record<string, unknown>) || configData
      const agentsConfig = (rawConfig?.agents as Record<string, unknown>) || undefined
      const defaultsConfig = (agentsConfig?.defaults as Record<string, unknown>) || undefined
      const modelConfig = (defaultsConfig?.model as Record<string, unknown>) || undefined
      let currentModel = (modelConfig?.primary as string) || null
      let fallbackModels = ((modelConfig?.fallbacks || []) as string[])

      // Fallback: read directly from config file if gateway didn't return model info
      if (!currentModel) {
        try {
          const configFilePath = path.join(os.homedir(), ".clawdbot", "clawdbot.json")
          const fileConfig = JSON.parse(fs.readFileSync(configFilePath, "utf-8"))
          currentModel = fileConfig?.agents?.defaults?.model?.primary || null
          if (!fallbackModels.length) {
            fallbackModels = fileConfig?.agents?.defaults?.model?.fallbacks || []
          }
        } catch {
          // config file not readable
        }
      }

      // Also extract the raw config hash for conflict-safe patching
      const configHash = configData?._hash || configData?.hash || null

      // Extract models list: { models: [{id, name, provider, contextWindow, reasoning, input}] }
      const modelsList = (modelsData?.models || []) as unknown[]

      // Read HEARTBEAT.md for heartbeat task info
      let heartbeatContent: string | null = null
      try {
        const workspace = (configData?.agents as Record<string, unknown> | undefined)?.defaults as Record<string, unknown> | undefined
        const wsPath = (workspace?.workspace as string) || "/Users/manohar_air/clawd"
        const hbPath = path.join(wsPath, "HEARTBEAT.md")
        heartbeatContent = fs.readFileSync(hbPath, "utf-8").trim()
      } catch {
        // HEARTBEAT.md not found
      }

      return NextResponse.json({
        status: "online",
        gateway: true,
        system: {
          memoryUsage: memUsage,
          uptime: os.uptime(),
          platform: os.platform(),
        },
        agent: {
          name: identityData?.name || "Tarzan",
          vibe: identityData?.vibe || "",
          emoji: identityData?.emoji || "",
          skills: skillsList.length,
          cronJobs: cronList.filter((j: unknown) => (j as Record<string, unknown>)?.enabled).length,
          cronTotal: cronList.length,
          lastHeartbeat: heartbeatData?.timestamp || heartbeatData?.lastChecked || null,
          heartbeatContent,
          currentModel,
          fallbackModels,
        },
        models: modelsList,
        configHash,
        health: healthData,
      })
    } catch {
      // Gateway not available - fall back to HTTP probe
    }

    // Fallback: HTTP probe + file reads
    let agentStatus = "offline"
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 1000)
      const response = await fetch("http://127.0.0.1:18789/__clawdbot__/canvas/", {
        signal: controller.signal,
        cache: "no-store",
      })
      clearTimeout(timeoutId)
      if (response.ok) agentStatus = "online"
    } catch {
      // offline
    }

    // Even without gateway, try to read config file for model info
    let fallbackModel: string | null = null
    let fallbackFallbacks: string[] = []
    let fallbackHeartbeat: string | null = null
    try {
      const configFilePath = path.join(os.homedir(), ".clawdbot", "clawdbot.json")
      const fileConfig = JSON.parse(fs.readFileSync(configFilePath, "utf-8"))
      fallbackModel = fileConfig?.agents?.defaults?.model?.primary || null
      fallbackFallbacks = fileConfig?.agents?.defaults?.model?.fallbacks || []
    } catch { /* ignore */ }
    try {
      fallbackHeartbeat = fs.readFileSync(path.join("/Users/manohar_air/clawd", "HEARTBEAT.md"), "utf-8").trim()
    } catch { /* ignore */ }

    return NextResponse.json({
      status: agentStatus,
      gateway: false,
      system: {
        memoryUsage: memUsage,
        uptime: os.uptime(),
        platform: os.platform(),
      },
      agent: {
        skills: 0,
        cronJobs: 0,
        lastHeartbeat: null,
        heartbeatContent: fallbackHeartbeat,
        currentModel: fallbackModel,
        fallbackModels: fallbackFallbacks,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch status" }, { status: 500 })
  }
}
