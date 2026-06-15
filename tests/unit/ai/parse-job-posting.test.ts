import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockGenerateContent = vi.fn()

vi.mock('@/shared/infrastructure/ai/client', () => ({
  isGeminiConfigured: () => true,
  getGenerativeModel: vi.fn(() => ({ generateContent: mockGenerateContent })),
}))

vi.mock('@/shared/infrastructure/ai/model-manager', () => {
  class AIRateLimitError extends Error {
    constructor(public nextAvailableTime: number, public queued: boolean, message: string) {
      super(message)
      this.name = 'AIRateLimitError'
    }
  }
  return {
    default: {
      getAvailableModel: vi.fn(() => 'gemini-2.0-flash'),
      getNextAvailableTime: vi.fn(() => Date.now() + 60_000),
      markModelRateLimited: vi.fn(),
    },
    AIRateLimitError,
  }
})

vi.mock('@/shared/infrastructure/ai/queue-manager', () => ({
  queueManager: { enqueue: vi.fn() },
}))

vi.mock('@/shared/infrastructure/ai/telemetry', () => ({
  classifyError: vi.fn(() => ({ category: 'unknown', status: 500, message: 'err' })),
  logAICall: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

import { parseJobPosting } from '@/shared/infrastructure/ai'

function mockGeminiResponse(text: string) {
  mockGenerateContent.mockResolvedValueOnce({ response: { text: () => text } })
}

describe('parseJobPosting', () => {
  it('parses JSON wrapped in markdown code fences', async () => {
    mockGeminiResponse(
      '```json\n{"title":"Senior Backend Engineer","company":"Vercel","job_description":"Build serverless infra."}\n```'
    )
    const job = await parseJobPosting('some scraped posting text')
    expect(job.title).toBe('Senior Backend Engineer')
    expect(job.company).toBe('Vercel')
    expect(job.job_description).toContain('serverless')
  })

  it('falls back to a placeholder title when missing', async () => {
    mockGeminiResponse('{"title":"","company":null,"job_description":"Some role."}')
    const job = await parseJobPosting('text')
    expect(job.title).toBe('Untitled Application')
    expect(job.company).toBeNull()
    expect(job.job_description).toBe('Some role.')
  })

  it('keeps the original text as job_description when AI returns none', async () => {
    mockGeminiResponse('{"title":"Analyst","company":"Acme"}')
    const job = await parseJobPosting('the raw posting body')
    expect(job.job_description).toBe('the raw posting body')
  })

  it('throws a user-facing error when the response is not valid JSON', async () => {
    mockGeminiResponse('not json at all')
    await expect(parseJobPosting('text')).rejects.toThrow(/failed to parse job posting/i)
  })

  it('throws a user-facing error when Gemini fails', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('gemini exploded'))
    await expect(parseJobPosting('text')).rejects.toThrow(/failed to parse job posting/i)
  })
})
