/**
 * Pure helpers for activity-based gamification (streak, weekly goal, heatmap).
 * All functions accept an explicit `today` so they are deterministic and testable.
 * "Activity" is any application event — here, an application's created_at date.
 */

/** Local calendar day key, e.g. "2026-08-21". */
export function dayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** Count activity events per local day from a list of ISO date strings. */
export function countByDay(isoDates: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const iso of isoDates) {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) continue
    const key = dayKey(date)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function addDays(date: Date, delta: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + delta)
  return next
}

/**
 * Consecutive days with at least one activity, ending at today.
 * If today has no activity yet, the run is measured from yesterday so an
 * active streak isn't shown as broken before the day is over.
 */
export function computeStreak(counts: Map<string, number>, today: Date): number {
  const hasToday = (counts.get(dayKey(today)) ?? 0) > 0
  let cursor = hasToday ? today : addDays(today, -1)
  let streak = 0
  while ((counts.get(dayKey(cursor)) ?? 0) > 0) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}

/** Total activity events within the last `days` days (inclusive of today). */
export function countInLastDays(counts: Map<string, number>, days: number, today: Date): number {
  let total = 0
  for (let i = 0; i < days; i++) {
    total += counts.get(dayKey(addDays(today, -i))) ?? 0
  }
  return total
}

export interface HeatmapDay {
  key: string
  date: Date
  count: number
  /** true when the day falls after `today` (padding to fill the final week). */
  future: boolean
}

/**
 * GitHub-style heatmap grid. Returns `weeks` columns of 7 days (Sun–Sat),
 * oldest week first, ending on the week containing `today`.
 */
export function buildHeatmap(
  counts: Map<string, number>,
  weeks: number,
  today: Date
): HeatmapDay[][] {
  // Anchor to the Saturday that ends this week so columns are aligned.
  const endOfWeek = addDays(today, 6 - today.getDay())
  const start = addDays(endOfWeek, -(weeks * 7 - 1))
  const todayKey = dayKey(today)

  const grid: HeatmapDay[][] = []
  for (let w = 0; w < weeks; w++) {
    const week: HeatmapDay[] = []
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d)
      const key = dayKey(date)
      week.push({
        key,
        date,
        count: counts.get(key) ?? 0,
        future: key > todayKey,
      })
    }
    grid.push(week)
  }
  return grid
}
