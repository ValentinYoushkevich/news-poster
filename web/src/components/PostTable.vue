<script setup lang="ts">
import type { Post } from '../api/types'

defineProps<{ posts: Post[] }>()
const emit = defineEmits<{ open: [string] }>()
</script>

<template>
  <table class="w-full border-collapse text-sm">
    <thead>
      <tr class="border-b border-surface-700 text-left">
        <th class="p-2">Заголовок</th>
        <th class="p-2">Статус</th>
        <th class="p-2">Бакет</th>
        <th class="p-2">Источник</th>
        <th class="p-2">Дата</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="p in posts"
        :key="p.id"
        :data-test="`row-${p.id}`"
        class="cursor-pointer border-b border-surface-800 hover:bg-surface-800"
        @click="emit('open', p.id)"
      >
        <td class="p-2">{{ p.finalTitle || p.origTitle }}</td>
        <td class="p-2">{{ p.status }}</td>
        <td class="p-2">{{ p.bucket ?? '—' }}</td>
        <td class="p-2">{{ p.source }}</td>
        <td class="p-2">{{ new Date(p.pubDate).toLocaleString('ru') }}</td>
      </tr>
    </tbody>
  </table>
</template>
