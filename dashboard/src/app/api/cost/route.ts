import { NextResponse } from "next/server"
import { calculateCost, CostEntry, DailyCost, ModelCost, CostSummary, getDefaultBudget } from "@/lib/cost"

// In-memory storage for costs (in production, use a database)
let costEntries: CostEntry[] = []

// Load from localStorage on server start (simulated)
try {
  if (typeof global !== "undefined" && (global as any).__COST_ENTRIES__) {
    costEntries = (global as any).__COST_ENTRIES__
  }
} catch {
  // Ignore
}

// Helper to persist
function persist() {
  if (typeof global !== "undefined") {
    (global as any).__COST_ENTRIES__ = costEntries
  }
}

export async function GET() {
  try {
    // Calculate summary
    const now = new Date()
    const today = now.toISOString().split("T")[0]
    const weekStart = new Date(now)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const todayCost = costEntries
      .filter(e => e.timestamp.startsWith(today))
      .reduce((sum, e) => sum + e.totalCost, 0)

    const weekCost = costEntries
      .filter(e => new Date(e.timestamp) >= weekStart)
      .reduce((sum, e) => sum + e.totalCost, 0)

    const monthCost = costEntries
      .filter(e => new Date(e.timestamp) >= monthStart)
      .reduce((sum, e) => sum + e.totalCost, 0)

    // Daily breakdown (last 30 days)
    const dailyMap = new Map<string, { total: number; requests: number }>()
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    costEntries
      .filter(e => new Date(e.timestamp) >= thirtyDaysAgo)
      .forEach(e => {
        const date = e.timestamp.split("T")[0]
        const existing = dailyMap.get(date) || { total: 0, requests: 0 }
        dailyMap.set(date, {
          total: existing.total + e.totalCost,
          requests: existing.requests + 1
        })
      })

    const daily: DailyCost[] = Array.from(dailyMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // By model
    const modelMap = new Map<string, ModelCost>()
    costEntries.forEach(e => {
      const existing = modelMap.get(e.model)
      if (existing) {
        existing.totalCost += e.totalCost
        existing.requests += 1
        existing.inputTokens += e.inputTokens
        existing.outputTokens += e.outputTokens
      } else {
        modelMap.set(e.model, {
          model: e.model,
          provider: e.provider,
          totalCost: e.totalCost,
          requests: 1,
          inputTokens: e.inputTokens,
          outputTokens: e.outputTokens
        })
      }
    })

    const byModel = Array.from(modelMap.values()).sort((a, b) => b.totalCost - a.totalCost)

    const summary: CostSummary = {
      today: todayCost,
      thisWeek: weekCost,
      thisMonth: monthCost,
      totalRequests: costEntries.length,
      averagePerRequest: costEntries.length > 0
        ? costEntries.reduce((sum, e) => sum + e.totalCost, 0) / costEntries.length
        : 0,
      budgetUsed: monthCost,
      budgetLimit: getDefaultBudget()
    }

    // Last entry
    const lastEntry = costEntries[costEntries.length - 1]

    return NextResponse.json({
      summary,
      daily,
      byModel,
      lastEntry,
      entries: costEntries.slice(-50).reverse() // Last 50 entries
    })
  } catch (error) {
    console.error("Cost API error:", error)
    return NextResponse.json(
      { error: "Failed to fetch cost data" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { model, provider, inputTokens, outputTokens, sessionId, requestType } = body

    if (!model || typeof inputTokens !== "number" || typeof outputTokens !== "number") {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    const costs = calculateCost(model, inputTokens, outputTokens)

    const entry: CostEntry = {
      id: `cost_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      model,
      provider: provider || "unknown",
      inputTokens,
      outputTokens,
      inputCost: costs.inputCost,
      outputCost: costs.outputCost,
      totalCost: costs.totalCost,
      sessionId,
      requestType
    }

    costEntries.push(entry)
    persist()

    return NextResponse.json({ success: true, entry })
  } catch (error) {
    console.error("Cost tracking error:", error)
    return NextResponse.json(
      { error: "Failed to track cost" },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  costEntries = []
  persist()
  return NextResponse.json({ success: true })
}
