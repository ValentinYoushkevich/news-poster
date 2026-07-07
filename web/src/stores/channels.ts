import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '../api/client'
import type { Channel } from '../api/types'

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

  return { channels, loading, loadChannels }
})
