<script setup lang="ts">
import type { PostStatus } from '../api/types'

defineProps<{ status: PostStatus }>()
const emit = defineEmits<{ approve: []; unapprove: []; delete: []; rewrite: [] }>()
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <button
      v-if="status === 'pending'"
      data-test="approve"
      class="rounded bg-green-600 px-3 py-1 text-white"
      @click="emit('approve')"
    >
      Заапрувить
    </button>
    <button
      v-if="status === 'ready_to_publish'"
      data-test="unapprove"
      class="rounded bg-amber-600 px-3 py-1 text-white"
      @click="emit('unapprove')"
    >
      Отменить аппрув
    </button>
    <button data-test="rewrite" class="rounded border border-surface-700 px-3 py-1 hover:bg-surface-800" @click="emit('rewrite')">
      Пере-рерайт
    </button>
    <button data-test="delete" class="rounded bg-red-600 px-3 py-1 text-white" @click="emit('delete')">
      Удалить
    </button>
  </div>
</template>
