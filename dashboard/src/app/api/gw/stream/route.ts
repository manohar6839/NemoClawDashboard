import { getGateway } from "@/lib/gateway"

export const dynamic = "force-dynamic"

export async function GET() {
  const gw = getGateway()

  // Ensure connected
  try {
    if (!gw.isConnected()) {
      await gw.connect()
    }
  } catch {
    return new Response("Gateway offline", { status: 502 })
  }

  const encoder = new TextEncoder()
  let cleanupFn: (() => void) | null = null

  const stream = new ReadableStream({
    start(controller) {
      const handler = ({ event, payload, seq }: { event: string; payload: unknown; seq: number }) => {
        if (event === "tick") return
        const data = JSON.stringify({ event, payload, seq })
        controller.enqueue(encoder.encode(`data: ${data}\n\n`))
      }

      gw.on("gateway-event", handler)

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ event: "stream.connected", payload: { connected: true } })}\n\n`)
      )

      const keepalive = setInterval(() => {
        controller.enqueue(encoder.encode(`: keepalive\n\n`))
      }, 15000)

      const disconnectHandler = () => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ event: "stream.disconnected", payload: { connected: false } })}\n\n`)
        )
      }
      gw.on("disconnected", disconnectHandler)

      cleanupFn = () => {
        gw.off("gateway-event", handler)
        gw.off("disconnected", disconnectHandler)
        clearInterval(keepalive)
      }
    },
    cancel() {
      cleanupFn?.()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
