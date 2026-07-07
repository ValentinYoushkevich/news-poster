import { describe, expect, it } from 'vitest'
import { normalizeItem } from '../../src/normalize/normalizeItem.js'

const base = {
  channelId: '1',
  source: 'rbc',
  sourceLang: 'ru',
  title: 'Заголовок',
  link: 'https://rbc.ru/a',
  isoDate: '2026-07-07T10:00:00.000Z',
}

describe('normalizeItem', () => {
  it('author = creator || author || dc:creator || null', () => {
    expect(normalizeItem({ ...base, creator: 'Иван' }).author).toBe('Иван')
    expect(normalizeItem({ ...base, author: 'Пётр' }).author).toBe('Пётр')
    expect(normalizeItem({ ...base, 'dc:creator': 'Сидор' }).author).toBe('Сидор')
    expect(normalizeItem({ ...base }).author).toBeNull()
  })

  it('categories: строки RBC как есть', () => {
    expect(normalizeItem({ ...base, categories: ['Политика', 'Экономика'] }).categories).toEqual([
      'Политика',
      'Экономика',
    ])
  })

  it('categories: Guardian — берём cat._ из объектов', () => {
    const item = { ...base, categories: [{ _: 'World' }, { _: 'UK' }] }
    expect(normalizeItem(item).categories).toEqual(['World', 'UK'])
  })

  it('categories: отсутствуют -> пустой массив (BBC)', () => {
    expect(normalizeItem({ ...base }).categories).toEqual([])
  })

  it('origText: снят HTML и хвост', () => {
    const item = { ...base, contentSnippet: '<p>Тело новости.</p> Continue reading...' }
    expect(normalizeItem(item).origText).toBe('Тело новости.')
  })

  it('pubDate из isoDate как Date', () => {
    const r = normalizeItem({ ...base })
    expect(r.pubDate).toBeInstanceOf(Date)
    expect(r.pubDate.toISOString()).toBe('2026-07-07T10:00:00.000Z')
  })

  it('images: enclosure.url -> один кандидат (length игнорируем)', () => {
    const item = {
      ...base,
      enclosure: { url: 'https://img/a.jpg', length: '0', type: 'image/jpeg' },
    }
    expect(normalizeItem(item).images).toEqual([
      { url: 'https://img/a.jpg', type: 'image/jpeg', origin: 'enclosure', fileId: null, chosen: true },
    ])
  })

  it('images: без enclosure -> первый <img> из content', () => {
    const item = { ...base, content: '<p>x</p><img src="https://img/b.jpg">' }
    expect(normalizeItem(item).images).toEqual([
      { url: 'https://img/b.jpg', type: null, origin: 'content', fileId: null, chosen: true },
    ])
  })

  it('images: ничего -> пустой массив (text-only)', () => {
    expect(normalizeItem({ ...base }).images).toEqual([])
  })

  it('channelId приводится к BigInt', () => {
    expect(normalizeItem({ ...base }).channelId).toBe(1n)
  })
})
