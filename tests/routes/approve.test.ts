import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Хойстим спаи, чтобы vi.mock (тоже хойстится) их видел.
const { sendPhotoMock, sendMessageMock } = vi.hoisted(() => ({
  sendPhotoMock: vi.fn(),
  sendMessageMock: vi.fn(),
}))

vi.mock('../../src/telegram/default.js', () => ({
  defaultTelegram: () => ({ sendPhoto: sendPhotoMock, sendMessage: sendMessageMock }),
}))

import { createApp } from '../../src/app.js'
import { prisma } from '../../src/db/client.js'
import { makeChannel, resetDb } from '../helpers/db.js'

const app = createApp()

beforeEach(async () => {
  await resetDb()
  sendPhotoMock.mockReset()
  sendMessageMock.mockReset()
})
afterEach(() => vi.clearAllMocks())
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
      pubDate: new Date('2026-07-07T10:00:00Z'),
      images: [],
      finalTitle: 'Заголовок & факты',
      finalText: 'Тело поста',
      status: 'pending',
      ...over,
    },
  })
}

describe('POST /posts/:id/approve — с картинкой', () => {
  it('шлёт sendPhoto, пишет fileId + previewMessageId, статус ready_to_publish', async () => {
    sendPhotoMock.mockResolvedValue({ messageId: 555, fileId: 'FILE_123' })
    const ch = await makeChannel()
    const post = await seedPost(ch.id, {
      images: [{ url: 'https://a.jpg', type: null, origin: 'enclosure', fileId: null, chosen: true }],
    })

    const res = await request(app).post(`/posts/${post.id}/approve`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ready_to_publish')
    expect(res.body.previewMessageId).toBe('555')
    expect(res.body.approvedAt).not.toBeNull()
    expect(res.body.images[0].fileId).toBe('FILE_123')

    expect(sendPhotoMock).toHaveBeenCalledTimes(1)
    expect(sendMessageMock).not.toHaveBeenCalled()
    // caption экранирован: & -> &amp;, заголовок в <b>
    const captionArg = sendPhotoMock.mock.calls[0][0].caption as string
    expect(captionArg).toContain('<b>Заголовок &amp; факты</b>')
    // выбранная картинка ушла в photo
    expect(sendPhotoMock.mock.calls[0][0].photo).toBe('https://a.jpg')
  })

  it('уже имеющийся fileId используется как photo (переиспользование CDN)', async () => {
    sendPhotoMock.mockResolvedValue({ messageId: 1, fileId: 'NEW' })
    const ch = await makeChannel()
    const post = await seedPost(ch.id, {
      images: [{ url: 'https://a.jpg', type: null, origin: 'enclosure', fileId: 'OLD_FILE', chosen: true }],
    })
    await request(app).post(`/posts/${post.id}/approve`)
    expect(sendPhotoMock.mock.calls[0][0].photo).toBe('OLD_FILE')
  })
})

describe('POST /posts/:id/approve — без картинки', () => {
  it('шлёт sendMessage, пишет previewMessageId, статус ready_to_publish', async () => {
    sendMessageMock.mockResolvedValue({ messageId: 777 })
    const ch = await makeChannel()
    const post = await seedPost(ch.id, { images: [] })

    const res = await request(app).post(`/posts/${post.id}/approve`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ready_to_publish')
    expect(res.body.previewMessageId).toBe('777')
    expect(sendMessageMock).toHaveBeenCalledTimes(1)
    expect(sendPhotoMock).not.toHaveBeenCalled()
  })
})

describe('POST /posts/:id/approve — ошибки', () => {
  it('не из pending -> 409 invalid_transition', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, { status: 'ready_to_publish' })
    const res = await request(app).post(`/posts/${post.id}/approve`)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('invalid_transition')
    expect(sendPhotoMock).not.toHaveBeenCalled()
    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it('404 для несуществующего', async () => {
    const res = await request(app).post('/posts/999999/approve')
    expect(res.status).toBe(404)
  })
})
