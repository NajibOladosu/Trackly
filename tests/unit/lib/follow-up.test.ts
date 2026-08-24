import { describe, expect, it } from 'vitest'
import { daysSince, getFollowUps } from '@/modules/applications/lib/follow-up'
import type { Application } from '@/types/database'

const NOW = new Date(2026, 7, 22) // 2026-08-22

function app(overrides: Partial<Application>): Application {
  return {
    id: 'a',
    user_id: 'u',
    title: 'Role',
    company: null,
    url: null,
    status: 'submitted',
    priority: 'medium',
    type: 'job',
    deadline: null,
    job_description: null,
    ai_cover_letter: null,
    manual_cover_letter: null,
    last_analyzed_document_id: null,
    archived: false,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString()
}

describe('daysSince', () => {
  it('counts whole days elapsed', () => {
    expect(daysSince(daysAgo(10), NOW)).toBe(10)
    expect(daysSince(daysAgo(0), NOW)).toBe(0)
  })

  it('never returns negative for future dates', () => {
    expect(daysSince(daysAgo(-5), NOW)).toBe(0)
  })

  it('returns 0 for invalid input', () => {
    expect(daysSince('nope', NOW)).toBe(0)
  })
})

describe('getFollowUps', () => {
  it('flags waiting applications past the threshold, most-overdue first', () => {
    const apps = [
      app({ id: '1', status: 'submitted', updated_at: daysAgo(10) }),
      app({ id: '2', status: 'in_review', updated_at: daysAgo(30) }),
      app({ id: '3', status: 'submitted', updated_at: daysAgo(3) }), // too recent
    ]
    const result = getFollowUps(apps, NOW, 7)
    expect(result.map((f) => f.application.id)).toEqual(['2', '1'])
    expect(result[0].daysSinceUpdate).toBe(30)
  })

  it('excludes non-waiting statuses and archived applications', () => {
    const apps = [
      app({ id: '1', status: 'draft', updated_at: daysAgo(30) }),
      app({ id: '2', status: 'offer', updated_at: daysAgo(30) }),
      app({ id: '3', status: 'submitted', updated_at: daysAgo(30), archived: true }),
    ]
    expect(getFollowUps(apps, NOW, 7)).toHaveLength(0)
  })
})
