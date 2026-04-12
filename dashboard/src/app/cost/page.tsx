import { CostMonitor } from "@/components/cost/cost-monitor"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { DollarSign, TrendingUp, Info } from "lucide-react"

export default function CostPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" />
            Cost Monitor
          </h1>
          <p className="text-muted-foreground">
            Track API usage costs across all AI models and sessions
          </p>
        </div>
      </div>

      {/* Info Card */}
      <Card className="bg-blue-500/10 border-blue-500/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-400 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-400">Cost Tracking Active</p>
              <p className="text-sm text-muted-foreground">
                Costs are calculated based on token usage and approximate model rates. 
                Actual costs may vary depending on your API provider pricing. Set your monthly 
                budget limit in settings to receive alerts.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cost Monitor Component */}
      <CostMonitor />

      {/* Additional Info */}
      <Card className="bg-card/40">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Supported Models
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="space-y-1">
              <p className="font-medium">OpenAI</p>
              <p className="text-muted-foreground text-xs">GPT-4o, GPT-4o-mini</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium">Anthropic</p>
              <p className="text-muted-foreground text-xs">Claude 3 Opus, Claude 3.5 Sonnet</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium">Google</p>
              <p className="text-muted-foreground text-xs">Gemini Pro 1.5, Gemini Flash 1.5</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium">Others</p>
              <p className="text-muted-foreground text-xs">Kimi K2.5, and more via OpenRouter</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
