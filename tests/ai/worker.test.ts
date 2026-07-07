import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { classifyPost, processPost, reRewritePost } from '../../src/ai/worker.js'
import type { RewriteInput, WorkerDeps } from '../../src/ai/providers/types.js'
import { prisma } from '../../src/db/client.js'
import { makeChannel, resetDb } from '../helpers/db.js'

beforeEach(resetDb)
afterAll(() => prisma.$disconnect())

function fakeDeps(
  over: Partial<{
    vector: number[]
    bucket: string
    capture: (i: RewriteInput) => void
    onClassify: () => void
  }> = {},
): WorkerDeps {
  return {
    embedding: { embed: async () => over.vector ?? [1, 0, 0] },
    llm: {
      classify: async () => {
        over.onClassify?.()
        return over.bucket ?? 'рф-внутр'
      },
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

describe('processPost — happy path (только дедуп)', () => {
  it('недубль -> pending с embedding, но БЕЗ бакета и рерайт-полей', async () => {
    const ch = await makeChannel()
    const post = await makePost(ch.id)
    await processPost(post.id, fakeDeps({ vector: [1, 0, 0] }))
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.status).toBe('pending')
    expect(Array.isArray(updated.embedding)).toBe(true)
    // классификация и рерайт теперь запускаются только по запросу человека
    expect(updated.bucket).toBeNull()
    expect(updated.rewrittenTitle).toBeNull()
    expect(updated.rewrittenText).toBeNull()
    expect(updated.finalTitle).toBeNull()
    expect(updated.finalText).toBeNull()
  })

  it('не вызывает LLM (classify/rewrite)', async () => {
    const ch = await makeChannel()
    const post = await makePost(ch.id)
    let classified = false
    let rewritten = false
    await processPost(
      post.id,
      fakeDeps({ onClassify: () => (classified = true), capture: () => (rewritten = true) }),
    )
    expect(classified).toBe(false)
    expect(rewritten).toBe(false)
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
  it('падение провайдера эмбеддингов -> failed + aiError', async () => {
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
})

describe('processPost — гонки со сменой статуса', () => {
  it('оператор reject-нул карточку во время эмбеддинга — воркер не перетирает статус', async () => {
    const ch = await makeChannel()
    const post = await makePost(ch.id)
    const deps: WorkerDeps = {
      embedding: {
        embed: async () => {
          // конкурентный soft-delete, пока воркер ждал провайдера
          await prisma.post.update({
            where: { id: post.id },
            data: { status: 'rejected', rejectReason: 'оператор' },
          })
          return [1, 0, 0]
        },
      },
      llm: { classify: async () => 'рф-внутр', rewrite: async () => ({ title: 'РТ', text: 'РТело' }) },
    }
    await processPost(post.id, deps)
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    // финальный переход processing->pending не прошёл: статус цел
    expect(updated.status).toBe('rejected')
    expect(updated.rejectReason).toBe('оператор')
  })

  it('статус сменился между чтением и стартом — воркер выходит, ничего не трогая', async () => {
    const ch = await makeChannel()
    const post = await makePost(ch.id, { status: 'rejected', rejectReason: 'до старта' })
    await processPost(post.id, fakeDeps())
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.status).toBe('rejected')
    expect(updated.embedding).toBeNull()
  })
})

describe('classifyPost — классификация по запросу человека', () => {
  it('pending: ставит бакет и возвращает в pending, рерайт НЕ запускается', async () => {
    const ch = await makeChannel()
    const post = await makePost(ch.id, { status: 'pending' })
    let rewritten = false
    await classifyPost(post.id, fakeDeps({ bucket: 'сво', capture: () => (rewritten = true) }))
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.status).toBe('pending')
    expect(updated.bucket).toBe('сво')
    expect(updated.rewrittenTitle).toBeNull()
    expect(updated.finalText).toBeNull()
    expect(rewritten).toBe(false)
  })

  it('failed -> pending (повторная классификация после ошибки)', async () => {
    const ch = await makeChannel()
    const post = await makePost(ch.id, { status: 'failed', aiError: 'boom' })
    await classifyPost(post.id, fakeDeps({ bucket: 'рф-внутр' }))
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.status).toBe('pending')
    expect(updated.bucket).toBe('рф-внутр')
    expect(updated.aiError).toBeNull()
  })

  it('классификатор вернул неизвестный бакет -> failed + aiError', async () => {
    const ch = await makeChannel()
    const post = await makePost(ch.id, { status: 'pending' })
    await classifyPost(post.id, fakeDeps({ bucket: 'спорт' }))
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.status).toBe('failed')
    expect(updated.aiError).toContain('classify_unknown_bucket:спорт')
  })

  it('rejected к моменту старта — не «воскрешается»', async () => {
    const ch = await makeChannel()
    const post = await makePost(ch.id, { status: 'rejected' })
    await classifyPost(post.id, fakeDeps())
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.status).toBe('rejected')
    expect(updated.bucket).toBeNull()
  })

  it('карточка reject-нута во время классификации — статус и бакет не перетираются', async () => {
    const ch = await makeChannel()
    const post = await makePost(ch.id, { status: 'pending' })
    const deps: WorkerDeps = {
      embedding: { embed: async () => [1, 0, 0] },
      llm: {
        classify: async () => {
          // конкурентный soft-delete, пока воркер ждал LLM
          await prisma.post.update({
            where: { id: post.id },
            data: { status: 'rejected', rejectReason: 'оператор' },
          })
          return 'рф-внутр'
        },
        rewrite: async () => ({ title: 'РТ', text: 'РТело' }),
      },
    }
    await classifyPost(post.id, deps)
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.status).toBe('rejected')
    expect(updated.rejectReason).toBe('оператор')
    expect(updated.bucket).toBeNull()
  })
})

describe('reRewritePost — только при выставленном бакете', () => {
  it('без бакета -> failed rewrite_no_bucket (авто-классификации больше нет)', async () => {
    const ch = await makeChannel()
    const post = await makePost(ch.id, { status: 'pending', bucket: null })
    let classified = false
    await reRewritePost(post.id, fakeDeps({ onClassify: () => (classified = true) }))
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.status).toBe('failed')
    expect(updated.aiError).toBe('rewrite_no_bucket')
    expect(classified).toBe(false)
  })

  it('сво прокидывает isSvo=true в рерайт', async () => {
    const ch = await makeChannel()
    const post = await makePost(ch.id, { status: 'pending', bucket: 'сво' })
    let captured: RewriteInput | null = null
    await reRewritePost(post.id, fakeDeps({ capture: (i) => (captured = i) }))
    expect(captured!.isSvo).toBe(true)
  })
})

describe('reRewritePost — гонки со сменой статуса', () => {
  it('карточка reject-нута во время рерайта — статус не перетирается', async () => {
    const ch = await makeChannel()
    const post = await makePost(ch.id, { status: 'pending', bucket: 'рф-внутр' })
    const deps: WorkerDeps = {
      embedding: { embed: async () => [1, 0, 0] },
      llm: {
        classify: async () => 'рф-внутр',
        rewrite: async () => {
          await prisma.post.update({
            where: { id: post.id },
            data: { status: 'rejected', rejectReason: 'оператор' },
          })
          return { title: 'РТ', text: 'РТело' }
        },
      },
    }
    await reRewritePost(post.id, deps)
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.status).toBe('rejected')
    expect(updated.rewrittenTitle).toBeNull()
  })

  it('rejected к моменту старта — не «воскрешается» в processing/pending', async () => {
    const ch = await makeChannel()
    const post = await makePost(ch.id, { status: 'rejected', bucket: 'рф-внутр' })
    await reRewritePost(post.id, fakeDeps())
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.status).toBe('rejected')
  })

  it('failed -> pending (штатный повторный запуск)', async () => {
    const ch = await makeChannel()
    const post = await makePost(ch.id, { status: 'failed', aiError: 'boom', bucket: 'рф-внутр' })
    await reRewritePost(post.id, fakeDeps())
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.status).toBe('pending')
    expect(updated.aiError).toBeNull()
    expect(updated.finalTitle).toBe('РТ')
  })
})
