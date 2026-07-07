import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../src/api/client'
import ChannelPostsView from '../../src/views/ChannelPostsView.vue'
import { usePostsStore } from '../../src/stores/posts'

vi.mock('../../src/api/client', () => ({
  api: {
    listChannels: vi.fn().mockResolvedValue([
      {
        id: 'c1',
        name: 'Новости',
        mainChatId: '-100',
        buckets: ['сво'],
        rewritePrompts: {},
        schedule: '*/30 * * * *',
        previewTtl: null,
        active: true,
      },
    ]),
    listPosts: vi.fn().mockResolvedValue({
      items: [
        {
          id: '1',
          origTitle: 'A',
          finalTitle: 'Аа',
          status: 'pending',
          source: 'rbc',
          bucket: 'сво',
          pubDate: '2026-07-07T10:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    }),
  },
  ApiError: class extends Error {},
}))

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('ChannelPostsView', () => {
  it('выставляет channelId в фильтры и грузит посты', async () => {
    const w = mount(ChannelPostsView, { props: { channelId: 'c1' } })
    await new Promise((r) => setTimeout(r, 0))
    await w.vm.$nextTick()
    const posts = usePostsStore()
    expect(posts.filters.channelId).toBe('c1')
    expect(api.listPosts).toHaveBeenCalledWith(expect.objectContaining({ channelId: 'c1', page: 1 }))
    expect(w.text()).toContain('Аа')
    expect(w.text()).toContain('Новости')
  })

  it('скрывает селектор канала в фильтрах', async () => {
    const w = mount(ChannelPostsView, { props: { channelId: 'c1' } })
    await new Promise((r) => setTimeout(r, 0))
    await w.vm.$nextTick()
    expect(w.find('[data-test="channel"]').exists()).toBe(false)
  })

  it('клик по посту ведёт на карточку поста', async () => {
    const w = mount(ChannelPostsView, { props: { channelId: 'c1' } })
    await new Promise((r) => setTimeout(r, 0))
    await w.vm.$nextTick()
    await w.get('[data-test="row-1"]').trigger('click')
    expect(push).toHaveBeenCalledWith('/posts/1')
  })
})
