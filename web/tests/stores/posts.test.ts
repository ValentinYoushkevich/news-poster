import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../src/api/client'
import { usePostsStore } from '../../src/stores/posts'

vi.mock('../../src/api/client', () => ({
  api: {
    listPosts: vi.fn(),
    getPost: vi.fn(),
    approve: vi.fn(),
  },
  ApiError: class extends Error {},
}))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('posts store', () => {
  it('loadList кладёт результат и прокидывает фильтры', async () => {
    ;(api.listPosts as any).mockResolvedValue({ items: [{ id: '1' }], total: 1, page: 1, pageSize: 20 })
    const store = usePostsStore()
    store.filters.channelId = '7'
    await store.loadList()
    expect(api.listPosts).toHaveBeenCalledWith(expect.objectContaining({ channelId: '7', page: 1 }))
    expect(store.list.items).toHaveLength(1)
    expect(store.list.total).toBe(1)
  })

  it('loadPost кладёт current', async () => {
    ;(api.getPost as any).mockResolvedValue({ id: '5', status: 'pending' })
    const store = usePostsStore()
    await store.loadPost('5')
    expect(store.current?.id).toBe('5')
  })

  it('approveCurrent обновляет current из ответа', async () => {
    ;(api.getPost as any).mockResolvedValue({ id: '5', status: 'pending' })
    ;(api.approve as any).mockResolvedValue({ id: '5', status: 'ready_to_publish' })
    const store = usePostsStore()
    await store.loadPost('5')
    await store.approveCurrent()
    expect(store.current?.status).toBe('ready_to_publish')
  })
})
