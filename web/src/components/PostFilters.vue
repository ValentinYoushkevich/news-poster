<script setup lang="ts">
import type { ListFilters } from '../api/types'

// buckets — рубрики текущего канала (фильтры всегда показываются внутри канала).
const props = defineProps<{ modelValue: ListFilters; buckets: string[] }>()
const emit = defineEmits<{
  'update:modelValue': [ListFilters]
  apply: []
}>()

const STATUSES = [
  'ingested',
  'processing',
  'pending',
  'ready_to_publish',
  'published',
  'rejected',
  'failed',
]

function patch(part: Partial<ListFilters>) {
  emit('update:modelValue', { ...props.modelValue, ...part, page: 1 })
}
</script>

<template>
  <div class="flex flex-wrap items-end gap-3 rounded border border-surface-700 bg-surface-900 p-3">
    <label class="flex flex-col text-sm">
      <span>Статус</span>
      <select
        data-test="status"
        class="rounded border border-surface-700 bg-surface-900 px-2 py-1 text-surface-0"
        :value="modelValue.status ?? ''"
        @change="patch({ status: ($event.target as HTMLSelectElement).value || undefined })"
      >
        <option value="">— любой —</option>
        <option v-for="s in STATUSES" :key="s" :value="s">{{ s }}</option>
      </select>
    </label>

    <label class="flex flex-col text-sm">
      <span>Бакет</span>
      <select
        data-test="bucket"
        class="rounded border border-surface-700 bg-surface-900 px-2 py-1 text-surface-0"
        :value="modelValue.bucket ?? ''"
        @change="patch({ bucket: ($event.target as HTMLSelectElement).value || undefined })"
      >
        <option value="">— любой —</option>
        <option v-for="b in buckets" :key="b" :value="b">{{ b }}</option>
      </select>
    </label>

    <label class="flex flex-col text-sm">
      <span>Источник</span>
      <input
        data-test="source"
        class="rounded border border-surface-700 bg-surface-900 px-2 py-1 text-surface-0"
        :value="modelValue.source ?? ''"
        @input="patch({ source: ($event.target as HTMLInputElement).value || undefined })"
      />
    </label>

    <label class="flex flex-col text-sm">
      <span>Дата</span>
      <input
        type="date"
        data-test="date"
        class="rounded border border-surface-700 bg-surface-900 px-2 py-1 text-surface-0"
        :value="modelValue.date ?? ''"
        @change="patch({ date: ($event.target as HTMLInputElement).value || undefined })"
      />
    </label>

    <button data-test="apply" class="rounded bg-primary-500 px-3 py-1 text-white" @click="emit('apply')">
      Применить
    </button>
  </div>
</template>
