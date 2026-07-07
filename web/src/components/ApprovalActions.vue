<script setup lang="ts">
import { computed } from 'vue'
import type { PostStatus } from '../api/types'

const props = defineProps<{ status: PostStatus; bucket: string | null }>()
const emit = defineEmits<{ approve: []; unapprove: []; delete: []; rewrite: []; classify: [] }>()

// Зеркало карты переходов бэкенда (src/status.ts):
// удалить = переход в rejected; классификация и рерайт разрешены только из pending|failed.
// Рерайт требует выставленного бакета (иначе бэкенд ответит 409 rewrite_no_bucket),
// поэтому без бакета показываем «Классифицировать», с бакетом — «На рерайт».
const DELETABLE = new Set<PostStatus>(['processing', 'pending', 'ready_to_publish'])
const AI_ACTIONABLE = new Set<PostStatus>(['pending', 'failed'])

const canDelete = computed(() => DELETABLE.has(props.status))
const canClassify = computed(() => AI_ACTIONABLE.has(props.status) && !props.bucket)
const canRewrite = computed(() => AI_ACTIONABLE.has(props.status) && !!props.bucket)
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
    <button
      v-if="canClassify"
      data-test="classify"
      class="rounded border border-surface-700 px-3 py-1 hover:bg-surface-800"
      @click="emit('classify')"
    >
      Классифицировать
    </button>
    <button
      v-if="canRewrite"
      data-test="rewrite"
      class="rounded border border-surface-700 px-3 py-1 hover:bg-surface-800"
      @click="emit('rewrite')"
    >
      На рерайт
    </button>
    <button
      v-if="canDelete"
      data-test="delete"
      class="rounded bg-red-600 px-3 py-1 text-white"
      @click="emit('delete')"
    >
      Удалить
    </button>
  </div>
</template>
