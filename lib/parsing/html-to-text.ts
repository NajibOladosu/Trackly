/**
 * Strip an HTML document down to readable text.
 * Removes script/style/comments, converts block tags to newlines,
 * decodes common entities, and collapses whitespace.
 */
export function htmlToText(html: string): string {
  try {
    const replaceUntilStable = (input: string, pattern: RegExp, replacement: string): string => {
      let previous: string
      let current = input
      do {
        previous = current
        current = current.replace(pattern, replacement)
      } while (current !== previous)
      return current
    }

    let text = replaceUntilStable(html, /<script\b[^<]*(?:(?!<\/script(?:\s[^>]*)?>)<[^<]*)*<\/script(?:\s[^>]*)?>/gi, '')
    text = replaceUntilStable(text, /<style\b[^<]*(?:(?!<\/style(?:\s[^>]*)?>)<[^<]*)*<\/style(?:\s[^>]*)?>/gi, '')
    text = replaceUntilStable(text, /<!--[\s\S]*?--!?>/g, '')
    text = text.replace(/<\/(div|p|h[1-6]|li|tr|section|article|header|footer|form|fieldset|label)>/gi, '\n')
    text = text.replace(/<(br|hr)\s*\/?>/gi, '\n')
    text = text.replace(/<[^>]+>/g, ' ')
    text = text.replace(/&nbsp;/g, ' ')
    text = text.replace(/&lt;/g, '<')
    text = text.replace(/&gt;/g, '>')
    text = text.replace(/&quot;/g, '"')
    text = text.replace(/&#39;/g, "'")
    text = text.replace(/&apos;/g, "'")
    text = text.replace(/&amp;/g, '&')
    text = text.replace(/[ \t]+/g, ' ')
    text = text.replace(/\n\s+/g, '\n')
    text = text.replace(/\s+\n/g, '\n')
    text = text.replace(/\n{3,}/g, '\n\n')
    text = text.trim()
    return text
  } catch (error) {
    console.error('Error extracting text from HTML:', error)
    return html
  }
}
