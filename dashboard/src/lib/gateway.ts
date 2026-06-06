/**
 * gateway.ts — OpenClaw Gateway client for server-side API routes
 *
 * v3: Routes through Tiger Bridge proxy because the gateway runs inside
 * the Tiger Docker container and is not directly accessible from Dokploy.
 */

const BRIDGE_URL = process.env.TIGER_BRIDGE_URL || "http://localhost:3456"
const BRIDGE_TOKEN = process.env.TIGER_BRIDGE_TOKEN || ""
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || ""

interface GatewayOptions {
  method?: string
  body?: any
  timeout?: number
}

export function getGateway() {
  // Use the bridge proxy which can access the gateway inside the container
  const gatewayBase = `${BRIDGE_URL}/api/gateway`

  return {
    url: gatewayBase,
    token: GATEWAY_TOKEN,

    async request(path: string, opts: GatewayOptions = {}) {
      const { method = "GET", body, timeout = 30000 } = opts
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)

      try {
        const res = await fetch(`${gatewayBase}${path}`, {
          method,
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${BRIDGE_TOKEN}`,
            ...(GATEWAY_TOKEN ? { "X-Gateway-Token": GATEWAY_TOKEN } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        })

        if (!res.ok) {
          throw new Error(`Gateway ${res.status}: ${res.statusText}`)
        }

        return res
      } finally {
        clearTimeout(timer)
      }
    },

    async json(path: string, opts: GatewayOptions = {}) {
      const res = await this.request(path, opts)
      return res.json()
    },

    async text(path: string, opts: GatewayOptions = {}) {
      const res = await this.request(path, opts)
      return res.text()
    },

    streamUrl(path: string) {
      const sep = path.includes("?") ? "&" : "?"
      return `${gatewayBase}${path}${GATEWAY_TOKEN ? `${sep}token=${GATEWAY_TOKEN}` : ""}`
    },
  }
}