import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../src/api/client'
import PostListView from '../../src/views/PostListView.vue'

vi.mock('../../src/api/client', () => ({
  api: {
    listPosts: vi.fn().mockResolvedValue({
      items: [
        { id: '1', origTitle: 'A', finalTitle: 'Аа', status: 'pending', source: 'rbc', bucket: 'сво', pubDate: '2026-07-07T10:00:00.000Z' },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    }),
    listChannels: vi.fn().mockResolvedValue([]),
  },
  ApiError: class extends Error {},
}))

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('PostListView', () => {
  it('грузит и показывает карточки', async () => {
    const w = mount(PostListView)
    await new Promise((r) => setTimeout(r, 0))
    await w.vm.$nextTick()
    expect(api.listPosts).toHaveBeenCalled()
    expect(w.text()).toContain('Аа')
  })

  it('клик по строке ведёт на карточку', async () => {
    const w = mount(PostListView)
    await new Promise((r) => setTimeout(r, 0))
    await w.vm.$nextTick()
    await w.get('[data-test="row-1"]').trigger('click')
    expect(push).toHaveBeenCalledWith('/posts/1')
  })
})
