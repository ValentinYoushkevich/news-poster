import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PostFilters from '../../src/components/PostFilters.vue'
import type { ListFilters } from '../../src/api/types'

function factory(filters: ListFilters = { page: 1 }, buckets: string[] = ['рф-внутр', 'сво']) {
  return mount(PostFilters, { props: { modelValue: filters, buckets } })
}

describe('PostFilters', () => {
  it('рендерит опции статусов', () => {
    const w = factory()
    expect(w.text()).toContain('Статус')
  })

  it('не содержит селектора канала', () => {
    const w = factory()
    expect(w.find('[data-test="channel"]').exists()).toBe(false)
  })

  it('рендерит бакеты из пропа', () => {
    const w = factory()
    const options = w.get('[data-test="bucket"]').findAll('option')
    expect(options.map((o) => o.text())).toEqual(['— любой —', 'рф-внутр', 'сво'])
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

  it('выбор бакета эмитит update:modelValue со сбросом страницы', async () => {
    const w = factory({ page: 3 })
    await w.get('[data-test="bucket"]').setValue('сво')
    const events = w.emitted('update:modelValue') as ListFilters[][]
    expect(events.at(-1)?.[0].bucket).toBe('сво')
    expect(events.at(-1)?.[0].page).toBe(1)
  })
})
