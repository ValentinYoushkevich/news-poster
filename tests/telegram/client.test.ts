import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTelegramClient } from '../../src/telegram/client.js'

afterEach(() => vi.unstubAllGlobals())

function mockFetch(body: unknown, ok = true, status = 200) {
  const fn = vi.fn(async () => ({ ok, status, json: async () => body }))
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('createTelegramClient.sendPhoto', () => {
  it('шлёт chat_id/photo/caption/parse_mode и возвращает messageId + крупнейший file_id', async () => {
    const fetchMock = mockFetch({
      ok: true,
      result: {
        message_id: 555,
        photo: [
          { file_id: 'small', file_unique_id: 'u1', width: 90, height: 60, file_size: 1000 },
          { file_id: 'big', file_unique_id: 'u2', width: 1280, height: 720, file_size: 90000 },
        ],
      },
    })
    const tg = createTelegramClient({ botToken: 'TOKEN' })
    const res = await tg.sendPhoto({ chatId: '-100777', photo: 'https://img/a.jpg', caption: 'Привет' })
    expect(res).toEqual({ messageId: 555, fileId: 'big' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://api.telegram.org/botTOKEN/sendPhoto')
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      chat_id: '-100777',
      photo: 'https://img/a.jpg',
      caption: 'Привет',
      parse_mode: 'HTML',
    })
  })

  it('не-ok HTTP -> ошибка', async () => {
    mockFetch({ ok: false, description: 'boom' }, false, 500)
    const tg = createTelegramClient({ botToken: 'T' })
    await expect(tg.sendPhoto({ chatId: 'c', photo: 'p' })).rejects.toThrow()
  })

  it('ok:false в теле -> ошибка', async () => {
    mockFetch({ ok: false, description: 'chat not found' }, true, 200)
    const tg = createTelegramClient({ botToken: 'T' })
    await expect(tg.sendPhoto({ chatId: 'c', photo: 'p' })).rejects.toThrow()
  })
})

describe('createTelegramClient.sendMessage', () => {
  it('возвращает messageId без fileId', async () => {
    const fetchMock = mockFetch({ ok: true, result: { message_id: 777 } })
    const tg = createTelegramClient({ botToken: 'T' })
    const res = await tg.sendMessage({ chatId: '-100', text: 'текст' })
    expect(res).toEqual({ messageId: 777 })

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://api.telegram.org/botT/sendMessage')
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      chat_id: '-100',
      text: 'текст',
      parse_mode: 'HTML',
    })
  })
})
