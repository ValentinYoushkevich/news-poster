<script setup lang="ts">
import { useToast } from 'primevue/usetoast'
import { computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError } from '../api/client'
import ApprovalActions from '../components/ApprovalActions.vue'
import ImageManager from '../components/ImageManager.vue'
import PostEditor from '../components/PostEditor.vue'
import PreviewPane from '../components/PreviewPane.vue'
import { useChannelsStore } from '../stores/channels'
import { usePostsStore } from '../stores/posts'

const props = defineProps<{ id: string }>()
const posts = usePostsStore()
const channelsStore = useChannelsStore()
const router = useRouter()
const toast = useToast()

const buckets = computed(() => {
  const ch = channelsStore.channels.find((c) => c.id === posts.current?.channelId)
  return ch?.buckets ?? []
})

async function load() {
  await posts.loadPost(props.id)
}

onMounted(async () => {
  if (!channelsStore.channels.length) await channelsStore.loadChannels()
  await load()
})
watch(() => props.id, load)

async function run(action: () => Promise<unknown>, okMsg: string) {
  try {
    await action()
    toast.add({ severity: 'success', summary: okMsg, life: 2000 })
  } catch (e) {
    const msg = e instanceof ApiError ? `${e.code ?? e.status}: ${e.message}` : 'Ошибка'
    toast.add({ severity: 'error', summary: msg, life: 4000 })
  }
}
</script>

<template>
  <div v-if="posts.current" class="grid grid-cols-1 gap-6 lg:grid-cols-2">
    <div class="flex flex-col gap-4">
      <button
        class="self-start text-sm text-primary-400"
        @click="router.push(`/channels/${posts.current.channelId}`)"
      >
        ← к постам канала
      </button>

      <PostEditor
        :post="posts.current"
        :buckets="buckets"
        @save="(d) => run(() => posts.patchCurrent(d), 'Сохранено')"
      />

      <ImageManager
        :images="posts.current.images"
        @add="(url) => run(() => posts.addImage(url), 'Картинка добавлена')"
        @select="(url) => run(() => posts.selectImage(url), 'Картинка обновлена')"
      />

      <ApprovalActions
        :status="posts.current.status"
        @approve="run(() => posts.approveCurrent(), 'Заапрувлено — превью в служебке')"
        @unapprove="run(() => posts.unapproveCurrent(), 'Аппрув отменён')"
        @rewrite="run(() => posts.rewriteCurrent(), 'Рерайт запущен')"
        @delete="run(async () => { const ch = posts.current?.channelId; await posts.removeCurrent(); router.push(`/channels/${ch}`) }, 'Удалено')"
      />
    </div>

    <PreviewPane :post="posts.current" />
  </div>
  <p v-else class="text-surface-400">Загрузка…</p>
</template>
