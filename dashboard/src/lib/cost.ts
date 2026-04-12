// Cost tracking types and utilities
export interface CostEntry {
  id: string
  timestamp: string
  model: string
  provider: string
  inputTokens: number
  outputTokens: number
  inputCost: number
  outputCost: number
  totalCost: number
  sessionId?: string
  requestType?: string
}

export interface DailyCost {
  date: string
  total: number
  requests: number
}

export interface ModelCost {
  model: string
  provider: string
  totalCost: number
  requests: number
  inputTokens: number
  outputTokens: number
}

export interface CostSummary {
  today: number
  thisWeek: number
  thisMonth: number
  totalRequests: number
  averagePerRequest: number
  budgetUsed: number
  budgetLimit: number
}

// Cost per 1M tokens (approximate rates)
const MODEL_RATES: Record<string, { input: number; output: number }> = {
  "openrouter/moonshotai/kimi-k2.5": { input: 0.8, output: 2.0 },
  "openrouter/anthropic/claude-3.5-sonnet": { input: 3.0, output: 15.0 },
  "openrouter/anthropic/claude-3-opus": { input: 15.0, output: 75.0 },
  "openrouter/openai/gpt-4o": { input: 5.0, output: 15.0 },
  "openrouter/openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
  "openrouter/google/gemini-flash-1.5": { input: 0.075, output: 0.3 },
  "openrouter/google/gemini-pro-1.5": { input: 1.25, output: 5.0 },
  "anthropic/claude-3.5-sonnet": { input: 3.0, output: 15.0 },
  "openai/gpt-4o": { input: 5.0, output: 15.0 },
  "gemini-flash": { input: 0.075, output: 0.3 },
  "gemini-pro": { input: 1.25, output: 5.0 },
}

export function calculateCost(model: string, inputTokens: number, outputTokens: number): { inputCost: number; outputCost: number; totalCost: number } {
  const rates = MODEL_RATES[model] || { input: 1.0, output: 3.0 }
  const inputCost = (inputTokens / 1000000) * rates.input
  const outputCost = (outputTokens / 1000000) * rates.output
  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost
  }
}

export function getDefaultBudget(): number {
  return 50 // $50 default budget
}

export function formatCost(cost: number): string {
  if (cost < 0.01) return `<$0.01`
  return `$${cost.toFixed(2)}`
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`
  return String(tokens)
}
