import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '../api/client'
import type { Channel, ChannelCreate, ChannelUpdate } from '../api/types'

export const useChannelsStore = defineStore('channels', () => {
  const channels = ref<Channel[]>([])
  const loading = ref(false)

  async function loadChannels() {
    loading.value = true
    try {
      channels.value = await api.listChannels()
    } finally {
      loading.value = false
    }
  }

  async function createChannel(body: ChannelCreate) {
    const created = await api.createChannel(body)
    channels.value.push(created)
    return created
  }

  async function updateChannel(id: string, body: ChannelUpdate) {
    const updated = await api.updateChannel(id, body)
    const i = channels.value.findIndex((c) => c.id === id)
    if (i !== -1) channels.value[i] = updated
    return updated
  }

  return { channels, loading, loadChannels, createChannel, updateChannel }
})
