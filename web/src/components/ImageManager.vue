<script setup lang="ts">
import { ref } from 'vue'
import type { ImageCandidate } from '../api/types'

defineProps<{ images: ImageCandidate[] }>()
const emit = defineEmits<{ add: [string]; select: [string | null] }>()

const newUrl = ref('')

function add() {
  if (!newUrl.value.trim()) return
  emit('add', newUrl.value.trim())
  newUrl.value = ''
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div v-if="!images.length" class="text-sm text-surface-400">Картинок нет — пост текстовый.</div>

    <div class="flex flex-wrap gap-3">
      <figure
        v-for="img in images"
        :key="img.url"
        class="w-40 rounded border p-1"
        :class="img.chosen ? 'border-primary-500 ring-2 ring-primary-300' : 'border-surface-700'"
      >
        <img :src="img.url" :alt="img.origin" class="h-24 w-full object-cover" />
        <figcaption class="mt-1 flex items-center justify-between text-xs">
          <span>{{ img.origin }}</span>
          <button
            :data-test="`select-${img.url}`"
            class="rounded bg-primary-500 px-2 py-0.5 text-white disabled:opacity-40"
            :disabled="img.chosen"
            @click="emit('select', img.url)"
          >
            {{ img.chosen ? 'выбрана' : 'выбрать' }}
          </button>
        </figcaption>
      </figure>
    </div>

    <div class="flex items-center gap-2">
      <input
        data-test="img-url"
        v-model="newUrl"
        placeholder="URL картинки"
        class="flex-1 rounded border border-surface-700 bg-surface-900 px-2 py-1 text-sm text-surface-0"
      />
      <button data-test="img-add" class="rounded border border-surface-700 px-3 py-1 text-sm hover:bg-surface-800" @click="add">Добавить</button>
      <button
        v-if="images.some((i) => i.chosen)"
        data-test="clear"
        class="rounded border border-surface-700 px-3 py-1 text-sm hover:bg-surface-800"
        @click="emit('select', null)"
      >
        Убрать картинку
      </button>
    </div>
  </div>
</template>
