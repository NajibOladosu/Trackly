import { describe, expect, it } from 'vitest'
import { fillTemplate, OUTREACH_TEMPLATES } from '@/modules/resources/lib/outreach'

describe('fillTemplate', () => {
  it('replaces tokens with provided values', () => {
    const out = fillTemplate('Hi {{contact}}, re {{role}} at {{company}}', {
      contact: 'Jordan',
      role: 'SWE',
      company: 'Acme',
    })
    expect(out).toBe('Hi Jordan, re SWE at Acme')
  })

  it('trims values', () => {
    expect(fillTemplate('{{role}}', { role: '  Engineer  ' })).toBe('Engineer')
  })

  it('falls back to a visible [token] for missing or empty values', () => {
    expect(fillTemplate('Hi {{contact}} at {{company}}', { contact: '' })).toBe('Hi [contact] at [company]')
  })

  it('leaves non-token text untouched', () => {
    expect(fillTemplate('no tokens here', {})).toBe('no tokens here')
  })
})

describe('OUTREACH_TEMPLATES', () => {
  it('has unique ids and every template fills without leftover tokens when all vars provided', () => {
    const ids = OUTREACH_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)

    const vars = { contact: 'J', company: 'C', role: 'R', highlight: 'H', yourName: 'Y' }
    for (const t of OUTREACH_TEMPLATES) {
      const filled = fillTemplate(t.subject + '\n' + t.body, vars)
      expect(filled).not.toMatch(/\{\{|\}\}/)
    }
  })
})
