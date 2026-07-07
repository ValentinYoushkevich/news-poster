<script setup lang="ts">
import Toast from 'primevue/toast'
</script>

<template>
  <div class="min-h-screen bg-surface-950 text-surface-0">
    <header class="border-b border-surface-700 px-6 py-3">
      <router-link to="/" class="text-lg font-semibold">news-poster · админка</router-link>
    </header>
    <main class="p-6">
      <router-view />
    </main>
    <Toast />
  </div>
</template>
