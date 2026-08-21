"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import { Button } from "@/shared/ui/button"
import { Flame, Target, Minus, Plus } from "lucide-react"
import {
  countByDay,
  computeStreak,
  countInLastDays,
  buildHeatmap,
} from "@/modules/analytics/lib/activity"

const GOAL_KEY = "applyos:weeklyGoal"
const DEFAULT_GOAL = 5
const HEATMAP_WEEKS = 26

interface ActivityStatsProps {
  /** ISO date strings for each activity event (e.g. application created_at). */
  activityDates: string[]
}

function intensityClass(count: number): string {
  if (count <= 0) return "bg-secondary"
  if (count === 1) return "bg-primary/30"
  if (count === 2) return "bg-primary/60"
  return "bg-primary"
}

export function ActivityStats({ activityDates }: ActivityStatsProps) {
  const [goal, setGoal] = useState(DEFAULT_GOAL)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(GOAL_KEY)
      if (saved) {
        const parsed = parseInt(saved, 10)
        if (!Number.isNaN(parsed) && parsed > 0) setGoal(parsed)
      }
    } catch {
      // localStorage unavailable — fall back to default.
    }
  }, [])

  const updateGoal = (next: number) => {
    const clamped = Math.max(1, Math.min(50, next))
    setGoal(clamped)
    try {
      localStorage.setItem(GOAL_KEY, String(clamped))
    } catch {
      // Best-effort persistence only.
    }
  }

  const { streak, weekCount, heatmap } = useMemo(() => {
    const today = new Date()
    const counts = countByDay(activityDates)
    return {
      streak: computeStreak(counts, today),
      weekCount: countInLastDays(counts, 7, today),
      heatmap: buildHeatmap(counts, HEATMAP_WEEKS, today),
    }
  }, [activityDates])

  const goalPct = Math.min(100, (weekCount / goal) * 100)
  const goalMet = weekCount >= goal

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Streak */}
          <div className="flex items-center gap-4 rounded-lg border border-border p-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Flame className={`h-6 w-6 ${streak > 0 ? "text-primary" : "text-muted-foreground"}`} />
            </div>
            <div>
              <div className="text-2xl font-bold">
                {streak} <span className="text-base font-medium text-muted-foreground">day{streak === 1 ? "" : "s"}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {streak > 0 ? "Current activity streak" : "No active streak — add an application today"}
              </p>
            </div>
          </div>

          {/* Weekly goal */}
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Weekly goal</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => updateGoal(goal - 1)}
                  aria-label="Decrease weekly goal"
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="text-sm font-semibold w-4 text-center">{goal}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => updateGoal(goal + 1)}
                  aria-label="Increase weekly goal"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className={`text-2xl font-bold ${goalMet ? "text-primary" : ""}`}>{weekCount}</span>
              <span className="text-xs text-muted-foreground">
                of {goal} this week{goalMet ? " · reached 🎉" : ""}
              </span>
            </div>
            <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${goalPct}%` }} />
            </div>
          </div>
        </div>

        {/* Heatmap */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Last 6 months</span>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Less</span>
              <div className="h-2.5 w-2.5 rounded-sm bg-secondary" />
              <div className="h-2.5 w-2.5 rounded-sm bg-primary/30" />
              <div className="h-2.5 w-2.5 rounded-sm bg-primary/60" />
              <div className="h-2.5 w-2.5 rounded-sm bg-primary" />
              <span>More</span>
            </div>
          </div>
          <div className="overflow-x-auto pb-1">
            <div className="flex gap-1">
              {heatmap.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-1">
                  {week.map((day) => (
                    <div
                      key={day.key}
                      className={`h-2.5 w-2.5 rounded-sm ${day.future ? "bg-transparent" : intensityClass(day.count)}`}
                      title={day.future ? undefined : `${day.key}: ${day.count} application${day.count === 1 ? "" : "s"}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
