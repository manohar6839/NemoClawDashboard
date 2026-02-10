import WebSocket from "ws"
import { randomUUID } from "crypto"
import { EventEmitter } from "events"

const GATEWAY_URL = process.env.CLAWDBOT_GATEWAY_URL || "ws://127.0.0.1:18789"
const GATEWAY_TOKEN = process.env.CLAWDBOT_GATEWAY_TOKEN || ""

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

class GatewayClient extends EventEmitter {
  private ws: WebSocket | null = null
  private pending = new Map<string, PendingRequest>()
  private connected = false
  private connecting = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private seq = 0

  isConnected() {
    return this.connected
  }

  async connect(): Promise<void> {
    if (this.connected || this.connecting) return
    this.connecting = true

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(GATEWAY_URL)

        this.ws.on("open", () => {
          // Send connect handshake
          const connectMsg = {
            type: "req",
            id: randomUUID(),
            method: "connect",
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: {
                id: "gateway-client",
                version: "1.0.0",
                platform: "node",
                mode: "ui",
              },
              auth: { token: GATEWAY_TOKEN },
            },
          }
          this.ws!.send(JSON.stringify(connectMsg))
        })

        this.ws.on("message", (data) => {
          try {
            const msg = JSON.parse(data.toString())
            this.handleMessage(msg, resolve)
          } catch {
            // ignore parse errors
          }
        })

        this.ws.on("close", () => {
          this.connected = false
          this.connecting = false
          this.emit("disconnected")
          this.rejectAllPending("Connection closed")
          this.scheduleReconnect()
        })

        this.ws.on("error", (err) => {
          if (this.connecting && !this.connected) {
            this.connecting = false
            reject(err)
          }
          this.connected = false
          this.rejectAllPending("Connection error")
        })
      } catch (err) {
        this.connecting = false
        reject(err)
      }
    })
  }

  private handleMessage(msg: Record<string, unknown>, connectResolve?: (value: void) => void) {
    const type = msg.type as string

    if (type === "event") {
      const event = msg.event as string
      const payload = msg.payload as Record<string, unknown>

      // Handle connect challenge by ignoring (token auth doesn't need signing)
      if (event === "connect.challenge") return

      this.seq = (msg.seq as number) || this.seq
      this.emit("gateway-event", { event, payload, seq: this.seq })
      this.emit(`event:${event}`, payload)
      return
    }

    if (type === "res") {
      const id = msg.id as string
      const ok = msg.ok as boolean
      const payload = msg.payload as Record<string, unknown>

      // Check if this is the connect handshake response
      if (payload && (payload as Record<string, unknown>).type === "hello-ok") {
        this.connected = true
        this.connecting = false
        this.emit("connected", payload)
        connectResolve?.()
        return
      }

      const pending = this.pending.get(id)
      if (pending) {
        this.pending.delete(id)
        clearTimeout(pending.timer)
        if (ok) {
          pending.resolve(payload)
        } else {
          pending.reject(msg.error || payload || "Request failed")
        }
      }
      return
    }
  }

  async request(method: string, params: Record<string, unknown> = {}, timeoutMs = 30000): Promise<unknown> {
    if (!this.connected) {
      await this.connect()
    }

    const id = randomUUID()
    const msg = { type: "req", id, method, params }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Request ${method} timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      this.pending.set(id, { resolve, reject, timer })
      this.ws!.send(JSON.stringify(msg))
    })
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.connected = false
    this.connecting = false
    this.rejectAllPending("Disconnected")
  }

  private rejectAllPending(reason: string) {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new Error(reason))
      this.pending.delete(id)
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect().catch(() => {
        // Will retry on next request
      })
    }, 3000)
  }
}

// Singleton instance - shared across all API routes
let instance: GatewayClient | null = null

export function getGateway(): GatewayClient {
  if (!instance) {
    instance = new GatewayClient()
  }
  return instance
}

export type { GatewayClient }
