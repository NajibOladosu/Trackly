/**
 * Upstash Redis Rate Limiting (REST API, no SDK dependency)
 *
 * Distributed fixed-window rate limiter that calls Upstash REST API directly
 * via fetch. Used by `rate-limit.ts` when UPSTASH_KV_REST_API_URL +
 * UPSTASH_KV_REST_API_TOKEN env vars are set.
 *
 * Strategy: pipelined INCR + PEXPIRE (only set TTL when count == 1).
 * Window resets at TTL expiry. Sufficient for API throttling.
 *
 * Failure mode: any Upstash error logs and returns null (fail open) so
 * outages don't break the app — caller falls back to in-memory.
 */

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import type { RateLimitConfig } from './rate-limit'

const UPSTASH_TIMEOUT_MS = 1500

interface UpstashConfig {
  url: string
  token: string
}

function readUpstashConfig(): UpstashConfig | null {
  const url = process.env.UPSTASH_KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url: url.replace(/\/$/, ''), token }
}

export function isUpstashConfigured(): boolean {
  return readUpstashConfig() !== null
}

interface UpstashPipelineResult {
  result?: unknown
  error?: string
}

async function pipeline(commands: (string | number)[][]): Promise<UpstashPipelineResult[] | null> {
  const cfg = readUpstashConfig()
  if (!cfg) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPSTASH_TIMEOUT_MS)

  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
      signal: controller.signal,
      cache: 'no-store',
    })

    if (!res.ok) {
      console.error(`[Upstash RateLimit] HTTP ${res.status}`)
      return null
    }

    return (await res.json()) as UpstashPipelineResult[]
  } catch (err) {
    console.error('[Upstash RateLimit] request failed:', err instanceof Error ? err.message : err)
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function getIdentifier(request: NextRequest, userId?: string): string {
  if (userId) return `user:${userId}`
  const forwarded = request.headers.get('x-forwarded-for')
  const real = request.headers.get('x-real-ip')
  const ip = forwarded?.split(',')[0].trim() || real || 'unknown'
  return `ip:${ip}`
}

/**
 * Check rate limit via Upstash. Returns:
 *  - NextResponse 429 if limited
 *  - null if allowed
 *  - 'fallback' string if Upstash unavailable (caller should use in-memory)
 */
export async function checkRateLimitUpstash(
  request: NextRequest,
  config: RateLimitConfig,
  userId?: string
): Promise<NextResponse | null | 'fallback'> {
  const identifier = getIdentifier(request, userId)
  const key = `ratelimit:${identifier}:${request.nextUrl.pathname}`

  const results = await pipeline([
    ['INCR', key],
    ['PEXPIRE', key, config.windowMs, 'NX'],
    ['PTTL', key],
  ])

  if (!results || results.length < 3) return 'fallback'

  const countResult = results[0]
  const ttlResult = results[2]
  if (countResult?.error || ttlResult?.error) {
    console.error('[Upstash RateLimit] command error:', countResult?.error || ttlResult?.error)
    return 'fallback'
  }

  const count = typeof countResult.result === 'number' ? countResult.result : Number(countResult.result)
  const ttlMs = typeof ttlResult.result === 'number' ? ttlResult.result : Number(ttlResult.result)

  if (!Number.isFinite(count)) return 'fallback'

  const resetMs = ttlMs > 0 ? Date.now() + ttlMs : Date.now() + config.windowMs

  if (count > config.maxRequests) {
    const retryAfter = Math.max(1, Math.ceil((resetMs - Date.now()) / 1000))
    return NextResponse.json(
      { error: config.message || 'Too many requests', retryAfter },
      {
        status: 429,
        headers: {
          'Retry-After': retryAfter.toString(),
          'X-RateLimit-Limit': config.maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': resetMs.toString(),
          'X-RateLimit-Backend': 'upstash',
        },
      }
    )
  }

  return null
}
