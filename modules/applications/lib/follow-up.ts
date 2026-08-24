import type { Application } from "@/types/database"

/** Statuses where the ball is in the employer's court — a follow-up may help. */
export const FOLLOW_UP_STATUSES: Application["status"][] = ["submitted", "in_review"]

/** Default days of silence before a follow-up is suggested. */
export const DEFAULT_FOLLOW_UP_DAYS = 7

export interface FollowUp {
  application: Application
  daysSinceUpdate: number
}

/** Whole days between `since` (ISO string) and `now`, floored at 0. */
export function daysSince(sinceIso: string, now: Date): number {
  const since = new Date(sinceIso)
  if (Number.isNaN(since.getTime())) return 0
  const ms = now.getTime() - since.getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

/**
 * Applications that have sat in a waiting status (submitted / in_review)
 * without any update for at least `thresholdDays`, most-overdue first.
 * Archived applications are excluded.
 */
export function getFollowUps(
  applications: Application[],
  now: Date,
  thresholdDays: number = DEFAULT_FOLLOW_UP_DAYS
): FollowUp[] {
  return applications
    .filter((app) => !app.archived && FOLLOW_UP_STATUSES.includes(app.status))
    .map((app) => ({ application: app, daysSinceUpdate: daysSince(app.updated_at, now) }))
    .filter((f) => f.daysSinceUpdate >= thresholdDays)
    .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate)
}
