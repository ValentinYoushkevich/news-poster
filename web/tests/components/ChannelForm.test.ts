import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ChannelForm from '../../src/components/ChannelForm.vue'
import type { Channel } from '../../src/api/types'

const existing: Channel = {
  id: 'c1',
  name: 'Новости',
  mainChatId: '-100',
  buckets: ['сво', 'рф'],
  rewritePrompts: { сво: 'кратко' },
  schedule: '0 * * * *',
  previewTtl: 1440,
  active: true,
}

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

  it('режим редактирования: предзаполняет поля из channel', () => {
    const w = mount(ChannelForm, { props: { channel: existing } })
    expect((w.get('[data-test="ch-name"]').element as HTMLInputElement).value).toBe('Новости')
    expect((w.get('[data-test="ch-mainChatId"]').element as HTMLInputElement).value).toBe('-100')
    expect((w.get('[data-test="bucket-name-0"]').element as HTMLInputElement).value).toBe('сво')
    expect((w.get('[data-test="bucket-prompt-0"]').element as HTMLInputElement).value).toBe('кратко')
    expect((w.get('[data-test="bucket-name-1"]').element as HTMLInputElement).value).toBe('рф')
    expect((w.get('[data-test="ch-previewTtl"]').element as HTMLInputElement).value).toBe('1440')
    expect((w.get('[data-test="ch-schedule"]').element as HTMLSelectElement).value).toBe('0 * * * *')
    expect((w.get('[data-test="ch-active"]').element as HTMLInputElement).checked).toBe(true)
  })

  it('режим редактирования: эмитит update с id и payload', async () => {
    const w = mount(ChannelForm, { props: { channel: existing } })
    await w.get('[data-test="ch-name"]').setValue('Новости 2')
    await w.get('[data-test="ch-active"]').setValue(false)
    await w.get('[data-test="channel-submit"]').trigger('click')

    const events = w.emitted('update') as any[][]
    expect(events).toBeTruthy()
    expect(events[0][0]).toBe('c1')
    expect(events[0][1]).toEqual({
      name: 'Новости 2',
      mainChatId: '-100',
      buckets: ['сво', 'рф'],
      rewritePrompts: { сво: 'кратко' },
      schedule: '0 * * * *',
      previewTtl: 1440,
      active: false,
    })
    expect(w.emitted('create')).toBeFalsy()
  })

  it('режим редактирования: пустой TTL шлёт previewTtl: null', async () => {
    const w = mount(ChannelForm, { props: { channel: existing } })
    await w.get('[data-test="ch-previewTtl"]').setValue('')
    await w.get('[data-test="channel-submit"]').trigger('click')
    const payload = (w.emitted('update') as any[][])[0][1]
    expect(payload.previewTtl).toBeNull()
  })

  it('режим редактирования: кнопка отмены эмитит cancel', async () => {
    const w = mount(ChannelForm, { props: { channel: existing } })
    await w.get('[data-test="channel-cancel"]').trigger('click')
    expect(w.emitted('cancel')).toBeTruthy()
  })

  it('режим создания: чекбокса active и кнопки отмены нет', () => {
    const w = mount(ChannelForm)
    expect(w.find('[data-test="ch-active"]').exists()).toBe(false)
    expect(w.find('[data-test="channel-cancel"]').exists()).toBe(false)
  })
})
