import 'server-only'
import type { DocumentReport } from '@/types/database'
import ModelManager, { AIRateLimitError } from '@/shared/infrastructure/ai/model-manager'
import { queueManager } from '@/shared/infrastructure/ai/queue-manager'
import { getGenerativeModel, isGeminiConfigured } from '@/shared/infrastructure/ai/client'
import { classifyError, logAICall } from '@/shared/infrastructure/ai/telemetry'

/**
 * Token optimization configurations per complexity level
 * Reduces token waste and improves rate limit efficiency
 * 
 * Note: Document parsing requires larger token limits to avoid truncation
 */
const GENERATION_CONFIGS = {
  SIMPLE: {
    temperature: 0.7,        // Lower = faster, more deterministic
    maxOutputTokens: 1000,   // Short responses (100-300 words)
    topP: 0.8,
    topK: 20,
  },
  MEDIUM: {
    temperature: 0.8,        // Balanced creativity
    maxOutputTokens: 4000,   // Medium responses - enough for structured data
    topP: 0.9,
    topK: 40,
  },
  COMPLEX: {
    temperature: 0.9,        // Higher creativity for complex tasks
    maxOutputTokens: 8000,   // Full responses (detailed analysis, large JSON)
    topP: 0.95,
    topK: 50,
  },
} as const

/**
 * Extract retry-after header value from error response
 */
function getRetryAfterFromError(error: unknown, status: number | null): string | null {
  if (!error || typeof error !== 'object') return null

  const headers = (error as { headers?: Record<string, string> }).headers
  if (headers?.['retry-after']) {
    return headers['retry-after']
  }

  if (status === 503) return '120'
  if (status === 429) return '60'

  return null
}

/**
 * Helper to call Gemini with fallback logic and token optimization
 *
 * Features:
 * - Automatic model fallback when rate limited or on 5xx
 * - 4xx errors fail fast (non-retryable)
 * - Token-optimized generation configs per complexity
 * - Queue integration when all models are exhausted
 * - Structured JSON telemetry per call
 */
export async function callGeminiWithFallback(
  prompt: string,
  complexity: 'SIMPLE' | 'MEDIUM' | 'COMPLEX' = 'MEDIUM'
): Promise<string> {
  const startedAt = Date.now()
  const fallbackPath: string[] = []
  let lastError: Error | null = null
  let attemptCount = 0
  let retries = 0
  const maxAttempts = 10

  while (attemptCount < maxAttempts) {
    attemptCount++
    const model = ModelManager.getAvailableModel(complexity)

    if (!model) {
      const nextAvailableTime = ModelManager.getNextAvailableTime()
      const now = Date.now()
      const waitSeconds = Math.ceil((nextAvailableTime - now) / 1000)

      if (waitSeconds <= 120) {
        console.log(`[AI] All models rate limited. Waiting ${waitSeconds}s for next available...`)
        await new Promise(resolve => setTimeout(resolve, Math.min(waitSeconds * 1000, 10000)))
        continue
      }

      logAICall({
        ts: new Date().toISOString(),
        event: 'ai.call',
        complexity,
        model: null,
        attempt: attemptCount,
        total_attempts: attemptCount,
        latency_ms: Date.now() - startedAt,
        retries,
        fallback_path: fallbackPath,
        status: 'rate_limited',
        error_class: 'AIRateLimitError',
        error_message: 'all models rate limited',
        prompt_chars: prompt.length,
      })

      throw new AIRateLimitError(
        nextAvailableTime,
        true,
        `All AI models are currently rate limited due to high demand. Your request has been queued and will be processed in about ${waitSeconds} seconds.`
      )
    }

    fallbackPath.push(model)

    try {
      const generationConfig = GENERATION_CONFIGS[complexity]
      const genModel = getGenerativeModel(model, generationConfig)

      const result = await genModel.generateContent(prompt)
      const response = await result.response
      const text = response.text()

      logAICall({
        ts: new Date().toISOString(),
        event: 'ai.call',
        complexity,
        model,
        attempt: attemptCount,
        total_attempts: attemptCount,
        latency_ms: Date.now() - startedAt,
        retries,
        fallback_path: fallbackPath,
        status: 'success',
        prompt_chars: prompt.length,
        response_chars: text.length,
      })

      return text
    } catch (error) {
      lastError = error as Error
      const classified = classifyError(error)
      console.error(`[AI] Error with model ${model} (${classified.category}, status=${classified.status}):`, classified.message)

      if (classified.category === 'rate_limit') {
        const retryAfter = getRetryAfterFromError(error, classified.status)
        ModelManager.markModelRateLimited(model, retryAfter, classified.message)
        retries++
        console.warn(`[AI] Model ${model} hit rate limit, trying fallback...`)
        continue
      }

      if (classified.category === 'server_error') {
        retries++
        console.warn(`[AI] Model ${model} server error (${classified.status}), trying fallback...`)
        continue
      }

      logAICall({
        ts: new Date().toISOString(),
        event: 'ai.call',
        complexity,
        model,
        attempt: attemptCount,
        total_attempts: attemptCount,
        latency_ms: Date.now() - startedAt,
        retries,
        fallback_path: fallbackPath,
        status: 'client_error',
        http_status: classified.status,
        error_class: error instanceof Error ? error.name : 'Error',
        error_message: classified.message,
        prompt_chars: prompt.length,
      })

      throw error
    }
  }

  logAICall({
    ts: new Date().toISOString(),
    event: 'ai.call',
    complexity,
    model: fallbackPath[fallbackPath.length - 1] ?? null,
    attempt: attemptCount,
    total_attempts: attemptCount,
    latency_ms: Date.now() - startedAt,
    retries,
    fallback_path: fallbackPath,
    status: 'failed',
    error_class: lastError?.name,
    error_message: lastError?.message,
    prompt_chars: prompt.length,
  })

  throw lastError || new Error('Failed to get AI response after maximum attempts')
}

/**
 * NOTE: Question extraction from URLs is now handled by the API route:
 * /api/questions/extract-from-url
 *
 * This route properly scrapes the URL content and passes it to Gemini for analysis.
 * Use that endpoint instead of trying to extract questions client-side.
 */

export async function generateAnswer(
  question: string,
  context: {
    resume?: string
    experience?: string
    education?: string
    jobDescription?: string
    extraInstructions?: string
    previousAnswers?: { question: string; answer: string }[]
  }
): Promise<string> {
  if (!isGeminiConfigured()) {
    return 'AI answer generation is not configured. Please add your Gemini API key to use this feature.'
  }

  const hasBackground = Boolean(context.resume || context.experience || context.education)

  const previousAnswersBlock =
    context.previousAnswers && context.previousAnswers.length > 0
      ? `Previously answered questions for THIS application (keep the narrative consistent, do NOT repeat the same anecdotes or phrasing, and draw on different strengths where possible):
${context.previousAnswers.map((p) => `Q: ${p.question}\nA: ${p.answer}`).join('\n\n')}

`
      : ''

  const prompt = `You are helping a candidate answer a job or scholarship application question. Your job is to write the answer AS IF you are the candidate.

Question: ${question}

${context.jobDescription ? `Position/Opportunity Description:\n${context.jobDescription}\n\n` : ''}Candidate's Background:
${hasBackground ? `Resume/Profile:\n${context.resume || ''}` : '(No background provided)'}

${previousAnswersBlock}${context.extraInstructions ? `Additional Instructions from User:\n${context.extraInstructions}\n` : ''}

Grounding Rules (MOST IMPORTANT — never violate these):
- Use ONLY facts stated in the candidate's background above. Do NOT invent
  employers, job titles, dates, locations, projects, certifications, or skills
  that are not explicitly present.
- Never state a quantified achievement (percentages, dollar amounts, headcount,
  rankings, durations) unless that exact figure appears in the background.
- If the background does not contain enough detail to answer concretely, write
  an honest, general answer using only what is provided. Do NOT fabricate
  specifics to sound impressive. A truthful general answer is better than an
  invented detailed one.
${hasBackground ? '' : '- No background was provided, so keep the answer general and motivational without inventing any concrete experience.\n'}
Style Instructions:
- Write the answer in first person (as the candidate responding)
- Do NOT provide templates, disclaimers, or bracketed placeholders
- Do NOT say "Here's a template answer" or "Replace X with your own Y"
- Do NOT prefix with explanations or caveats
- Treat the provided background as the candidate's ACTUAL, real history
- Between 100-200 words
- Professional and compelling, but truthful over impressive
- If specific user instructions were provided above, PRIORITIZE them while staying within the grounding rules

Answer (write as if you are the candidate):`

  try {
    // MEDIUM complexity: Balance of speed and quality for application answers
    return await callGeminiWithFallback(prompt, 'MEDIUM')
  } catch (error) {
    if (error instanceof AIRateLimitError) {
      throw error // Re-throw rate limit errors to be handled by caller
    }
    console.error('Error generating answer:', error)
    return 'Error generating answer. Please try again.'
  }
}

/**
 * Generate a cover letter for a job or scholarship application.
 * Uses the candidate's background and position description to create a compelling cover letter.
 */
export async function generateCoverLetter(
  applicationTitle: string,
  company: string | null,
  context: {
    resume?: string
    experience?: string
    education?: string
    jobDescription?: string
    extraInstructions?: string
  }
): Promise<string> {
  if (!isGeminiConfigured()) {
    return 'AI cover letter generation is not configured. Please add your Gemini API key to use this feature.'
  }

  const hasBackground = Boolean(context.resume || context.experience || context.education)

  const prompt = `You are helping a candidate write a professional cover letter for a job or scholarship application. Write the cover letter AS IF you are the candidate.

Application: ${applicationTitle}${company ? ` at ${company}` : ''}

${context.jobDescription ? `Position/Opportunity Description:\n${context.jobDescription}\n\n` : ''}Candidate's Background:
${hasBackground ? `Resume/Profile:\n${context.resume || ''}` : '(No background provided)'}

${context.extraInstructions ? `Additional Instructions from User:\n${context.extraInstructions}\n` : ''}

Grounding Rules (MOST IMPORTANT — never violate these):
- Use ONLY facts stated in the candidate's background above. Do NOT invent
  employers, job titles, dates, locations, projects, certifications, or skills
  that are not explicitly present.
- Never state a quantified achievement (percentages, dollar amounts, headcount,
  rankings, durations) unless that exact figure appears in the background.
- If the background lacks detail, write a sincere letter about motivation and
  fit using only what is provided. Do NOT fabricate experience to sound
  impressive. A truthful, motivation-led letter is better than an invented one.
${hasBackground ? '' : '- No background was provided, so focus on genuine interest in the position and general strengths without inventing any concrete experience.\n'}
Style Instructions:
- Write the cover letter in first person (as the candidate)
- Do NOT use templates, placeholders like [Your Name], [Company Name], or bracketed sections
- Do NOT include a date, address block, or signature line
- Start directly with the opening paragraph (e.g., "I am writing to express my strong interest...")
- Do NOT say "Here's a cover letter" or provide meta-commentary
- Treat the provided background as the candidate's ACTUAL, real history
- Structure: Opening paragraph (express interest), 2-3 body paragraphs (highlight relevant experience and skills), closing paragraph (express enthusiasm and call to action)
- Professional, compelling, and persuasive — but truthful over impressive
- Between 250-350 words
- Focus on why the candidate is a great fit for this specific position

Cover Letter (write as if you are the candidate):`

  try {
    // COMPLEX complexity: Quality priority for cover letters (can be slower)
    return await callGeminiWithFallback(prompt, 'COMPLEX')
  } catch (error) {
    if (error instanceof AIRateLimitError) {
      throw error // Re-throw rate limit errors to be handled by caller
    }
    console.error('Error generating cover letter:', error)
    return 'Error generating cover letter. Please try again.'
  }
}

/**
 * Structured analysis shape for documents.
 */
export type ParsedDocument = {
  education: {
    institution: string
    degree: string
    field: string
    start_date: string
    end_date: string
    description: string
  }[]
  experience: {
    company: string
    role: string
    start_date: string
    end_date: string
    description: string
  }[]
  projects: {
    name: string
    description: string
    technologies?: string[]
    start_date?: string
    end_date?: string
  }[]
  skills: {
    technical: string[]
    soft: string[]
    other: string[]
  }
  achievements: string[]
  certifications: {
    name: string
    issuer: string
    date: string
  }[]
  keywords: string[]
  raw_highlights: string[]
}

/**
 * Parse a document into structured data using Gemini.
 * Returns a deterministic ParsedDocument object (never null/undefined, no placeholder noise).
 */
export async function parseDocument(fileContent: string): Promise<ParsedDocument> {
  const empty: ParsedDocument = {
    education: [],
    experience: [],
    projects: [],
    skills: {
      technical: [],
      soft: [],
      other: [],
    },
    achievements: [],
    certifications: [],
    keywords: [],
    raw_highlights: [],
  }

  if (!isGeminiConfigured()) {
    return empty
  }

  const prompt = `Extract structured information from this resume/document:

${fileContent}

IMPORTANT: Return ONLY valid JSON (no markdown, no code fences, no extra text). Extract EVERYTHING you can find:

{
  "education": [
    {
      "institution": "school/university name",
      "degree": "Bachelor/Master/PhD/Certificate etc",
      "field": "major/subject",
      "start_date": "2020 or 2020-01",
      "end_date": "2024 or 2024-05",
      "description": "relevant coursework or achievements"
    }
  ],
  "experience": [
    {
      "company": "company name",
      "role": "job title",
      "start_date": "2022 or 2022-01",
      "end_date": "2023 or 2023-12",
      "description": "what you did, achievements, impact"
    }
  ],
  "projects": [
    {
      "name": "Project name",
      "description": "What the project does and your role in it",
      "technologies": ["Tech1", "Tech2"],
      "start_date": "2023 or 2023-01",
      "end_date": "2023 or 2023-12"
    }
  ],
  "skills": {
    "technical": ["Python", "JavaScript", "React", etc],
    "soft": ["Leadership", "Communication", etc],
    "other": ["Languages", "Tools", etc]
  },
  "achievements": ["Notable accomplishment 1", "Notable accomplishment 2"],
  "certifications": [
    {
      "name": "Certification name",
      "issuer": "Issuing organization",
      "date": "2023"
    }
  ],
  "keywords": ["Key terms", "Industries", "Technologies"],
  "raw_highlights": ["Bullet point 1", "Bullet point 2"]
}

Rules:
- Return ONLY the JSON object, nothing else
- Include ALL education found
- Include ALL work experience found
- Include ALL projects found (personal, academic, or professional)
- Extract technical AND soft skills
- Use empty arrays [] if section not found
- Use empty strings "" for missing details
- NO markdown, NO code fences, NO explanations`

  try {
    // COMPLEX complexity: Large resumes need full token limit to avoid truncation
    const text = await callGeminiWithFallback(prompt, 'COMPLEX')

    // Handle markdown code fences (```json...``` or ```...```)
    let jsonText = text
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim()
    }

    const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn('No JSON object found in response:', text.substring(0, 100))
      return empty
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch (error) {
      console.error('Failed to parse JSON:', error, 'Text:', jsonMatch[0].substring(0, 100))
      return empty
    }

    if (!parsed || typeof parsed !== 'object') {
      return empty
    }

    const obj = parsed as Record<string, unknown>

    const normalizeArray = (value: unknown): string[] =>
      Array.isArray(value) ? value.map((v) => String(v)).filter(Boolean) : []

    const normalized: ParsedDocument = {
      education: Array.isArray(obj.education)
        ? (obj.education as Record<string, unknown>[]).map((e) => ({
          institution: String(e?.institution || ''),
          degree: String(e?.degree || ''),
          field: String(e?.field || ''),
          start_date: String(e?.start_date || ''),
          end_date: String(e?.end_date || ''),
          description: String(e?.description || ''),
        }))
        : [],
      experience: Array.isArray(obj.experience)
        ? (obj.experience as Record<string, unknown>[]).map((e) => ({
          company: String(e?.company || ''),
          role: String(e?.role || ''),
          start_date: String(e?.start_date || ''),
          end_date: String(e?.end_date || ''),
          description: String(e?.description || ''),
        }))
        : [],
      projects: Array.isArray(obj.projects)
        ? (obj.projects as Record<string, unknown>[]).map((p) => ({
          name: String(p?.name || ''),
          description: String(p?.description || ''),
          technologies: normalizeArray(p?.technologies),
          start_date: p?.start_date ? String(p.start_date) : undefined,
          end_date: p?.end_date ? String(p.end_date) : undefined,
        }))
        : [],
      skills: (() => {
        const s = (obj.skills as Record<string, unknown> | undefined) ?? {}
        return {
          technical: normalizeArray(s.technical),
          soft: normalizeArray(s.soft),
          other: normalizeArray(s.other),
        }
      })(),
      achievements: normalizeArray(obj.achievements),
      certifications: Array.isArray(obj.certifications)
        ? (obj.certifications as Record<string, unknown>[]).map((c) => ({
          name: String(c?.name || ''),
          issuer: String(c?.issuer || ''),
          date: String(c?.date || ''),
        }))
        : [],
      keywords: normalizeArray(obj.keywords),
      raw_highlights: normalizeArray(obj.raw_highlights),
    }

    return normalized
  } catch (error) {
    if (error instanceof AIRateLimitError) {
      throw error // Re-throw rate limit errors to be handled by caller
    }
    console.error('Error parsing document:', error)
    return empty
  }
}

/**
 * Generate a comprehensive report for a document using Gemini.
 * Analyzes 6 key aspects:
 * 1. Content Quality & Completeness
 * 2. Formatting & Structure
 * 3. ATS Compatibility
 * 4. Language & Clarity
 * 5. Achievement Demonstration
 * 6. Industry Keywords & Relevance
 *
 * Returns a structured DocumentReport with honest feedback (not forcing issues).
 * - Uses models/gemini-2.5-flash
 * - Scores are 1-10 for each category
 * - Improvements only suggested when genuinely needed
 * - Safe for unknown parsed_data shapes via runtime checks
 */
export async function generateDocumentReport(input: {
  fileName: string
  parsedData?: unknown
  extractedText?: string
}): Promise<DocumentReport> {
  const { fileName, parsedData, extractedText } = input

  const defaultReport: DocumentReport = {
    documentType: 'Unknown',
    overallScore: 0,
    overallAssessment: 'Report could not be generated.',
    categories: [],
  }

  if (!isGeminiConfigured()) {
    console.warn('Gemini API key not configured for generateDocumentReport')
    defaultReport.overallAssessment =
      'Report generation is unavailable because AI is not configured for this deployment.'
    return defaultReport
  }

  try {
    let education: unknown
    let experience: unknown
    let projects: unknown
    let skills: unknown
    let achievements: unknown
    let certifications: unknown
    let keywords: unknown
    let raw_highlights: unknown

    if (parsedData && typeof parsedData === 'object') {
      const obj = parsedData as Record<string, unknown>
      if (Array.isArray(obj.education)) education = obj.education
      if (Array.isArray(obj.experience)) experience = obj.experience
      if (Array.isArray(obj.projects)) projects = obj.projects
      if (obj.skills && typeof obj.skills === 'object') skills = obj.skills
      if (Array.isArray(obj.achievements)) achievements = obj.achievements
      if (Array.isArray(obj.certifications)) certifications = obj.certifications
      if (Array.isArray(obj.keywords)) keywords = obj.keywords
      if (Array.isArray(obj.raw_highlights)) raw_highlights = obj.raw_highlights
    }

    const contextParts: string[] = []

    // Prioritize extracted text
    if (extractedText && extractedText.trim().length > 0) {
      const truncatedText = extractedText.slice(0, 4000)
      contextParts.push(`Document content:\n${truncatedText}${extractedText.length > 4000 ? '...(truncated)' : ''}`)
    }

    // Include structured data
    if (education) {
      contextParts.push(`Education entries:\n${JSON.stringify(education, null, 2)}`)
    }
    if (experience) {
      contextParts.push(`Experience entries:\n${JSON.stringify(experience, null, 2)}`)
    }
    if (projects) {
      contextParts.push(`Projects:\n${JSON.stringify(projects, null, 2)}`)
    }
    if (skills) {
      contextParts.push(`Skills:\n${JSON.stringify(skills, null, 2)}`)
    }
    if (achievements) {
      contextParts.push(`Achievements:\n${JSON.stringify(achievements, null, 2)}`)
    }
    if (certifications) {
      contextParts.push(`Certifications:\n${JSON.stringify(certifications, null, 2)}`)
    }
    if (keywords) {
      contextParts.push(`Keywords:\n${JSON.stringify(keywords, null, 2)}`)
    }
    if (raw_highlights) {
      contextParts.push(`Highlights:\n${JSON.stringify(raw_highlights, null, 2)}`)
    }

    const contextBlock = contextParts.length
      ? contextParts.join('\n\n')
      : 'No content or structured data available.'

    // Get today's date for reference
    const today = new Date()
    const todayString = today.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

    const prompt = `You are an expert resume and document reviewer. Analyze the following document and provide a detailed scorecard report.

IMPORTANT: Today's date is ${todayString}. Use this to evaluate whether dates are in the past or future.

File name: ${fileName}

Available context:
${contextBlock}

Task: Provide a comprehensive evaluation of this document across 6 key dimensions. Return ONLY valid JSON (no markdown, no code fences, no extra text).

CRITICAL INSTRUCTIONS - READ CAREFULLY:
1. Analyze ONLY the ACTUAL data provided above. Do NOT make assumptions or invent details.
2. ONLY report issues/improvements if they are verifiable from the provided context.
3. Do NOT mention issues that don't exist in the data (e.g., don't report "future dates" if no future dates are present).
4. If an improvement doesn't apply or isn't needed, leave the improvements array EMPTY rather than making up suggestions.
5. All feedback MUST be specific to THIS document's actual content.
6. Do NOT use generic or templated feedback - every point must relate to what you see in the data.
7. If you cannot verify an issue from the provided data, DO NOT report it.
8. DATE VALIDATION: Before reporting any date as "in the future", compare it to today's date (${todayString}). Only report dates that are ACTUALLY in the future. Do NOT report dates that are in the past or present as problematic.
9. Do NOT report date issues unless dates are genuinely in the future (AFTER ${todayString}).

Return JSON with this exact structure:
{
  "documentType": "<Resume | Cover Letter | Transcript | Portfolio | Other - identify based on document>",
  "overallScore": <number 1-10 based on comprehensive analysis of THIS document>,
  "overallAssessment": "<1-2 sentences describing THIS specific document's overall quality and key impression>",
  "categories": [
    {
      "name": "Content Quality & Completeness",
      "score": <number 1-10>,
      "strengths": ["<specific strength you identified in THIS document>", "<another strength>"],
      "improvements": ["<actionable improvement based on actual gaps in THIS document>"]
    },
    {
      "name": "Formatting & Structure",
      "score": <number 1-10>,
      "strengths": ["<what THIS document does well structurally>"],
      "improvements": ["<specific formatting suggestions ONLY if issues are visible in the data>"]
    },
    {
      "name": "ATS Compatibility",
      "score": <number 1-10>,
      "strengths": ["<ATS-friendly aspects THIS document has>"],
      "improvements": ["<ATS improvements ONLY if actual issues exist in THIS document>"]
    },
    {
      "name": "Language & Clarity",
      "score": <number 1-10>,
      "strengths": ["<writing quality observations in THIS document>"],
      "improvements": ["<clarity improvements ONLY if actual issues exist>"]
    },
    {
      "name": "Achievement Demonstration",
      "score": <number 1-10>,
      "strengths": ["<how THIS document demonstrates impact and accomplishments>"],
      "improvements": ["<suggestions ONLY if THIS document lacks achievement details>"]
    },
    {
      "name": "Industry Keywords & Relevance",
      "score": <number 1-10>,
      "strengths": ["<relevant keywords and terms found in THIS document>"],
      "improvements": ["<opportunities to add keywords ONLY if THIS document is missing important ones>"]
    }
  ]
}

Scoring Guidelines (1-10):
- 1-3: Needs significant improvement
- 4-6: Below average, has notable gaps
- 7-8: Good, solid performance with minor areas to improve
- 9-10: Excellent, best practices demonstrated

MANDATORY RULES - DO NOT BREAK THESE:
1. Only include "improvements" if you can point to an actual gap in the provided data
2. If you cannot verify an issue from the provided context, DO NOT report it
3. If a category is strong (score 7+), the improvements array should be EMPTY
4. Better to have empty improvements than to hallucinate issues
5. Base scores on actual content quality, not appearance alone
6. Achievement Demonstration should rate how well the document shows the person's actual accomplishments from the data
7. Industry Keywords should check for relevant terms found in THIS document (NOT generic suggestions)
8. Return ONLY the JSON object, nothing else
9. VERIFY each improvement suggestion against the provided data - if not in data, don't include it`

    // MEDIUM complexity: Flash models are sufficient for document scoring
    const text = await callGeminiWithFallback(prompt, 'MEDIUM')

    // Handle markdown code fences
    let jsonText = text
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim()
    }

    const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      // Log the start of the text to debug why JSON wasn't found
      console.warn('No JSON object found in report response. Text start:', text.substring(0, 200))
      return defaultReport
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch (error) {
      console.error('Failed to parse report JSON:', error)
      return defaultReport
    }

    if (!parsed || typeof parsed !== 'object') {
      return defaultReport
    }

    const obj = parsed as Record<string, unknown>
    const report: DocumentReport = {
      documentType: String(obj.documentType || 'Unknown'),
      overallScore: typeof obj.overallScore === 'number' ? Math.min(10, Math.max(1, obj.overallScore)) : 0,
      overallAssessment: String(obj.overallAssessment || 'Report generated'),
      categories: Array.isArray(obj.categories)
        ? (obj.categories as Record<string, unknown>[])
          .map((cat) => ({
            name: String(cat?.name || ''),
            score: typeof cat?.score === 'number' ? Math.min(10, Math.max(1, cat.score)) : 0,
            strengths: Array.isArray(cat?.strengths) ? (cat.strengths as unknown[]).map((s) => String(s)) : [],
            improvements: Array.isArray(cat?.improvements) ? (cat.improvements as unknown[]).map((i) => String(i)) : [],
          }))
          .filter((cat) => cat.name.length > 0)
        : [],
    }

    return report
  } catch (error) {
    if (error instanceof AIRateLimitError) {
      throw error // Re-throw rate limit errors to be handled by caller
    }
    console.error('Error generating document report:', error)
    return defaultReport
  }
}

/**
 * Generate interview questions for behavioral, technical, or mixed interviews.
 *
 * @param sessionType - Type of interview session
 * @param difficulty - Difficulty level (easy, medium, hard)
 * @param questionCount - Number of questions to generate
 * @param jobDescription - Optional job description for context
 * @param companyName - Optional company name for context
 * @returns Array of generated questions with metadata
 */
export async function generateInterviewQuestions(params: {
  sessionType: 'behavioral' | 'technical' | 'mixed'
  difficulty: 'easy' | 'medium' | 'hard'
  questionCount: number
  jobDescription?: string
  companyName?: string
}): Promise<Array<{
  question_text: string
  question_category: string
  difficulty: string
  ideal_answer_outline: {
    structure: string
    keyPoints: string[]
    exampleMetrics?: string[]
    commonPitfalls?: string[]
  }
  evaluation_criteria: {
    mustInclude: string[]
    bonusPoints?: string[]
    redFlags?: string[]
  }
  estimated_duration_seconds: number
}>> {
  if (!isGeminiConfigured()) {
    throw new Error('AI is not configured. Please add your Gemini API key.')
  }

  const { sessionType, difficulty, questionCount, jobDescription, companyName } = params

  const sessionTypeMapping = {
    behavioral: 'behavioral questions (leadership, teamwork, conflict resolution, failures, challenges)',
    technical: 'technical discussion questions (system design, architecture, problem-solving approach, technical concepts)',
    mixed: 'a mix of behavioral AND technical discussion questions',
  }

  const difficultyMapping = {
    easy: 'entry-level or junior positions (straightforward, foundational)',
    medium: 'mid-level positions (moderate complexity, some depth required)',
    hard: 'senior-level positions (complex, strategic, high-impact)',
  }

  const validCategories = sessionType === 'behavioral'
    ? ['behavioral_leadership', 'behavioral_teamwork', 'behavioral_conflict', 'behavioral_failure']
    : sessionType === 'technical'
      ? ['technical_system_design', 'technical_concepts']
      : ['behavioral_leadership', 'behavioral_teamwork', 'technical_system_design', 'technical_concepts']

  const prompt = `You are an expert technical recruiter creating interview questions for ${companyName || 'a company'}.

Generate ${questionCount} ${sessionTypeMapping[sessionType]} at ${difficultyMapping[difficulty]} difficulty level.

${jobDescription ? `Job Description:\n${jobDescription}\n\n` : ''}CRITICAL REQUIREMENTS:
- ALL questions MUST be answerable through VERBAL responses only
- DO NOT include coding challenges, whiteboard coding, or algorithm implementation questions
- DO NOT ask candidates to write code, demonstrate skills, or perform tasks
- Focus on discussion-based questions about concepts, experiences, and approaches
- Technical questions should focus on system design discussions, architecture decisions, and conceptual understanding
- Questions should test knowledge and problem-solving through conversation, not code

Generate questions that:
- Are specific and realistic for actual verbal interviews
- Test knowledge and problem-solving ability through discussion
- Include clear evaluation criteria
- Provide helpful guidance for answering
- Can be fully answered by speaking (no coding, writing, or demonstrations required)

IMPORTANT: For "question_category", you MUST choose EXACTLY ONE from this list:
${validCategories.map(c => `- ${c}`).join('\n')}

Return ONLY valid JSON (no markdown, no code fences, no explanations):

{
  "questions": [
    {
      "question_text": "The actual interview question (verbal response only)",
      "question_category": "Choose ONE from the list above (e.g., ${validCategories[0]})",
      "difficulty": "${difficulty}",
      "ideal_answer_outline": {
        "structure": "${sessionType === 'behavioral' ? 'STAR (Situation, Task, Action, Result)' : 'Clarify → Explain Approach → Discuss Trade-offs → Describe Solution'}",
        "keyPoints": [
          "Key point 1 to cover in the answer",
          "Key point 2 to cover",
          "Key point 3 to cover"
        ],
        "exampleMetrics": [
          "Example metric or outcome to mention"
        ],
        "commonPitfalls": [
          "Common mistake candidates make",
          "Another pitfall to avoid"
        ]
      },
      "evaluation_criteria": {
        "mustInclude": [
          "Required element 1",
          "Required element 2"
        ],
        "bonusPoints": [
          "Extra credit item 1",
          "Extra credit item 2"
        ],
        "redFlags": [
          "Red flag 1",
          "Red flag 2"
        ]
      },
      "estimated_duration_seconds": ${sessionType === 'technical' ? '300' : '180'}
    }
  ]
}

Generate exactly ${questionCount} unique, high-quality VERBAL interview questions.`

  try {
    const text = await callGeminiWithFallback(prompt, 'MEDIUM') // MEDIUM: Flash handles questions well

    // Handle markdown code fences
    let jsonText = text
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim()
    }

    const jsonMatch = jsonText.match(/\{[\s\S]*\}$/)
    if (!jsonMatch) {
      console.warn('No JSON object found in response:', text.substring(0, 100))

      throw new Error('Failed to parse AI response')
    }


    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      throw new Error('Invalid response format')
    }

    // Validate and sanitize question categories
    const allValidCategories = [
      'behavioral_leadership',
      'behavioral_teamwork',
      'behavioral_conflict',
      'behavioral_failure',
      'technical_system_design',
      'technical_concepts',
      'company_culture',
      'company_values',
      'resume_specific',
      'other'
    ]

    parsed.questions = (parsed.questions as Record<string, unknown>[]).map((q) => {
      // Validate category
      if (!allValidCategories.includes(q.question_category as string)) {
        console.warn(`Invalid question category "${q.question_category}", defaulting to "other"`)
        q.question_category = 'other'
      }
      return q
    })

    return parsed.questions
  } catch (error) {
    if (error instanceof AIRateLimitError) {
      throw error
    }
    console.error('Error generating interview questions:', error)
    throw new Error('Failed to generate interview questions. Please try again.')
  }
}

/**
 * Generate "Resume Grill" questions based on the candidate's resume.
 * These questions dig deep into specific experiences, projects, and claims.
 *
 * @param resumeText - Extracted text from the resume
 * @param parsedData - Structured resume data
 * @param questionCount - Number of questions to generate
 * @param difficulty - Difficulty level
 * @returns Array of resume-specific questions
 */
export async function generateResumeGrillQuestions(params: {
  resumeText: string
  parsedData?: unknown
  questionCount: number
  difficulty: 'easy' | 'medium' | 'hard'
}): Promise<Array<{
  question_text: string
  question_category: string
  difficulty: string
  ideal_answer_outline: {
    structure: string
    keyPoints: string[]
    exampleMetrics?: string[]
    commonPitfalls?: string[]
  }
  evaluation_criteria: {
    mustInclude: string[]
    bonusPoints?: string[]
    redFlags?: string[]
  }
  estimated_duration_seconds: number
}>> {
  if (!isGeminiConfigured()) {
    throw new Error('AI is not configured. Please add your Gemini API key.')
  }

  const { resumeText, parsedData, questionCount, difficulty } = params

  const structuredData = parsedData ? JSON.stringify(parsedData, null, 2) : 'Not available'

  const prompt = `You are an expert interviewer conducting a "Resume Grill" - asking deep, probing questions about specific claims and experiences on the candidate's resume.

Resume Content:
${resumeText}

Structured Resume Data:
${structuredData}

CRITICAL REQUIREMENTS:
- ALL questions MUST be answerable through VERBAL responses only
- DO NOT ask candidates to write code, implement algorithms, or demonstrate technical skills
- DO NOT include coding challenges or whiteboard exercises
- Focus on discussing experiences, decisions, challenges, and learnings
- Ask about the "what", "why", and "how" of their experiences through conversation
- Questions should probe understanding and involvement through discussion, not code

Generate ${questionCount} specific, challenging questions that:
- Reference SPECIFIC projects, technologies, or experiences from the resume
- Probe for depth of knowledge and actual involvement through discussion
- Test whether claims are genuine or exaggerated via verbal explanation
- Ask about decisions, trade-offs, and challenges faced
- Verify understanding of technologies and concepts mentioned through conversation
- Can be fully answered by speaking about experiences and knowledge

Difficulty level: ${difficulty}

Return ONLY valid JSON (no markdown, no code fences):

{
  "questions": [
    {
      "question_text": "I see you worked on [specific project]. Can you walk me through [specific aspect/challenge]?",
      "question_category": "resume_specific",
      "difficulty": "${difficulty}",
      "ideal_answer_outline": {
        "structure": "Specific project/experience → Context → Challenges → Approach → Solutions → Impact",
        "keyPoints": [
          "Demonstrates actual hands-on experience through detailed explanation",
          "Shows understanding of technical concepts and decisions",
          "Can articulate trade-offs and reasoning",
          "Provides specific metrics or outcomes"
        ],
        "exampleMetrics": [
          "Performance improvements",
          "Scale achieved",
          "Business impact"
        ],
        "commonPitfalls": [
          "Vague or generic answers",
          "Can't explain technical details or decisions",
          "Over-reliance on 'we' instead of 'I'",
          "Can't discuss challenges or failures"
        ]
      },
      "evaluation_criteria": {
        "mustInclude": [
          "Specific details about the project or experience",
          "Personal contribution (use of 'I' not just 'we')",
          "Challenges faced and how they were overcome"
        ],
        "bonusPoints": [
          "Discusses trade-offs considered",
          "Mentions metrics or measurable impact",
          "Shows learning or growth from the experience"
        ],
        "redFlags": [
          "Cannot provide specific details",
          "Vague or rehearsed answers",
          "Blames others for failures",
          "Inflated claims not backed by explanation"
        ]
      },
      "estimated_duration_seconds": 240
    }
  ]
}

Generate exactly ${questionCount} questions that reference ACTUAL content from the resume and can be answered verbally.`

  try {
    const text = await callGeminiWithFallback(prompt, 'COMPLEX')

    // Handle markdown code fences
    let jsonText = text
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim()
    }

    const jsonMatch = jsonText.match(/\{[\s\S]*\}$/)
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response')
    }

    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      throw new Error('Invalid response format')
    }

    // Validate and sanitize question categories
    const allValidCategories = [
      'behavioral_leadership',
      'behavioral_teamwork',
      'behavioral_conflict',
      'behavioral_failure',
      'technical_system_design',
      'technical_concepts',
      'company_culture',
      'company_values',
      'resume_specific',
      'other'
    ]

    parsed.questions = (parsed.questions as Record<string, unknown>[]).map((q) => {
      // Validate category
      if (!allValidCategories.includes(q.question_category as string)) {
        console.warn(`Invalid question category "${q.question_category}", defaulting to "resume_specific"`)
        q.question_category = 'resume_specific'
      }
      return q
    })

    return parsed.questions
  } catch (error) {
    if (error instanceof AIRateLimitError) {
      throw error
    }
    console.error('Error generating resume grill questions:', error)
    throw new Error('Failed to generate resume-specific questions. Please try again.')
  }
}

/**
 * Generate company-specific interview questions from a template.
 * Uses pre-defined question bank but customizes for the specific job description.
 *
 * @param templateQuestions - Questions from company_interview_templates
 * @param jobDescription - Optional job description to customize questions
 * @param questionCount - Number of questions to select/customize
 * @returns Array of customized questions
 */
type CompanySpecificQuestion = {
  question_text: string
  question_category: string
  difficulty: string
  ideal_answer_outline: unknown
  evaluation_criteria: unknown
  estimated_duration_seconds: number
}

export async function generateCompanySpecificQuestions(params: {
  templateQuestions: Array<Record<string, unknown>>
  jobDescription?: string
  questionCount: number
}): Promise<Array<CompanySpecificQuestion>> {
  if (!isGeminiConfigured()) {
    throw new Error('AI is not configured. Please add your Gemini API key.')
  }

  const { templateQuestions, jobDescription, questionCount } = params

  if (templateQuestions.length === 0) {
    throw new Error('No template questions provided')
  }

  // If we have enough template questions and no job description, just return them
  if (templateQuestions.length >= questionCount && !jobDescription) {
    return templateQuestions.slice(0, questionCount) as CompanySpecificQuestion[]
  }

  const prompt = `You are customizing interview questions from a company-specific question bank.

Template Questions:
${JSON.stringify(templateQuestions, null, 2)}

${jobDescription ? `Job Description:\n${jobDescription}\n\n` : ''}Task: ${jobDescription ? 'Customize and adapt these questions to better fit the job description.' : 'Select and return the best questions from the template.'}

Select exactly ${questionCount} questions. ${jobDescription ? 'Modify the questions slightly to reference the specific role/responsibilities from the job description while maintaining their core intent and evaluation criteria.' : ''}

Return ONLY valid JSON (no markdown, no code fences):

{
  "questions": [
    {
      "question_text": "The question (customized if job description provided)",
      "question_category": "category from template",
      "difficulty": "difficulty from template",
      "ideal_answer_outline": { ... from template ... },
      "evaluation_criteria": { ... from template ... },
      "estimated_duration_seconds": number from template
    }
  ]
}

Return exactly ${questionCount} questions.`

  try {
    const text = await callGeminiWithFallback(prompt, 'MEDIUM')

    // Handle markdown code fences
    let jsonText = text
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim()
    }

    const jsonMatch = jsonText.match(/\{[\s\S]*\}$/)
    if (!jsonMatch) {
      // Fallback: just return template questions
      return templateQuestions.slice(0, questionCount) as CompanySpecificQuestion[]
    }

    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      return templateQuestions.slice(0, questionCount) as CompanySpecificQuestion[]
    }

    // Validate and sanitize question categories
    const allValidCategories = [
      'behavioral_leadership',
      'behavioral_teamwork',
      'behavioral_conflict',
      'behavioral_failure',
      'technical_system_design',
      'technical_concepts',
      'company_culture',
      'company_values',
      'resume_specific',
      'other'
    ]

    parsed.questions = (parsed.questions as Record<string, unknown>[]).map((q) => {
      // Validate category
      if (!allValidCategories.includes(q.question_category as string)) {
        console.warn(`Invalid question category "${q.question_category}", defaulting to "company_culture"`)
        q.question_category = 'company_culture'
      }
      return q
    })

    return parsed.questions as CompanySpecificQuestion[]
  } catch (error) {
    if (error instanceof AIRateLimitError) {
      throw error
    }
    console.error('Error generating company-specific questions:', error)
    // Fallback: return template questions
    return templateQuestions.slice(0, questionCount) as CompanySpecificQuestion[]
  }
}

/**
 * Evaluate an interview answer and provide detailed feedback with scoring.
 *
 * @param question - The interview question
 * @param answer - The candidate's answer
 * @param idealOutline - Guidance on ideal answer structure
 * @param evaluationCriteria - Criteria for evaluation
 * @param answerType - Whether answer was voice or text
 * @returns Evaluation with score breakdown and feedback
 */
export async function evaluateInterviewAnswer(params: {
  question: string
  answer: string
  questionCategory: string
  idealOutline?: unknown
  evaluationCriteria?: unknown
  answerType: 'voice' | 'text'
}): Promise<{
  score: number
  clarity_score: number
  structure_score: number
  relevance_score: number
  depth_score: number
  confidence_score: number
  feedback: {
    overall: string
    strengths: string[]
    weaknesses: string[]
    suggestions: string[]
    tone_analysis?: string
  }
}> {
  if (!isGeminiConfigured()) {
    throw new Error('AI is not configured. Please add your Gemini API key.')
  }

  const { question, answer, questionCategory, idealOutline, evaluationCriteria, answerType } = params

  const isBehavioral = questionCategory.startsWith('behavioral')
  const isTechnical = questionCategory.startsWith('technical')

  const prompt = `You are an expert interviewer evaluating a candidate's answer to an interview question.

Question: ${question}
Category: ${questionCategory}

Candidate's Answer (${answerType === 'voice' ? 'transcribed from voice' : 'typed'}):
${answer}

${idealOutline ? `Ideal Answer Guidance:\n${JSON.stringify(idealOutline, null, 2)}\n\n` : ''}${evaluationCriteria ? `Evaluation Criteria:\n${JSON.stringify(evaluationCriteria, null, 2)}\n\n` : ''}CRITICAL REQUIREMENTS - YOU MUST FOLLOW THESE:
1. You MUST provide ALL 5 individual scores (clarity, structure, relevance, depth, confidence)
2. Each score MUST be a decimal number between 0.00 and 10.00 (e.g., 7.5, 8.2, 9.1)
3. You MUST provide detailed feedback with:
   - overall: 2-3 sentences summarizing the answer quality
   - strengths: ONLY if score >= 5.0 (provide 2-3 specific positive aspects)
   - weaknesses: ONLY if score < 7.0 (provide 2-3 specific areas for improvement)
   - suggestions: Always provide 2-3 actionable recommendations
   - tone_analysis: 1-2 sentences analyzing communication style and delivery

4. Be SPECIFIC - reference actual content from the candidate's answer
5. Be HONEST - if an answer is poor (score < 5), don't force strengths. If excellent (score >= 7), don't force weaknesses.
6. Suggestions should always be provided regardless of score
7. All feedback must be constructive and helpful

Evaluate this answer across 5 dimensions (each scored 0.00 to 10.00):

1. **Clarity** (0-10): How clear and understandable is the answer?
2. **Structure** (0-10): How well-organized is the answer? ${isBehavioral ? '(STAR method for behavioral)' : '(Logical flow for technical)'}
3. **Relevance** (0-10): How directly does it address the question?
4. **Depth** (0-10): How detailed and thorough is the answer?
5. **Confidence** (0-10): ${answerType === 'voice' ? 'How confident did they sound?' : 'How confident does the writing appear?'}

Return ONLY valid JSON (no markdown, no code fences):

{
  "score": <overall score 0.00-10.00 (average of the 5 dimensions)>,
  "clarity_score": <decimal 0.00-10.00>,
  "structure_score": <decimal 0.00-10.00>,
  "relevance_score": <decimal 0.00-10.00>,
  "depth_score": <decimal 0.00-10.00>,
  "confidence_score": <decimal 0.00-10.00>,
  "feedback": {
    "overall": "2-3 sentence summary of the answer quality",
    "strengths": [
      // ONLY include if overall score >= 5.0
      // If score < 5.0, return empty array []
      "Specific strength 1 with reference to answer content",
      "Specific strength 2"
    ],
    "weaknesses": [
      // ONLY include if overall score < 7.0
      // If score >= 7.0, return empty array []
      "Specific area for improvement 1",
      "Specific area for improvement 2"
    ],
    "suggestions": [
      // ALWAYS provide suggestions regardless of score
      "Actionable suggestion 1 to improve the answer",
      "Actionable suggestion 2"
    ],
    "tone_analysis": "1-2 sentences analyzing communication style and delivery"
  }
}

SCORING GUIDELINES:
- Score < 5.0: Poor answer - provide weaknesses and suggestions, skip strengths
- Score 5.0-6.9: Average answer - provide strengths, weaknesses, and suggestions
- Score >= 7.0: Good answer - provide strengths and suggestions, skip weaknesses

Be honest with your scoring. Don't inflate or deflate scores.`

  try {
    const text = await callGeminiWithFallback(prompt, 'COMPLEX')

    // Handle markdown code fences
    let jsonText = text
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim()
    }

    const jsonMatch = jsonText.match(/\{[\s\S]*\}$/)
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response')
    }

    const parsed = JSON.parse(jsonMatch[0])

    // Validation helper to ensure arrays are properly formatted
    // Note: Empty arrays are now allowed for strengths/weaknesses (conditional based on score)
    const ensureArray = (arr: unknown, minLength: number = 0, fieldName: string = 'field'): string[] => {
      if (!Array.isArray(arr)) {
        console.warn(`[AI Evaluation] ${fieldName} is not an array, got ${typeof arr}`)
        return []
      }
      if (arr.length < minLength && minLength > 0) {
        console.warn(`[AI Evaluation] ${fieldName} array has ${arr.length} items, expected at least ${minLength}`)
      }
      return arr.map(item => String(item))
    }

    // Ensure all scores are valid numbers
    const ensureScore = (score: unknown, fieldName: string = 'score'): number => {
      const num = Number(score)
      if (isNaN(num) || num < 0 || num > 10) {
        console.warn(`[AI Evaluation] Invalid ${fieldName}: ${score}, defaulting to 0`)
        return 0
      }
      return num
    }

    return {
      score: ensureScore(parsed.score, 'overall score'),
      clarity_score: ensureScore(parsed.clarity_score, 'clarity_score'),
      structure_score: ensureScore(parsed.structure_score, 'structure_score'),
      relevance_score: ensureScore(parsed.relevance_score, 'relevance_score'),
      depth_score: ensureScore(parsed.depth_score, 'depth_score'),
      confidence_score: ensureScore(parsed.confidence_score, 'confidence_score'),
      feedback: {
        overall: String(parsed.feedback?.overall || 'Feedback generated'),
        strengths: ensureArray(parsed.feedback?.strengths, 0, 'strengths'),  // Allow empty
        weaknesses: ensureArray(parsed.feedback?.weaknesses, 0, 'weaknesses'),  // Allow empty
        suggestions: ensureArray(parsed.feedback?.suggestions, 2, 'suggestions'),  // Always require 2+
        tone_analysis: String(parsed.feedback?.tone_analysis || ''),
      },
    }
  } catch (error) {
    if (error instanceof AIRateLimitError) {
      throw error
    }
    console.error('Error evaluating interview answer:', error)
    throw new Error('Failed to evaluate answer. Please try again.')
  }
}

/**
 * @deprecated Use generateDocumentReport instead.
 * Kept for backward compatibility but should not be used in new code.
 */
export async function summarizeDocument(input: {
  fileName: string
  parsedData?: unknown
  extractedText?: string
}): Promise<string> {
  const report = await generateDocumentReport(input)
  return report.overallAssessment
}

export type ResumeAnalysisResult = {
  score: number           // 0-100
  matchingKeywords: string[]
  missingKeywords: string[] // Critical missing keywords for ATS
  strengths: string[]
  weaknesses: string[]
  recommendations: string[] // Actionable advice
}

/**
 * Analyze the match between a resume and a job description.
 * Focuses on weaknesses, ATS keyword gaps, and actionable improvements.
 */
export async function analyzeResumeMatch(
  resumeText: string,
  jobDescription: string
): Promise<ResumeAnalysisResult> {
  if (!isGeminiConfigured()) {
    throw new Error('AI is not configured. Please add your Gemini API key.')
  }

  const prompt = `You are an expert Resume Analyst and ATS (Applicant Tracking System) Specialist.
Analyze the following RESUME against the JOB DESCRIPTION.

JOB DESCRIPTION:
${jobDescription.slice(0, 8000)}

RESUME CONTENT:
${resumeText.slice(0, 8000)}

YOUR TASK:
Provide a critical, no-nonsense analysis of how well the resume matches the job description.
Focus HEAVILY on finding gaps, weaknesses, and missing keywords that would cause an ATS rejection.

REQUIREMENTS:
1. **Score**: Give a strict match score (0-100). Be realistic.
2. **Weaknesses**: Identify at least 3-5 specific weaknesses or gaps. Be crucial.
3. **ATS Keywords**: Identify CRITICAL keywords from the JD that are MISSING in the resume. High importance.
4. **Actionable Advice**: Provide specific, concrete steps to improve the resume for THIS specific job.
5. **Strengths**: Briefly list key strengths (but prioritize finding gaps).

Return ONLY valid JSON (no markdown, no code fences):
{
  "score": <number 0-100>,
  "matchingKeywords": ["<keyword found in both>"],
  "missingKeywords": ["<CRITICAL keyword in JD but NOT in resume>"],
  "strengths": ["<strength 1>", "<strength 2>"],
  "weaknesses": ["<detailed weakness 1>", "<detailed weakness 2>"],
  "recommendations": ["<specific action 1>", "<specific action 2>"]
}
  `

  try {
    const text = await callGeminiWithFallback(prompt, 'COMPLEX')

    // Handle markdown code fences
    let jsonText = text
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim()
    }

    const jsonMatch = jsonText.match(/\{[\s\S]*\}$/)
    if (!jsonMatch) {
      throw new Error('No JSON object found in analysis response')
    }

    const parsed = JSON.parse(jsonMatch[0])

    const normalizeArray = (arr: unknown) => Array.isArray(arr) ? arr.map(String) : []

    return {
      score: typeof parsed.score === 'number' ? Math.min(100, Math.max(0, parsed.score)) : 0,
      matchingKeywords: normalizeArray(parsed.matchingKeywords),
      missingKeywords: normalizeArray(parsed.missingKeywords),
      strengths: normalizeArray(parsed.strengths),
      weaknesses: normalizeArray(parsed.weaknesses),
      recommendations: normalizeArray(parsed.recommendations),
    }

  } catch (error) {
    if (error instanceof AIRateLimitError) {
      throw error
    }
    console.error('Error analyzing resume match:', error)
    throw new Error('Failed to analyze resume match. Please try again.')
  }
}

export interface ParsedJob {
  title: string
  company: string | null
  job_description: string
}

/**
 * Turn raw job-posting text (scraped HTML text or pasted) into structured fields.
 * Title falls back to a placeholder so a NOT NULL applications.title insert never fails.
 */
export async function parseJobPosting(text: string): Promise<ParsedJob> {
  if (!isGeminiConfigured()) {
    throw new Error('AI is not configured. Please add your Gemini API key.')
  }

  const source = text.slice(0, 20000)

  const prompt = `You extract structured fields from a job or scholarship posting.

POSTING TEXT:
${source}

Return ONLY valid JSON (no markdown, no code fences, no commentary):
{
  "title": "<the role/position title exactly as written, or empty string if none>",
  "company": "<the hiring company or organization name, or null if none>",
  "job_description": "<the cleaned, readable job description: responsibilities, requirements, and about-the-role text with navigation/boilerplate/cookie notices removed>"
}

RULES:
- Do NOT invent details that are not in the text.
- job_description must be plain text copied/cleaned from the posting, not summarized away.
- If you cannot find a company, use null (not the string "null").`

  try {
    const raw = await callGeminiWithFallback(prompt, 'MEDIUM')

    let jsonText = raw
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) jsonText = fence[1].trim()
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('no json')
    }

    const parsed = JSON.parse(jsonMatch[0]) as Partial<ParsedJob>
    const title = typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : 'Untitled Application'
    const company = typeof parsed.company === 'string' && parsed.company.trim() ? parsed.company.trim() : null
    const job_description =
      typeof parsed.job_description === 'string' && parsed.job_description.trim()
        ? parsed.job_description.trim()
        : text.trim()

    return { title, company, job_description }
  } catch (error) {
    if (error instanceof AIRateLimitError) throw error
    console.error('Error parsing job posting:', error)
    throw new Error('Failed to parse job posting. Please try again.')
  }
}
