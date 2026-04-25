"use client"
/**
 * settings/page.tsx — Tiger configuration
 *
 * Sections:
 *  1. Model         — primary model dropdown + fallback models
 *  2. Session       — dmScope, compaction mode
 *  3. Telegram      — enabled toggle, streaming mode
 *  4. Commands      — native commands, ownerDisplay
 */

import * as React from "react"
import useSWR from "swr"
import {
  Settings2, Save, Loader2, RefreshCw,
  Bot, MessageSquare, Terminal, Cpu, AlertCircle, Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModelInfo {
  id: string
  name: string
  provider: string
  reasoning: boolean
  contextWindow: number
  cost?: { input: number; output: number }
}

interface OpenClawConfig {
  agents?: { defaults?: { model?: { primary?: string; fallbacks?: string[] }; compaction?: { mode?: string } } }
  session?: { dmScope?: string }
  channels?: { telegram?: { enabled?: boolean; streaming?: string } }
  commands?: { native?: string; ownerDisplay?: string; restart?: boolean }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then(r => r.json())

function get(obj: any, path: string, fallback: any = ""): any {
  return path.split(".").reduce((o, k) => (o != null ? o[k] : undefined), obj) ?? fallback
}

function set(obj: any, path: string, value: any): any {
  const keys = path.split(".")
  const result = JSON.parse(JSON.stringify(obj))
  let cur = result
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null) cur[keys[i]] = {}
    cur = cur[keys[i]]
  }
  cur[keys[keys.length - 1]] = value
  return result
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-3 border-b border-border/50 last:border-0">
      <div className="w-52 shrink-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
        checked ? "bg-primary" : "bg-muted"
      )}
    >
      <span className={cn(
        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform",
        checked ? "translate-x-5" : "translate-x-0"
      )} />
    </button>
  )
}

function SelectInput({ value, options, onChange }: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring w-full max-w-xs"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

// ─── Model dropdown component ─────────────────────────────────────────────────

function ModelSelect({ value, models, onChange }: {
  value: string
  models: ModelInfo[]
  onChange: (v: string) => void
}) {
  // Group by provider
  const grouped = models.reduce<Record<string, ModelInfo[]>>((acc, m) => {
    if (!acc[m.provider]) acc[m.provider] = []
    acc[m.provider].push(m)
    return acc
  }, {})

  const providerLabels: Record<string, string> = {
    minimax: "MiniMax",
    "minimax-portal": "MiniMax Portal",
    openrouter: "OpenRouter",
  }

  const current = models.find(m => m.id === value)

  return (
    <div className="space-y-2">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring w-full max-w-sm"
      >
        {Object.entries(grouped).map(([prov, mods]) => (
          <optgroup key={prov} label={providerLabels[prov] ?? prov}>
            {mods.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </optgroup>
        ))}
      </select>

      {/* Model detail badge row */}
      {current && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
            {current.id}
          </span>
          {current.reasoning && (
            <span className="text-xs bg-purple-500/15 text-purple-400 px-2 py-0.5 rounded font-medium">
              reasoning
            </span>
          )}
          {current.contextWindow > 0 && (
            <span className="text-xs text-muted-foreground">
              {current.contextWindow >= 1000000
                ? `${(current.contextWindow / 1000000).toFixed(1)}M ctx`
                : `${Math.round(current.contextWindow / 1000)}K ctx`}
            </span>
          )}
          {current.cost && (
            <span className="text-xs text-muted-foreground">
              ${current.cost.input}/M in · ${current.cost.output}/M out
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Section card wrapper ─────────────────────────────────────────────────────

function SectionCard({ icon: Icon, title, description, children, dirty }: {
  icon: React.ElementType
  title: string
  description: string
  children: React.ReactNode
  dirty?: boolean
}) {
  return (
    <Card className={cn("transition-colors", dirty && "border-primary/40")}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
          {dirty && (
            <span className="text-xs font-normal text-primary ml-1">unsaved changes</span>
          )}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  // Raw config from bridge
  const { data: configData, mutate: mutateConfig, isLoading: configLoading } =
    useSWR<{ ok: boolean; config: OpenClawConfig }>("/api/tiger/config", fetcher)

  // Available models
  const { data: modelsData, isLoading: modelsLoading } =
    useSWR<{ ok: boolean; models: ModelInfo[] }>("/api/tiger/config/models", fetcher)

  const remoteConfig = configData?.config ?? {}
  const models = modelsData?.models ?? []

  // ── Local draft — tracks unsaved edits ─────────────────────────────────────
  const [draft, setDraft] = React.useState<OpenClawConfig>({})
  const [initialized, setInitialized] = React.useState(false)

  React.useEffect(() => {
    if (configData?.ok && !initialized) {
      setDraft(JSON.parse(JSON.stringify(configData.config)))
      setInitialized(true)
    }
  }, [configData, initialized])

  const update = (path: string, value: any) => {
    setDraft(prev => set(prev, path, value))
  }

  const g = (path: string, fallback: any = "") => get(draft, path, fallback)
  const r = (path: string, fallback: any = "") => get(remoteConfig, path, fallback)

  // Dirty check — compare draft to remote at path level
  const isDirty = (path: string) => JSON.stringify(g(path)) !== JSON.stringify(r(path))
  const anyDirty = JSON.stringify(draft) !== JSON.stringify(remoteConfig)

  // ── Save ────────────────────────────────────────────────────────────────────
  const [saving, setSaving] = React.useState(false)
  const [saveState, setSaveState] = React.useState<"idle" | "ok" | "err">("idle")
  const [saveError, setSaveError] = React.useState("")

  const handleSave = async () => {
    setSaving(true)
    setSaveState("idle")
    try {
      const res = await fetch("/api/tiger/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patch: draft }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? "Save failed")
      setSaveState("ok")
      await mutateConfig()
      setInitialized(false) // re-sync draft from fresh server data
      setTimeout(() => setSaveState("idle"), 3000)
    } catch (err: any) {
      setSaveError(err.message)
      setSaveState("err")
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setDraft(JSON.parse(JSON.stringify(remoteConfig)))
    setSaveState("idle")
  }

  const loading = configLoading || modelsLoading || !initialized

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Settings2 className="h-6 w-6" /> Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live Tiger configuration — writes directly to openclaw.json inside the container.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={!anyDirty || saving}>
            <RefreshCw className="h-4 w-4 mr-1" /> Reset
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!anyDirty || saving}>
            {saving
              ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              : saveState === "ok"
              ? <Check className="h-4 w-4 mr-1" />
              : <Save className="h-4 w-4 mr-1" />}
            {saving ? "Saving…" : saveState === "ok" ? "Saved!" : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Save error */}
      {saveState === "err" && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {saveError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">

          {/* ── 1. Model ───────────────────────────────────────────────────── */}
          <SectionCard
            icon={Cpu}
            title="Model"
            description="Which AI model Tiger and sub-agents use. Changes take effect on the next conversation."
            dirty={isDirty("agents.defaults.model.primary") || isDirty("agents.defaults.model.fallbacks")}
          >
            <SettingRow
              label="Primary model"
              hint="Active model for all agents"
            >
              <ModelSelect
                value={g("agents.defaults.model.primary", "")}
                models={models}
                onChange={v => update("agents.defaults.model.primary", v)}
              />
            </SettingRow>

            <SettingRow
              label="Fallback models"
              hint="Comma-separated, tried in order if primary fails"
            >
              <input
                type="text"
                value={(g("agents.defaults.model.fallbacks", []) as string[]).join(", ")}
                onChange={e => update(
                  "agents.defaults.model.fallbacks",
                  e.target.value.split(",").map(s => s.trim()).filter(Boolean)
                )}
                placeholder="e.g. openrouter/auto"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring w-full max-w-sm"
              />
            </SettingRow>

            <SettingRow
              label="Compaction mode"
              hint="How Tiger handles context window limits"
            >
              <SelectInput
                value={g("agents.defaults.compaction.mode", "safeguard")}
                options={[
                  { value: "safeguard", label: "Safeguard — compress when near limit" },
                  { value: "auto",      label: "Auto — compress aggressively" },
                  { value: "off",       label: "Off — never compress" },
                ]}
                onChange={v => update("agents.defaults.compaction.mode", v)}
              />
            </SettingRow>
          </SectionCard>

          {/* ── 2. Session ─────────────────────────────────────────────────── */}
          <SectionCard
            icon={Bot}
            title="Session"
            description="How Tiger manages conversation sessions and identity scoping."
            dirty={isDirty("session.dmScope")}
          >
            <SettingRow
              label="DM scope"
              hint="How Tiger isolates context between different Telegram chats"
            >
              <SelectInput
                value={g("session.dmScope", "per-channel-peer")}
                options={[
                  { value: "per-channel-peer", label: "Per-channel-peer (recommended)" },
                  { value: "per-channel",      label: "Per-channel" },
                  { value: "global",           label: "Global — single shared context" },
                ]}
                onChange={v => update("session.dmScope", v)}
              />
            </SettingRow>
          </SectionCard>

          {/* ── 3. Telegram ────────────────────────────────────────────────── */}
          <SectionCard
            icon={MessageSquare}
            title="Telegram"
            description="Telegram bot channel settings."
            dirty={isDirty("channels.telegram.enabled") || isDirty("channels.telegram.streaming")}
          >
            <SettingRow label="Enabled" hint="Whether the Telegram bot is active">
              <Toggle
                checked={g("channels.telegram.enabled", true)}
                onChange={v => update("channels.telegram.enabled", v)}
              />
            </SettingRow>

            <SettingRow
              label="Streaming"
              hint="How Tiger sends message updates while generating"
            >
              <SelectInput
                value={g("channels.telegram.streaming", "partial")}
                options={[
                  { value: "partial", label: "Partial — stream as it types" },
                  { value: "full",    label: "Full — send only on completion" },
                  { value: "off",     label: "Off — no streaming" },
                ]}
                onChange={v => update("channels.telegram.streaming", v)}
              />
            </SettingRow>
          </SectionCard>

          {/* ── 4. Commands ────────────────────────────────────────────────── */}
          <SectionCard
            icon={Terminal}
            title="Commands"
            description="How Tiger handles native and system commands."
            dirty={isDirty("commands.native") || isDirty("commands.ownerDisplay") || isDirty("commands.restart")}
          >
            <SettingRow
              label="Native commands"
              hint="Whether Tiger can run shell commands on the host"
            >
              <SelectInput
                value={g("commands.native", "auto")}
                options={[
                  { value: "auto", label: "Auto — enable when available" },
                  { value: "on",   label: "On — always enabled" },
                  { value: "off",  label: "Off — disabled" },
                ]}
                onChange={v => update("commands.native", v)}
              />
            </SettingRow>

            <SettingRow
              label="Owner display"
              hint="How Manohar's name appears to Tiger in context"
            >
              <SelectInput
                value={g("commands.ownerDisplay", "raw")}
                options={[
                  { value: "raw",       label: "Raw — show as-is" },
                  { value: "formatted", label: "Formatted — display name" },
                ]}
                onChange={v => update("commands.ownerDisplay", v)}
              />
            </SettingRow>

            <SettingRow
              label="Allow restart"
              hint="Tiger can restart itself when needed"
            >
              <Toggle
                checked={g("commands.restart", true)}
                onChange={v => update("commands.restart", v)}
              />
            </SettingRow>
          </SectionCard>

        </div>
      )}
    </div>
  )
}
