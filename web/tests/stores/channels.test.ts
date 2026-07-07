import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../src/api/client'
import { useChannelsStore } from '../../src/stores/channels'

vi.mock('../../src/api/client', () => ({
  api: {
    listChannels: vi.fn(),
    createChannel: vi.fn(),
  },
  ApiError: class extends Error {},
}))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('channels store', () => {
  it('loadChannels кладёт список', async () => {
    ;(api.listChannels as any).mockResolvedValue([
      { id: '1', name: 'A', mainChatId: '-1', buckets: [], rewritePrompts: {}, schedule: 'x', previewTtl: null, active: true },
    ])
    const store = useChannelsStore()
    await store.loadChannels()
    expect(api.listChannels).toHaveBeenCalled()
    expect(store.channels).toHaveLength(1)
    expect(store.channels[0].id).toBe('1')
  })

  it('createChannel вызывает api и добавляет канал', async () => {
    const created = {
      id: '2',
      name: 'B',
      mainChatId: '-2',
      buckets: ['x'],
      rewritePrompts: {},
      schedule: '*/30 * * * *',
      previewTtl: null,
      active: true,
    }
    ;(api.createChannel as any).mockResolvedValue(created)
    const store = useChannelsStore()
    const body = {
      name: 'B',
      mainChatId: '-2',
      buckets: ['x'],
      rewritePrompts: {},
      schedule: '*/30 * * * *',
    }
    await store.createChannel(body)
    expect(api.createChannel).toHaveBeenCalledWith(body)
    expect(store.channels).toContainEqual(created)
  })
})
