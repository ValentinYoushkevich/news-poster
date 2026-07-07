import { Prisma } from '@prisma/client'
import { env } from '../config/env.js'
import { prisma } from '../db/client.js'
import { AppError } from '../errors.js'
import { type ImageCandidate, normalizeItem, type RawItem } from '../normalize/normalizeItem.js'
import { assertTransition } from '../status.js'
import { defaultTelegram } from '../telegram/default.js'
import { buildCaption } from '../telegram/html.js'
import type { TelegramClient } from '../telegram/types.js'

export async function ingest(item: RawItem) {
  const card = normalizeItem(item)

  const channel = await prisma.channel.findUnique({ where: { id: card.channelId } })
  if (!channel) throw new AppError(404, 'channel_not_found')

  // Везде, где пост уходит наружу через API, embedding исключается (omit):
  // это большой внутренний JSON дедупа, клиенту он не нужен и зря гоняется по сети.
  try {
    return await prisma.post.create({
      omit: { embedding: true },
      data: {
        channelId: card.channelId,
        source: card.source,
        sourceLang: card.sourceLang,
        link: card.link,
        guid: card.guid,
        origTitle: card.origTitle,
        origText: card.origText,
        author: card.author,
        categories: card.categories,
        pubDate: card.pubDate,
        images: card.images as unknown as Prisma.InputJsonValue,
        status: 'ingested',
      },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new AppError(409, 'duplicate_link')
    }
    throw e
  }
}

const PAGE_SIZE = 20

export async function listPosts(filter: {
  channelId?: bigint
  status?: string
  bucket?: string
  source?: string
  date?: string
  page: number
}) {
  const where: Prisma.PostWhereInput = {}
  if (filter.channelId !== undefined) where.channelId = filter.channelId
  if (filter.status) where.status = filter.status
  if (filter.bucket) where.bucket = filter.bucket
  if (filter.source) where.source = filter.source
  if (filter.date) {
    const from = new Date(`${filter.date}T00:00:00.000Z`)
    const to = new Date(`${filter.date}T23:59:59.999Z`)
    where.pubDate = { gte: from, lte: to }
  }

  const [items, total] = await Promise.all([
    prisma.post.findMany({
      where,
      omit: { embedding: true },
      orderBy: { pubDate: 'desc' },
      skip: (filter.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.post.count({ where }),
  ])
  return { items, total, page: filter.page, pageSize: PAGE_SIZE }
}

export async function getPost(id: bigint) {
  const post = await prisma.post.findUnique({ where: { id }, omit: { embedding: true } })
  if (!post) throw new AppError(404, 'post_not_found')
  return post
}

export async function patchPost(
  id: bigint,
  data: Partial<{ finalTitle: string; finalText: string; bucket: string }>,
) {
  await getPost(id)
  return prisma.post.update({ where: { id }, data, omit: { embedding: true } })
}

export async function addImage(
  id: bigint,
  input: { url: string; type?: string | null },
) {
  const post = await getPost(id)
  const images = (post.images as unknown as ImageCandidate[]) ?? []
  const hasChosen = images.some((i) => i.chosen)
  const candidate: ImageCandidate = {
    url: input.url,
    type: input.type ?? null,
    origin: 'uploaded',
    fileId: null,
    chosen: !hasChosen, // авто-выбор, если выбранной ещё нет
  }
  const next = [...images, candidate]
  return prisma.post.update({
    where: { id },
    data: { images: next as unknown as Prisma.InputJsonValue },
    omit: { embedding: true },
  })
}

export async function selectImage(id: bigint, url: string | null) {
  const post = await getPost(id)
  const images = (post.images as unknown as ImageCandidate[]) ?? []
  if (url === null) {
    const next = images.map((i) => ({ ...i, chosen: false }))
    return prisma.post.update({
      where: { id },
      data: { images: next as unknown as Prisma.InputJsonValue },
      omit: { embedding: true },
    })
  }
  if (!images.some((i) => i.url === url)) throw new AppError(404, 'image_not_found')
  const next = images.map((i) => ({ ...i, chosen: i.url === url }))
  return prisma.post.update({
    where: { id },
    data: { images: next as unknown as Prisma.InputJsonValue },
    omit: { embedding: true },
  })
}

export async function approvePost(id: bigint, telegram: TelegramClient = defaultTelegram()) {
  const post = await getPost(id)
  assertTransition(post.status, 'ready_to_publish') // требует pending

  const caption = buildCaption(post.finalTitle ?? '', post.finalText ?? '')
  const images = (post.images as unknown as ImageCandidate[]) ?? []
  const chosen = images.find((i) => i.chosen)

  let previewMessageId: number
  let nextImages = images

  if (chosen) {
    const sent = await telegram.sendPhoto({
      chatId: env.SERVICE_CHAT_ID,
      photo: chosen.fileId ?? chosen.url,
      caption,
    })
    previewMessageId = sent.messageId
    if (sent.fileId) {
      nextImages = images.map((i) =>
        i.url === chosen.url ? { ...i, fileId: sent.fileId ?? null } : i,
      )
    }
  } else {
    const sent = await telegram.sendMessage({
      chatId: env.SERVICE_CHAT_ID,
      text: caption,
    })
    previewMessageId = sent.messageId
  }

  return prisma.post.update({
    where: { id },
    data: {
      images: nextImages as unknown as Prisma.InputJsonValue,
      previewMessageId: BigInt(previewMessageId),
      status: 'ready_to_publish',
      approvedAt: new Date(),
    },
    omit: { embedding: true },
  })
}

export async function unapprovePost(id: bigint) {
  const post = await getPost(id)
  assertTransition(post.status, 'pending') // требует ready_to_publish
  // Превью-сообщение в служебке НЕ удаляем — там TTL-автоудаление снаружи.
  return prisma.post.update({ where: { id }, data: { status: 'pending' }, omit: { embedding: true } })
}

// Жёсткое удаление из БД (кнопка-корзина в админке): без статусных ограничений,
// карточка исчезает безвозвратно — в отличие от softDeletePost (rejected).
export async function hardDeletePost(id: bigint): Promise<void> {
  await getPost(id) // 404, если карточки нет
  await prisma.post.delete({ where: { id } })
}

export async function softDeletePost(id: bigint, rejectReason?: string) {
  const post = await getPost(id)
  assertTransition(post.status, 'rejected')
  return prisma.post.update({
    where: { id },
    data: { status: 'rejected', rejectReason: rejectReason ?? null },
    omit: { embedding: true },
  })
}

export interface QueueItem {
  id: bigint
  channelId: bigint
  pubDate: Date
  caption: string
  fileId: string | null
  mainChatId: string
}

const QUEUE_LIMIT_DEFAULT = 10

// Готовая к постингу очередь канала: только ready_to_publish, старые первыми
// (ровный тайминг). Возвращаем всё, что n8n нужно для sendPhoto/sendMessage,
// одним запросом — сам сервис в Telegram не ходит.
export async function listPublishQueue(filter: {
  channelId: bigint
  limit?: number
}): Promise<QueueItem[]> {
  const posts = await prisma.post.findMany({
    // channel.active=false — канал выключен оператором: его посты в публикацию не отдаём.
    where: { channelId: filter.channelId, status: 'ready_to_publish', channel: { active: true } },
    orderBy: { pubDate: 'asc' },
    take: filter.limit ?? QUEUE_LIMIT_DEFAULT,
    include: { channel: true },
  })

  return posts.map((p) => {
    const images = (p.images as unknown as ImageCandidate[]) ?? []
    const chosen = Array.isArray(images) ? images.find((img) => img.chosen) : undefined
    return {
      id: p.id,
      channelId: p.channelId,
      pubDate: p.pubDate,
      caption: buildCaption(p.finalTitle ?? '', p.finalText ?? ''),
      fileId: chosen?.fileId ?? null,
      mainChatId: p.channel.mainChatId,
    }
  })
}

// Callback публикующей джобы: перевод в published после успешного постинга n8n.
// from берём из БД, переход валидирует общий assertTransition (409 invalid_transition).
export async function markPublished(id: bigint, publishedMessageId: bigint) {
  const post = await getPost(id) // 404, если нет
  assertTransition(post.status, 'published')
  return prisma.post.update({
    where: { id },
    data: {
      status: 'published',
      publishedMessageId,
      publishedAt: new Date(),
    },
    omit: { embedding: true },
  })
}
