import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ChannelCard from '../../src/components/ChannelCard.vue'
import type { Channel } from '../../src/api/types'

const channel: Channel = {
  id: 'c1',
  name: 'Новости',
  mainChatId: '-100',
  buckets: ['сво', 'рф'],
  rewritePrompts: {},
  schedule: '*/30 * * * *',
  previewTtl: null,
  active: true,
}

describe('ChannelCard', () => {
  it('показывает данные канала', () => {
    const w = mount(ChannelCard, { props: { channel } })
    expect(w.text()).toContain('Новости')
    expect(w.text()).toContain('-100')
  })

  it('эмитит open с id по клику', async () => {
    const w = mount(ChannelCard, { props: { channel } })
    await w.get('[data-test="channel-card-c1"]').trigger('click')
    expect(w.emitted('open')?.[0]).toEqual(['c1'])
  })

  it('кнопка редактирования эмитит edit и не эмитит open', async () => {
    const w = mount(ChannelCard, { props: { channel } })
    await w.get('[data-test="channel-edit-c1"]').trigger('click')
    expect(w.emitted('edit')?.[0]).toEqual([channel])
    expect(w.emitted('open')).toBeFalsy()
  })

  it('тумблер эмитит toggle-active с инверсией и не эмитит open', async () => {
    const w = mount(ChannelCard, { props: { channel } })
    await w.get('[data-test="channel-toggle-c1"]').trigger('click')
    expect(w.emitted('toggle-active')?.[0]).toEqual(['c1', false])
    expect(w.emitted('open')).toBeFalsy()
  })

  it('тумблер выключенного канала эмитит включение', async () => {
    const w = mount(ChannelCard, { props: { channel: { ...channel, active: false } } })
    await w.get('[data-test="channel-toggle-c1"]').trigger('click')
    expect(w.emitted('toggle-active')?.[0]).toEqual(['c1', true])
  })
})
