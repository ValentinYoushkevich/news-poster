import { env } from '../config/env.js'
import { prisma } from '../db/client.js'
import { defaultTelegram } from './default.js'
import type { TelegramClient } from './types.js'

// TTL-очистка превью в служебном чате (раздел ТЗ про PREVIEW_TTL):
// у заапрувленной карточки previewMessageId живёт channel.previewTtl минут
// (или PREVIEW_TTL_DEFAULT, если у канала не задан), после чего превью
// удаляется из служебки, а ссылка на него обнуляется.

// «Сообщение уже удалено» (руками или другим тиком) — задача фактически
// выполнена, ссылку чистим. Прочие ошибки — временные, ретрай следующим тиком.
function isMessageGone(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.toLowerCase().includes('message to delete not found')
}

// Один тик очистки. telegram и now инъектируются для тестов.
export async function cleanupExpiredPreviews(
  telegram: TelegramClient = defaultTelegram(),
  now: Date = new Date(),
): Promise<void> {
  const posts = await prisma.post.findMany({
    where: { previewMessageId: { not: null }, approvedAt: { not: null } },
    select: {
      id: true,
      previewMessageId: true,
      approvedAt: true,
      channel: { select: { previewTtl: true } },
    },
  })

  for (const post of posts) {
    const ttlMinutes = post.channel.previewTtl ?? env.PREVIEW_TTL_DEFAULT
    const expiresAt = post.approvedAt!.getTime() + ttlMinutes * 60_000
    if (expiresAt > now.getTime()) continue

    try {
      await telegram.deleteMessage({
        chatId: env.SERVICE_CHAT_ID,
        messageId: Number(post.previewMessageId),
      })
    } catch (e) {
      if (!isMessageGone(e)) {
        // Временная ошибка Telegram: лог и пропуск, previewMessageId не трогаем.
        console.error(
          `preview_cleanup_failed post=${post.id}: ${e instanceof Error ? e.message : String(e)}`,
        )
        continue
      }
    }
    // updateMany: карточку могли удалить, пока ходили в Telegram — не бросаем.
    await prisma.post.updateMany({
      where: { id: post.id },
      data: { previewMessageId: null },
    })
  }
}

const CLEANUP_INTERVAL_MS = 5 * 60_000

// Под тест-раннером фоновую джобу не запускаем — по образцу AI_TRIGGER_DISABLED
// в src/ai/trigger.ts: тики не должны асинхронно трогать карточки юнит-тестов.
const CLEANUP_DISABLED = process.env.VITEST === 'true'

// Запускается из src/server.ts (не из app.ts — createApp зовут и тесты).
export function startPreviewCleanup(): NodeJS.Timeout | null {
  if (CLEANUP_DISABLED) return null
  const timer = setInterval(() => {
    // Тик никогда не реджектится наружу: упавшая очистка не роняет процесс.
    void cleanupExpiredPreviews().catch((e) =>
      console.error(`preview_cleanup_tick_failed: ${e instanceof Error ? e.message : String(e)}`),
    )
  }, CLEANUP_INTERVAL_MS)
  // Таймер не должен держать процесс при graceful shutdown.
  timer.unref()
  return timer
}
