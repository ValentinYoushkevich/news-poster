<script setup lang="ts">
import Toast from 'primevue/toast'
import { useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth'

const auth = useAuthStore()
const router = useRouter()

async function logout() {
  await auth.signOut()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="min-h-screen bg-surface-950 text-surface-0">
    <header class="flex items-center justify-between border-b border-surface-700 px-6 py-3">
      <router-link to="/" class="text-lg font-semibold">news-poster · админка</router-link>
      <button
        v-if="auth.authenticated && auth.authRequired"
        data-test="logout"
        class="rounded px-3 py-1 text-sm hover:bg-surface-800"
        @click="logout"
      >
        выйти ({{ auth.login }})
      </button>
    </header>
    <main class="p-6">
      <router-view />
    </main>
    <Toast />
  </div>
</template>
