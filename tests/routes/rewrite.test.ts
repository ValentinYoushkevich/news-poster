import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/db/client.js'
import { makeChannel, resetDb } from '../helpers/db.js'

const app = createApp()

beforeEach(resetDb)
afterAll(() => prisma.$disconnect())

async function seedPost(channelId: bigint) {
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
      bucket: 'рф-внутр',
    },
  })
}

describe('POST /posts/:id/rewrite', () => {
  it('существующая карточка -> 202 accepted', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id)
    const res = await request(app).post(`/posts/${post.id}/rewrite`)
    expect(res.status).toBe(202)
  })

  it('несуществующая -> 404', async () => {
    const res = await request(app).post('/posts/999999/rewrite')
    expect(res.status).toBe(404)
  })
})
