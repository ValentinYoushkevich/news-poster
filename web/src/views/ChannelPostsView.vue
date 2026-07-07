<script setup lang="ts">
import { useToast } from 'primevue/usetoast'
import { computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError } from '../api/client'
import PostFilters from '../components/PostFilters.vue'
import PostTable from '../components/PostTable.vue'
import { useChannelsStore } from '../stores/channels'
import { usePostsStore } from '../stores/posts'

const props = defineProps<{ channelId: string }>()
const router = useRouter()
const posts = usePostsStore()
const channelsStore = useChannelsStore()
const toast = useToast()

const channel = computed(() => channelsStore.channels.find((c) => c.id === props.channelId))
const channelName = computed(() => channel.value?.name ?? props.channelId)
const buckets = computed(() => channel.value?.buckets ?? [])

// Полный сброс фильтров к дефолту: чужие status/bucket/source/date не должны
// протекать между каналами.
async function resetForChannel(channelId: string) {
  posts.filters.channelId = channelId
  posts.filters.status = undefined
  posts.filters.bucket = undefined
  posts.filters.source = undefined
  posts.filters.date = undefined
  posts.filters.page = 1
  await posts.loadList()
}

onMounted(async () => {
  if (!channelsStore.channels.length) await channelsStore.loadChannels()
  await resetForChannel(props.channelId)
})

// Переход канал→канал переиспользует компонент — сбрасываем и по смене пропа.
watch(
  () => props.channelId,
  (id) => resetForChannel(id),
)

function open(id: string) {
  router.push(`/posts/${id}`)
}

async function hardDelete(id: string) {
  try {
    await posts.hardDelete(id)
    toast.add({ severity: 'success', summary: 'Карточка удалена', life: 2000 })
  } catch (e) {
    const msg = e instanceof ApiError ? `${e.code ?? e.status}: ${e.message}` : 'Ошибка'
    toast.add({ severity: 'error', summary: msg, life: 4000 })
  }
}

function changePage(page: number) {
  posts.filters.page = page
  posts.loadList()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center gap-3">
      <button class="text-sm text-primary-400" @click="router.push('/')">← к каналам</button>
      <h2 class="text-lg font-semibold">{{ channelName }}</h2>
    </div>

    <PostFilters v-model="posts.filters" :buckets="buckets" @apply="posts.loadList()" />

    <div class="rounded border border-surface-700">
      <PostTable :posts="posts.list.items" @open="open" @hard-delete="hardDelete" />
      <p v-if="!posts.list.items.length" class="p-4 text-surface-400">Ничего не найдено</p>
    </div>

    <div class="flex items-center gap-3 text-sm">
      <button
        class="rounded px-3 py-1 hover:bg-surface-800 disabled:opacity-40"
        :disabled="(posts.filters.page ?? 1) <= 1"
        @click="changePage((posts.filters.page ?? 1) - 1)"
      >
        ←
      </button>
      <span>Стр. {{ posts.list.page }} · всего {{ posts.list.total }}</span>
      <button
        class="rounded px-3 py-1 hover:bg-surface-800 disabled:opacity-40"
        :disabled="posts.list.page * posts.list.pageSize >= posts.list.total"
        @click="changePage((posts.filters.page ?? 1) + 1)"
      >
        →
      </button>
    </div>
  </div>
</template>
