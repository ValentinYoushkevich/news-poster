import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../../src/api/client'
import { useAuthStore } from '../../src/stores/auth'

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

describe('auth store', () => {
  it('check: 200 от /me -> authenticated', async () => {
    ;(api.me as any).mockResolvedValue({ login: 'admin', authRequired: true })
    const store = useAuthStore()
    await store.check()
    expect(store.checked).toBe(true)
    expect(store.authenticated).toBe(true)
    expect(store.login).toBe('admin')
  })

  it('check: 401 -> не authenticated, но checked', async () => {
    ;(api.me as any).mockRejectedValue(new ApiError(401, 'unauthorized', 'unauthorized'))
    const store = useAuthStore()
    await store.check()
    expect(store.checked).toBe(true)
    expect(store.authenticated).toBe(false)
  })

  it('check: authRequired=false (auth выключен) -> пускаем', async () => {
    ;(api.me as any).mockResolvedValue({ login: null, authRequired: false })
    const store = useAuthStore()
    await store.check()
    expect(store.authenticated).toBe(true)
    expect(store.authRequired).toBe(false)
  })

  it('signIn: успех -> authenticated', async () => {
    ;(api.login as any).mockResolvedValue({ login: 'admin', authRequired: true })
    const store = useAuthStore()
    await store.signIn('admin', 'pw')
    expect(api.login).toHaveBeenCalledWith('admin', 'pw')
    expect(store.authenticated).toBe(true)
  })

  it('signIn: 401 пробрасывается, состояние не меняется', async () => {
    ;(api.login as any).mockRejectedValue(new ApiError(401, 'invalid_credentials', 'x'))
    const store = useAuthStore()
    await expect(store.signIn('admin', 'bad')).rejects.toThrow()
    expect(store.authenticated).toBe(false)
  })

  it('reset: снимает аутентификацию, checked остаётся true', async () => {
    ;(api.login as any).mockResolvedValue({ login: 'admin', authRequired: true })
    const store = useAuthStore()
    await store.signIn('admin', 'pw')
    store.reset()
    expect(store.authenticated).toBe(false)
    expect(store.login).toBeNull()
    expect(store.checked).toBe(true)
  })

  it('signOut: сбрасывает состояние', async () => {
    ;(api.login as any).mockResolvedValue({ login: 'admin', authRequired: true })
    ;(api.logout as any).mockResolvedValue(undefined)
    const store = useAuthStore()
    await store.signIn('admin', 'pw')
    await store.signOut()
    expect(api.logout).toHaveBeenCalled()
    expect(store.authenticated).toBe(false)
    expect(store.login).toBeNull()
  })
})
