import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { api } from '../api/client'
import type { ListFilters, Post, PostList } from '../api/types'

const EMPTY_LIST: PostList = { items: [], total: 0, page: 1, pageSize: 20 }

export const usePostsStore = defineStore('posts', () => {
  const filters = reactive<ListFilters>({ page: 1 })
  const list = ref<PostList>({ ...EMPTY_LIST })
  const current = ref<Post | null>(null)
  const loading = ref(false)

  async function loadList() {
    loading.value = true
    try {
      list.value = await api.listPosts({ ...filters })
    } finally {
      loading.value = false
    }
  }

  async function loadPost(id: string) {
    loading.value = true
    try {
      current.value = await api.getPost(id)
    } finally {
      loading.value = false
    }
  }

  function setCurrent(post: Post) {
    current.value = post
  }

  async function patchCurrent(data: { finalTitle?: string; finalText?: string; bucket?: string }) {
    if (!current.value) return
    setCurrent(await api.patchPost(current.value.id, data))
  }

  async function addImage(url: string, type?: string) {
    if (!current.value) return
    setCurrent(await api.addImage(current.value.id, { url, type }))
  }

  async function selectImage(url: string | null) {
    if (!current.value) return
    setCurrent(await api.selectImage(current.value.id, url))
  }

  async function approveCurrent() {
    if (!current.value) return
    setCurrent(await api.approve(current.value.id))
  }

  async function unapproveCurrent() {
    if (!current.value) return
    setCurrent(await api.unapprove(current.value.id))
  }

  async function removeCurrent(rejectReason?: string) {
    if (!current.value) return
    setCurrent(await api.remove(current.value.id, rejectReason))
  }

  // Безвозвратное удаление из БД (любой статус) + чистка локального списка.
  async function hardDelete(id: string) {
    await api.hardDelete(id)
    list.value.items = list.value.items.filter((p) => p.id !== id)
    list.value.total = Math.max(0, list.value.total - 1)
    if (current.value?.id === id) current.value = null
  }

  async function rewriteCurrent() {
    if (!current.value) return
    await api.rewrite(current.value.id)
  }

  async function classifyCurrent() {
    if (!current.value) return
    await api.classify(current.value.id)
  }

  return {
    filters,
    list,
    current,
    loading,
    loadList,
    loadPost,
    setCurrent,
    patchCurrent,
    addImage,
    selectImage,
    approveCurrent,
    unapproveCurrent,
    removeCurrent,
    hardDelete,
    rewriteCurrent,
    classifyCurrent,
  }
})
