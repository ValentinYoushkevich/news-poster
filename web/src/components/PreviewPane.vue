<script setup lang="ts">
import { computed } from 'vue'
import type { Post } from '../api/types'

const props = defineProps<{ post: Post }>()
const chosen = computed(() => props.post.images.find((i) => i.chosen) ?? null)
</script>

<template>
  <div class="rounded border border-surface-200 p-3">
    <p class="mb-2 text-xs uppercase text-surface-500">Превью · {{ post.status }}</p>
    <img v-if="chosen" :src="chosen.url" alt="preview" class="mb-2 max-h-64 rounded object-contain" />
    <p class="font-semibold">{{ post.finalTitle || post.origTitle }}</p>
    <p class="whitespace-pre-wrap text-sm">{{ post.finalText || post.origText }}</p>
    <p v-if="post.aiError" class="mt-2 text-sm text-red-600">Ошибка ИИ: {{ post.aiError }}</p>
  </div>
</template>
