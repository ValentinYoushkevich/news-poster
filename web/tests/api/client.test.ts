import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api } from '../../src/api/client'

afterEach(() => vi.unstubAllGlobals())

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

  it('не-ok ответ бросает ApiError с code', async () => {
    mockFetch({ error: 'invalid_transition', code: 'invalid_transition' }, false, 409)
    await expect(api.approve('1')).rejects.toMatchObject({
      status: 409,
      code: 'invalid_transition',
    })
    await expect(api.approve('1')).rejects.toBeInstanceOf(ApiError)
  })
})
