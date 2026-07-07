<script setup lang="ts">
import { computed } from 'vue'
import type { Channel, ListFilters } from '../api/types'

const props = withDefaults(
  defineProps<{ modelValue: ListFilters; channels: Channel[]; hideChannel?: boolean }>(),
  { hideChannel: false },
)
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

const buckets = computed(() => {
  const ch = props.channels.find((c) => c.id === props.modelValue.channelId)
  return ch?.buckets ?? []
})

function patch(part: Partial<ListFilters>) {
  emit('update:modelValue', { ...props.modelValue, ...part, page: 1 })
}
</script>

<template>
  <div class="flex flex-wrap items-end gap-3 rounded border border-surface-700 bg-surface-900 p-3">
    <label v-if="!props.hideChannel" class="flex flex-col text-sm">
      <span>Канал</span>
      <select
        data-test="channel"
        class="rounded border border-surface-700 bg-surface-900 px-2 py-1 text-surface-0"
        :value="modelValue.channelId ?? ''"
        @change="patch({ channelId: ($event.target as HTMLSelectElement).value || undefined, bucket: undefined })"
      >
        <option value="">— все —</option>
        <option v-for="c in channels" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
    </label>

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
