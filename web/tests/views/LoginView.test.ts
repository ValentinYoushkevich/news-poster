import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../../src/api/client'
import LoginView from '../../src/views/LoginView.vue'

const push = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ query: {} }),
}))

vi.mock('../../src/api/client', () => ({
  api: {
    login: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
  },
  ApiError: class extends Error {
    constructor(
      public status: number,
      public code: string | undefined,
      message: string,
    ) {
      super(message)
    }
  },
}))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('LoginView', () => {
  it('логинится и уводит на /', async () => {
    ;(api.login as any).mockResolvedValue({ login: 'admin', authRequired: true })
    const w = mount(LoginView)
    await w.get('[data-test="login-user"]').setValue('admin')
    await w.get('[data-test="login-password"]').setValue('pw')
    await w.get('form').trigger('submit')
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/'))
    expect(api.login).toHaveBeenCalledWith('admin', 'pw')
  })

  it('показывает ошибку при 401', async () => {
    ;(api.login as any).mockRejectedValue(new ApiError(401, 'invalid_credentials', 'x'))
    const w = mount(LoginView)
    await w.get('[data-test="login-user"]').setValue('admin')
    await w.get('[data-test="login-password"]').setValue('bad')
    await w.get('form').trigger('submit')
    await vi.waitFor(() =>
      expect(w.get('[data-test="login-error"]').text()).toContain('Неверный логин или пароль'),
    )
    expect(push).not.toHaveBeenCalled()
  })

  it('не зовёт api без логина/пароля', async () => {
    const w = mount(LoginView)
    await w.get('form').trigger('submit')
    expect(api.login).not.toHaveBeenCalled()
    expect(w.get('[data-test="login-error"]').text()).toContain('Введите логин и пароль')
  })
})
