"use client"

import { useCallback, useEffect, useRef, useState } from "react"

// Call a gateway method via the proxy API
export function useGatewayRequest() {
  const [loading, setLoading] = useState(false)

  const request = useCallback(async (method: string, params: Record<string, unknown> = {}) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/gw/${method.replace(/\./g, "/")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || "Request failed")
      return json.data
    } finally {
      setLoading(false)
    }
  }, [])

  return { request, loading }
}

// Subscribe to gateway events via SSE
export function useGatewayEvents(
  onEvent: (event: string, payload: unknown) => void,
  deps: unknown[] = []
) {
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let eventSource: EventSource | null = null
    let retryTimeout: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      eventSource = new EventSource("/api/gw/stream")

      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.event === "stream.connected") {
            setConnected(true)
          } else if (data.event === "stream.disconnected") {
            setConnected(false)
          } else {
            onEventRef.current(data.event, data.payload)
          }
        } catch {
          // ignore parse errors
        }
      }

      eventSource.onerror = () => {
        setConnected(false)
        eventSource?.close()
        retryTimeout = setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      eventSource?.close()
      if (retryTimeout) clearTimeout(retryTimeout)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { connected }
}
