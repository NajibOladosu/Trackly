import { describe, expect, it, vi } from 'vitest'
import { runApplyKit, type ApplyKitClient, type StepEvent } from '@/modules/applications/services/apply-kit'

function makeClient(overrides: Partial<ApplyKitClient> = {}): ApplyKitClient {
  return {
    parseJob: vi.fn(async () => ({ title: 'BE Eng', company: 'Vercel', job_description: 'desc' })),
    createApplication: vi.fn(async () => 'app-1'),
    linkDocument: vi.fn(async () => {}),
    scoreFit: vi.fn(async () => ({ score: 80, tips: ['t'], missingKeywords: ['k'], summary: 's' })),
    generateCoverLetter: vi.fn(async () => 'Dear hiring manager...'),
    ...overrides,
  }
}

describe('runApplyKit', () => {
  it('runs all steps and returns a full result', async () => {
    const events: StepEvent[] = []
    const client = makeClient()
    const result = await runApplyKit(
      { text: 'pasted jd' },
      'doc-1',
      client,
      (e) => events.push(e)
    )

    expect(result.applicationId).toBe('app-1')
    expect(result.job.title).toBe('BE Eng')
    expect(result.fit?.score).toBe(80)
    expect(result.coverLetter).toContain('Dear hiring manager')

    expect(client.linkDocument).toHaveBeenCalledWith('app-1', 'doc-1')
    expect(client.scoreFit).toHaveBeenCalledWith('desc', 'doc-1')
    expect(client.generateCoverLetter).toHaveBeenCalledWith('app-1')

    expect(events).toEqual([
      { step: 'job', status: 'loading' },
      { step: 'job', status: 'done' },
      { step: 'fit', status: 'loading' },
      { step: 'fit', status: 'done' },
      { step: 'coverLetter', status: 'loading' },
      { step: 'coverLetter', status: 'done' },
    ])
  })

  it('throws and creates nothing when parse fails', async () => {
    const client = makeClient({ parseJob: vi.fn(async () => { throw new Error('bad parse') }) })
    await expect(runApplyKit({ url: 'https://x.com' }, 'doc-1', client, () => {})).rejects.toThrow('bad parse')
    expect(client.createApplication).not.toHaveBeenCalled()
  })

  it('keeps the application and fit when cover letter fails', async () => {
    const client = makeClient({ generateCoverLetter: vi.fn(async () => { throw new Error('cl down') }) })
    const events: StepEvent[] = []
    const result = await runApplyKit({ text: 'jd' }, 'doc-1', client, (e) => events.push(e))

    expect(result.applicationId).toBe('app-1')
    expect(result.fit?.score).toBe(80)
    expect(result.coverLetter).toBeNull()
    expect(events).toContainEqual({ step: 'coverLetter', status: 'error', error: 'cl down' })
  })
})
