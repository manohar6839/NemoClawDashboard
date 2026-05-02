"use client"

/**
 * settings/page.tsx — Tiger configuration + API key management
 *
 * Sections (in order):
 *  0. API Keys & Router — ANTHROPIC, OPENROUTER, TELEGRAM keys + TIGER_ROUTER_MODEL
 *  1. Model            — OpenClaw global model dropdown + fallbacks + compaction
 *  2. Session          — dmScope
 *  3. Telegram         — enabled toggle, streaming mode
 *  4. Commands         — native commands, ownerDisplay, restart
 */

import * as React from "react"
import useSWR from "swr"
import {
  Settings2, Save, Loader2, RefreshCw,
  Bot, MessageSquare, Terminal, Cpu, AlertCircle, Check,
  Key, RotateCcw,
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
  agents?: {
    defaults?: {
      model?: { primary?: string; fallbacks?: string[] }
      compaction?: { mode?: string }
    }
  }
  session?: { dmScope?: string }
  channels?: { telegram?: { enabled?: boolean; streaming?: string } }
  commands?: { native?: string; ownerDisplay?: string; restart?: boolean }
}

interface KeyPresence {
  isSet: boolean
  preview?: string
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

// ─── Shared sub-components ────────────────────────────────────────────────────

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

function ModelSelect({ value, models, onChange }: {
  value: string
  models: ModelInfo[]
  onChange: (v: string) => void
}) {
  const grouped = models.reduce<Record<string, ModelInfo[]>>((acc, m) => {
    if (!acc[m.provider]) acc[m.provider] = []
    acc[m.provider].push(m)
    return acc
  }, {})

  const current = models.find(m => m.id === value)

  return (
    <div className="space-y-2">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring w-full max-w-sm"
      >
        {Object.entries(grouped).map(([prov, mods]) => (
          <optgroup key={prov} label={prov}>
            {mods.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </optgroup>
        ))}
      </select>
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
              {current.contextWindow >= 1_000_000
                ? `${(current.contextWindow / 1_000_000).toFixed(1)}M ctx`
                : `${Math.round(current.contextWindow / 1_000)}K ctx`}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

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

// ─── Section 0: API Keys ──────────────────────────────────────────────────────

const SECRET_KEYS = [
  { key: "ANTHROPIC_API_KEY",  label: "Anthropic API key",  hint: "Required for claude-* models via TIGER_ROUTER_MODEL" },
  { key: "OPENROUTER_API_KEY", label: "OpenRouter API key", hint: "Required for openrouter/* and other non-Anthropic models" },
  { key: "TELEGRAM_BOT_TOKEN", label: "Telegram bot token", hint: "Bot token from @BotFather — enables Telegram channel" },
  { key: "TELEGRAM_CHAT_ID",   label: "Telegram chat ID",   hint: "Your personal chat ID — restricts who can DM Tiger" },
] as const

type SecretKey = (typeof SECRET_KEYS)[number]["key"]

function ApiKeysSection() {
  const { data: keysData, mutate: mutateKeys } = useSWR<{
    ok: boolean
    keys: Record<string, KeyPresence>
  }>("/api/tiger/keys", fetcher, { revalidateOnFocus: false })

  const keysPresence = keysData?.keys ?? {}

  // Local draft for pending key values (user types new value)
  const [draft, setDraft] = React.useState<Partial<Record<SecretKey | "TIGER_ROUTER_MODEL", string>>>({})
  const [saving, setSaving] = React.useState(false)
  const [saveState, setSaveState] = React.useState<"idle" | "ok" | "err">("idle")
  const [saveMsg, setSaveMsg] = React.useState("")
  const [restarting, setRestarting] = React.useState(false)
  const [restartMsg, setRestartMsg] = React.useState("")

  // Router model uses preview value (non-secret)
  const routerModelPreview = keysPresence["TIGER_ROUTER_MODEL"]?.preview ?? ""
  const [routerModelDraft, setRouterModelDraft] = React.useState("")

  // Sync router model draft from server on first load
  React.useEffect(() => {
    if (routerModelPreview && !routerModelDraft) {
      setRouterModelDraft(routerModelPreview)
    }
  }, [routerModelPreview])

  const anyChanges = Object.keys(draft).length > 0 || routerModelDraft !== routerModelPreview

  const handleSaveKeys = async () => {
    setSaving(true)
    setSaveState("idle")
    const payload: Record<string, string | null> = {}
    for (const [k, v] of Object.entries(draft)) {
      // Empty string in the input → clear the key
      payload[k] = v === "" ? null : v
    }
    if (routerModelDraft !== routerModelPreview) {
      payload["TIGER_ROUTER_MODEL"] = routerModelDraft || null
    }
    try {
      const res = await fetch("/api/tiger/keys", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? "Save failed")
      setSaveState("ok")
      setSaveMsg("Keys saved. Restart bridge to apply.")
      setDraft({})
      mutateKeys()
      setTimeout(() => { setSaveState("idle"); setSaveMsg("") }, 5000)
    } catch (err: any) {
      setSaveState("err")
      setSaveMsg(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleRestartBridge = async () => {
    setRestarting(true)
    setRestartMsg("")
    try {
      const res = await fetch("/api/tiger/bridge-restart", { method: "POST" })
      const data = await res.json()
      setRestartMsg(data.message ?? "Restart initiated.")
      setTimeout(() => setRestartMsg(""), 8000)
    } catch {
      setRestartMsg("Restart request failed.")
    } finally {
      setRestarting(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Key className="h-4 w-4 text-muted-foreground" />
          API Keys &amp; Router
        </CardTitle>
        <CardDescription>
          Stored in bridge .env. Values are never returned — only presence is shown.
          After saving, click <strong>Restart bridge</strong> to apply.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Secret keys */}
        {SECRET_KEYS.map(({ key, label, hint }) => {
          const isSet = keysPresence[key]?.isSet ?? false
          const hasDraft = draft[key] !== undefined
          return (
            <SettingRow key={key} label={label} hint={hint}>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={isSet ? "●●●●●●●● (set)" : "Not set — paste to update"}
                  value={draft[key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  className={cn(
                    "h-9 rounded-md border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring w-full max-w-sm",
                    hasDraft && "border-primary/60"
                  )}
                />
                {isSet && !hasDraft && (
                  <span className="text-xs text-emerald-400 shrink-0">✓ set</span>
                )}
                {hasDraft && draft[key] === "" && (
                  <span className="text-xs text-amber-400 shrink-0">will clear</span>
                )}
              </div>
            </SettingRow>
          )
        })}

        {/* Router model (non-secret, shown as text) */}
        <SettingRow
          label="Router model"
          hint="Model slug for classifyAgent / generateProject*. Prefix 'anthropic/' uses Anthropic API; anything else uses OpenRouter."
        >
          <input
            type="text"
            value={routerModelDraft}
            onChange={(e) => setRouterModelDraft(e.target.value)}
            placeholder="e.g. anthropic/claude-haiku-4-5"
            className={cn(
              "h-9 rounded-md border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring w-full max-w-sm",
              routerModelDraft !== routerModelPreview && "border-primary/60"
            )}
          />
        </SettingRow>

        {/* Feedback */}
        {saveMsg && (
          <div className={cn(
            "mt-3 text-xs px-3 py-2 rounded",
            saveState === "err"
              ? "bg-destructive/10 text-destructive"
              : "bg-emerald-500/10 text-emerald-400"
          )}>
            {saveMsg}
          </div>
        )}
        {restartMsg && (
          <div className="mt-2 text-xs px-3 py-2 rounded bg-blue-500/10 text-blue-400">
            {restartMsg}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-4">
          <Button
            size="sm"
            onClick={handleSaveKeys}
            disabled={!anyChanges || saving}
          >
            {saving
              ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              : saveState === "ok"
              ? <Check className="h-4 w-4 mr-1" />
              : <Save className="h-4 w-4 mr-1" />
            }
            {saving ? "Saving…" : saveState === "ok" ? "Saved!" : "Save Keys"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRestartBridge}
            disabled={restarting}
          >
            {restarting
              ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              : <RotateCcw className="h-4 w-4 mr-1" />
            }
            {restarting ? "Restarting…" : "Restart bridge"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { data: configData, mutate: mutateConfig, isLoading: configLoading } =
    useSWR<{ ok: boolean; config: OpenClawConfig }>("/api/tiger/config", fetcher)

  const { data: modelsData, isLoading: modelsLoading } =
    useSWR<{ ok: boolean; models: ModelInfo[] }>("/api/tiger/config/models", fetcher)

  const remoteConfig = configData?.config ?? {}
  const models = modelsData?.models ?? []

  const [draft, setDraft] = React.useState<OpenClawConfig>({})
  const [initialized, setInitialized] = React.useState(false)

  React.useEffect(() => {
    if (configData?.ok && !initialized) {
      setDraft(JSON.parse(JSON.stringify(configData.config)))
      setInitialized(true)
    }
  }, [configData, initialized])

  const update = (path: string, value: any) => setDraft(prev => set(prev, path, value))
  const g = (path: string, fallback: any = "") => get(draft, path, fallback)
  const r = (path: string, fallback: any = "") => get(remoteConfig, path, fallback)
  const isDirty = (path: string) => JSON.stringify(g(path)) !== JSON.stringify(r(path))
  const anyDirty = JSON.stringify(draft) !== JSON.stringify(remoteConfig)

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
      setInitialized(false)
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

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Settings2 className="h-6 w-6" /> Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            API keys and Tiger configuration.
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
              : <Save className="h-4 w-4 mr-1" />
            }
            {saving ? "Saving…" : saveState === "ok" ? "Saved!" : "Save Config"}
          </Button>
        </div>
      </div>

      {saveState === "err" && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {saveError}
        </div>
      )}

      {/* ── 0. API Keys (always rendered — has its own data fetching) ─── */}
      <ApiKeysSection />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">

          {/* ── 1. Model ─────────────────────────────────────────────────── */}
          <SectionCard
            icon={Cpu}
            title="Model"
            description="Global model for Tiger and sub-agents. Per-agent overrides live on the Agents page."
            dirty={isDirty("agents.defaults.model.primary") || isDirty("agents.defaults.model.fallbacks")}
          >
            <SettingRow label="Primary model" hint="Active model for all agents (unless overridden)">
              <ModelSelect
                value={g("agents.defaults.model.primary", "")}
                models={models}
                onChange={v => update("agents.defaults.model.primary", v)}
              />
            </SettingRow>
            <SettingRow label="Fallback models" hint="Comma-separated, tried in order if primary fails">
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
            <SettingRow label="Compaction mode" hint="How Tiger handles context window limits">
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

          {/* ── 2. Session ───────────────────────────────────────────────── */}
          <SectionCard
            icon={Bot}
            title="Session"
            description="Conversation session and identity scoping."
            dirty={isDirty("session.dmScope")}
          >
            <SettingRow label="DM scope" hint="Context isolation between Telegram chats">
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

          {/* ── 3. Telegram ──────────────────────────────────────────────── */}
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
            <SettingRow label="Streaming" hint="How Tiger sends updates while generating">
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

          {/* ── 4. Commands ──────────────────────────────────────────────── */}
          <SectionCard
            icon={Terminal}
            title="Commands"
            description="Native and system command settings."
            dirty={isDirty("commands.native") || isDirty("commands.ownerDisplay") || isDirty("commands.restart")}
          >
            <SettingRow label="Native commands" hint="Whether Tiger can run shell commands on the host">
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
            <SettingRow label="Owner display" hint="How your name appears to Tiger">
              <SelectInput
                value={g("commands.ownerDisplay", "raw")}
                options={[
                  { value: "raw",       label: "Raw — as-is" },
                  { value: "formatted", label: "Formatted — display name" },
                ]}
                onChange={v => update("commands.ownerDisplay", v)}
              />
            </SettingRow>
            <SettingRow label="Allow restart" hint="Tiger can restart itself when needed">
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
