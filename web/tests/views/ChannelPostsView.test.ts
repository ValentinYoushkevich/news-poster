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
    hardDelete: vi.fn().mockResolvedValue(undefined),
  },
  ApiError: class extends Error {},
}))

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
const toastAdd = vi.fn()
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: toastAdd }) }))

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

  it('корзина в таблице: confirm → hardDelete, тост «Карточка удалена», без перехода', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const w = mount(ChannelPostsView, { props: { channelId: 'c1' } })
    await new Promise((r) => setTimeout(r, 0))
    await w.vm.$nextTick()

    await w.get('[data-test="hard-delete-1"]').trigger('click')
    await new Promise((r) => setTimeout(r, 0))

    expect(confirm).toHaveBeenCalledWith('Удалить карточку из базы безвозвратно?')
    expect(api.hardDelete).toHaveBeenCalledWith('1')
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success', summary: 'Карточка удалена' }),
    )
    expect(push).not.toHaveBeenCalled()

    const posts = usePostsStore()
    expect(posts.list.items).toHaveLength(0)
    confirm.mockRestore()
  })

  it('при входе сбрасывает фильтры другого канала к дефолту', async () => {
    const posts = usePostsStore()
    posts.filters.channelId = 'c0'
    posts.filters.status = 'published'
    posts.filters.bucket = 'старый'
    posts.filters.source = 'rbc'
    posts.filters.date = '2026-01-01'
    posts.filters.page = 5

    mount(ChannelPostsView, { props: { channelId: 'c1' } })
    await new Promise((r) => setTimeout(r, 0))

    expect(posts.filters).toMatchObject({
      channelId: 'c1',
      status: undefined,
      bucket: undefined,
      source: undefined,
      date: undefined,
      page: 1,
    })
    expect(api.listPosts).toHaveBeenLastCalledWith(
      expect.objectContaining({ channelId: 'c1', page: 1 }),
    )
  })

  it('переход канал→канал (смена пропа) тоже сбрасывает фильтры', async () => {
    const w = mount(ChannelPostsView, { props: { channelId: 'c1' } })
    await new Promise((r) => setTimeout(r, 0))
    const posts = usePostsStore()
    posts.filters.status = 'pending'
    posts.filters.bucket = 'сво'
    posts.filters.page = 3

    await w.setProps({ channelId: 'c2' })
    await new Promise((r) => setTimeout(r, 0))

    expect(posts.filters).toMatchObject({
      channelId: 'c2',
      status: undefined,
      bucket: undefined,
      page: 1,
    })
    expect(api.listPosts).toHaveBeenLastCalledWith(
      expect.objectContaining({ channelId: 'c2', page: 1 }),
    )
  })
})
