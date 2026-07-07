<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError } from '../api/client'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const login = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  if (!login.value.trim() || !password.value) {
    error.value = 'Введите логин и пароль'
    return
  }
  error.value = ''
  busy.value = true
  try {
    await auth.signIn(login.value.trim(), password.value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.push(redirect)
  } catch (e) {
    error.value =
      e instanceof ApiError && e.status === 401 ? 'Неверный логин или пароль' : 'Ошибка входа, попробуйте ещё раз'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex min-h-[70vh] items-center justify-center">
    <form
      class="flex w-full max-w-sm flex-col gap-4 rounded border border-surface-700 bg-surface-900 p-6"
      @submit.prevent="submit"
    >
      <h1 class="text-lg font-semibold">Вход в админку</h1>

      <label class="flex flex-col text-sm">
        <span>Логин</span>
        <input
          data-test="login-user"
          v-model="login"
          autocomplete="username"
          class="rounded border border-surface-700 bg-surface-950 px-2 py-1 text-surface-0"
        />
      </label>

      <label class="flex flex-col text-sm">
        <span>Пароль</span>
        <input
          data-test="login-password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          class="rounded border border-surface-700 bg-surface-950 px-2 py-1 text-surface-0"
        />
      </label>

      <p v-if="error" data-test="login-error" class="text-sm text-red-400">{{ error }}</p>

      <button
        type="submit"
        data-test="login-submit"
        :disabled="busy"
        class="rounded bg-primary-500 px-4 py-2 text-white disabled:opacity-60"
      >
        Войти
      </button>
    </form>
  </div>
</template>
