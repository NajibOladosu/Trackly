import { describe, expect, it } from 'vitest'
import { htmlToText } from '@/lib/parsing/html-to-text'

describe('htmlToText', () => {
  it('strips script and style tag content', () => {
    const html = '<div>Keep<script>var x=1;</script><style>.a{}</style> Me</div>'
    const out = htmlToText(html)
    expect(out).toContain('Keep')
    expect(out).toContain('Me')
    expect(out).not.toContain('var x=1')
    expect(out).not.toContain('.a{')
  })

  it('decodes common HTML entities', () => {
    expect(htmlToText('<p>R&amp;D &lt;ok&gt;</p>')).toContain('R&D <ok>')
  })

  it('collapses whitespace and caps consecutive newlines', () => {
    const out = htmlToText('<p>a</p><p>b</p><p>c</p>')
    expect(out).not.toMatch(/\n{3,}/)
    expect(out.split('\n').filter(Boolean)).toEqual(['a', 'b', 'c'])
  })

  it('returns input on unparseable content without throwing', () => {
    expect(() => htmlToText('plain text no tags')).not.toThrow()
    expect(htmlToText('plain text no tags')).toContain('plain text no tags')
  })
})
