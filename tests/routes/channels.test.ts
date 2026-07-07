import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/db/client.js'
import { resetDb } from '../helpers/db.js'

const app = createApp()

beforeEach(resetDb)
afterAll(() => prisma.$disconnect())

describe('POST /channels', () => {
  it('создаёт канал и возвращает 201 с id-строкой', async () => {
    const res = await request(app)
      .post('/channels')
      .send({
        name: 'Новости',
        mainChatId: '-1001',
        buckets: ['рф-внутр', 'сво'],
        rewritePrompts: { 'рф-внутр': 'промпт' },
        schedule: '*/30 * * * *',
      })
    expect(res.status).toBe(201)
    expect(typeof res.body.id).toBe('string')
    expect(res.body.active).toBe(true)
  })

  it('400 при отсутствии обязательного поля', async () => {
    const res = await request(app).post('/channels').send({ name: 'X' })
    expect(res.status).toBe(400)
  })
})

describe('GET /channels', () => {
  it('возвращает список', async () => {
    await request(app)
      .post('/channels')
      .send({ name: 'A', mainChatId: '-1', buckets: [], rewritePrompts: {}, schedule: 'x' })
    const res = await request(app).get('/channels')
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(1)
  })
})

describe('PATCH /channels/:id', () => {
  it('обновляет расписание и бакеты', async () => {
    const created = await request(app)
      .post('/channels')
      .send({ name: 'A', mainChatId: '-1', buckets: [], rewritePrompts: {}, schedule: 'x' })
    const id = created.body.id
    const res = await request(app)
      .patch(`/channels/${id}`)
      .send({ schedule: '0 * * * *', buckets: ['новый'] })
    expect(res.status).toBe(200)
    expect(res.body.schedule).toBe('0 * * * *')
    expect(res.body.buckets).toEqual(['новый'])
  })

  it('404 для несуществующего id', async () => {
    const res = await request(app).patch('/channels/999999').send({ schedule: 'y' })
    expect(res.status).toBe(404)
  })
})
