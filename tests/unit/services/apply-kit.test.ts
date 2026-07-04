import { describe, expect, it, vi } from 'vitest'
import { runApplyKit, type ApplyKitClient, type StepEvent } from '@/modules/applications/services/apply-kit'

const ANALYSIS = {
  score: 80,
  matchingKeywords: ['ts'],
  missingKeywords: ['k'],
  strengths: ['s'],
  weaknesses: ['w'],
  recommendations: ['r'],
}

function makeClient(overrides: Partial<ApplyKitClient> = {}): ApplyKitClient {
  return {
    parseJob: vi.fn(async () => ({ title: 'BE Eng', company: 'Vercel', job_description: 'desc' })),
    createApplication: vi.fn(async () => 'app-1'),
    linkDocument: vi.fn(async () => {}),
    analyzeResume: vi.fn(async () => ANALYSIS),
    generateCoverLetter: vi.fn(async () => 'Dear hiring manager...'),
    ...overrides,
  }
}

const ALL = { analysis: true, coverLetter: true }

describe('runApplyKit', () => {
  it('runs all selected steps and returns a full result', async () => {
    const events: StepEvent[] = []
    const client = makeClient()
    const result = await runApplyKit(
      { text: 'pasted jd' },
      'doc-1',
      ALL,
      client,
      (e) => events.push(e)
    )

    expect(result.applicationId).toBe('app-1')
    expect(result.job.title).toBe('BE Eng')
    expect(result.analysis?.score).toBe(80)
    expect(result.coverLetter).toContain('Dear hiring manager')

    expect(client.linkDocument).toHaveBeenCalledWith('app-1', 'doc-1')
    expect(client.analyzeResume).toHaveBeenCalledWith('app-1', 'doc-1')
    expect(client.generateCoverLetter).toHaveBeenCalledWith('app-1')

    expect(events).toEqual([
      { step: 'job', status: 'loading' },
      { step: 'job', status: 'done' },
      { step: 'analysis', status: 'loading' },
      { step: 'analysis', status: 'done' },
      { step: 'coverLetter', status: 'loading' },
      { step: 'coverLetter', status: 'done' },
    ])
  })

  it('skips unselected steps entirely', async () => {
    const events: StepEvent[] = []
    const client = makeClient()
    const result = await runApplyKit(
      { text: 'jd' },
      'doc-1',
      { analysis: false, coverLetter: false },
      client,
      (e) => events.push(e)
    )

    expect(result.applicationId).toBe('app-1')
    expect(result.analysis).toBeNull()
    expect(result.coverLetter).toBeNull()
    expect(client.analyzeResume).not.toHaveBeenCalled()
    expect(client.generateCoverLetter).not.toHaveBeenCalled()
    expect(events).toEqual([
      { step: 'job', status: 'loading' },
      { step: 'job', status: 'done' },
    ])
  })

  it('runs only the cover letter when analysis is unselected', async () => {
    const client = makeClient()
    const result = await runApplyKit(
      { text: 'jd' },
      'doc-1',
      { analysis: false, coverLetter: true },
      client,
      () => {}
    )

    expect(result.analysis).toBeNull()
    expect(result.coverLetter).toContain('Dear hiring manager')
    expect(client.analyzeResume).not.toHaveBeenCalled()
  })

  it('throws and creates nothing when parse fails', async () => {
    const client = makeClient({ parseJob: vi.fn(async () => { throw new Error('bad parse') }) })
    await expect(runApplyKit({ url: 'https://x.com' }, 'doc-1', ALL, client, () => {})).rejects.toThrow('bad parse')
    expect(client.createApplication).not.toHaveBeenCalled()
  })

  it('keeps the application and analysis when cover letter fails', async () => {
    const client = makeClient({ generateCoverLetter: vi.fn(async () => { throw new Error('cl down') }) })
    const events: StepEvent[] = []
    const result = await runApplyKit({ text: 'jd' }, 'doc-1', ALL, client, (e) => events.push(e))

    expect(result.applicationId).toBe('app-1')
    expect(result.analysis?.score).toBe(80)
    expect(result.coverLetter).toBeNull()
    expect(events).toContainEqual({ step: 'coverLetter', status: 'error', error: 'cl down' })
  })
})
