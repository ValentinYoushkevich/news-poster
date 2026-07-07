const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
}

export function stripHtml(input: string | undefined | null): string {
  if (!input) return ''
  const noTags = input.replace(/<[^>]*>/g, ' ')
  const decoded = noTags.replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m] ?? m)
  return decoded.replace(/\s+/g, ' ').trim()
}

const TAIL_PATTERNS = [
  /\s*Continue reading[.…]*.*$/is,
  /\s*Читать далее[.…]*.*$/is,
  /\s*Read more[.…]*.*$/is,
]

export function cutReadMoreTail(input: string): string {
  let out = input
  for (const re of TAIL_PATTERNS) out = out.replace(re, '')
  return out.trim()
}

export function extractFirstImgSrc(html: string | undefined | null): string | null {
  if (!html) return null
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  return m ? m[1] : null
}
