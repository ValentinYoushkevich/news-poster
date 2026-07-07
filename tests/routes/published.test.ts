import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/db/client.js'
import { makeChannel, resetDb } from '../helpers/db.js'

const app = createApp()

beforeEach(resetDb)
afterAll(() => prisma.$disconnect())

async function seedPost(channelId: bigint, over: Record<string, unknown> = {}) {
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
      finalTitle: 'Заг',
      finalText: 'Тело',
      status: 'ready_to_publish',
      ...over,
    },
  })
}

describe('PATCH /posts/:id/published', () => {
  it('ready_to_publish -> published + publishedMessageId + publishedAt', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id)
    const res = await request(app)
      .patch(`/posts/${post.id}/published`)
      .send({ publishedMessageId: '4242' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('published')
    expect(res.body.publishedMessageId).toBe('4242') // BigInt сериализуется строкой
    expect(res.body.publishedAt).not.toBeNull()
  })

  it('невалидный переход (pending) -> 409 invalid_transition', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, { status: 'pending' })
    const res = await request(app)
      .patch(`/posts/${post.id}/published`)
      .send({ publishedMessageId: '1' })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('invalid_transition')
  })

  it('несуществующий id -> 404', async () => {
    const res = await request(app)
      .patch('/posts/999999/published')
      .send({ publishedMessageId: '1' })
    expect(res.status).toBe(404)
  })

  it('400 без publishedMessageId', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id)
    const res = await request(app).patch(`/posts/${post.id}/published`).send({})
    expect(res.status).toBe(400)
  })
})
