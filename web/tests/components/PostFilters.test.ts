import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PostFilters from '../../src/components/PostFilters.vue'
import type { Channel, ListFilters } from '../../src/api/types'

const channels: Channel[] = [
  { id: '1', name: 'Новости', mainChatId: '-1', buckets: ['рф-внутр', 'сво'], schedule: 'x', active: true },
]

function factory(filters: ListFilters = { page: 1 }) {
  return mount(PostFilters, { props: { modelValue: filters, channels } })
}

describe('PostFilters', () => {
  it('рендерит опции статусов', () => {
    const w = factory()
    expect(w.text()).toContain('Статус')
  })

  it('эмитит apply по кнопке', async () => {
    const w = factory()
    await w.get('[data-test="apply"]').trigger('click')
    expect(w.emitted('apply')).toBeTruthy()
  })

  it('меняет статус и эмитит update:modelValue', async () => {
    const w = factory()
    const select = w.get('[data-test="status"]')
    await select.setValue('pending')
    const events = w.emitted('update:modelValue') as ListFilters[][]
    expect(events.at(-1)?.[0].status).toBe('pending')
  })
})
