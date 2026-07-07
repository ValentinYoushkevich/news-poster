import { describe, expect, it } from 'vitest'
import { enqueue } from '../../src/ai/queue.js'

describe('enqueue — последовательная очередь', () => {
  it('выполняет задачи строго по одной, в порядке постановки', async () => {
    const order: number[] = []
    const running: number[] = []
    const task = (n: number) => async () => {
      running.push(n)
      expect(running.length).toBe(1) // никогда не пересекаются
      await new Promise((r) => setTimeout(r, 5))
      order.push(n)
      running.pop()
    }
    enqueue(task(1))
    enqueue(task(2))
    await enqueue(task(3))
    expect(order).toEqual([1, 2, 3])
  })

  it('ошибка задачи не рушит очередь', async () => {
    const done: number[] = []
    enqueue(async () => {
      throw new Error('boom')
    })
    await enqueue(async () => {
      done.push(2)
    })
    expect(done).toEqual([2])
  })
})
