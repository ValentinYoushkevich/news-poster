import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../src/api/client'
import ChannelsHomeView from '../../src/views/ChannelsHomeView.vue'

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
    createChannel: vi.fn(),
  },
  ApiError: class extends Error {},
}))

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('ChannelsHomeView', () => {
  it('рендерит форму и карточки из стора', async () => {
    const w = mount(ChannelsHomeView)
    await new Promise((r) => setTimeout(r, 0))
    await w.vm.$nextTick()
    expect(api.listChannels).toHaveBeenCalled()
    expect(w.find('[data-test="channel-submit"]').exists()).toBe(true)
    expect(w.find('[data-test="channel-card-c1"]').exists()).toBe(true)
    expect(w.text()).toContain('Новости')
  })

  it('клик по карточке ведёт на посты канала', async () => {
    const w = mount(ChannelsHomeView)
    await new Promise((r) => setTimeout(r, 0))
    await w.vm.$nextTick()
    await w.get('[data-test="channel-card-c1"]').trigger('click')
    expect(push).toHaveBeenCalledWith('/channels/c1')
  })
})
