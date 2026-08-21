import { describe, expect, it } from 'vitest'
import {
  dayKey,
  countByDay,
  computeStreak,
  countInLastDays,
  buildHeatmap,
} from '@/modules/analytics/lib/activity'

// Fixed reference "today" — a Friday.
const TODAY = new Date(2026, 7, 21) // 2026-08-21, month is 0-indexed

// Build a local ISO-ish string for a given local day at noon (avoids TZ edge cases).
function localNoon(y: number, m: number, d: number): string {
  return new Date(y, m - 1, d, 12, 0, 0).toISOString()
}

describe('dayKey', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(dayKey(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

describe('countByDay', () => {
  it('counts events per local day and ignores invalid dates', () => {
    const counts = countByDay([
      localNoon(2026, 8, 21),
      localNoon(2026, 8, 21),
      localNoon(2026, 8, 20),
      'not-a-date',
    ])
    expect(counts.get('2026-08-21')).toBe(2)
    expect(counts.get('2026-08-20')).toBe(1)
    expect(counts.size).toBe(2)
  })
})

describe('computeStreak', () => {
  it('counts consecutive active days ending today', () => {
    const counts = countByDay([
      localNoon(2026, 8, 21),
      localNoon(2026, 8, 20),
      localNoon(2026, 8, 19),
    ])
    expect(computeStreak(counts, TODAY)).toBe(3)
  })

  it('keeps the streak alive from yesterday when today has no activity', () => {
    const counts = countByDay([
      localNoon(2026, 8, 20),
      localNoon(2026, 8, 19),
    ])
    expect(computeStreak(counts, TODAY)).toBe(2)
  })

  it('returns 0 when neither today nor yesterday has activity', () => {
    const counts = countByDay([localNoon(2026, 8, 10)])
    expect(computeStreak(counts, TODAY)).toBe(0)
  })

  it('stops at the first gap', () => {
    const counts = countByDay([
      localNoon(2026, 8, 21),
      localNoon(2026, 8, 20),
      // gap on the 19th
      localNoon(2026, 8, 18),
    ])
    expect(computeStreak(counts, TODAY)).toBe(2)
  })
})

describe('countInLastDays', () => {
  it('sums events within the window inclusive of today', () => {
    const counts = countByDay([
      localNoon(2026, 8, 21),
      localNoon(2026, 8, 18),
      localNoon(2026, 8, 15), // exactly 7 days back (still in a 7-day window: 21,20,...15)
      localNoon(2026, 8, 10), // outside 7-day window
    ])
    expect(countInLastDays(counts, 7, TODAY)).toBe(3)
  })
})

describe('buildHeatmap', () => {
  it('builds the requested number of 7-day weeks ending this week', () => {
    const counts = countByDay([localNoon(2026, 8, 21)])
    const grid = buildHeatmap(counts, 4, TODAY)
    expect(grid).toHaveLength(4)
    grid.forEach((week) => expect(week).toHaveLength(7))
  })

  it('places counts on the correct day and flags future padding', () => {
    const counts = countByDay([localNoon(2026, 8, 21)])
    const grid = buildHeatmap(counts, 4, TODAY)
    const flat = grid.flat()
    const todayCell = flat.find((c) => c.key === '2026-08-21')
    expect(todayCell?.count).toBe(1)
    // 2026-08-21 is a Friday; Saturday the 22nd is future padding.
    const tomorrow = flat.find((c) => c.key === '2026-08-22')
    expect(tomorrow?.future).toBe(true)
  })
})
