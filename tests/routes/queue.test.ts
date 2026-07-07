import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/db/client.js'
import { makeChannel, resetDb } from '../helpers/db.js'

const app = createApp()

beforeEach(resetDb)
afterAll(() => prisma.$disconnect())

async function seedPost(
  channelId: bigint,
  over: Record<string, unknown> = {},
) {
  return prisma.post.create({
    data: {
      channelId,
      source: 'rbc',
      sourceLang: 'ru',
      link: `https://a/${Math.random()}`,
      origTitle: 'T',
      origText: 'B',
      categories: [],
      pubDate: new Date('2026-07-07T10:00:00.000Z'),
      images: [],
      finalTitle: 'Заголовок',
      finalText: 'Тело поста',
      status: 'ready_to_publish',
      ...over,
    },
  })
}

describe('GET /posts/queue', () => {
  it('отдаёт только ready_to_publish этого канала', async () => {
    const ch = await makeChannel()
    const other = await makeChannel()
    await seedPost(ch.id, { link: 'https://a/1' })
    await seedPost(ch.id, { link: 'https://a/2', status: 'pending' }) // не готов
    await seedPost(other.id, { link: 'https://a/3' }) // другой канал

    const res = await request(app).get(`/posts/queue?channelId=${ch.id}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBe(1)
    expect(res.body[0].mainChatId).toBe(ch.mainChatId)
  })

  it('порядок по pubDate ASC (старые первыми)', async () => {
    const ch = await makeChannel()
    await seedPost(ch.id, { link: 'https://a/new', pubDate: new Date('2026-07-07T12:00:00.000Z') })
    await seedPost(ch.id, { link: 'https://a/old', pubDate: new Date('2026-07-07T08:00:00.000Z') })
    const res = await request(app).get(`/posts/queue?channelId=${ch.id}`)
    expect(res.status).toBe(200)
    const dates = res.body.map((p: { pubDate: string }) => p.pubDate)
    expect(new Date(dates[0]).getTime()).toBeLessThan(new Date(dates[1]).getTime())
  })

  it('caption собран из final-полей, fileId — из выбранной картинки', async () => {
    const ch = await makeChannel()
    await seedPost(ch.id, {
      link: 'https://a/img',
      finalTitle: 'Заг',
      finalText: 'Тело',
      images: [
        { url: 'https://i/skip.jpg', type: 'image/jpeg', origin: 'content', fileId: 'FID_SKIP', chosen: false },
        { url: 'https://i/use.jpg', type: 'image/jpeg', origin: 'uploaded', fileId: 'FID_USE', chosen: true },
      ],
    })
    const res = await request(app).get(`/posts/queue?channelId=${ch.id}`)
    expect(res.status).toBe(200)
    expect(res.body[0].fileId).toBe('FID_USE')
    expect(typeof res.body[0].caption).toBe('string')
    expect(res.body[0].caption).toContain('Заг')
    expect(res.body[0].caption).toContain('Тело')
  })

  it('пост без картинки -> fileId=null (n8n пойдёт в sendMessage)', async () => {
    const ch = await makeChannel()
    await seedPost(ch.id, { link: 'https://a/text', images: [] })
    const res = await request(app).get(`/posts/queue?channelId=${ch.id}`)
    expect(res.status).toBe(200)
    expect(res.body[0].fileId).toBeNull()
  })

  it('limit ограничивает выдачу', async () => {
    const ch = await makeChannel()
    await seedPost(ch.id, { link: 'https://a/1' })
    await seedPost(ch.id, { link: 'https://a/2' })
    await seedPost(ch.id, { link: 'https://a/3' })
    const res = await request(app).get(`/posts/queue?channelId=${ch.id}&limit=2`)
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(2)
  })

  it('400 без channelId', async () => {
    const res = await request(app).get('/posts/queue')
    expect(res.status).toBe(400)
  })
})
