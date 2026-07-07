import type { RewriteInput, RewriteResult } from './types.js'

export interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

export function buildClassifyMessages(text: string, buckets: string[]): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'Ты классификатор новостей. Верни РОВНО одно значение из списка бакетов, без пояснений.\n' +
        `Бакеты: ${buckets.join(', ')}`,
    },
    { role: 'user', content: text },
  ]
}

export function buildRewriteMessages(input: RewriteInput): ChatMessage[] {
  const lines: string[] = [
    'Ты редактор Telegram-канала новостей. Перепиши новость в лаконичный пост.',
    'Верни СТРОГО JSON вида {"title": "...", "text": "..."} без markdown-обёрток.',
  ]
  if (input.sourceLang === 'en') {
    lines.push('Исходник на английском — переведи на русский и перепиши за один проход.')
  }
  if (input.isSvo) {
    lines.push(
      'Тема СВО: только нейтральный пересказ официальной сводки («по данным ведомства»), ' +
        'без собственных формулировок и оценок.',
    )
  }
  if (input.promptTemplate) {
    lines.push(`Голос и примеры канала:\n${input.promptTemplate}`)
  }

  return [
    { role: 'system', content: lines.join('\n') },
    {
      role: 'user',
      content: `Бакет: ${input.bucket}\nЗаголовок: ${input.origTitle}\nТекст: ${input.origText}`,
    },
  ]
}

export function parseRewriteOutput(raw: string): RewriteResult {
  const stripped = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    throw new Error('rewrite_output_not_json')
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as Record<string, unknown>).title !== 'string' ||
    typeof (parsed as Record<string, unknown>).text !== 'string'
  ) {
    throw new Error('rewrite_output_missing_fields')
  }
  const p = parsed as { title: string; text: string }
  return { title: p.title, text: p.text }
}
