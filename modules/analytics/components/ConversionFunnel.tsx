'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'

interface ConversionFunnelStage {
  stage: string
  count: number
  percentage: number
}

interface ConversionFunnelProps {
  data: ConversionFunnelStage[]
  title?: string
}

export function ConversionFunnel({ data, title = 'Application Conversion Funnel' }: ConversionFunnelProps) {
  if (!data || data.length === 0) {
    return (
      <Card className="flex flex-col h-full">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-muted-foreground">
            No funnel data available
          </div>
        </CardContent>
      </Card>
    )
  }

  // Calculate max width for the first stage (100%)
  const maxCount = data[0]?.count || 1



  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        {data.map((stage, index) => {
          // Only show bar if count > 0, no minimum width for empty stages
          const widthPercentage = stage.count > 0
            ? Math.max((stage.count / maxCount) * 100, 8)
            : 0

          // Color palette for funnel stages
          const colors = [
            '#3b82f6', // blue
            '#06b6d4', // cyan
            '#10b981', // emerald
            '#84cc16', // lime
            '#18BB70', // primary green
          ]
          const barColor = colors[index % colors.length]

          return (
            <div key={stage.stage} className="space-y-1.5">
              {/* Stage label and count */}
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{stage.stage}</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{stage.count}</span>
                  <span className="text-muted-foreground text-xs">
                    ({stage.percentage}%)
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="relative h-8 bg-muted rounded-md overflow-hidden">
                {/* Colored fill bar - only render if count > 0 */}
                {stage.count > 0 && (
                  <div
                    className="absolute inset-y-0 left-0 h-full rounded-md"
                    style={{
                      width: `${widthPercentage}%`,
                      backgroundColor: barColor,
                      boxShadow: `0 2px 8px ${barColor}50`
                    }}
                  />
                )}
                {/* Centered stats label */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span
                    className={`text-sm font-bold drop-shadow-sm ${widthPercentage >= 50
                      ? 'text-white'
                      : 'text-foreground'
                      }`}
                  >
                    {stage.count} ({stage.percentage}%)
                  </span>
                </div>
              </div>

              {/* Drop-off indicator - styled more subtly */}
              {index < data.length - 1 && data[index + 1] && stage.count > 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                  <div className="h-px flex-1 bg-border/50" />
                  <span className="flex items-center gap-1 text-muted-foreground/70">
                    <span className="text-destructive/70">↓</span>
                    {Math.round(((stage.count - data[index + 1].count) / stage.count) * 100)}% drop
                  </span>
                  <div className="h-px flex-1 bg-border/50" />
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
