import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/db/client.js'
import { makeChannel, resetDb } from '../helpers/db.js'

const app = createApp()

beforeEach(resetDb)
afterAll(() => prisma.$disconnect())

function ingestBody(channelId: string, overrides: Record<string, unknown> = {}) {
  return {
    channelId,
    source: 'rbc',
    sourceLang: 'ru',
    title: 'Заголовок',
    link: 'https://rbc.ru/a',
    isoDate: '2026-07-07T10:00:00.000Z',
    contentSnippet: '<p>Тело.</p> Continue reading...',
    ...overrides,
  }
}

describe('POST /posts (ingest)', () => {
  it('создаёт карточку в статусе ingested, нормализует поля', async () => {
    const ch = await makeChannel()
    const res = await request(app).post('/posts').send(ingestBody(String(ch.id)))
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('ingested')
    expect(res.body.origText).toBe('Тело.')
    expect(res.body.channelId).toBe(String(ch.id))
  })

  it('дедуп: повтор пары (channelId, link) -> 409', async () => {
    const ch = await makeChannel()
    await request(app).post('/posts').send(ingestBody(String(ch.id)))
    const res = await request(app).post('/posts').send(ingestBody(String(ch.id)))
    expect(res.status).toBe(409)
  })

  it('та же ссылка в другом канале -> ok (скоуп дедупа по каналу)', async () => {
    const ch1 = await makeChannel()
    const ch2 = await makeChannel()
    await request(app).post('/posts').send(ingestBody(String(ch1.id)))
    const res = await request(app).post('/posts').send(ingestBody(String(ch2.id)))
    expect(res.status).toBe(201)
  })

  it('400 без channelId', async () => {
    const res = await request(app).post('/posts').send({ source: 'rbc', sourceLang: 'ru', link: 'x' })
    expect(res.status).toBe(400)
  })

  it('404 при несуществующем channelId', async () => {
    const res = await request(app).post('/posts').send(ingestBody('999999'))
    expect(res.status).toBe(404)
  })
})

describe('GET /posts', () => {
  it('фильтрует по channelId и status, отдаёт пагинацию', async () => {
    const ch = await makeChannel()
    await request(app).post('/posts').send(ingestBody(String(ch.id), { link: 'https://a/1' }))
    await request(app).post('/posts').send(ingestBody(String(ch.id), { link: 'https://a/2' }))
    const res = await request(app).get(`/posts?channelId=${ch.id}&status=ingested&page=1`)
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(2)
    expect(res.body.items.length).toBe(2)
    expect(res.body.page).toBe(1)
  })
})

describe('GET /posts/:id', () => {
  it('отдаёт карточку', async () => {
    const ch = await makeChannel()
    const created = await request(app).post('/posts').send(ingestBody(String(ch.id)))
    const res = await request(app).get(`/posts/${created.body.id}`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(created.body.id)
  })

  it('embedding не утекает в API, guid остаётся', async () => {
    const ch = await makeChannel()
    const post = await prisma.post.create({
      data: {
        channelId: ch.id,
        source: 'rbc',
        sourceLang: 'ru',
        link: 'https://a/emb',
        guid: 'guid-1',
        origTitle: 'T',
        origText: 'B',
        categories: [],
        pubDate: new Date('2026-07-07T10:00:00Z'),
        images: [],
        status: 'pending',
        embedding: [0.1, 0.2, 0.3],
      },
    })
    const res = await request(app).get(`/posts/${post.id}`)
    expect(res.status).toBe(200)
    expect(res.body).not.toHaveProperty('embedding')
    expect(res.body.guid).toBe('guid-1')
    // и в списке тоже
    const list = await request(app).get(`/posts?channelId=${ch.id}`)
    expect(list.body.items[0]).not.toHaveProperty('embedding')
  })

  it('404 для несуществующего', async () => {
    const res = await request(app).get('/posts/999999')
    expect(res.status).toBe(404)
  })
})

describe('PATCH /posts/:id', () => {
  it('правит finalTitle/finalText/bucket', async () => {
    const ch = await makeChannel()
    const created = await request(app).post('/posts').send(ingestBody(String(ch.id)))
    const res = await request(app)
      .patch(`/posts/${created.body.id}`)
      .send({ finalTitle: 'Правл. заголовок', finalText: 'Правл. текст', bucket: 'рф-внутр' })
    expect(res.status).toBe(200)
    expect(res.body.finalTitle).toBe('Правл. заголовок')
    expect(res.body.bucket).toBe('рф-внутр')
  })

  it('404 для несуществующего', async () => {
    const res = await request(app).patch('/posts/999999').send({ finalTitle: 'x' })
    expect(res.status).toBe(404)
  })
})
