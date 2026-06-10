"use client"

/**
 * /positions — intentionally NOT a positions UI.
 *
 * Live positions have a dedicated home: the standalone position-tracker at
 * https://angel.manohargupta.com (its own repo, own deploy, market-hours
 * aware). This dashboard previously replicated that UI here, which meant
 * two implementations drifting against the same Angel One data. One owner
 * per concern: the tracker owns positions; this page just hands you over.
 */

import { useEffect } from "react"
import { ExternalLink, TrendingUp } from "lucide-react"
import { Card } from "@/components/ui/card"

const TRACKER_URL = "https://angel.manohargupta.com"

export default function PositionsPage() {
  useEffect(() => {
    // Auto-redirect after a beat — the card below is the no-JS / slow-net fallback.
    const t = setTimeout(() => {
      window.location.href = TRACKER_URL
    }, 800)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="bg-card/40 p-8 max-w-md text-center">
        <TrendingUp className="h-8 w-8 text-primary mx-auto mb-4" />
        <h1 className="text-lg font-semibold mb-2">Positions live on the tracker</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Redirecting you to the dedicated position tracker — single source of
          truth for live P&amp;L, bands and alerts.
        </p>
        <a
          href={TRACKER_URL}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Open angel.manohargupta.com
          <ExternalLink className="h-4 w-4" />
        </a>
      </Card>
    </div>
  )
}
