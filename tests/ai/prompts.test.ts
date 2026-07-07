import { describe, expect, it } from 'vitest'
import {
  buildClassifyMessages,
  buildRewriteMessages,
  parseRewriteOutput,
} from '../../src/ai/providers/prompts.js'

describe('buildClassifyMessages', () => {
  it('включает список бакетов и текст', () => {
    const msgs = buildClassifyMessages('текст новости', ['a', 'b'])
    const joined = JSON.stringify(msgs)
    expect(joined).toContain('a')
    expect(joined).toContain('b')
    expect(joined).toContain('текст новости')
    expect(msgs[msgs.length - 1].role).toBe('user')
  })
})

describe('buildRewriteMessages', () => {
  const base = {
    origTitle: 'T',
    origText: 'B',
    sourceLang: 'ru',
    bucket: 'рф-внутр',
    isSvo: false,
    promptTemplate: null,
  }

  it('для en добавляет инструкцию перевода', () => {
    const msgs = buildRewriteMessages({ ...base, sourceLang: 'en' })
    expect(JSON.stringify(msgs).toLowerCase()).toContain('перев')
  })
  it('для ru не требует перевода', () => {
    const msgs = buildRewriteMessages(base)
    expect(JSON.stringify(msgs).toLowerCase()).not.toContain('переведи')
  })
  it('для сво добавляет минимальную инструкцию (офиц. сводка)', () => {
    const msgs = buildRewriteMessages({ ...base, bucket: 'сво', isSvo: true })
    expect(JSON.stringify(msgs).toLowerCase()).toContain('офиц')
  })
  it('подмешивает per-bucket promptTemplate', () => {
    const msgs = buildRewriteMessages({ ...base, promptTemplate: 'ГОЛОС-КАНАЛА-XYZ' })
    expect(JSON.stringify(msgs)).toContain('ГОЛОС-КАНАЛА-XYZ')
  })
})

describe('parseRewriteOutput', () => {
  it('парсит чистый JSON', () => {
    expect(parseRewriteOutput('{"title":"Заг","text":"Тело"}')).toEqual({ title: 'Заг', text: 'Тело' })
  })
  it('парсит JSON в code fences', () => {
    const raw = '```json\n{"title":"Z","text":"B"}\n```'
    expect(parseRewriteOutput(raw)).toEqual({ title: 'Z', text: 'B' })
  })
  it('битый ответ -> ошибка', () => {
    expect(() => parseRewriteOutput('не json')).toThrow()
  })
  it('нет полей title/text -> ошибка', () => {
    expect(() => parseRewriteOutput('{"foo":1}')).toThrow()
  })
})
