import { describe, expect, it } from 'vitest'
import { AppError } from '../src/errors.js'
import { assertTransition } from '../src/status.js'

describe('assertTransition — разрешённые', () => {
  const ok: [string, string][] = [
    ['ingested', 'processing'],
    ['processing', 'pending'],
    ['processing', 'failed'],
    ['processing', 'rejected'],
    ['pending', 'ready_to_publish'],
    ['pending', 'rejected'],
    ['ready_to_publish', 'pending'],
    ['ready_to_publish', 'published'],
    ['ready_to_publish', 'rejected'],
  ]
  for (const [from, to] of ok) {
    it(`${from} -> ${to}`, () => {
      expect(() => assertTransition(from, to)).not.toThrow()
    })
  }
})

describe('assertTransition — запрещённые', () => {
  it('бросает AppError(409, "invalid_transition")', () => {
    try {
      assertTransition('ingested', 'published')
      throw new Error('должно было бросить')
    } catch (e) {
      expect(e).toBeInstanceOf(AppError)
      expect((e as AppError).status).toBe(409)
      expect((e as AppError).message).toBe('invalid_transition')
    }
  })
  it('published — терминальный', () => {
    expect(() => assertTransition('published', 'pending')).toThrow()
  })
  it('rejected — терминальный', () => {
    expect(() => assertTransition('rejected', 'pending')).toThrow()
  })
  it('неизвестный статус -> запрещено', () => {
    expect(() => assertTransition('zzz', 'pending')).toThrow()
  })
})
