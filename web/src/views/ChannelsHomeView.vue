<script setup lang="ts">
import { useToast } from 'primevue/usetoast'
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError } from '../api/client'
import type { ChannelCreate } from '../api/types'
import ChannelCard from '../components/ChannelCard.vue'
import ChannelForm from '../components/ChannelForm.vue'
import { useChannelsStore } from '../stores/channels'

const router = useRouter()
const channelsStore = useChannelsStore()
const toast = useToast()

onMounted(() => channelsStore.loadChannels())

async function create(payload: ChannelCreate) {
  try {
    await channelsStore.createChannel(payload)
    toast.add({ severity: 'success', summary: 'Канал создан', life: 2000 })
  } catch (e) {
    const msg = e instanceof ApiError ? `${e.code ?? e.status}: ${e.message}` : 'Ошибка'
    toast.add({ severity: 'error', summary: msg, life: 4000 })
  }
}

function open(id: string) {
  router.push(`/channels/${id}`)
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <ChannelForm @create="create" />

    <div v-if="channelsStore.channels.length" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <ChannelCard
        v-for="ch in channelsStore.channels"
        :key="ch.id"
        :channel="ch"
        @open="open"
      />
    </div>
    <p v-else class="text-surface-400">Каналов пока нет — добавьте первый выше.</p>
  </div>
</template>
