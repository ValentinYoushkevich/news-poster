import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from '../../src/config/env.js'
import { prisma } from '../../src/db/client.js'
import { cleanupExpiredPreviews } from '../../src/telegram/previewCleanup.js'
import type { TelegramClient } from '../../src/telegram/types.js'
import { makeChannel, resetDb } from '../helpers/db.js'

beforeEach(resetDb)
afterAll(() => prisma.$disconnect())

const NOW = new Date('2026-07-07T12:00:00.000Z')

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000)
}

// Мок телеграм-клиента: sendPhoto/sendMessage джобе не нужны, но интерфейс полный.
function fakeTelegram(deleteImpl?: () => Promise<void>) {
  const deleteMessage = vi.fn(deleteImpl ?? (async () => undefined))
  const client: TelegramClient = {
    sendPhoto: vi.fn(),
    sendMessage: vi.fn(),
    deleteMessage,
  }
  return { client, deleteMessage }
}

async function seedApproved(channelId: bigint, over: Record<string, unknown> = {}) {
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
      status: 'ready_to_publish',
      previewMessageId: 555n,
      approvedAt: minutesAgo(10),
      ...over,
    },
  })
}

describe('cleanupExpiredPreviews', () => {
  it('истёкший по дефолтному TTL — превью удалено, previewMessageId обнулён', async () => {
    const ch = await makeChannel() // previewTtl не задан -> PREVIEW_TTL_DEFAULT (1440 мин)
    const post = await seedApproved(ch.id, { approvedAt: minutesAgo(env.PREVIEW_TTL_DEFAULT + 1) })
    const { client, deleteMessage } = fakeTelegram()

    await cleanupExpiredPreviews(client, NOW)

    expect(deleteMessage).toHaveBeenCalledTimes(1)
    expect(deleteMessage).toHaveBeenCalledWith({ chatId: env.SERVICE_CHAT_ID, messageId: 555 })
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.previewMessageId).toBeNull()
  })

  it('неистёкший — не тронут, в Telegram не ходим', async () => {
    const ch = await makeChannel()
    const post = await seedApproved(ch.id, { approvedAt: minutesAgo(10) })
    const { client, deleteMessage } = fakeTelegram()

    await cleanupExpiredPreviews(client, NOW)

    expect(deleteMessage).not.toHaveBeenCalled()
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.previewMessageId).toBe(555n)
  })

  it('per-channel previewTtl приоритетнее дефолта (короткий TTL — удаляем раньше)', async () => {
    const ch = await makeChannel({ previewTtl: 5 })
    const post = await seedApproved(ch.id, { approvedAt: minutesAgo(10) }) // 10 > 5, но << 1440
    const { client, deleteMessage } = fakeTelegram()

    await cleanupExpiredPreviews(client, NOW)

    expect(deleteMessage).toHaveBeenCalledTimes(1)
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.previewMessageId).toBeNull()
  })

  it('per-channel previewTtl приоритетнее дефолта (длинный TTL — держим дольше)', async () => {
    const ch = await makeChannel({ previewTtl: 10_000 })
    const post = await seedApproved(ch.id, { approvedAt: minutesAgo(env.PREVIEW_TTL_DEFAULT + 60) })
    const { client, deleteMessage } = fakeTelegram()

    await cleanupExpiredPreviews(client, NOW)

    expect(deleteMessage).not.toHaveBeenCalled()
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.previewMessageId).toBe(555n)
  })

  it('«message to delete not found» — previewMessageId всё равно обнуляется', async () => {
    const ch = await makeChannel({ previewTtl: 5 })
    const post = await seedApproved(ch.id, { approvedAt: minutesAgo(10) })
    const { client } = fakeTelegram(async () => {
      throw new Error('telegram_deleteMessage_failed:400:Bad Request: message to delete not found')
    })

    await cleanupExpiredPreviews(client, NOW)

    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.previewMessageId).toBeNull()
  })

  it('прочая ошибка Telegram — лог и пропуск, ретрай следующим тиком', async () => {
    const ch = await makeChannel({ previewTtl: 5 })
    const post = await seedApproved(ch.id, { approvedAt: minutesAgo(10) })
    const { client } = fakeTelegram(async () => {
      throw new Error('telegram_deleteMessage_failed:500:Internal Server Error')
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await cleanupExpiredPreviews(client, NOW)

    expect(errorSpy).toHaveBeenCalled()
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.previewMessageId).toBe(555n) // ссылка цела — попробуем ещё раз
    errorSpy.mockRestore()
  })

  it('посты без previewMessageId джобу не интересуют', async () => {
    const ch = await makeChannel({ previewTtl: 5 })
    await seedApproved(ch.id, { previewMessageId: null, approvedAt: minutesAgo(10) })
    const { client, deleteMessage } = fakeTelegram()

    await cleanupExpiredPreviews(client, NOW)

    expect(deleteMessage).not.toHaveBeenCalled()
  })
})
