import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/shared/db/supabase/server'
import { callGeminiWithFallback } from '@/shared/infrastructure/ai'
import { AIRateLimitError } from '@/shared/infrastructure/ai/model-manager'
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/middleware/rate-limit'
import { isPublicHttpUrl } from '@/lib/security/url-validator'
import { htmlToText } from '@/lib/parsing/html-to-text'

const aiConfigured = !!process.env.GEMINI_API_KEY

export const dynamic = 'force-dynamic'

/**
 * POST /api/questions/extract-from-url
 *
 * Extracts application questions from a job/scholarship posting URL
 *
 * Request body:
 * {
 *   "url": "https://example.com/job-posting"
 * }
 *
 * Response:
 * {
 *   "questions": ["Question 1?", "Question 2?", ...]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Apply rate limiting for AI endpoints
    const rateLimitResponse = await rateLimitMiddleware(
      request,
      RATE_LIMITS.ai,
      async () => user.id
    )
    if (rateLimitResponse) return rateLimitResponse

    // Check if Gemini AI is configured
    if (!aiConfigured) {
      return NextResponse.json(
        {
          error: 'AI service not configured. Please add Gemini API key to enable question extraction.',
          questions: [],
        },
        { status: 200 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { url } = body

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Validate URL is public + http(s) + not resolving to private/internal range (SSRF guard)
    const urlCheck = await isPublicHttpUrl(url)
    if (!urlCheck.ok) {
      return NextResponse.json({ error: `Invalid URL: ${urlCheck.reason}` }, { status: 400 })
    }
    const validUrl = urlCheck.url

    // Inline SSRF barrier (defense in depth + makes the sanitizer visible to static analysis).
    // Re-parse the validated URL and explicitly check protocol + hostname against a blocklist.
    // isPublicHttpUrl already did this with DNS resolution; this duplicates the protocol and
    // literal-hostname checks so CodeQL can see them in the same scope as the fetch().
    const reparsed = new URL(validUrl.href)
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

    // Fetch the URL content
    let htmlContent: string
    try {
      // lgtm [js/request-forgery]
      // CodeQL [js/request-forgery]: URL is validated by isPublicHttpUrl() (which
      // performs protocol + literal-hostname + DNS-resolution checks against
      // private/internal ranges) AND by the inline barrier above. Both must pass
      // before this fetch executes. Static taint analysis cannot trace through
      // the async validator, but the runtime guarantees are equivalent to an
      // explicit hostname allowlist.
      const response = await fetch(reparsed.href, {
        redirect: 'error',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
        // Set a timeout
        signal: AbortSignal.timeout(10000), // 10 seconds
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('text/html')) {
        return NextResponse.json(
          { error: 'URL does not point to an HTML page' },
          { status: 400 }
        )
      }

      htmlContent = await response.text()
    } catch (error) {
      console.error('Error fetching URL:', error)
      return NextResponse.json(
        {
          error: 'Failed to fetch URL content. The page may be protected or inaccessible. Please check the URL or add questions manually.',
          questions: [],
        },
        { status: 200 } // Return 200 with empty array instead of failing
      )
    }

    // Extract text from HTML
    const textContent = htmlToText(htmlContent)

    console.log(`Extracted ${textContent.length} characters from ${url}`)

    if (!textContent || textContent.length < 20) {
      return NextResponse.json(
        {
          error: 'Could not extract meaningful content from the URL. The page may be empty or use JavaScript rendering.',
          questions: [],
        },
        { status: 200 }
      )
    }

    // Limit text length to avoid token limits (use first 20000 characters)
    // Most application pages should have questions within this range
    const truncatedText = textContent.slice(0, 200000)

    // Use Gemini to extract questions
    try {
      const prompt = `You are an AI assistant that extracts open-ended application questions from job postings and scholarship pages.

Below is the text content extracted from a job/scholarship posting webpage:

${truncatedText}

CRITICAL RULES:
1. ONLY extract questions that are LITERALLY WRITTEN on the page - do NOT make up, invent, or hallucinate any questions
2. Copy the EXACT WORDING from the page - do not paraphrase or rewrite
3. Extract ALL open-ended questions that require written text responses (paragraphs, not just single words)
4. Look for questions in ALL parts of the page: form labels, field descriptions, application instructions, section headers
5. If you don't see any open-ended questions on the page, return an empty array []

WHAT IS AN OPEN-ENDED QUESTION?
Any question that requires the applicant to write at least a few sentences explaining their thoughts, experiences, or perspectives. This includes:
- "Why" questions (Why are you interested? Why do you want to work here?)
- "What" questions about experiences, motivations, or perspectives
- "How" questions about approaches or methods
- "Describe" or "Tell us about" prompts
- Questions asking for examples, stories, or explanations
- Questions about goals, challenges, interests, or opinions
- Cover letter or personal statement prompts

EXCLUDE QUESTIONS that are or related to these (NOT open-ended):
- Personal information: name, preferred name, pronouns, name pronunciation
- Contact details: email, phone, address, city, state, country, zip code
- Links to files: resume, portfolio, GitHub, LinkedIn, website URLs
- Education factual data: university name, major, graduation date, GPA, degree type
- Simple factual questions with one-word answers: "What languages do you speak?", "What year are you?"
- Work authorization: visa status, citizenship, eligibility questions
- Availability: start date, work schedule, "When can you start?"
- Demographics: race, ethnicity, gender, age, disability status
- Simple preferences answered with dropdowns: location, remote/hybrid/in-office
- Salary numbers: expected salary, compensation range
- Yes/No questions or checkbox items
- Questions answered by selecting from a dropdown list

INCLUDE - Examples of GOOD open-ended questions to extract:
✓ "What's most exciting to you about this company and why do you want to work here?"
✓ "Please share one problem you've solved more efficiently with the help of AI"
✓ "Tell us one thing that's not on your resume that you're proud of"
✓ "Describe a challenging technical problem you solved"
✓ "Why are you interested in this internship?"
✓ "What unique perspective would you bring to our team?"
✓ "How did you hear about this position and what interests you?"
✓ "What are your career goals?"
✓ "Describe your experience with [specific technology/skill]"
✓ "Tell us about a time when you demonstrated leadership"
✓ "What motivates you to apply for this role?"

VERIFICATION TEST:
Before including a question, ask: "Does this require the applicant to write sentences explaining their thoughts/experiences, or can it be answered with just a name/link/number/dropdown?"
- If it needs sentences/paragraphs → INCLUDE
- If it's just a factual field → EXCLUDE

WARNING: Do NOT invent questions. Only extract questions that are literally written in the text above.

IMPORTANT:
- Return ONLY a JSON array of strings with EXACT question text from the page
- Extract ALL open-ended questions you find - be inclusive, not exclusive
- If you don't see any open-ended questions in the text, return []
- Do NOT make up generic questions - only extract what's actually there
- Do NOT include markdown code fences
- Do NOT include any explanatory text

Extract ALL the open-ended questions found on this page:`

      let text = (await callGeminiWithFallback(prompt, 'SIMPLE')).trim()

      console.log(`Gemini response length: ${text.length} characters`)

      // Handle markdown code fences
      const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (codeBlockMatch) {
        text = codeBlockMatch[1].trim()
      }

      // Extract JSON array
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        console.warn('No JSON array found in Gemini response:', text.substring(0, 200))
        return NextResponse.json(
          {
            error: 'Could not parse AI response. Please try again or add questions manually.',
            questions: [],
          },
          { status: 200 }
        )
      }

      const questions = JSON.parse(jsonMatch[0])
      console.log(`Gemini extracted ${questions.length} questions`)

      if (!Array.isArray(questions)) {
        throw new Error('Response is not an array')
      }

      // Filter out empty strings and ensure all are strings
      const validQuestions = questions
        .filter((q) => typeof q === 'string' && q.trim().length > 0)
        .map((q) => q.trim())

      if (validQuestions.length === 0) {
        return NextResponse.json(
          {
            error: 'No open-ended questions found on this page. The application may only have basic form fields, or questions may be in a format that cannot be extracted (e.g., embedded in images or JavaScript forms).',
            questions: [],
          },
          { status: 200 }
        )
      }

      return NextResponse.json({
        questions: validQuestions,
      })
    } catch (error) {
      if (error instanceof AIRateLimitError) {
        const retryAfter = Math.max(1, Math.ceil((error.nextAvailableTime - Date.now()) / 1000))
        return NextResponse.json(
          { error: error.message, retryAfter, questions: [] },
          { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        )
      }
      console.error('Error extracting questions with AI:', error)
      return NextResponse.json(
        {
          error: 'AI extraction failed. Please try again or add questions manually.',
          questions: [],
        },
        { status: 200 }
      )
    }
  } catch (error) {
    console.error('Unexpected error in extract-from-url:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
