import { describe, expect, it } from 'vitest'
import {
  composeStarAnswer,
  starCompleteness,
  isStarComplete,
  type StarParts,
} from '@/modules/interviews/lib/star'

const full: StarParts = {
  situation: 'Our team missed sprint goals two cycles running.',
  task: 'I owned turning around delivery predictability.',
  action: 'I introduced story-point estimation and a mid-sprint check-in.',
  result: 'Predictability rose to 95% over the next quarter.',
}

describe('composeStarAnswer', () => {
  it('joins filled sections into paragraphs', () => {
    const out = composeStarAnswer(full)
    expect(out).toContain('missed sprint goals')
    expect(out).toContain('95%')
    expect(out.split('\n\n')).toHaveLength(4)
  })

  it('skips empty and whitespace-only sections', () => {
    const out = composeStarAnswer({ ...full, task: '', action: '   ' })
    expect(out.split('\n\n')).toHaveLength(2)
  })

  it('returns an empty string when nothing is filled', () => {
    expect(composeStarAnswer({ situation: '', task: '', action: '', result: '' })).toBe('')
  })
})

describe('starCompleteness', () => {
  it('reports the fraction of filled sections', () => {
    expect(starCompleteness(full)).toBe(1)
    expect(starCompleteness({ ...full, result: '' })).toBe(0.75)
    expect(starCompleteness({ situation: 'x', task: '', action: '', result: '' })).toBe(0.25)
    expect(starCompleteness({ situation: '', task: '', action: '', result: '' })).toBe(0)
  })
})

describe('isStarComplete', () => {
  it('is true only when all four sections are filled', () => {
    expect(isStarComplete(full)).toBe(true)
    expect(isStarComplete({ ...full, action: '' })).toBe(false)
  })
})
