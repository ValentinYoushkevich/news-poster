<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import PostFilters from '../components/PostFilters.vue'
import PostTable from '../components/PostTable.vue'
import { useChannelsStore } from '../stores/channels'
import { usePostsStore } from '../stores/posts'

const router = useRouter()
const posts = usePostsStore()
const channelsStore = useChannelsStore()

onMounted(async () => {
  await Promise.all([channelsStore.loadChannels(), posts.loadList()])
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
    <PostFilters v-model="posts.filters" :channels="channelsStore.channels" @apply="posts.loadList()" />

    <div class="rounded border border-surface-200">
      <PostTable :posts="posts.list.items" @open="open" />
      <p v-if="!posts.list.items.length" class="p-4 text-surface-500">Ничего не найдено</p>
    </div>

    <div class="flex items-center gap-3 text-sm">
      <button
        class="rounded border px-3 py-1 disabled:opacity-40"
        :disabled="(posts.filters.page ?? 1) <= 1"
        @click="changePage((posts.filters.page ?? 1) - 1)"
      >
        ←
      </button>
      <span>Стр. {{ posts.list.page }} · всего {{ posts.list.total }}</span>
      <button
        class="rounded border px-3 py-1 disabled:opacity-40"
        :disabled="posts.list.page * posts.list.pageSize >= posts.list.total"
        @click="changePage((posts.filters.page ?? 1) + 1)"
      >
        →
      </button>
    </div>
  </div>
</template>
