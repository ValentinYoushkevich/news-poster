import { Prisma } from '@prisma/client'
import { prisma } from '../db/client.js'
import { AppError } from '../errors.js'
import { normalizeItem, type RawItem } from '../normalize/normalizeItem.js'

export async function ingest(item: RawItem) {
  const card = normalizeItem(item)

  const channel = await prisma.channel.findUnique({ where: { id: card.channelId } })
  if (!channel) throw new AppError(404, 'channel_not_found')

  try {
    return await prisma.post.create({
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
      orderBy: { pubDate: 'desc' },
      skip: (filter.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.post.count({ where }),
  ])
  return { items, total, page: filter.page, pageSize: PAGE_SIZE }
}

export async function getPost(id: bigint) {
  const post = await prisma.post.findUnique({ where: { id } })
  if (!post) throw new AppError(404, 'post_not_found')
  return post
}

export async function patchPost(
  id: bigint,
  data: Partial<{ finalTitle: string; finalText: string; bucket: string }>,
) {
  await getPost(id)
  return prisma.post.update({ where: { id }, data })
}
