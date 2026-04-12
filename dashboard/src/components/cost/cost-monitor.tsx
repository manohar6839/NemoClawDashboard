"use client"

import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { formatCost, formatTokens, CostSummary, DailyCost, ModelCost, CostEntry } from "@/lib/cost"
import {
  DollarSign,
  TrendingUp,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  Cpu
} from "lucide-react"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

interface CostData {
  summary: CostSummary
  daily: DailyCost[]
  byModel: ModelCost[]
  lastEntry?: CostEntry
  entries: CostEntry[]
}

function BudgetAlert({ used, limit }: { used: number; limit: number }) {
  const percentage = (used / limit) * 100

  if (percentage < 50) return null

  return (
    <div className={cn(
      "flex items-center gap-2 p-3 rounded-lg text-sm",
      percentage >= 90 ? "bg-red-500/10 text-red-400 border border-red-500/20" :
      percentage >= 75 ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" :
      "bg-blue-500/10 text-blue-400 border border-blue-500/20"
    )}>
      {percentage >= 75 ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
      <span>
        {percentage >= 90 ? "Budget critical: " :
         percentage >= 75 ? "Budget warning: " :
         "Budget notice: "}
        {formatCost(used)} of {formatCost(limit)} used ({percentage.toFixed(1)}%)
      </span>
    </div>
  )
}

export function CostMonitor() {
  const { data, error } = useSWR<CostData>("/api/cost", fetcher, { refreshInterval: 30000 })

  if (error) {
    return (
      <Card className="bg-card/40">
        <CardContent className="pt-6">
          <div className="text-red-400 text-sm">Failed to load cost data</div>
        </CardContent>
      </Card>
    )
  }

  const summary = data?.summary
  const daily = data?.daily || []
  const byModel = data?.byModel || []
  const lastEntry = data?.lastEntry

  // Prepare chart data
  const chartData = daily.map(d => ({
    date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    cost: d.total,
    requests: d.requests
  }))

  const modelChartData = byModel.slice(0, 5).map(m => ({
    name: m.model.split("/").pop()?.slice(0, 15) || m.model,
    cost: m.totalCost,
    fullModel: m.model
  }))

  const budgetPercentage = summary ? (summary.budgetUsed / summary.budgetLimit) * 100 : 0

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card/40">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Today</p>
                <p className="text-2xl font-bold">{summary ? formatCost(summary.today) : "—"}</p>
              </div>
              <DollarSign className="h-5 w-5 text-emerald-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/40">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">This Week</p>
                <p className="text-2xl font-bold">{summary ? formatCost(summary.thisWeek) : "—"}</p>
              </div>
              <Calendar className="h-5 w-5 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/40">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">This Month</p>
                <p className="text-2xl font-bold">{summary ? formatCost(summary.thisMonth) : "—"}</p>
              </div>
              <TrendingUp className="h-5 w-5 text-violet-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/40">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg/Request</p>
                <p className="text-2xl font-bold">{summary ? formatCost(summary.averagePerRequest) : "—"}</p>
              </div>
              <BarChart3 className="h-5 w-5 text-amber-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Budget Progress */}
      {summary && (
        <Card className="bg-card/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Monthly Budget
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{formatCost(summary.budgetUsed)} used</span>
              <span className="text-muted-foreground">{formatCost(summary.budgetLimit)} limit</span>
            </div>
            <Progress
              value={Math.min(budgetPercentage, 100)}
              className={cn(
                budgetPercentage >= 90 ? "bg-red-500/20" :
                budgetPercentage >= 75 ? "bg-yellow-500/20" :
                "bg-emerald-500/20"
              )}
            />
            <BudgetAlert used={summary.budgetUsed} limit={summary.budgetLimit} />
          </CardContent>
        </Card>
      )}

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Daily Trend */}
        <Card className="bg-card/40">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Daily Cost Trend</CardTitle>
            <CardDescription>Last 30 days spending</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="date" tick={{fontSize: 10}} stroke="#6b7280" />
                    <YAxis tick={{fontSize: 10}} stroke="#6b7280" tickFormatter={(v) => `$${v.toFixed(2)}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '6px' }}
                      formatter={(value: number) => [`$${value.toFixed(4)}`, 'Cost']}
                    />
                    <Area type="monotone" dataKey="cost" stroke="#10b981" fillOpacity={1} fill="url(#colorCost)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                No cost data available yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* By Model */}
        <Card className="bg-card/40">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Top Models by Cost</CardTitle>
            <CardDescription>Highest spending models</CardDescription>
          </CardHeader>
          <CardContent>
            {modelChartData.length > 0 ? (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={modelChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                    <XAxis type="number" tick={{fontSize: 10}} stroke="#6b7280" tickFormatter={(v) => `$${v.toFixed(2)}`} />
                    <YAxis type="category" dataKey="name" tick={{fontSize: 10}} stroke="#6b7280" width={100} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '6px' }}
                      formatter={(value: number, _name: string, props: any) => {
                        const model = props?.payload?.fullModel || ''
                        return [`$${value.toFixed(4)}`, model]
                      }}
                    />
                    <Bar dataKey="cost" fill="#8b5cf6" radius={[0, 4, 4, 0]}>
                      {modelChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={["#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6"][index % 5]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                No model data available yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Last Request */}
      {lastEntry && (
        <Card className="bg-card/40">
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Cpu className="h-4 w-4" />
              Last Request
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Model</p>
                <p className="font-medium truncate">{lastEntry.model.split("/").pop()}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Cost</p>
                <p className="font-medium text-emerald-400">{formatCost(lastEntry.totalCost)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Tokens</p>
                <p className="font-medium">{formatTokens(lastEntry.inputTokens + lastEntry.outputTokens)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Time</p>
                <p className="font-medium">{new Date(lastEntry.timestamp).toLocaleTimeString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
