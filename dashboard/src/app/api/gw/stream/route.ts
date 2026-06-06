const BRIDGE_URL = process.env.TIGER_BRIDGE_URL || "http://localhost:3456"
const BRIDGE_TOKEN = process.env.TIGER_BRIDGE_TOKEN || ""

export const dynamic = "force-dynamic"

export async function GET() {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connected message
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ event: "stream.connected", payload: { connected: true } })}\n\n`
        )
      )

      // Poll tiger status instead of gateway directly
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`${BRIDGE_URL}/tiger/status`, {
            headers: { "Authorization": `Bearer ${BRIDGE_TOKEN}` },
          })
          const data = await res.json()
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ event: "health", payload: { status: data.status, ...data } })}\n\n`
            )
          )
        } catch {
          controller.enqueue(encoder.encode(`: keepalive\n\n`))
        }
      }, 10000)

      ;(controller as any)._cleanup = () => clearInterval(interval)
    },
    cancel(controller: any) {
      controller?._cleanup?.()
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