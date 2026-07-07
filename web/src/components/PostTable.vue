<script setup lang="ts">
import type { Post } from '../api/types'

defineProps<{ posts: Post[] }>()
const emit = defineEmits<{ open: [string]; 'hard-delete': [string] }>()

function confirmHardDelete(id: string) {
  if (window.confirm('Удалить карточку из базы безвозвратно?')) emit('hard-delete', id)
}
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
        <th class="p-2"><span class="sr-only">Действия</span></th>
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
        <td class="p-2 text-right">
          <button
            :data-test="`hard-delete-${p.id}`"
            type="button"
            class="rounded px-2 py-1 text-red-400 hover:bg-surface-700"
            title="Удалить карточку из базы безвозвратно"
            @click.stop="confirmHardDelete(p.id)"
          >
            <i class="pi pi-trash" />
          </button>
        </td>
      </tr>
    </tbody>
  </table>
</template>
