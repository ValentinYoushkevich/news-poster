import { describe, expect, it } from 'vitest'
import { buildCaption, escapeHtml } from '../../src/telegram/html.js'

describe('escapeHtml', () => {
  it('экранирует & < > (амперсанд первым)', () => {
    expect(escapeHtml('a & b <c> "d"')).toBe('a &amp; b &lt;c&gt; "d"')
  })
  it('пустая строка -> пустая', () => {
    expect(escapeHtml('')).toBe('')
  })
})

describe('buildCaption', () => {
  it('оборачивает экранированный заголовок в <b> и добавляет тело через пустую строку', () => {
    expect(buildCaption('Заголовок', 'Тело')).toBe('<b>Заголовок</b>\n\nТело')
  })
  it('экранирует спецсимволы и в заголовке, и в теле', () => {
    expect(buildCaption('A & B', 'x < y')).toBe('<b>A &amp; B</b>\n\nx &lt; y')
  })
  it('пустой заголовок -> без <b>', () => {
    expect(buildCaption('', 'только тело')).toBe('только тело')
  })
  it('пустое тело -> только заголовок', () => {
    expect(buildCaption('Только заголовок', '')).toBe('<b>Только заголовок</b>')
  })
  it('держит лимит 1024 символа', () => {
    const cap = buildCaption('T', 'я'.repeat(5000))
    expect(cap.length).toBeLessThanOrEqual(1024)
    expect(cap.endsWith('…')).toBe(true)
  })
  it('не рвёт HTML-сущность при обрезке', () => {
    const cap = buildCaption('', '&'.repeat(5000))
    expect(cap.length).toBeLessThanOrEqual(1024)
    // каждая & превратилась в &amp;; обрезка по сырому тексту не оставит "&amp" без ";"
    expect(cap.replace(/…$/, '').endsWith('&amp;') || cap === '…').toBe(true)
  })
})
