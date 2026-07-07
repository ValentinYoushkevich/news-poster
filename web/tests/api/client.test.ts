import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, setOnUnauthorized } from '../../src/api/client'

afterEach(() => {
  vi.unstubAllGlobals()
  setOnUnauthorized(null)
})

function mockFetch(body: unknown, ok = true, status = 200) {
  const fn = vi.fn(async (..._args: any[]) => ({ ok, status, json: async () => body }))
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('api client', () => {
  it('listPosts строит query и бьёт /api/posts', async () => {
    const fetchMock = mockFetch({ items: [], total: 0, page: 1, pageSize: 20 })
    await api.listPosts({ channelId: '1', status: 'pending', page: 2 })
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/api/posts?')
    expect(url).toContain('channelId=1')
    expect(url).toContain('status=pending')
    expect(url).toContain('page=2')
  })

  it('пропускает пустые фильтры', async () => {
    const fetchMock = mockFetch({ items: [], total: 0, page: 1, pageSize: 20 })
    await api.listPosts({ channelId: '1', status: '' })
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).not.toContain('status=')
  })

  it('patchPost шлёт PATCH с JSON-телом', async () => {
    const fetchMock = mockFetch({ id: '1' })
    await api.patchPost('1', { finalTitle: 'X' })
    const [, init] = fetchMock.mock.calls[0]
    expect((init as RequestInit).method).toBe('PATCH')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ finalTitle: 'X' })
  })

  it('selectImage с null убирает выбор', async () => {
    const fetchMock = mockFetch({ id: '1' })
    await api.selectImage('1', null)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/posts/1/images/select')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ url: null })
  })

  it('createChannel шлёт POST на /api/channels с телом', async () => {
    const fetchMock = mockFetch({ id: 'c1' })
    const body = {
      name: 'Новости',
      mainChatId: '-100',
      buckets: ['x'],
      rewritePrompts: {},
      schedule: '*/30 * * * *',
    }
    await api.createChannel(body)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/channels')
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual(body)
  })

  it('classify шлёт POST на /api/posts/:id/classify', async () => {
    const fetchMock = mockFetch({ accepted: true })
    await api.classify('42')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/posts/42/classify')
    expect((init as RequestInit).method).toBe('POST')
  })

  it('rewrite шлёт POST на /api/posts/:id/rewrite', async () => {
    const fetchMock = mockFetch({ accepted: true })
    await api.rewrite('42')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/posts/42/rewrite')
    expect((init as RequestInit).method).toBe('POST')
  })

  it('hardDelete шлёт DELETE на /api/posts/:id/hard', async () => {
    const fn = vi.fn(async (..._args: any[]) => ({ ok: true, status: 204, json: async () => ({}) }))
    vi.stubGlobal('fetch', fn)
    await expect(api.hardDelete('42')).resolves.toBeUndefined()
    const [url, init] = fn.mock.calls[0]
    expect(url).toContain('/api/posts/42/hard')
    expect((init as RequestInit).method).toBe('DELETE')
  })

  it('не-ok ответ бросает ApiError с code', async () => {
    mockFetch({ error: 'invalid_transition', code: 'invalid_transition' }, false, 409)
    await expect(api.approve('1')).rejects.toMatchObject({
      status: 409,
      code: 'invalid_transition',
    })
    await expect(api.approve('1')).rejects.toBeInstanceOf(ApiError)
  })

  it('updateChannel шлёт PATCH на /api/channels/:id с телом', async () => {
    const fetchMock = mockFetch({ id: 'c1', active: false })
    await api.updateChannel('c1', { active: false })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/channels/c1')
    expect((init as RequestInit).method).toBe('PATCH')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ active: false })
  })

  it('401 вне /auth зовёт onUnauthorized и всё равно бросает ApiError', async () => {
    mockFetch({ error: 'unauthorized', code: 'unauthorized' }, false, 401)
    const cb = vi.fn()
    setOnUnauthorized(cb)
    await expect(api.listChannels()).rejects.toMatchObject({ status: 401 })
    await expect(api.listChannels()).rejects.toBeInstanceOf(ApiError)
    expect(cb).toHaveBeenCalled()
  })

  it('401 на /auth/* НЕ зовёт onUnauthorized', async () => {
    mockFetch({ error: 'invalid_credentials', code: 'invalid_credentials' }, false, 401)
    const cb = vi.fn()
    setOnUnauthorized(cb)
    await expect(api.login('admin', 'bad')).rejects.toMatchObject({ status: 401 })
    expect(cb).not.toHaveBeenCalled()
  })
})
