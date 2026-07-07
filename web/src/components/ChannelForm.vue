<script setup lang="ts">
import { ref } from 'vue'
import type { ChannelCreate } from '../api/types'

const emit = defineEmits<{ create: [ChannelCreate] }>()

interface BucketRow {
  name: string
  prompt: string
}

const name = ref('')
const mainChatId = ref('')
const schedule = ref('*/30 * * * *')
const previewTtl = ref('')
const buckets = ref<BucketRow[]>([])
const error = ref('')

const SCHEDULE_OPTIONS: { label: string; value: string }[] = [
  { label: 'раз в минуту', value: '* * * * *' },
  { label: 'раз в 5 минут', value: '*/5 * * * *' },
  { label: 'раз в 10 минут', value: '*/10 * * * *' },
  { label: 'раз в 15 минут', value: '*/15 * * * *' },
  { label: 'раз в 30 минут', value: '*/30 * * * *' },
  { label: 'раз в час', value: '0 * * * *' },
  { label: 'раз в 2 часа', value: '0 */2 * * *' },
  { label: 'раз в 3 часа', value: '0 */3 * * *' },
  { label: 'раз в 6 часов', value: '0 */6 * * *' },
  { label: 'раз в 12 часов', value: '0 */12 * * *' },
  { label: 'раз в сутки', value: '0 0 * * *' },
]

function addBucket() {
  buckets.value.push({ name: '', prompt: '' })
}

function removeBucket(i: number) {
  buckets.value.splice(i, 1)
}

function submit() {
  const names = buckets.value.map((b) => b.name.trim()).filter(Boolean)
  if (!name.value.trim() || !mainChatId.value.trim() || names.length === 0) {
    error.value = 'Заполните имя, chatId и хотя бы один бакет'
    return
  }
  error.value = ''

  const rewritePrompts: Record<string, string> = {}
  for (const b of buckets.value) {
    const bn = b.name.trim()
    const bp = b.prompt.trim()
    if (bn && bp) rewritePrompts[bn] = bp
  }

  const payload: ChannelCreate = {
    name: name.value.trim(),
    mainChatId: mainChatId.value.trim(),
    buckets: names,
    rewritePrompts,
    schedule: schedule.value.trim() || '*/30 * * * *',
  }

  const ttl = previewTtl.value.trim()
  if (ttl !== '') payload.previewTtl = Number(ttl)

  emit('create', payload)
}
</script>

<template>
  <form class="flex flex-col gap-3 rounded border border-surface-700 bg-surface-900 p-4" @submit.prevent="submit">
    <h2 class="text-base font-semibold">Добавить канал</h2>

    <label class="flex flex-col text-sm">
      <span>Название</span>
      <input data-test="ch-name" v-model="name" class="rounded border border-surface-700 bg-surface-950 px-2 py-1 text-surface-0" />
    </label>

    <label class="flex flex-col text-sm">
      <span>Main chat ID</span>
      <input data-test="ch-mainChatId" v-model="mainChatId" class="rounded border border-surface-700 bg-surface-950 px-2 py-1 text-surface-0" />
    </label>

    <div class="flex flex-col gap-2">
      <span class="text-sm">Бакеты
        <span class="text-surface-400">(рубрики канала: по ним ИИ раскладывает новости и подбирает промпт рерайта — напр. рф-внутр, сво, мир-с-рф, мир-без-рф)</span>
      </span>
      <div v-for="(b, i) in buckets" :key="i" class="flex flex-wrap items-end gap-2">
        <label class="flex flex-col text-sm">
          <span>Имя бакета</span>
          <input :data-test="`bucket-name-${i}`" v-model="b.name" class="rounded border border-surface-700 bg-surface-950 px-2 py-1 text-surface-0" />
        </label>
        <label class="flex flex-1 flex-col text-sm">
          <span>Промпт рерайта (опц.)</span>
          <input :data-test="`bucket-prompt-${i}`" v-model="b.prompt" class="rounded border border-surface-700 bg-surface-950 px-2 py-1 text-surface-0" />
        </label>
        <button
          type="button"
          :data-test="`bucket-remove-${i}`"
          class="rounded border border-surface-700 px-2 py-1 text-sm text-red-400 hover:bg-surface-800"
          @click="removeBucket(i)"
        >
          удалить
        </button>
      </div>
      <button
        type="button"
        data-test="add-bucket"
        class="self-start rounded border border-surface-700 px-3 py-1 text-sm hover:bg-surface-800"
        @click="addBucket"
      >
        + бакет
      </button>
    </div>

    <label class="flex flex-col text-sm">
      <span>Расписание публикации
        <span class="text-surface-400">(как часто n8n постит накопленные посты из очереди в канал)</span>
      </span>
      <select data-test="ch-schedule" v-model="schedule" class="rounded border border-surface-700 bg-surface-950 px-2 py-1 text-surface-0">
        <option v-for="o in SCHEDULE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
    </label>

    <label class="flex flex-col text-sm">
      <span>TTL превью
        <span class="text-surface-400">(через сколько минут авто-удалять превью-сообщение из служебного канала; число в минутах, напр. 1440 = сутки; пусто = дефолт сервера)</span>
      </span>
      <input data-test="ch-previewTtl" v-model="previewTtl" type="number" placeholder="напр. 1440" class="rounded border border-surface-700 bg-surface-950 px-2 py-1 text-surface-0" />
    </label>

    <p v-if="error" data-test="ch-error" class="text-sm text-red-400">{{ error }}</p>

    <button
      type="button"
      data-test="channel-submit"
      @click="submit"
      class="self-start rounded bg-primary-500 px-4 py-2 text-white"
    >
      Добавить канал
    </button>
  </form>
</template>
