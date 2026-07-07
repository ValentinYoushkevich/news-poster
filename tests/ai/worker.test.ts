import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { processPost } from '../../src/ai/worker.js'
import type { RewriteInput, WorkerDeps } from '../../src/ai/providers/types.js'
import { prisma } from '../../src/db/client.js'
import { makeChannel, resetDb } from '../helpers/db.js'

beforeEach(resetDb)
afterAll(() => prisma.$disconnect())

function fakeDeps(over: Partial<{ vector: number[]; bucket: string; capture: (i: RewriteInput) => void }> = {}): WorkerDeps {
  return {
    embedding: { embed: async () => over.vector ?? [1, 0, 0] },
    llm: {
      classify: async () => over.bucket ?? 'рф-внутр',
      rewrite: async (input) => {
        over.capture?.(input)
        return { title: 'РТ', text: 'РТело' }
      },
    },
  }
}

async function makePost(channelId: bigint, over: Record<string, unknown> = {}) {
  return prisma.post.create({
    data: {
      channelId,
      source: 'rbc',
      sourceLang: 'ru',
      link: `https://a/${Math.random()}`,
      origTitle: 'T',
      origText: 'B',
      categories: [],
      pubDate: new Date('2026-07-07T10:00:00Z'),
      images: [],
      status: 'ingested',
      ...over,
    },
  })
}

describe('processPost — happy path', () => {
  it('доводит до pending, пишет embedding/bucket/rewritten/final', async () => {
    const ch = await makeChannel()
    const post = await makePost(ch.id)
    await processPost(post.id, fakeDeps({ vector: [1, 0, 0], bucket: 'сво' }))
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.status).toBe('pending')
    expect(updated.bucket).toBe('сво')
    expect(updated.rewrittenTitle).toBe('РТ')
    expect(updated.finalText).toBe('РТело')
    expect(Array.isArray(updated.embedding)).toBe(true)
  })

  it('сво прокидывает isSvo=true в рерайт', async () => {
    const ch = await makeChannel()
    const post = await makePost(ch.id)
    let captured: RewriteInput | null = null
    await processPost(post.id, fakeDeps({ bucket: 'сво', capture: (i) => (captured = i) }))
    expect(captured!.isSvo).toBe(true)
  })
})

describe('processPost — дедуп', () => {
  it('дубль того же канала -> rejected', async () => {
    const ch = await makeChannel()
    // существующий пост с тем же вектором
    await makePost(ch.id, { status: 'pending', embedding: [1, 0, 0] })
    const post = await makePost(ch.id)
    await processPost(post.id, fakeDeps({ vector: [1, 0, 0] }))
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.status).toBe('rejected')
    expect(updated.rejectReason).toContain('semantic_duplicate')
  })

  it('похожий пост из ДРУГОГО канала не считается дублем', async () => {
    const ch1 = await makeChannel()
    const ch2 = await makeChannel()
    await makePost(ch1.id, { status: 'pending', embedding: [1, 0, 0] })
    const post = await makePost(ch2.id)
    await processPost(post.id, fakeDeps({ vector: [1, 0, 0] }))
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.status).toBe('pending')
  })
})

describe('processPost — ошибка', () => {
  it('падение провайдера -> failed + aiError', async () => {
    const ch = await makeChannel()
    const post = await makePost(ch.id)
    const deps: WorkerDeps = {
      embedding: { embed: async () => { throw new Error('ollama down') } },
      llm: { classify: async () => 'x', rewrite: async () => ({ title: '', text: '' }) },
    }
    await processPost(post.id, deps)
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.status).toBe('failed')
    expect(updated.aiError).toContain('ollama down')
  })

  it('классификатор вернул неизвестный бакет -> failed', async () => {
    const ch = await makeChannel()
    const post = await makePost(ch.id)
    await processPost(post.id, fakeDeps({ bucket: 'спорт' }))
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.status).toBe('failed')
  })
})
