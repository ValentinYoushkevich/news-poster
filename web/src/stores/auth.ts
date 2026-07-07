import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, ApiError } from '../api/client'

export const useAuthStore = defineStore('auth', () => {
  // checked — сходили ли уже на /auth/me (гард роутера делает это один раз)
  const checked = ref(false)
  const authenticated = ref(false)
  const login = ref<string | null>(null)
  const authRequired = ref(true)

  async function check() {
    try {
      const me = await api.me()
      authenticated.value = true
      login.value = me.login
      authRequired.value = me.authRequired
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        authenticated.value = false
        login.value = null
      } else {
        throw e
      }
    } finally {
      checked.value = true
    }
  }

  async function signIn(user: string, password: string) {
    const me = await api.login(user, password)
    authenticated.value = true
    login.value = me.login
    authRequired.value = me.authRequired
    checked.value = true
  }

  async function signOut() {
    await api.logout()
    authenticated.value = false
    login.value = null
  }

  // Сброс при протухшей сессии (401 вне /auth/*): checked остаётся true,
  // чтобы гард не пошёл повторно на /auth/me, а сразу пустил на /login.
  function reset() {
    authenticated.value = false
    login.value = null
  }

  return { checked, authenticated, login, authRequired, check, signIn, signOut, reset }
})
