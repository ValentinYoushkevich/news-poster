<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { Post } from '../api/types'

const props = defineProps<{ post: Post; buckets: string[] }>()
const emit = defineEmits<{ save: [{ finalTitle: string; finalText: string; bucket: string }] }>()

const form = reactive({
  finalTitle: props.post.finalTitle ?? props.post.rewrittenTitle ?? props.post.origTitle,
  finalText: props.post.finalText ?? props.post.rewrittenText ?? props.post.origText,
  bucket: props.post.bucket ?? '',
})

watch(
  () => props.post.id,
  () => {
    form.finalTitle = props.post.finalTitle ?? props.post.rewrittenTitle ?? props.post.origTitle
    form.finalText = props.post.finalText ?? props.post.rewrittenText ?? props.post.origText
    form.bucket = props.post.bucket ?? ''
  },
)
</script>

<template>
  <div class="flex flex-col gap-3">
    <label class="flex flex-col text-sm">
      <span>Заголовок</span>
      <input data-test="finalTitle" v-model="form.finalTitle" class="rounded border px-2 py-1" />
    </label>
    <label class="flex flex-col text-sm">
      <span>Текст</span>
      <textarea data-test="finalText" v-model="form.finalText" rows="8" class="rounded border px-2 py-1" />
    </label>
    <label class="flex flex-col text-sm">
      <span>Бакет</span>
      <select data-test="bucket" v-model="form.bucket" class="rounded border px-2 py-1">
        <option value="">— не задан —</option>
        <option v-for="b in buckets" :key="b" :value="b">{{ b }}</option>
      </select>
    </label>

    <details class="text-sm text-surface-500">
      <summary>Оригинал</summary>
      <p class="font-medium">{{ post.origTitle }}</p>
      <p class="whitespace-pre-wrap">{{ post.origText }}</p>
    </details>

    <button
      data-test="save"
      class="self-start rounded bg-primary-500 px-3 py-1 text-white"
      @click="emit('save', { ...form })"
    >
      Сохранить
    </button>
  </div>
</template>
