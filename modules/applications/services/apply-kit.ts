import { createClient } from '@/shared/db/supabase/client'
import type { ParsedJob } from '@/shared/infrastructure/ai'

export type { ParsedJob } from '@/shared/infrastructure/ai'

/** Matches the shape returned by POST /api/applications/analyze (analyzeResumeMatch). */
export interface ResumeAnalysisResult {
  score: number
  matchingKeywords: string[]
  missingKeywords: string[]
  strengths: string[]
  weaknesses: string[]
  recommendations: string[]
}

export type StepName = 'job' | 'analysis' | 'coverLetter'
export type StepStatus = 'loading' | 'done' | 'error'

export interface StepEvent {
  step: StepName
  status: StepStatus
  error?: string
}

export interface ApplyKitInput {
  url?: string
  text?: string
}

export interface ApplyKitOptions {
  analysis: boolean
  coverLetter: boolean
}

export interface ApplyKitResult {
  applicationId: string
  job: ParsedJob
  analysis: ResumeAnalysisResult | null
  coverLetter: string | null
}

export interface ApplyKitClient {
  parseJob(input: ApplyKitInput): Promise<ParsedJob>
  createApplication(job: ParsedJob, sourceUrl: string | null): Promise<string>
  linkDocument(applicationId: string, documentId: string): Promise<void>
  analyzeResume(applicationId: string, documentId: string): Promise<ResumeAnalysisResult>
  generateCoverLetter(applicationId: string): Promise<string | null>
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Sequence: parse -> create application -> link resume -> analysis -> cover letter.
 * The analysis and cover-letter steps only run when selected in `options`.
 * Parse failure aborts (nothing created). After the application exists, an analysis or
 * cover-letter failure is reported via onProgress but does not discard earlier results.
 */
export async function runApplyKit(
  input: ApplyKitInput,
  documentId: string,
  options: ApplyKitOptions,
  client: ApplyKitClient,
  onProgress: (event: StepEvent) => void
): Promise<ApplyKitResult> {
  onProgress({ step: 'job', status: 'loading' })
  let job: ParsedJob
  try {
    job = await client.parseJob(input)
  } catch (e) {
    onProgress({ step: 'job', status: 'error', error: errMessage(e) })
    throw e
  }
  onProgress({ step: 'job', status: 'done' })

  const sourceUrl = input.url ?? null
  const applicationId = await client.createApplication(job, sourceUrl)
  await client.linkDocument(applicationId, documentId)

  const result: ApplyKitResult = { applicationId, job, analysis: null, coverLetter: null }

  if (options.analysis) {
    onProgress({ step: 'analysis', status: 'loading' })
    try {
      result.analysis = await client.analyzeResume(applicationId, documentId)
      onProgress({ step: 'analysis', status: 'done' })
    } catch (e) {
      onProgress({ step: 'analysis', status: 'error', error: errMessage(e) })
    }
  }

  if (options.coverLetter) {
    onProgress({ step: 'coverLetter', status: 'loading' })
    try {
      result.coverLetter = await client.generateCoverLetter(applicationId)
      onProgress({ step: 'coverLetter', status: 'done' })
    } catch (e) {
      onProgress({ step: 'coverLetter', status: 'error', error: errMessage(e) })
    }
  }

  return result
}

/**
 * Default browser/fetch-backed client. Uses the Supabase browser client for
 * application creation + document linking (RLS scopes to the user), and the
 * existing feature API routes for parse, analysis, and cover-letter generation,
 * so results persist exactly as if each feature was used individually.
 */
export function createApplyKitClient(): ApplyKitClient {
  const supabase = createClient()

  async function postJson(path: string, body: unknown): Promise<Response> {
    return fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  return {
    async parseJob(input) {
      const res = await postJson('/api/apply-kit/parse', input)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to parse job posting.')
      return json as ParsedJob
    },

    async createApplication(job, sourceUrl) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in.')
      const { data, error } = await supabase
        .from('applications')
        .insert({
          user_id: user.id,
          title: job.title,
          company: job.company,
          job_description: job.job_description,
          url: sourceUrl,
          status: 'draft',
        })
        .select('id')
        .single()
      if (error || !data) throw new Error(error?.message || 'Failed to create application.')
      return data.id as string
    },

    async linkDocument(applicationId, documentId) {
      const { error } = await supabase
        .from('application_documents')
        .insert({ application_id: applicationId, document_id: documentId })
      // 23505 = unique_violation: the resume is already linked to this app (retry). Ignore it.
      if (error && error.code !== '23505') {
        throw new Error(error.message)
      }
    },

    async analyzeResume(applicationId, documentId) {
      // Same route the Analysis tab uses: persists to document_analyses and updates
      // applications.last_analyzed_document_id, so the result shows up on the tab.
      const res = await postJson('/api/applications/analyze', { applicationId, documentId })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to analyze resume.')
      return json.analysis as ResumeAnalysisResult
    },

    async generateCoverLetter(applicationId) {
      const res = await postJson('/api/cover-letter/generate', { applicationId })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to generate cover letter.')
      return typeof json.coverLetter === 'string' ? json.coverLetter : null
    },
  }
}
