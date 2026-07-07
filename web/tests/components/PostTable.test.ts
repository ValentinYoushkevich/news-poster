import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PostTable from '../../src/components/PostTable.vue'
import type { Post } from '../../src/api/types'

const post = {
  id: '1',
  origTitle: 'A',
  finalTitle: 'Аа',
  status: 'pending',
  source: 'rbc',
  bucket: 'сво',
  pubDate: '2026-07-07T10:00:00.000Z',
} as unknown as Post

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PostTable', () => {
  it('клик по строке эмитит open', async () => {
    const w = mount(PostTable, { props: { posts: [post] } })
    await w.get('[data-test="row-1"]').trigger('click')
    expect(w.emitted('open')).toEqual([['1']])
  })

  it('рисует кнопку-корзину с иконкой pi-trash', () => {
    const w = mount(PostTable, { props: { posts: [post] } })
    const btn = w.get('[data-test="hard-delete-1"]')
    expect(btn.find('i.pi.pi-trash').exists()).toBe(true)
  })

  it('клик по корзине с подтверждением эмитит hard-delete и НЕ эмитит open', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const w = mount(PostTable, { props: { posts: [post] } })
    await w.get('[data-test="hard-delete-1"]').trigger('click')
    expect(confirm).toHaveBeenCalledWith('Удалить карточку из базы безвозвратно?')
    expect(w.emitted('hard-delete')).toEqual([['1']])
    expect(w.emitted('open')).toBeUndefined()
  })

  it('отказ в confirm — ничего не эмитит', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const w = mount(PostTable, { props: { posts: [post] } })
    await w.get('[data-test="hard-delete-1"]').trigger('click')
    expect(w.emitted('hard-delete')).toBeUndefined()
    expect(w.emitted('open')).toBeUndefined()
  })
})
