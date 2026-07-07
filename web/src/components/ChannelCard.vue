<script setup lang="ts">
import type { Channel } from '../api/types'

const props = defineProps<{ channel: Channel }>()
const emit = defineEmits<{ open: [string]; edit: [Channel]; 'toggle-active': [string, boolean] }>()
</script>

<template>
  <div
    :data-test="`channel-card-${props.channel.id}`"
    class="cursor-pointer rounded border border-surface-700 bg-surface-900 p-4 hover:bg-surface-800"
    @click="emit('open', props.channel.id)"
  >
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-base font-semibold">{{ props.channel.name }}</h3>
      <div class="flex items-center gap-2">
        <button
          :data-test="`channel-edit-${props.channel.id}`"
          type="button"
          class="rounded px-2 py-0.5 text-xs text-surface-300 hover:bg-surface-700"
          title="Редактировать канал"
          @click.stop="emit('edit', props.channel)"
        >
          редактировать
        </button>
        <button
          :data-test="`channel-toggle-${props.channel.id}`"
          type="button"
          class="rounded px-2 py-0.5 text-xs"
          :class="props.channel.active ? 'bg-green-500/20 text-green-400' : 'bg-surface-700 text-surface-300'"
          :title="props.channel.active ? 'Выключить канал' : 'Включить канал'"
          @click.stop="emit('toggle-active', props.channel.id, !props.channel.active)"
        >
          {{ props.channel.active ? 'активен' : 'выключен' }}
        </button>
      </div>
    </div>
    <p class="text-sm text-surface-400">chat: {{ props.channel.mainChatId }}</p>
    <p class="text-sm text-surface-400">расписание: {{ props.channel.schedule }}</p>
    <p class="text-sm text-surface-400">
      бакеты ({{ props.channel.buckets.length }}):
      {{ props.channel.buckets.join(', ') || '—' }}
    </p>
  </div>
</template>
