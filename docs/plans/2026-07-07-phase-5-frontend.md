> ⚠️ **Исторический документ: план выполнен.** Отдельные детали устарели (создание каналов теперь через UI админки, порт 3000 наружу не публикуется, добавлена аутентификация `/login`). Актуальное описание системы — [docs/устройство системы.md](../устройство%20системы.md).

# Фаза 5 — Фронтенд-админка — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Веб-админка аппрува: человек фильтрует карточки по каналу/статусу/бакету, открывает `pending`-карточку, правит текст и картинку, жмёт «Заапрувить» (генерация превью), при необходимости откатывает аппрув, удаляет или пере-рерайтит — всё поверх готового REST API Фаз 1–4.

**Architecture:** Отдельное SPA в папке `web/` (свой `package.json`/Vite, бэкенд в корне не трогаем). Слои: типизированный `api/client.ts` (тонкая обёртка над `fetch`, единственная точка обращения к сети) → Pinia-сторы (`channels`, `posts`) → компоненты/вью. Все обращения идут на префикс `/api`, который Vite dev-proxy перенаправляет на `http://localhost:3000`. Компоненты тестируются через `@vue/test-utils` + jsdom с замоканным модулем `api/client` (`vi.mock`), сам клиент — со стабом `global fetch`. Аутентификации нет (бэкенд без неё) — **допущение фазы**.

**Tech Stack:** Vue 3 + TypeScript + Vite, PrimeVue 4 (пресет Aura, `@primevue/themes`), Tailwind CSS 3 + `tailwindcss-primeui`, Pinia, vue-router, Vitest + `@vue/test-utils` + jsdom.

---

## Предпосылки

Бэкенд Фаз 1–4 реализован и доступен на `http://localhost:3000`. Фактический контракт API (снят из `src/routes/posts.ts`, `src/routes/channels.ts`, `src/services/*`):

- `GET /channels` → `Channel[]` (поля: `id` строка, `name`, `mainChatId`, `buckets: string[]`, `rewritePrompts`, `schedule`, `previewTtl`, `active`, …).
- `GET /posts?channelId=&status=&bucket=&source=&date=&page=` → `{ items: Post[], total, page, pageSize }` (`pageSize=20`).
- `GET /posts/:id` → `Post`.
- `PATCH /posts/:id` `{ finalTitle?, finalText?, bucket? }` → `Post`.
- `POST /posts/:id/images` `{ url, type? }` → `Post` (201).
- `PATCH /posts/:id/images/select` `{ url: string | null }` → `Post` (null = убрать выбор → текстовый пост).
- `POST /posts/:id/approve` → `Post` (переходит в `ready_to_publish`).
- `POST /posts/:id/unapprove` → `Post` (обратно в `pending`).
- `DELETE /posts/:id` `{ rejectReason? }` → `Post` (soft-delete → `rejected`).
- `POST /posts/:id/rewrite` → `{ accepted: true }` (202, async).
- Ошибки: HTTP-код + тело `{ error, code? }` (400 `validation_failed` + `issues`; 404; 409 `invalid_transition`/`duplicate_link`).

**BigInt-поля (`id`, `channelId`, `previewMessageId`, …) приходят строками.** `images` — массив `{ url, type, origin: 'enclosure'|'content'|'uploaded', fileId, chosen }`. Статусы: `ingested`/`processing`/`pending`/`ready_to_publish`/`published`/`rejected`/`failed`.

## Структура файлов

```
web/
  package.json
  tsconfig.json
  tsconfig.node.json
  vite.config.ts            # плагин vue + dev-proxy /api + конфиг vitest
  tailwind.config.js
  postcss.config.js
  index.html
  src/
    main.ts                 # bootstrap: PrimeVue(Aura)+ToastService+Pinia+router
    App.vue                 # каркас + <router-view> + <Toast>
    style.css               # tailwind + primeui
    router/index.ts         # /  (список)  и  /posts/:id  (карточка)
    api/
      types.ts              # Post, Channel, ImageCandidate, PostList, ListFilters
      client.ts             # ApiError + api.* методы (fetch)
    stores/
      channels.ts           # Pinia: channels + loadChannels
      posts.ts              # Pinia: filters/list/current + действия
    components/
      PostFilters.vue       # фильтры (канал/статус/бакет/source/date)
      PostTable.vue         # таблица списка
      PostEditor.vue        # правка finalTitle/finalText/bucket
      ImageManager.vue      # добавить/выбрать/убрать картинку
      ApprovalActions.vue   # approve/unapprove/delete/rewrite
      PreviewPane.vue       # «как встанет в канал»
    views/
      PostListView.vue      # фильтры + таблица + пагинация
      PostDetailView.vue    # editor + image + preview + actions
    test/
      setup.ts              # общий mount-хелпер (PrimeVue плагин)
  tests/
    api/client.test.ts
    stores/posts.test.ts
    components/PostFilters.test.ts
    components/PostEditor.test.ts
    components/ImageManager.test.ts
    components/ApprovalActions.test.ts
    views/PostListView.test.ts
```

**Границы:** `api/client.ts` — единственное место с `fetch`; сторы держат состояние и вызывают клиент; компоненты получают данные пропсами и эмитят события действий, а сетевые вызовы делают через сторы/клиент. Это даёт компонентам чистую тестируемость (мок `api/client`).

> **Замечание по версиям (см. опыт Фаз 1–3):** экосистема фронта быстро меняется. План таргетит Tailwind 3 + PrimeVue 4. Если `npm i` поставит несовместимые мажоры (Tailwind 4 с `@import "tailwindcss"`, иной API `@primevue/themes`) — почини минимально в духе плана (директивы стилей/импорт пресета) и зафиксируй отклонение, как это делалось с Prisma 6.

---

## Task 0: Скаффолдинг web/

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/tsconfig.node.json`, `web/vite.config.ts`, `web/tailwind.config.js`, `web/postcss.config.js`, `web/index.html`, `web/src/main.ts`, `web/src/App.vue`, `web/src/style.css`, `web/src/test/setup.ts`

- [ ] **Step 1: Инициализировать и поставить зависимости**

Run (из корня репо):
```bash
mkdir web
cd web && npm init -y
npm i vue vue-router pinia primevue @primevue/themes primeicons
npm i -D vite @vitejs/plugin-vue vue-tsc typescript @vue/test-utils vitest jsdom tailwindcss@3 postcss autoprefixer tailwindcss-primeui @types/node
```

- [ ] **Step 2: Записать package.json (скрипты, type=module)**

Заменить `web/package.json` на (секции `dependencies`/`devDependencies` оставить от npm):
```json
{
  "name": "news-poster-web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: Записать tsconfig'и**

`web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vitest/globals", "node"]
  },
  "include": ["src", "tests"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```
`web/tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["node"]
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Записать vite.config.ts (proxy + vitest)**

`web/vite.config.ts`:
```ts
/// <reference types="vitest/config" />
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 5: Записать конфиги стилей**

`web/tailwind.config.js`:
```js
import PrimeUI from 'tailwindcss-primeui'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: { extend: {} },
  plugins: [PrimeUI],
}
```
`web/postcss.config.js`:
```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```
`web/src/style.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 6: Записать index.html, main.ts, App.vue**

`web/index.html`:
```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>news-poster · админка</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```
`web/src/main.ts`:
```ts
import Aura from '@primevue/themes/aura'
import { createPinia } from 'pinia'
import 'primeicons/primeicons.css'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router/index.js'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(PrimeVue, { theme: { preset: Aura } })
app.use(ToastService)
app.mount('#app')
```
`web/src/App.vue`:
```vue
<script setup lang="ts">
import Toast from 'primevue/toast'
</script>

<template>
  <div class="min-h-screen bg-surface-50 text-surface-900">
    <header class="border-b border-surface-200 px-6 py-3">
      <h1 class="text-lg font-semibold">news-poster · админка</h1>
    </header>
    <main class="p-6">
      <router-view />
    </main>
    <Toast />
  </div>
</template>
```

- [ ] **Step 7: Записать общий тест-хелпер**

`web/src/test/setup.ts`:
```ts
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import { config } from '@vue/test-utils'

// Глобально подключаем PrimeVue для всех mount() в тестах.
config.global.plugins = [[PrimeVue, {}], ToastService]
```

- [ ] **Step 8: Проверить, что dev-сервер и сборка стартуют**

Run (из web/):
```bash
npm run build
```
Expected: `vue-tsc` без ошибок, Vite собирает `dist/` (пустое приложение с шапкой).

- [ ] **Step 9: Commit**

```bash
git add web/package.json web/package-lock.json web/tsconfig*.json web/vite.config.ts web/tailwind.config.js web/postcss.config.js web/index.html web/src/main.ts web/src/App.vue web/src/style.css web/src/test/setup.ts
git commit -m "chore(web): scaffold vue3+vite+primevue+tailwind admin app"
```

---

## Task 1: Типы API и клиент (TDD)

**Files:**
- Create: `web/src/api/types.ts`, `web/src/api/client.ts`
- Test: `web/tests/api/client.test.ts`

- [ ] **Step 1: Записать типы**

`web/src/api/types.ts`:
```ts
export type ImageOrigin = 'enclosure' | 'content' | 'uploaded'

export interface ImageCandidate {
  url: string
  type: string | null
  origin: ImageOrigin
  fileId: string | null
  chosen: boolean
}

export type PostStatus =
  | 'ingested'
  | 'processing'
  | 'pending'
  | 'ready_to_publish'
  | 'published'
  | 'rejected'
  | 'failed'

export interface Post {
  id: string
  channelId: string
  source: string
  sourceLang: string
  link: string
  origTitle: string
  origText: string
  author: string | null
  categories: string[]
  pubDate: string
  images: ImageCandidate[]
  bucket: string | null
  rewrittenTitle: string | null
  rewrittenText: string | null
  finalTitle: string | null
  finalText: string | null
  status: PostStatus
  previewMessageId: string | null
  publishedMessageId: string | null
  aiError: string | null
  rejectReason: string | null
  createdAt: string
  updatedAt: string
  approvedAt: string | null
  publishedAt: string | null
}

export interface Channel {
  id: string
  name: string
  mainChatId: string
  buckets: string[]
  schedule: string
  active: boolean
}

export interface PostList {
  items: Post[]
  total: number
  page: number
  pageSize: number
}

export interface ListFilters {
  channelId?: string
  status?: string
  bucket?: string
  source?: string
  date?: string
  page?: number
}
```

- [ ] **Step 2: Написать падающий тест клиента**

`web/tests/api/client.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api } from '../../src/api/client'

afterEach(() => vi.unstubAllGlobals())

function mockFetch(body: unknown, ok = true, status = 200) {
  const fn = vi.fn(async () => ({ ok, status, json: async () => body }))
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('api client', () => {
  it('listPosts строит query и бьёт /api/posts', async () => {
    const fetchMock = mockFetch({ items: [], total: 0, page: 1, pageSize: 20 })
    await api.listPosts({ channelId: '1', status: 'pending', page: 2 })
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/api/posts?')
    expect(url).toContain('channelId=1')
    expect(url).toContain('status=pending')
    expect(url).toContain('page=2')
  })

  it('пропускает пустые фильтры', async () => {
    const fetchMock = mockFetch({ items: [], total: 0, page: 1, pageSize: 20 })
    await api.listPosts({ channelId: '1', status: '' })
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).not.toContain('status=')
  })

  it('patchPost шлёт PATCH с JSON-телом', async () => {
    const fetchMock = mockFetch({ id: '1' })
    await api.patchPost('1', { finalTitle: 'X' })
    const [, init] = fetchMock.mock.calls[0]
    expect((init as RequestInit).method).toBe('PATCH')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ finalTitle: 'X' })
  })

  it('selectImage с null убирает выбор', async () => {
    const fetchMock = mockFetch({ id: '1' })
    await api.selectImage('1', null)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/posts/1/images/select')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ url: null })
  })

  it('не-ok ответ бросает ApiError с code', async () => {
    mockFetch({ error: 'invalid_transition', code: 'invalid_transition' }, false, 409)
    await expect(api.approve('1')).rejects.toMatchObject({
      status: 409,
      code: 'invalid_transition',
    })
    await expect(api.approve('1')).rejects.toBeInstanceOf(ApiError)
  })
})
```

- [ ] **Step 3: Запустить — убедиться, что падает**

Run (из web/): `npx vitest run tests/api/client.test.ts`
Expected: FAIL — модуль `client` не найден.

- [ ] **Step 4: Реализовать client.ts**

`web/src/api/client.ts`:
```ts
import type { Channel, ListFilters, Post, PostList } from './types'

const BASE = '/api'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string | undefined,
    message: string,
  ) {
    super(message)
  }
}

function qs(filters: ListFilters): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  }
  return p.toString()
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    let body: { error?: string; code?: string } = {}
    try {
      body = await res.json()
    } catch {
      /* ignore non-json body */
    }
    throw new ApiError(res.status, body.code, body.error ?? `http_${res.status}`)
  }
  return (await res.json()) as T
}

export const api = {
  listChannels: () => request<Channel[]>('/channels'),
  listPosts: (f: ListFilters) => request<PostList>(`/posts?${qs(f)}`),
  getPost: (id: string) => request<Post>(`/posts/${id}`),
  patchPost: (id: string, body: { finalTitle?: string; finalText?: string; bucket?: string }) =>
    request<Post>(`/posts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  addImage: (id: string, body: { url: string; type?: string }) =>
    request<Post>(`/posts/${id}/images`, { method: 'POST', body: JSON.stringify(body) }),
  selectImage: (id: string, url: string | null) =>
    request<Post>(`/posts/${id}/images/select`, { method: 'PATCH', body: JSON.stringify({ url }) }),
  approve: (id: string) => request<Post>(`/posts/${id}/approve`, { method: 'POST' }),
  unapprove: (id: string) => request<Post>(`/posts/${id}/unapprove`, { method: 'POST' }),
  remove: (id: string, rejectReason?: string) =>
    request<Post>(`/posts/${id}`, { method: 'DELETE', body: JSON.stringify({ rejectReason }) }),
  rewrite: (id: string) =>
    request<{ accepted: boolean }>(`/posts/${id}/rewrite`, { method: 'POST' }),
}
```

- [ ] **Step 5: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/api/client.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/api tests/api/client.test.ts
git commit -m "feat(web): typed api client + types"
```

---

## Task 2: Pinia-сторы (TDD)

**Files:**
- Create: `web/src/stores/channels.ts`, `web/src/stores/posts.ts`
- Test: `web/tests/stores/posts.test.ts`

- [ ] **Step 1: Написать падающий тест стора**

`web/tests/stores/posts.test.ts`:
```ts
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../src/api/client'
import { usePostsStore } from '../../src/stores/posts'

vi.mock('../../src/api/client', () => ({
  api: {
    listPosts: vi.fn(),
    getPost: vi.fn(),
    approve: vi.fn(),
  },
  ApiError: class extends Error {},
}))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('posts store', () => {
  it('loadList кладёт результат и прокидывает фильтры', async () => {
    ;(api.listPosts as any).mockResolvedValue({ items: [{ id: '1' }], total: 1, page: 1, pageSize: 20 })
    const store = usePostsStore()
    store.filters.channelId = '7'
    await store.loadList()
    expect(api.listPosts).toHaveBeenCalledWith(expect.objectContaining({ channelId: '7', page: 1 }))
    expect(store.list.items).toHaveLength(1)
    expect(store.list.total).toBe(1)
  })

  it('loadPost кладёт current', async () => {
    ;(api.getPost as any).mockResolvedValue({ id: '5', status: 'pending' })
    const store = usePostsStore()
    await store.loadPost('5')
    expect(store.current?.id).toBe('5')
  })

  it('approveCurrent обновляет current из ответа', async () => {
    ;(api.getPost as any).mockResolvedValue({ id: '5', status: 'pending' })
    ;(api.approve as any).mockResolvedValue({ id: '5', status: 'ready_to_publish' })
    const store = usePostsStore()
    await store.loadPost('5')
    await store.approveCurrent()
    expect(store.current?.status).toBe('ready_to_publish')
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/stores/posts.test.ts`
Expected: FAIL — модуль стора не найден.

- [ ] **Step 3: Реализовать channels store**

`web/src/stores/channels.ts`:
```ts
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
```

- [ ] **Step 4: Реализовать posts store**

`web/src/stores/posts.ts`:
```ts
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

  async function rewriteCurrent() {
    if (!current.value) return
    await api.rewrite(current.value.id)
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
    rewriteCurrent,
  }
})
```

- [ ] **Step 5: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/stores/posts.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/stores tests/stores/posts.test.ts
git commit -m "feat(web): pinia stores for channels and posts"
```

---

## Task 3: Компонент фильтров (TDD)

**Files:**
- Create: `web/src/components/PostFilters.vue`
- Test: `web/tests/components/PostFilters.test.ts`

Компонент получает `channels` и `modelValue` (текущие фильтры), эмитит `update:modelValue` и `apply`.

- [ ] **Step 1: Написать падающий тест**

`web/tests/components/PostFilters.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PostFilters from '../../src/components/PostFilters.vue'
import type { Channel, ListFilters } from '../../src/api/types'

const channels: Channel[] = [
  { id: '1', name: 'Новости', mainChatId: '-1', buckets: ['рф-внутр', 'сво'], schedule: 'x', active: true },
]

function factory(filters: ListFilters = { page: 1 }) {
  return mount(PostFilters, { props: { modelValue: filters, channels } })
}

describe('PostFilters', () => {
  it('рендерит опции статусов', () => {
    const w = factory()
    expect(w.text()).toContain('Статус')
  })

  it('эмитит apply по кнопке', async () => {
    const w = factory()
    await w.get('[data-test="apply"]').trigger('click')
    expect(w.emitted('apply')).toBeTruthy()
  })

  it('меняет статус и эмитит update:modelValue', async () => {
    const w = factory()
    const select = w.get('[data-test="status"]')
    await select.setValue('pending')
    const events = w.emitted('update:modelValue') as ListFilters[][]
    expect(events.at(-1)?.[0].status).toBe('pending')
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/components/PostFilters.test.ts`
Expected: FAIL — компонент не найден.

- [ ] **Step 3: Реализовать PostFilters.vue**

`web/src/components/PostFilters.vue` (нативные `<select>`/`<input>` для стабильной тестируемости; стилизуем Tailwind-классами):
```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { Channel, ListFilters } from '../api/types'

const props = defineProps<{ modelValue: ListFilters; channels: Channel[] }>()
const emit = defineEmits<{
  'update:modelValue': [ListFilters]
  apply: []
}>()

const STATUSES = [
  'ingested',
  'processing',
  'pending',
  'ready_to_publish',
  'published',
  'rejected',
  'failed',
]

const buckets = computed(() => {
  const ch = props.channels.find((c) => c.id === props.modelValue.channelId)
  return ch?.buckets ?? []
})

function patch(part: Partial<ListFilters>) {
  emit('update:modelValue', { ...props.modelValue, ...part, page: 1 })
}
</script>

<template>
  <div class="flex flex-wrap items-end gap-3 rounded border border-surface-200 p-3">
    <label class="flex flex-col text-sm">
      <span>Канал</span>
      <select
        data-test="channel"
        class="rounded border px-2 py-1"
        :value="modelValue.channelId ?? ''"
        @change="patch({ channelId: ($event.target as HTMLSelectElement).value || undefined, bucket: undefined })"
      >
        <option value="">— все —</option>
        <option v-for="c in channels" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
    </label>

    <label class="flex flex-col text-sm">
      <span>Статус</span>
      <select
        data-test="status"
        class="rounded border px-2 py-1"
        :value="modelValue.status ?? ''"
        @change="patch({ status: ($event.target as HTMLSelectElement).value || undefined })"
      >
        <option value="">— любой —</option>
        <option v-for="s in STATUSES" :key="s" :value="s">{{ s }}</option>
      </select>
    </label>

    <label class="flex flex-col text-sm">
      <span>Бакет</span>
      <select
        data-test="bucket"
        class="rounded border px-2 py-1"
        :value="modelValue.bucket ?? ''"
        @change="patch({ bucket: ($event.target as HTMLSelectElement).value || undefined })"
      >
        <option value="">— любой —</option>
        <option v-for="b in buckets" :key="b" :value="b">{{ b }}</option>
      </select>
    </label>

    <label class="flex flex-col text-sm">
      <span>Источник</span>
      <input
        data-test="source"
        class="rounded border px-2 py-1"
        :value="modelValue.source ?? ''"
        @input="patch({ source: ($event.target as HTMLInputElement).value || undefined })"
      />
    </label>

    <label class="flex flex-col text-sm">
      <span>Дата</span>
      <input
        type="date"
        data-test="date"
        class="rounded border px-2 py-1"
        :value="modelValue.date ?? ''"
        @change="patch({ date: ($event.target as HTMLInputElement).value || undefined })"
      />
    </label>

    <button data-test="apply" class="rounded bg-primary-500 px-3 py-1 text-white" @click="emit('apply')">
      Применить
    </button>
  </div>
</template>
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/components/PostFilters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/PostFilters.vue tests/components/PostFilters.test.ts
git commit -m "feat(web): post filters component"
```

---

## Task 4: Таблица и вью списка (TDD)

**Files:**
- Create: `web/src/components/PostTable.vue`, `web/src/views/PostListView.vue`
- Test: `web/tests/views/PostListView.test.ts`

- [ ] **Step 1: Написать падающий тест вью списка**

`web/tests/views/PostListView.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../src/api/client'
import PostListView from '../../src/views/PostListView.vue'

vi.mock('../../src/api/client', () => ({
  api: {
    listPosts: vi.fn().mockResolvedValue({
      items: [
        { id: '1', origTitle: 'A', finalTitle: 'Аа', status: 'pending', source: 'rbc', bucket: 'сво', pubDate: '2026-07-07T10:00:00.000Z' },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    }),
    listChannels: vi.fn().mockResolvedValue([]),
  },
  ApiError: class extends Error {},
}))

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('PostListView', () => {
  it('грузит и показывает карточки', async () => {
    const w = mount(PostListView)
    await new Promise((r) => setTimeout(r, 0))
    await w.vm.$nextTick()
    expect(api.listPosts).toHaveBeenCalled()
    expect(w.text()).toContain('Аа')
  })

  it('клик по строке ведёт на карточку', async () => {
    const w = mount(PostListView)
    await new Promise((r) => setTimeout(r, 0))
    await w.vm.$nextTick()
    await w.get('[data-test="row-1"]').trigger('click')
    expect(push).toHaveBeenCalledWith('/posts/1')
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/views/PostListView.test.ts`
Expected: FAIL — вью/таблица не найдены.

- [ ] **Step 3: Реализовать PostTable.vue**

`web/src/components/PostTable.vue`:
```vue
<script setup lang="ts">
import type { Post } from '../api/types'

defineProps<{ posts: Post[] }>()
const emit = defineEmits<{ open: [string] }>()
</script>

<template>
  <table class="w-full border-collapse text-sm">
    <thead>
      <tr class="border-b text-left">
        <th class="p-2">Заголовок</th>
        <th class="p-2">Статус</th>
        <th class="p-2">Бакет</th>
        <th class="p-2">Источник</th>
        <th class="p-2">Дата</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="p in posts"
        :key="p.id"
        :data-test="`row-${p.id}`"
        class="cursor-pointer border-b hover:bg-surface-100"
        @click="emit('open', p.id)"
      >
        <td class="p-2">{{ p.finalTitle || p.origTitle }}</td>
        <td class="p-2">{{ p.status }}</td>
        <td class="p-2">{{ p.bucket ?? '—' }}</td>
        <td class="p-2">{{ p.source }}</td>
        <td class="p-2">{{ new Date(p.pubDate).toLocaleString('ru') }}</td>
      </tr>
    </tbody>
  </table>
</template>
```

- [ ] **Step 4: Реализовать PostListView.vue**

`web/src/views/PostListView.vue`:
```vue
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
```

- [ ] **Step 5: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/views/PostListView.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/PostTable.vue web/src/views/PostListView.vue tests/views/PostListView.test.ts
git commit -m "feat(web): post list view + table with pagination"
```

---

## Task 5: Редактор карточки (TDD)

**Files:**
- Create: `web/src/components/PostEditor.vue`
- Test: `web/tests/components/PostEditor.test.ts`

- [ ] **Step 1: Написать падающий тест**

`web/tests/components/PostEditor.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PostEditor from '../../src/components/PostEditor.vue'
import type { Post } from '../../src/api/types'

const post = {
  id: '1',
  origTitle: 'Ориг',
  origText: 'Ориг тело',
  finalTitle: 'Фин',
  finalText: 'Фин тело',
  bucket: 'сво',
  status: 'pending',
} as Post

describe('PostEditor', () => {
  it('показывает поля и эмитит save с изменёнными значениями', async () => {
    const w = mount(PostEditor, { props: { post, buckets: ['сво', 'рф-внутр'] } })
    await w.get('[data-test="finalTitle"]').setValue('Новый заголовок')
    await w.get('[data-test="save"]').trigger('click')
    const saved = w.emitted('save') as Array<[Record<string, string>]>
    expect(saved[0][0]).toMatchObject({ finalTitle: 'Новый заголовок', finalText: 'Фин тело', bucket: 'сво' })
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/components/PostEditor.test.ts`
Expected: FAIL — компонент не найден.

- [ ] **Step 3: Реализовать PostEditor.vue**

`web/src/components/PostEditor.vue`:
```vue
<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { Post } from '../api/types'

const props = defineProps<{ post: Post; buckets: string[] }>()
const emit = defineEmits<{ save: [{ finalTitle: string; finalText: string; bucket: string }] }>()

const form = reactive({
  finalTitle: props.post.finalTitle ?? props.post.rewrittenTitle ?? props.post.origTitle,
  finalText: props.post.finalText ?? props.post.rewrittenText ?? props.post.origText,
  bucket: props.post.bucket ?? '',
})

watch(
  () => props.post.id,
  () => {
    form.finalTitle = props.post.finalTitle ?? props.post.rewrittenTitle ?? props.post.origTitle
    form.finalText = props.post.finalText ?? props.post.rewrittenText ?? props.post.origText
    form.bucket = props.post.bucket ?? ''
  },
)
</script>

<template>
  <div class="flex flex-col gap-3">
    <label class="flex flex-col text-sm">
      <span>Заголовок</span>
      <input data-test="finalTitle" v-model="form.finalTitle" class="rounded border px-2 py-1" />
    </label>
    <label class="flex flex-col text-sm">
      <span>Текст</span>
      <textarea data-test="finalText" v-model="form.finalText" rows="8" class="rounded border px-2 py-1" />
    </label>
    <label class="flex flex-col text-sm">
      <span>Бакет</span>
      <select data-test="bucket" v-model="form.bucket" class="rounded border px-2 py-1">
        <option value="">— не задан —</option>
        <option v-for="b in buckets" :key="b" :value="b">{{ b }}</option>
      </select>
    </label>

    <details class="text-sm text-surface-500">
      <summary>Оригинал</summary>
      <p class="font-medium">{{ post.origTitle }}</p>
      <p class="whitespace-pre-wrap">{{ post.origText }}</p>
    </details>

    <button
      data-test="save"
      class="self-start rounded bg-primary-500 px-3 py-1 text-white"
      @click="emit('save', { ...form })"
    >
      Сохранить
    </button>
  </div>
</template>
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/components/PostEditor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/PostEditor.vue tests/components/PostEditor.test.ts
git commit -m "feat(web): post editor (finalTitle/finalText/bucket)"
```

---

## Task 6: Менеджер картинок (TDD)

**Files:**
- Create: `web/src/components/ImageManager.vue`
- Test: `web/tests/components/ImageManager.test.ts`

- [ ] **Step 1: Написать падающий тест**

`web/tests/components/ImageManager.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ImageManager from '../../src/components/ImageManager.vue'
import type { ImageCandidate } from '../../src/api/types'

const images: ImageCandidate[] = [
  { url: 'https://a/1.jpg', type: null, origin: 'enclosure', fileId: null, chosen: true },
  { url: 'https://a/2.jpg', type: null, origin: 'content', fileId: null, chosen: false },
]

describe('ImageManager', () => {
  it('эмитит add с введённым url', async () => {
    const w = mount(ImageManager, { props: { images: [] } })
    await w.get('[data-test="img-url"]').setValue('https://new/x.jpg')
    await w.get('[data-test="img-add"]').trigger('click')
    expect((w.emitted('add') as Array<[string]>)[0][0]).toBe('https://new/x.jpg')
  })

  it('эмитит select с url картинки', async () => {
    const w = mount(ImageManager, { props: { images } })
    await w.get('[data-test="select-https://a/2.jpg"]').trigger('click')
    expect((w.emitted('select') as Array<[string | null]>)[0][0]).toBe('https://a/2.jpg')
  })

  it('эмитит select(null) по «убрать картинку»', async () => {
    const w = mount(ImageManager, { props: { images } })
    await w.get('[data-test="clear"]').trigger('click')
    expect((w.emitted('select') as Array<[string | null]>)[0][0]).toBeNull()
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/components/ImageManager.test.ts`
Expected: FAIL — компонент не найден.

- [ ] **Step 3: Реализовать ImageManager.vue**

`web/src/components/ImageManager.vue`:
```vue
<script setup lang="ts">
import { ref } from 'vue'
import type { ImageCandidate } from '../api/types'

defineProps<{ images: ImageCandidate[] }>()
const emit = defineEmits<{ add: [string]; select: [string | null] }>()

const newUrl = ref('')

function add() {
  if (!newUrl.value.trim()) return
  emit('add', newUrl.value.trim())
  newUrl.value = ''
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div v-if="!images.length" class="text-sm text-surface-500">Картинок нет — пост текстовый.</div>

    <div class="flex flex-wrap gap-3">
      <figure
        v-for="img in images"
        :key="img.url"
        class="w-40 rounded border p-1"
        :class="img.chosen ? 'border-primary-500 ring-2 ring-primary-300' : 'border-surface-200'"
      >
        <img :src="img.url" :alt="img.origin" class="h-24 w-full object-cover" />
        <figcaption class="mt-1 flex items-center justify-between text-xs">
          <span>{{ img.origin }}</span>
          <button
            :data-test="`select-${img.url}`"
            class="rounded bg-primary-500 px-2 py-0.5 text-white disabled:opacity-40"
            :disabled="img.chosen"
            @click="emit('select', img.url)"
          >
            {{ img.chosen ? 'выбрана' : 'выбрать' }}
          </button>
        </figcaption>
      </figure>
    </div>

    <div class="flex items-center gap-2">
      <input
        data-test="img-url"
        v-model="newUrl"
        placeholder="URL картинки"
        class="flex-1 rounded border px-2 py-1 text-sm"
      />
      <button data-test="img-add" class="rounded border px-3 py-1 text-sm" @click="add">Добавить</button>
      <button
        v-if="images.some((i) => i.chosen)"
        data-test="clear"
        class="rounded border px-3 py-1 text-sm"
        @click="emit('select', null)"
      >
        Убрать картинку
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/components/ImageManager.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ImageManager.vue tests/components/ImageManager.test.ts
git commit -m "feat(web): image manager (add url / select / clear)"
```

---

## Task 7: Действия аппрува и превью (TDD)

**Files:**
- Create: `web/src/components/ApprovalActions.vue`, `web/src/components/PreviewPane.vue`
- Test: `web/tests/components/ApprovalActions.test.ts`

- [ ] **Step 1: Написать падающий тест**

`web/tests/components/ApprovalActions.test.ts`:
```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ApprovalActions from '../../src/components/ApprovalActions.vue'
import type { Post } from '../../src/api/types'

function w(status: Post['status']) {
  return mount(ApprovalActions, { props: { status } })
}

describe('ApprovalActions', () => {
  it('для pending есть approve, нет unapprove', () => {
    const c = w('pending')
    expect(c.find('[data-test="approve"]').exists()).toBe(true)
    expect(c.find('[data-test="unapprove"]').exists()).toBe(false)
  })

  it('для ready_to_publish есть unapprove, нет approve', () => {
    const c = w('ready_to_publish')
    expect(c.find('[data-test="unapprove"]').exists()).toBe(true)
    expect(c.find('[data-test="approve"]').exists()).toBe(false)
  })

  it('эмитит события кнопок', async () => {
    const c = w('pending')
    await c.get('[data-test="approve"]').trigger('click')
    await c.get('[data-test="rewrite"]').trigger('click')
    await c.get('[data-test="delete"]').trigger('click')
    expect(c.emitted('approve')).toBeTruthy()
    expect(c.emitted('rewrite')).toBeTruthy()
    expect(c.emitted('delete')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/components/ApprovalActions.test.ts`
Expected: FAIL — компонент не найден.

- [ ] **Step 3: Реализовать ApprovalActions.vue**

`web/src/components/ApprovalActions.vue`:
```vue
<script setup lang="ts">
import type { PostStatus } from '../api/types'

defineProps<{ status: PostStatus }>()
const emit = defineEmits<{ approve: []; unapprove: []; delete: []; rewrite: [] }>()
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <button
      v-if="status === 'pending'"
      data-test="approve"
      class="rounded bg-green-600 px-3 py-1 text-white"
      @click="emit('approve')"
    >
      Заапрувить
    </button>
    <button
      v-if="status === 'ready_to_publish'"
      data-test="unapprove"
      class="rounded bg-amber-600 px-3 py-1 text-white"
      @click="emit('unapprove')"
    >
      Отменить аппрув
    </button>
    <button data-test="rewrite" class="rounded border px-3 py-1" @click="emit('rewrite')">
      Пере-рерайт
    </button>
    <button data-test="delete" class="rounded bg-red-600 px-3 py-1 text-white" @click="emit('delete')">
      Удалить
    </button>
  </div>
</template>
```

- [ ] **Step 4: Реализовать PreviewPane.vue**

`web/src/components/PreviewPane.vue` (показывает «как встанет в канал» — выбранную картинку по URL + финальный текст):
```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { Post } from '../api/types'

const props = defineProps<{ post: Post }>()
const chosen = computed(() => props.post.images.find((i) => i.chosen) ?? null)
</script>

<template>
  <div class="rounded border border-surface-200 p-3">
    <p class="mb-2 text-xs uppercase text-surface-500">Превью · {{ post.status }}</p>
    <img v-if="chosen" :src="chosen.url" alt="preview" class="mb-2 max-h-64 rounded object-contain" />
    <p class="font-semibold">{{ post.finalTitle || post.origTitle }}</p>
    <p class="whitespace-pre-wrap text-sm">{{ post.finalText || post.origText }}</p>
    <p v-if="post.aiError" class="mt-2 text-sm text-red-600">Ошибка ИИ: {{ post.aiError }}</p>
  </div>
</template>
```

- [ ] **Step 5: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/components/ApprovalActions.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/ApprovalActions.vue web/src/components/PreviewPane.vue tests/components/ApprovalActions.test.ts
git commit -m "feat(web): approval actions + preview pane"
```

---

## Task 8: Вью карточки, роутер, финальная проверка

**Files:**
- Create: `web/src/views/PostDetailView.vue`, `web/src/router/index.ts`

- [ ] **Step 1: Реализовать роутер**

`web/src/router/index.ts`:
```ts
import { createRouter, createWebHistory } from 'vue-router'
import PostDetailView from '../views/PostDetailView.vue'
import PostListView from '../views/PostListView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'list', component: PostListView },
    { path: '/posts/:id', name: 'detail', component: PostDetailView, props: true },
  ],
})

export default router
```

- [ ] **Step 2: Реализовать PostDetailView.vue**

`web/src/views/PostDetailView.vue`:
```vue
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
      <button class="self-start text-sm text-primary-600" @click="router.push('/')">← к списку</button>

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
        @delete="run(async () => { await posts.removeCurrent(); router.push('/') }, 'Удалено')"
      />
    </div>

    <PreviewPane :post="posts.current" />
  </div>
  <p v-else class="text-surface-500">Загрузка…</p>
</template>
```

- [ ] **Step 3: Прогнать весь тест-сьют web/**

Run (из web/): `npm test`
Expected: PASS — `api/client`, `stores/posts`, `components/*`, `views/PostListView`.

- [ ] **Step 4: Проверить сборку и типы**

Run (из web/): `npm run build`
Expected: `vue-tsc --noEmit` без ошибок, Vite собирает `dist/`.

- [ ] **Step 5: Ручной smoke (с поднятым бэкендом)**

Run: в одном терминале из корня `npm run dev` (бэкенд на :3000), в другом из `web/` — `npm run dev`. Открыть Vite-URL, создать канал и карточку через API (или n8n), убедиться: список грузится с фильтрами, карточка открывается, правка/картинки/аппрув работают, тосты показываются.
Expected: сквозной путь аппрува работает через прокси `/api`.

- [ ] **Step 6: Commit**

```bash
git add web/src/router web/src/views/PostDetailView.vue
git commit -m "feat(web): post detail view + router wiring"
```

---

## Self-Review (выполнено при написании плана)

**Покрытие ТЗ (раздел 5):**
- Просмотр карточки `pending` (текст + картинка по URL) — `PostDetailView` + `PreviewPane`. ✔
- Правка `finalTitle`/`finalText` (и `bucket`) → `PATCH /posts/:id` — `PostEditor` + `patchCurrent`. ✔
- «Добавить картинку» (URL, `origin=uploaded`) → `POST /images` — `ImageManager` + `addImage`. ✔
- Выбрать одну / убрать (текстовый пост) → `PATCH /images/select` (url|null) — `ImageManager` + `selectImage`. ✔
- «Заапрувить» → `POST /approve` (превью в служебке) — `ApprovalActions` + `approveCurrent`. ✔
- «Отменить аппрув» → `POST /unapprove` — `ApprovalActions` + `unapproveCurrent`. ✔
- «Удалить» → `DELETE /posts/:id` — `ApprovalActions` + `removeCurrent`. ✔
- Список с фильтрами `channelId/status/bucket/source/date` + пагинация → `GET /posts` — `PostFilters` + `PostListView`. ✔
- Пере-рерайт → `POST /rewrite` — `ApprovalActions` + `rewriteCurrent`. ✔
- Ошибки API (`{error,code}`) показываются тостами — `run()` + `ApiError`. ✔

**Консистентность с API:** BigInt-поля трактуются как `string` во всех типах; `images` — `ImageCandidate[]` с `{url,type,origin,fileId,chosen}`; `GET /posts` возвращает `{items,total,page,pageSize}` (пагинация в `PostListView` считает по `page*pageSize>=total`); `selectImage(url|null)` совпадает с бэкендом; пути с префиксом `/api` проксируются на `:3000`. Имена методов клиента и экшенов сторов едины между реализацией и тестами.

**Плейсхолдеры:** отсутствуют — весь код приведён целиком.

---

## Definition of Done (Фаза 5)

- `web/`: `npm test` зелёный (api-клиент, стор, компоненты, вью списка).
- `npm run build` (`vue-tsc --noEmit` + `vite build`) — без ошибок.
- Smoke с поднятым бэкендом: список/фильтры/пагинация, открытие карточки, правка, работа с картинкой, approve/unapprove/delete/rewrite, тосты.
- Все задачи закоммичены (при исполнении коммиты может делать пользователь).
