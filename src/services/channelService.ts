import type { Prisma } from '@prisma/client'
import { prisma } from '../db/client.js'
import { AppError } from '../errors.js'

export function listChannels() {
  return prisma.channel.findMany({ orderBy: { id: 'asc' } })
}

export function createChannel(data: {
  name: string
  mainChatId: string
  buckets: string[]
  rewritePrompts: Prisma.InputJsonValue
  schedule: string
  previewTtl?: number | null
  active?: boolean
}) {
  return prisma.channel.create({ data })
}

export async function updateChannel(
  id: bigint,
  data: Partial<{
    name: string
    mainChatId: string
    buckets: string[]
    rewritePrompts: Prisma.InputJsonValue
    schedule: string
    previewTtl: number | null
    active: boolean
  }>,
) {
  const existing = await prisma.channel.findUnique({ where: { id } })
  if (!existing) throw new AppError(404, 'channel_not_found')
  return prisma.channel.update({ where: { id }, data })
}
