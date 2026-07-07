import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ImageManager from '../../src/components/ImageManager.vue'
import type { ImageCandidate } from '../../src/api/types'

const images: ImageCandidate[] = [
  { url: 'https://a/1.jpg', type: null, origin: 'enclosure', fileId: null, chosen: true },
  { url: 'https://a/2.jpg', type: null, origin: 'content', fileId: null, chosen: false },
]

describe('ImageManager', () => {
  it('эмитит add с введённым url', async () => {
    const w = mount(ImageManager, { props: { images: [] } })
    await w.get('[data-test="img-url"]').setValue('https://new/x.jpg')
    await w.get('[data-test="img-add"]').trigger('click')
    expect((w.emitted('add') as Array<[string]>)[0][0]).toBe('https://new/x.jpg')
  })

  it('эмитит select с url картинки', async () => {
    const w = mount(ImageManager, { props: { images } })
    await w.get('[data-test="select-https://a/2.jpg"]').trigger('click')
    expect((w.emitted('select') as Array<[string | null]>)[0][0]).toBe('https://a/2.jpg')
  })

  it('эмитит select(null) по «убрать картинку»', async () => {
    const w = mount(ImageManager, { props: { images } })
    await w.get('[data-test="clear"]').trigger('click')
    expect((w.emitted('select') as Array<[string | null]>)[0][0]).toBeNull()
  })
})
