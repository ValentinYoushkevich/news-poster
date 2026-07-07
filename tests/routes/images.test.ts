import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/db/client.js'
import { makeChannel, resetDb } from '../helpers/db.js'

const app = createApp()

beforeEach(resetDb)
afterAll(() => prisma.$disconnect())

async function seedPost(channelId: bigint, images: unknown[] = [], status = 'pending') {
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
      images: images as never,
      finalTitle: 'Заг',
      finalText: 'Тело',
      status,
    },
  })
}

describe('POST /posts/:id/images', () => {
  it('добавляет uploaded-кандидата и авто-выбирает его, если выбранной нет', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, [])
    const res = await request(app)
      .post(`/posts/${post.id}/images`)
      .send({ url: 'https://my/pic.jpg', type: 'image/jpeg' })
    expect(res.status).toBe(201)
    expect(res.body.images).toEqual([
      { url: 'https://my/pic.jpg', type: 'image/jpeg', origin: 'uploaded', fileId: null, chosen: true },
    ])
  })

  it('не перевыбирает, если уже есть chosen', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, [
      { url: 'https://a.jpg', type: null, origin: 'enclosure', fileId: null, chosen: true },
    ])
    const res = await request(app).post(`/posts/${post.id}/images`).send({ url: 'https://b.jpg' })
    expect(res.status).toBe(201)
    const uploaded = res.body.images.find((i: { origin: string }) => i.origin === 'uploaded')
    expect(uploaded.chosen).toBe(false)
    expect(res.body.images.find((i: { url: string }) => i.url === 'https://a.jpg').chosen).toBe(true)
  })

  it('404 для несуществующего поста', async () => {
    const res = await request(app).post('/posts/999999/images').send({ url: 'https://x.jpg' })
    expect(res.status).toBe(404)
  })

  it('400 без url', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, [])
    const res = await request(app).post(`/posts/${post.id}/images`).send({})
    expect(res.status).toBe(400)
  })
})

describe('PATCH /posts/:id/images/select', () => {
  it('выбирает одну (chosen=true у неё, false у остальных)', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, [
      { url: 'https://a.jpg', type: null, origin: 'enclosure', fileId: null, chosen: true },
      { url: 'https://b.jpg', type: null, origin: 'uploaded', fileId: null, chosen: false },
    ])
    const res = await request(app).patch(`/posts/${post.id}/images/select`).send({ url: 'https://b.jpg' })
    expect(res.status).toBe(200)
    expect(res.body.images.find((i: { url: string }) => i.url === 'https://a.jpg').chosen).toBe(false)
    expect(res.body.images.find((i: { url: string }) => i.url === 'https://b.jpg').chosen).toBe(true)
  })

  it('url:null снимает выбор со всех (текстовый пост)', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, [
      { url: 'https://a.jpg', type: null, origin: 'enclosure', fileId: null, chosen: true },
    ])
    const res = await request(app).patch(`/posts/${post.id}/images/select`).send({ url: null })
    expect(res.status).toBe(200)
    expect(res.body.images.every((i: { chosen: boolean }) => i.chosen === false)).toBe(true)
  })

  it('404, если url нет среди кандидатов', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, [
      { url: 'https://a.jpg', type: null, origin: 'enclosure', fileId: null, chosen: true },
    ])
    const res = await request(app).patch(`/posts/${post.id}/images/select`).send({ url: 'https://nope.jpg' })
    expect(res.status).toBe(404)
  })
})
