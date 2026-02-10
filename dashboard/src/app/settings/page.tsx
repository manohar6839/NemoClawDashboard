"use client"

import * as React from "react"
import { Settings2, Save, Loader2, RefreshCw, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useGatewayRequest } from "@/hooks/use-gateway"
import { cn } from "@/lib/utils"

type ConfigValue = string | number | boolean | null | ConfigValue[] | { [key: string]: ConfigValue }

interface ConfigSection {
  key: string
  label: string
  description: string
  fields: ConfigField[]
}

interface ConfigField {
  path: string
  label: string
  type: "text" | "number" | "boolean" | "password"
  value: ConfigValue
  original: ConfigValue
}

const CONFIG_SECTIONS: { key: string; label: string; description: string; paths: { path: string; label: string; type: "text" | "number" | "boolean" | "password" }[] }[] = [
  {
    key: "gateway",
    label: "Gateway",
    description: "Core gateway server settings",
    paths: [
      { path: "gateway.port", label: "Port", type: "number" },
      { path: "gateway.host", label: "Host", type: "text" },
      { path: "gateway.auth.token", label: "Auth Token", type: "password" },
    ],
  },
  {
    key: "agent",
    label: "Agent",
    description: "AI agent configuration",
    paths: [
      { path: "agent.name", label: "Agent Name", type: "text" },
      { path: "agent.model", label: "Primary Model", type: "text" },
      { path: "agent.fallbackModel", label: "Fallback Model", type: "text" },
      { path: "agent.maxConcurrentAgents", label: "Max Concurrent Agents", type: "number" },
      { path: "agent.maxSubAgents", label: "Max Sub-Agents", type: "number" },
    ],
  },
  {
    key: "telegram",
    label: "Telegram",
    description: "Telegram bot integration",
    paths: [
      { path: "telegram.enabled", label: "Enabled", type: "boolean" },
      { path: "telegram.token", label: "Bot Token", type: "password" },
    ],
  },
  {
    key: "heartbeat",
    label: "Heartbeat",
    description: "Periodic check settings",
    paths: [
      { path: "heartbeat.enabled", label: "Enabled", type: "boolean" },
      { path: "heartbeat.intervalMinutes", label: "Interval (minutes)", type: "number" },
    ],
  },
]

export default function SettingsPage() {
  const { request } = useGatewayRequest()
  const [sections, setSections] = React.useState<ConfigSection[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState<string | null>(null)
  const [savedKey, setSavedKey] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [showPasswords, setShowPasswords] = React.useState<Record<string, boolean>>({})

  const loadConfig = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await request("config.get", {}) as Record<string, ConfigValue>

      const loadedSections: ConfigSection[] = CONFIG_SECTIONS.map(section => ({
        key: section.key,
        label: section.label,
        description: section.description,
        fields: section.paths.map(p => {
          const value = getNestedValue(data, p.path)
          return {
            path: p.path,
            label: p.label,
            type: p.type,
            value: value ?? "",
            original: value ?? "",
          }
        }),
      }))

      setSections(loadedSections)
    } catch {
      setError("Failed to load configuration. Is the gateway running?")
    } finally {
      setLoading(false)
    }
  }, [request])

  React.useEffect(() => {
    loadConfig()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleFieldChange = (sectionKey: string, fieldPath: string, newValue: ConfigValue) => {
    setSections(prev =>
      prev.map(s =>
        s.key === sectionKey
          ? {
              ...s,
              fields: s.fields.map(f =>
                f.path === fieldPath ? { ...f, value: newValue } : f
              ),
            }
          : s
      )
    )
  }

  const handleSaveSection = async (section: ConfigSection) => {
    setSaving(section.key)
    setError(null)
    try {
      const changedFields = section.fields.filter(
        f => JSON.stringify(f.value) !== JSON.stringify(f.original)
      )

      for (const field of changedFields) {
        let val = field.value
        if (field.type === "number") val = Number(val)
        if (field.type === "boolean") val = val === true || val === "true"
        await request("config.set", { key: field.path, value: val })
      }

      // Update originals
      setSections(prev =>
        prev.map(s =>
          s.key === section.key
            ? { ...s, fields: s.fields.map(f => ({ ...f, original: f.value })) }
            : s
        )
      )
      setSavedKey(section.key)
      setTimeout(() => setSavedKey(null), 2000)
    } catch {
      setError(`Failed to save ${section.label} settings.`)
    } finally {
      setSaving(null)
    }
  }

  const hasChanges = (section: ConfigSection) =>
    section.fields.some(f => JSON.stringify(f.value) !== JSON.stringify(f.original))

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Settings2 className="h-6 w-6" />
            Settings
          </h1>
          <p className="text-muted-foreground">Gateway configuration. Changes are applied live.</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadConfig} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4 mr-1", loading && "animate-spin")} />
          Reload
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        sections.map(section => (
          <Card key={section.key}>
            <CardHeader>
              <CardTitle className="text-lg">{section.label}</CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {section.fields.map(field => (
                <div key={field.path} className="flex items-center gap-4">
                  <label className="w-[200px] text-sm font-medium text-muted-foreground shrink-0">
                    {field.label}
                  </label>
                  {field.type === "boolean" ? (
                    <button
                      type="button"
                      onClick={() =>
                        handleFieldChange(section.key, field.path, !field.value)
                      }
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                        field.value ? "bg-primary" : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition-transform",
                          field.value ? "translate-x-5" : "translate-x-0"
                        )}
                      />
                    </button>
                  ) : field.type === "password" ? (
                    <div className="flex-1 flex gap-2">
                      <Input
                        type={showPasswords[field.path] ? "text" : "password"}
                        value={String(field.value)}
                        onChange={e =>
                          handleFieldChange(section.key, field.path, e.target.value)
                        }
                        className="flex-1 font-mono text-sm"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setShowPasswords(p => ({ ...p, [field.path]: !p[field.path] }))
                        }
                      >
                        {showPasswords[field.path] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  ) : (
                    <Input
                      type={field.type}
                      value={String(field.value)}
                      onChange={e =>
                        handleFieldChange(
                          section.key,
                          field.path,
                          field.type === "number" ? e.target.value : e.target.value
                        )
                      }
                      className="flex-1 font-mono text-sm"
                    />
                  )}
                </div>
              ))}
              <div className="flex justify-end pt-2">
                <Button
                  size="sm"
                  disabled={!hasChanges(section) || saving === section.key}
                  onClick={() => handleSaveSection(section)}
                >
                  {saving === section.key ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-1" />
                  )}
                  {savedKey === section.key ? "Saved!" : "Save"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}

function getNestedValue(obj: Record<string, ConfigValue>, path: string): ConfigValue {
  const keys = path.split(".")
  let current: ConfigValue = obj
  for (const key of keys) {
    if (current == null || typeof current !== "object" || Array.isArray(current)) return null
    current = (current as Record<string, ConfigValue>)[key]
  }
  return current ?? null
}
