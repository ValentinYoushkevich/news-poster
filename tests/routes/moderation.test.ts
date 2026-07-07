import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/db/client.js'
import { makeChannel, resetDb } from '../helpers/db.js'

const app = createApp()

beforeEach(resetDb)
afterAll(() => prisma.$disconnect())

async function seedPost(channelId: bigint, status: string) {
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
      status,
    },
  })
}

describe('POST /posts/:id/unapprove', () => {
  it('ready_to_publish -> pending', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, 'ready_to_publish')
    const res = await request(app).post(`/posts/${post.id}/unapprove`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('pending')
  })

  it('из pending -> 409', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, 'pending')
    const res = await request(app).post(`/posts/${post.id}/unapprove`)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('invalid_transition')
  })

  it('404 для несуществующего', async () => {
    const res = await request(app).post('/posts/999999/unapprove')
    expect(res.status).toBe(404)
  })
})

describe('DELETE /posts/:id', () => {
  it('pending -> rejected с rejectReason', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, 'pending')
    const res = await request(app).delete(`/posts/${post.id}`).send({ rejectReason: 'дубль' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('rejected')
    expect(res.body.rejectReason).toBe('дубль')
  })

  it('ready_to_publish -> rejected (без причины)', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, 'ready_to_publish')
    const res = await request(app).delete(`/posts/${post.id}`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('rejected')
    expect(res.body.rejectReason).toBeNull()
  })

  it('processing -> rejected', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, 'processing')
    const res = await request(app).delete(`/posts/${post.id}`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('rejected')
  })

  it('уже published -> 409 (нельзя удалить)', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, 'published')
    const res = await request(app).delete(`/posts/${post.id}`)
    expect(res.status).toBe(409)
  })

  it('удалённая карточка пропадает из рабочей выдачи (?status=pending)', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, 'pending')
    await request(app).delete(`/posts/${post.id}`)
    const list = await request(app).get(`/posts?channelId=${ch.id}&status=pending`)
    expect(list.body.total).toBe(0)
  })

  it('404 для несуществующего', async () => {
    const res = await request(app).delete('/posts/999999')
    expect(res.status).toBe(404)
  })
})
