<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import PostFilters from '../components/PostFilters.vue'
import PostTable from '../components/PostTable.vue'
import { useChannelsStore } from '../stores/channels'
import { usePostsStore } from '../stores/posts'

const props = defineProps<{ channelId: string }>()
const router = useRouter()
const posts = usePostsStore()
const channelsStore = useChannelsStore()

const channelName = computed(
  () => channelsStore.channels.find((c) => c.id === props.channelId)?.name ?? props.channelId,
)

onMounted(async () => {
  if (!channelsStore.channels.length) await channelsStore.loadChannels()
  posts.filters.channelId = props.channelId
  posts.filters.page = 1
  await posts.loadList()
})

function open(id: string) {
  router.push(`/posts/${id}`)
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

    <PostFilters
      v-model="posts.filters"
      :channels="channelsStore.channels"
      hide-channel
      @apply="posts.loadList()"
    />

    <div class="rounded border border-surface-700">
      <PostTable :posts="posts.list.items" @open="open" />
      <p v-if="!posts.list.items.length" class="p-4 text-surface-400">Ничего не найдено</p>
    </div>

    <div class="flex items-center gap-3 text-sm">
      <button
        class="rounded border border-surface-700 px-3 py-1 hover:bg-surface-800 disabled:opacity-40"
        :disabled="(posts.filters.page ?? 1) <= 1"
        @click="changePage((posts.filters.page ?? 1) - 1)"
      >
        ←
      </button>
      <span>Стр. {{ posts.list.page }} · всего {{ posts.list.total }}</span>
      <button
        class="rounded border border-surface-700 px-3 py-1 hover:bg-surface-800 disabled:opacity-40"
        :disabled="posts.list.page * posts.list.pageSize >= posts.list.total"
        @click="changePage((posts.filters.page ?? 1) + 1)"
      >
        →
      </button>
    </div>
  </div>
</template>
