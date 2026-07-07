import { describe, expect, it } from 'vitest'
import { pickBucket } from '../../src/ai/bucket.js'

const buckets = ['рф-внутр', 'сво', 'мир-с-рф', 'мир-без-рф']

describe('pickBucket', () => {
  it('точное совпадение', () => {
    expect(pickBucket('сво', buckets)).toBe('сво')
  })
  it('игнорирует кавычки/пробелы/точку/регистр', () => {
    expect(pickBucket('  "РФ-Внутр". ', buckets)).toBe('рф-внутр')
  })
  it('находит бакет внутри болтливого ответа', () => {
    expect(pickBucket('Это относится к бакету мир-без-рф однозначно', buckets)).toBe('мир-без-рф')
  })
  it('неизвестный -> null', () => {
    expect(pickBucket('спорт', buckets)).toBeNull()
  })
})
