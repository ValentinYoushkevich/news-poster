import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ApprovalActions from '../../src/components/ApprovalActions.vue'
import type { Post } from '../../src/api/types'

function w(status: Post['status']) {
  return mount(ApprovalActions, { props: { status } })
}

describe('ApprovalActions', () => {
  it('для pending есть approve, нет unapprove', () => {
    const c = w('pending')
    expect(c.find('[data-test="approve"]').exists()).toBe(true)
    expect(c.find('[data-test="unapprove"]').exists()).toBe(false)
  })

  it('для ready_to_publish есть unapprove, нет approve', () => {
    const c = w('ready_to_publish')
    expect(c.find('[data-test="unapprove"]').exists()).toBe(true)
    expect(c.find('[data-test="approve"]').exists()).toBe(false)
  })

  it('pending: доступны и rewrite, и delete', () => {
    const c = w('pending')
    expect(c.find('[data-test="rewrite"]').exists()).toBe(true)
    expect(c.find('[data-test="delete"]').exists()).toBe(true)
  })

  it('failed: доступен rewrite, но не delete', () => {
    const c = w('failed')
    expect(c.find('[data-test="rewrite"]').exists()).toBe(true)
    expect(c.find('[data-test="delete"]').exists()).toBe(false)
  })

  it('ready_to_publish: доступен delete, но не rewrite', () => {
    const c = w('ready_to_publish')
    expect(c.find('[data-test="delete"]').exists()).toBe(true)
    expect(c.find('[data-test="rewrite"]').exists()).toBe(false)
  })

  it('processing: доступен delete, но не rewrite', () => {
    const c = w('processing')
    expect(c.find('[data-test="delete"]').exists()).toBe(true)
    expect(c.find('[data-test="rewrite"]').exists()).toBe(false)
  })

  it('published: кнопок нет', () => {
    const c = w('published')
    expect(c.findAll('button')).toHaveLength(0)
  })

  it('rejected: кнопок нет', () => {
    const c = w('rejected')
    expect(c.findAll('button')).toHaveLength(0)
  })

  it('эмитит события кнопок', async () => {
    const c = w('pending')
    await c.get('[data-test="approve"]').trigger('click')
    await c.get('[data-test="rewrite"]').trigger('click')
    await c.get('[data-test="delete"]').trigger('click')
    expect(c.emitted('approve')).toBeTruthy()
    expect(c.emitted('rewrite')).toBeTruthy()
    expect(c.emitted('delete')).toBeTruthy()
  })
})
