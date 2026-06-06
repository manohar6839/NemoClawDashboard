"use client"

import * as React from "react"
import { TrendingUp, TrendingDown, RefreshCw, Activity, DollarSign, BarChart2, Layers } from "lucide-react"
import { StatCard } from "@/components/stat-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface Position {
  key: string
  tradingsymbol: string
  exchange: string
  instrumenttype: string
  producttype: string
  netqty: number
  ltp: number
  avg_price: number
  unrealised_pnl: number
  realised_pnl: number
  total_pnl: number
  is_closed: number
  updated_at: string
}

interface Summary {
  totalUnrealised: number
  totalRealised: number
  totalPnl: number
  openPositions: number
  asOf?: string
}

function fmt(n: number) {
  const sign = n >= 0 ? "+" : ""
  return `${sign}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
}

function PnlCell({ value }: { value: number }) {
  return (
    <span className={cn("font-mono tabular-nums", value > 0 ? "text-emerald-500" : value < 0 ? "text-rose-500" : "text-muted-foreground")}>
      {fmt(value)}
    </span>
  )
}

export default function PositionsPage() {
  const [positions, setPositions] = React.useState<Position[]>([])
  const [summary, setSummary] = React.useState<Summary | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null)

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/positions", { cache: "no-store" })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? "Failed to load")
      setPositions(data.positions ?? [])
      setSummary(data.summary ?? null)
      setLastUpdated(new Date())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await fetch("/api/positions", { method: "POST" })
    } catch { /* ignore */ }
    await load(true)
    setRefreshing(false)
  }

  React.useEffect(() => {
    load()
    const id = setInterval(() => load(true), 30_000)
    return () => clearInterval(id)
  }, [load])

  const open = positions.filter(p => p.netqty !== 0 && !p.is_closed)
  const closed = positions.filter(p => p.netqty === 0 && p.is_closed && p.realised_pnl !== 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart2 className="h-6 w-6 text-primary" />
            Positions
          </h1>
          <p className="text-muted-foreground text-sm">
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false })} IST` : "Live positions from Angel One"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing || loading}>
          <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-rose-500/30 bg-rose-500/10">
          <CardContent className="pt-4 text-sm text-rose-400">{error}</CardContent>
        </Card>
      )}

      {/* Summary stat cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total P&L"
          value={summary ? fmt(summary.totalPnl) : "—"}
          icon={summary && summary.totalPnl >= 0 ? TrendingUp : TrendingDown}
          className={summary && summary.totalPnl < 0 ? "border-rose-500/30" : "border-emerald-500/30"}
        />
        <StatCard
          title="Unrealised"
          value={summary ? fmt(summary.totalUnrealised) : "—"}
          icon={Activity}
          description="Open positions"
        />
        <StatCard
          title="Realised"
          value={summary ? fmt(summary.totalRealised) : "—"}
          icon={DollarSign}
          description="Closed today"
        />
        <StatCard
          title="Open Positions"
          value={loading ? "…" : open.length}
          icon={Layers}
          description={closed.length > 0 ? `${closed.length} closed today` : undefined}
        />
      </div>

      {/* Open positions table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Open Positions ({open.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
          ) : open.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No open positions</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="px-4 py-2 text-left font-medium">Symbol</th>
                    <th className="px-4 py-2 text-right font-medium">Qty</th>
                    <th className="px-4 py-2 text-right font-medium">Avg</th>
                    <th className="px-4 py-2 text-right font-medium">LTP</th>
                    <th className="px-4 py-2 text-right font-medium">Unrealised</th>
                    <th className="px-4 py-2 text-right font-medium">Total P&L</th>
                    <th className="px-4 py-2 text-left font-medium">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {open.map(p => (
                    <tr key={p.key} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 font-mono font-medium">{p.tradingsymbol}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span className={p.netqty > 0 ? "text-emerald-500" : "text-rose-500"}>
                          {p.netqty > 0 ? "+" : ""}{p.netqty}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">₹{p.avg_price.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">₹{p.ltp.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right"><PnlCell value={p.unrealised_pnl} /></td>
                      <td className="px-4 py-2.5 text-right"><PnlCell value={p.total_pnl} /></td>
                      <td className="px-4 py-2.5">
                        <Badge variant="secondary" className="text-xs font-normal">
                          {p.instrumenttype || p.producttype}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Closed today */}
      {!loading && closed.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-muted-foreground">Closed Today ({closed.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="px-4 py-2 text-left font-medium">Symbol</th>
                    <th className="px-4 py-2 text-right font-medium">Realised P&L</th>
                    <th className="px-4 py-2 text-left font-medium">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {closed.map(p => (
                    <tr key={p.key} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 font-mono font-medium text-muted-foreground">{p.tradingsymbol}</td>
                      <td className="px-4 py-2.5 text-right"><PnlCell value={p.realised_pnl} /></td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className="text-xs font-normal opacity-60">
                          {p.instrumenttype || p.producttype}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
