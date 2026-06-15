import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/shared/db/supabase/server'
import { parseJobPosting } from '@/shared/infrastructure/ai'
import { AIRateLimitError } from '@/shared/infrastructure/ai/model-manager'
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/middleware/rate-limit'
import { isPublicHttpUrl } from '@/lib/security/url-validator'
import { htmlToText } from '@/lib/parsing/html-to-text'

const aiConfigured = !!process.env.GEMINI_API_KEY

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimitResponse = await rateLimitMiddleware(request, RATE_LIMITS.ai, async () => user.id)
    if (rateLimitResponse) return rateLimitResponse

    if (!aiConfigured) {
      return NextResponse.json(
        { error: 'AI service not configured. Please add a Gemini API key.' },
        { status: 503 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const url = typeof body.url === 'string' ? body.url.trim() : ''
    const text = typeof body.text === 'string' ? body.text.trim() : ''

    if ((!url && !text) || (url && text)) {
      return NextResponse.json(
        { error: 'Provide exactly one of: url or text.' },
        { status: 400 }
      )
    }

    let sourceText: string

    if (url) {
      const urlCheck = await isPublicHttpUrl(url)
      if (!urlCheck.ok) {
        return NextResponse.json({ error: `Invalid URL: ${urlCheck.reason}` }, { status: 400 })
      }

      // Inline SSRF barrier (defense in depth + makes the sanitizer visible to static analysis).
      // Re-parse the validated URL and explicitly check protocol + hostname against a blocklist.
      // isPublicHttpUrl already did this with DNS resolution; this duplicates the protocol and
      // literal-hostname checks so CodeQL can see them in the same scope as the fetch().
      const reparsed = new URL(urlCheck.url.href)
      if (reparsed.protocol !== 'http:' && reparsed.protocol !== 'https:') {
        return NextResponse.json({ error: 'Invalid URL: blocked protocol' }, { status: 400 })
      }
      const hostnameLower = reparsed.hostname.toLowerCase()
      if (
        hostnameLower === 'localhost' ||
        hostnameLower === '127.0.0.1' ||
        hostnameLower === '0.0.0.0' ||
        hostnameLower === '::1' ||
        hostnameLower === '169.254.169.254' ||
        hostnameLower === 'metadata.google.internal' ||
        hostnameLower.endsWith('.local') ||
        hostnameLower.endsWith('.internal') ||
        hostnameLower.endsWith('.localhost')
      ) {
        return NextResponse.json({ error: 'Invalid URL: blocked host' }, { status: 400 })
      }

      let html: string
      try {
        // CodeQL [js/request-forgery]: URL validated by isPublicHttpUrl (protocol +
        // literal-hostname + DNS-resolution checks) AND the inline barrier above before fetch.
        const response = await fetch(reparsed.href, {
          redirect: 'error',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          },
          signal: AbortSignal.timeout(10000),
        })
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
        const contentType = response.headers.get('content-type')
        if (!contentType || !contentType.includes('text/html')) {
          return NextResponse.json(
            { error: 'URL does not point to an HTML page. Paste the job description instead.' },
            { status: 400 }
          )
        }
        html = await response.text()
      } catch (error) {
        console.error('Apply kit fetch error:', error)
        return NextResponse.json(
          {
            error:
              'Could not fetch that URL. The page may require login or block bots. Paste the job description instead.',
          },
          { status: 400 }
        )
      }

      sourceText = htmlToText(html)
      if (!sourceText || sourceText.length < 20) {
        return NextResponse.json(
          {
            error:
              'Could not read meaningful content from that URL. Paste the job description instead.',
          },
          { status: 400 }
        )
      }
    } else {
      sourceText = text
      if (sourceText.length < 20) {
        return NextResponse.json(
          { error: 'Job description text is too short to parse.' },
          { status: 400 }
        )
      }
    }

    try {
      const job = await parseJobPosting(sourceText)
      return NextResponse.json(job, { status: 200 })
    } catch (error) {
      if (error instanceof AIRateLimitError) {
        const retryAfter = Math.max(1, Math.ceil((error.nextAvailableTime - Date.now()) / 1000))
        return NextResponse.json(
          { error: error.message, retryAfter },
          { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        )
      }
      console.error('Apply kit parse error:', error)
      return NextResponse.json(
        { error: 'Failed to parse the job posting. Please try again.' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Apply kit parse unexpected error:', error)
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 })
  }
}
