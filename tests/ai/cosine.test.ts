import { describe, expect, it } from 'vitest'
import { cosineSimilarity } from '../../src/ai/cosine.js'

describe('cosineSimilarity', () => {
  it('идентичные векторы -> 1', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6)
  })
  it('ортогональные -> 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6)
  })
  it('противоположные -> -1', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 6)
  })
  it('нулевой вектор -> 0 (без деления на ноль)', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0)
  })
  it('разная длина -> ошибка', () => {
    expect(() => cosineSimilarity([1, 2], [1])).toThrow()
  })
})
