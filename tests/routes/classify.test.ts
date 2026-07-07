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
      link: 'https://a/x',
      origTitle: 'T',
      origText: 'B',
      categories: [],
      pubDate: new Date('2026-07-07T10:00:00Z'),
      images: [],
      status: 'pending',
      ...over,
    },
  })
}

describe('POST /posts/:id/classify', () => {
  it('pending -> 202 accepted', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id)
    const res = await request(app).post(`/posts/${post.id}/classify`)
    expect(res.status).toBe(202)
    expect(res.body.accepted).toBe(true)
  })

  it('failed -> 202 accepted (повторная классификация после ошибки ИИ)', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, { status: 'failed', aiError: 'boom' })
    const res = await request(app).post(`/posts/${post.id}/classify`)
    expect(res.status).toBe(202)
  })

  it('published -> 409 invalid_transition (рассинхрон с опубликованным)', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, { status: 'published' })
    const res = await request(app).post(`/posts/${post.id}/classify`)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('invalid_transition')
    const after = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(after.status).toBe('published')
  })

  it('rejected -> 409 invalid_transition (нельзя «воскресить» удалённый)', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, { status: 'rejected' })
    const res = await request(app).post(`/posts/${post.id}/classify`)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('invalid_transition')
    const after = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(after.status).toBe('rejected')
  })

  it('несуществующая -> 404', async () => {
    const res = await request(app).post('/posts/999999/classify')
    expect(res.status).toBe(404)
  })
})
