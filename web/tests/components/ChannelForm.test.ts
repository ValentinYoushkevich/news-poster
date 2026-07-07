import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ChannelForm from '../../src/components/ChannelForm.vue'

describe('ChannelForm', () => {
  it('эмитит create с корректным payload', async () => {
    const w = mount(ChannelForm)
    await w.get('[data-test="ch-name"]').setValue('Новости')
    await w.get('[data-test="ch-mainChatId"]').setValue('-100')
    await w.get('[data-test="add-bucket"]').trigger('click')
    await w.get('[data-test="bucket-name-0"]').setValue('сво')
    await w.get('[data-test="channel-submit"]').trigger('click')

    const events = w.emitted('create') as any[][]
    expect(events).toBeTruthy()
    const payload = events[0][0]
    expect(payload).toEqual({
      name: 'Новости',
      mainChatId: '-100',
      buckets: ['сво'],
      rewritePrompts: {},
      schedule: '*/30 * * * *',
    })
  })

  it('кладёт rewritePrompts для бакетов с промптом', async () => {
    const w = mount(ChannelForm)
    await w.get('[data-test="ch-name"]').setValue('N')
    await w.get('[data-test="ch-mainChatId"]').setValue('-1')
    await w.get('[data-test="add-bucket"]').trigger('click')
    await w.get('[data-test="bucket-name-0"]').setValue('b1')
    await w.get('[data-test="bucket-prompt-0"]').setValue('перепиши')
    await w.get('[data-test="channel-submit"]').trigger('click')

    const payload = (w.emitted('create') as any[][])[0][0]
    expect(payload.buckets).toEqual(['b1'])
    expect(payload.rewritePrompts).toEqual({ b1: 'перепиши' })
  })

  it('не сабмитит без имени/чата/бакетов', async () => {
    const w = mount(ChannelForm)
    await w.get('[data-test="channel-submit"]').trigger('click')
    expect(w.emitted('create')).toBeFalsy()
  })
})
