<script setup lang="ts">
import type { Channel } from '../api/types'

const props = defineProps<{ channel: Channel }>()
const emit = defineEmits<{ open: [string] }>()
</script>

<template>
  <div
    :data-test="`channel-card-${props.channel.id}`"
    class="cursor-pointer rounded border border-surface-700 bg-surface-900 p-4 hover:bg-surface-800"
    @click="emit('open', props.channel.id)"
  >
    <div class="flex items-center justify-between">
      <h3 class="text-base font-semibold">{{ props.channel.name }}</h3>
      <span
        class="rounded px-2 py-0.5 text-xs"
        :class="props.channel.active ? 'bg-green-500/20 text-green-400' : 'bg-surface-700 text-surface-300'"
      >
        {{ props.channel.active ? 'активен' : 'выключен' }}
      </span>
    </div>
    <p class="text-sm text-surface-400">chat: {{ props.channel.mainChatId }}</p>
    <p class="text-sm text-surface-400">расписание: {{ props.channel.schedule }}</p>
    <p class="text-sm text-surface-400">
      бакеты ({{ props.channel.buckets.length }}):
      {{ props.channel.buckets.join(', ') || '—' }}
    </p>
  </div>
</template>
