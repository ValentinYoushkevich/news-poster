import { describe, expect, it } from 'vitest'
import { findDuplicateId } from '../../src/ai/dedup.js'

describe('findDuplicateId', () => {
  const target = [1, 0, 0]

  it('возвращает id первого кандидата выше порога', () => {
    const dup = findDuplicateId(
      target,
      [
        { id: 10n, embedding: [0, 1, 0] }, // косинус 0
        { id: 20n, embedding: [0.99, 0.01, 0] }, // близко к 1
      ],
      0.85,
    )
    expect(dup).toBe(20n)
  })

  it('null, если все ниже порога', () => {
    const dup = findDuplicateId(target, [{ id: 10n, embedding: [0, 1, 0] }], 0.85)
    expect(dup).toBeNull()
  })

  it('пропускает кандидатов с некорректным вектором', () => {
    const dup = findDuplicateId(
      target,
      [{ id: 10n, embedding: [1, 0] }], // другая длина -> пропуск, не падаем
      0.85,
    )
    expect(dup).toBeNull()
  })

  it('пустой список -> null', () => {
    expect(findDuplicateId(target, [], 0.85)).toBeNull()
  })
})
