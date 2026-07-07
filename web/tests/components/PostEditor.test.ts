import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PostEditor from '../../src/components/PostEditor.vue'
import type { Post } from '../../src/api/types'

const post = {
  id: '1',
  origTitle: 'Ориг',
  origText: 'Ориг тело',
  finalTitle: 'Фин',
  finalText: 'Фин тело',
  bucket: 'сво',
  status: 'pending',
} as Post

describe('PostEditor', () => {
  it('показывает поля и эмитит save с изменёнными значениями', async () => {
    const w = mount(PostEditor, { props: { post, buckets: ['сво', 'рф-внутр'] } })
    await w.get('[data-test="finalTitle"]').setValue('Новый заголовок')
    await w.get('[data-test="save"]').trigger('click')
    const saved = w.emitted('save') as Array<[Record<string, string>]>
    expect(saved[0][0]).toMatchObject({ finalTitle: 'Новый заголовок', finalText: 'Фин тело', bucket: 'сво' })
  })
})
