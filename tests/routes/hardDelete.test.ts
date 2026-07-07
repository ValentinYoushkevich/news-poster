import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/db/client.js'
import { resetDb } from '../helpers/db.js'

const app = createApp()

beforeEach(resetDb)
afterAll(() => prisma.$disconnect())

async function createPost(): Promise<string> {
  const ch = await request(app)
    .post('/channels')
    .send({ name: 'A', mainChatId: '-1', buckets: ['b'], rewritePrompts: {}, schedule: 'x' })
  const post = await request(app).post('/posts').send({
    channelId: ch.body.id,
    source: 'src',
    sourceLang: 'ru',
    link: 'https://example.com/1',
    title: 'T',
    contentSnippet: 'text',
  })
  return post.body.id
}

describe('DELETE /posts/:id/hard', () => {
  it('204: карточка стирается из БД безвозвратно', async () => {
    const id = await createPost()
    const res = await request(app).delete(`/posts/${id}/hard`)
    expect(res.status).toBe(204)
    const gone = await request(app).get(`/posts/${id}`)
    expect(gone.status).toBe(404)
  })

  it('удаляет и в терминальном статусе (rejected)', async () => {
    const id = await createPost()
    await prisma.post.update({ where: { id: BigInt(id) }, data: { status: 'rejected' } })
    const res = await request(app).delete(`/posts/${id}/hard`)
    expect(res.status).toBe(204)
  })

  it('404 для несуществующего id', async () => {
    const res = await request(app).delete('/posts/999999/hard')
    expect(res.status).toBe(404)
  })
})
