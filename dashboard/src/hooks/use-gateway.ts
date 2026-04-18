"use client"

/**
 * use-gateway.ts — Client-side hooks for OpenClaw gateway interaction
 */

import { useState, useCallback, useEffect, useRef } from "react"

const GW_API_PREFIX = "/api/gw"

/**
 * useGatewayRequest — make RPC-style calls to the gateway via /api/gw/[...method]
 * Usage: request("cron.list") => POST /api/gw/cron/list
 *        request("cron.run", { id: "abc" }) => POST /api/gw/cron/run with body
 */
export function useGatewayRequest() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const request = useCallback(async (method: string, body?: Record<string, unknown>) => {
    setLoading(true)
    setError(null)
    try {
      const path = method.replace(/\./g, "/")
      const res = await fetch(`${GW_API_PREFIX}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      })
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`)
      const json = await res.json()
      return json.data ?? json
    } catch (err: any) {
      setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { request, loading, error }
}

/**
 * useGatewayEvents — SSE event stream from /api/gw/stream
 */
export function useGatewayEvents(path?: string, options?: { enabled?: boolean }) {
  const [events, setEvents] = useState<any[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const enabled = options?.enabled ?? true

  useEffect(() => {
    if (!enabled) return

    const url = path || "/api/gw/stream"
    const es = new EventSource(url)
    esRef.current = es

    es.onopen = () => {
      setConnected(true)
      setError(null)
    }

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        setEvents((prev) => [...prev.slice(-500), data])
      } catch {
        setEvents((prev) => [...prev.slice(-500), { raw: e.data }])
      }
    }

    es.onerror = () => {
      setConnected(false)
      setError("Connection lost")
    }

    return () => {
      es.close()
      esRef.current = null
      setConnected(false)
    }
  }, [path, enabled])

  const clear = useCallback(() => setEvents([]), [])

  return { events, connected, error, clear }
}
