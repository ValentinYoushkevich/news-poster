import { prisma } from '../../src/db/client.js'

export async function resetDb() {
  // порядок важен: posts ссылается на channels
  await prisma.post.deleteMany()
  await prisma.channel.deleteMany()
}

export async function makeChannel(overrides: Record<string, unknown> = {}) {
  return prisma.channel.create({
    data: {
      name: 'Тест-канал',
      mainChatId: '-1001',
      buckets: ['рф-внутр', 'сво', 'мир-с-рф', 'мир-без-рф'],
      rewritePrompts: {},
      schedule: '*/30 * * * *',
      ...overrides,
    },
  })
}
