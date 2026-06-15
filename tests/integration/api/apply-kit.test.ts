/**
 * Integration tests for POST /api/apply-kit/parse
 *
 * Authentication strategy
 * -----------------------
 * The route calls createClient() from @/shared/db/supabase/server, which reads
 * the Supabase SSR session from next/headers cookies. We mock next/headers at
 * module scope (via vi.doMock + vi.resetModules) so that the cookie store
 * returns the test user's access token under the Supabase SSR cookie key.
 * This is the same pattern used in tests/integration/api/ai-critical-paths.test.ts.
 *
 * The three cases tested here all return before parseJobPosting is called —
 * they exercise input validation / SSRF guard — so no real Gemini call is made.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createTestUser, deleteTestUser, TestUser } from '@/tests/helpers/test-user'
import { retry } from '@/tests/helpers/retry'

// ---------------------------------------------------------------------------
// Cookie mock helpers (mirror of ai-critical-paths.test.ts)
// ---------------------------------------------------------------------------

function supabaseCookieName(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const ref = url.replace(/^https?:\/\//, '').split('.')[0]
  return `sb-${ref}-auth-token`
}

function buildSessionCookieValue(accessToken: string, userId: string, userEmail: string): string {
  const session = {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: '',
    user: {
      id: userId,
      email: userEmail,
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      role: 'authenticated',
    },
  }
  return JSON.stringify(session)
}

function mockUserCookies(user: TestUser) {
  const cookieName = supabaseCookieName()
  const cookieValue = buildSessionCookieValue(user.accessToken, user.id, user.email)

  vi.doMock('next/headers', () => ({
    cookies: () =>
      Promise.resolve({
        get: (name: string) => {
          if (name === cookieName) return { value: cookieValue }
          return undefined
        },
        getAll: () => [{ name: cookieName, value: cookieValue }],
        has: (name: string) => name === cookieName,
        set: () => {},
        delete: () => {},
      }),
    headers: () => Promise.resolve(new Headers()),
  }))
}

// ---------------------------------------------------------------------------
// Helper: build a NextRequest for the parse endpoint
// ---------------------------------------------------------------------------

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/apply-kit/parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  } as ConstructorParameters<typeof NextRequest>[1])
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

let user: TestUser

describe('POST /api/apply-kit/parse — input validation (no Gemini call)', () => {
  beforeEach(async () => {
    vi.resetModules()
    user = await retry(() => createTestUser())
    mockUserCookies(user)
  })

  afterEach(async () => {
    vi.doUnmock('next/headers')
    try {
      await deleteTestUser(user)
    } catch {
      // best-effort cleanup
    }
  })

  it('returns 400 with "exactly one" message when neither url nor text is provided', async () => {
    const { POST } = await import('@/app/api/apply-kit/parse/route')
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/exactly one/i)
  }, 30_000)

  it('returns 400 when both url and text are provided', async () => {
    const { POST } = await import('@/app/api/apply-kit/parse/route')
    const res = await POST(makeReq({ url: 'https://example.com/jobs/1', text: 'some job text' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/exactly one/i)
  }, 30_000)

  it('returns 400 and blocks the AWS metadata IP (SSRF guard)', async () => {
    const { POST } = await import('@/app/api/apply-kit/parse/route')
    const res = await POST(makeReq({ url: 'http://169.254.169.254/latest/meta-data' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/invalid url/i)
  }, 30_000)

  it('returns 400 when pasted text is too short', async () => {
    const { POST } = await import('@/app/api/apply-kit/parse/route')
    const res = await POST(makeReq({ text: 'short' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/too short/i)
  }, 30_000)
})
