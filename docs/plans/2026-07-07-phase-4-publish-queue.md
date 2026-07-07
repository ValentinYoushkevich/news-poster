# Фаза 4 — Очередь публикации — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Отдать публикующей джобе n8n готовые к публикации карточки в правильном порядке и принять от неё рапорт об успешной публикации. Два эндпоинта: `GET /posts/queue?channelId=X&limit=` (очередь `ready_to_publish` канала, `ORDER BY pubDate ASC`, с уже готовым к постингу материалом — экранированный caption, `fileId` выбранной картинки, `mainChatId` канала) и `PATCH /posts/:id/published` (перевод `ready_to_publish → published` + `publishedMessageId` + `publishedAt`). Плюс раздел-документация контракта с n8n-джобой.

**Architecture:** Публикация в основной канал — ответственность **n8n**, не сервиса. Сервис в Telegram не ходит: он лишь (а) сериализует очередь готовых постов в формат, из которого n8n сразу собирает `sendPhoto`/`sendMessage`, и (б) принимает callback об успехе. Валидацию статусных переходов делает общий модуль `src/status.ts` (`assertTransition`), сериализацию caption — `src/telegram/html.ts` (`buildCaption`) — оба приходят из Фазы 3; Фаза 4 их **потребитель**, не владелец. Слои те же, что в Фазах 1–3: `routes` (парсинг DTO Zod + вызов сервиса) → `services/postService.ts` (Prisma + бизнес-правила) → `db`. Новые эндпоинты добавляются в существующие `src/routes/posts.ts` и `src/services/postService.ts` без изменения семантики уже готовых `GET /posts` (сортировка `desc`, пагинация остаётся как есть).

**Tech Stack:** Node.js (глобальный `fetch`), TypeScript (строгий), Express 5, Prisma 6, Zod 4, Vitest + Supertest. Внешних сетевых вызовов Фаза 4 не добавляет.

---

## Предпосылки

Фазы 1–3 завершены:

- **Фаза 1:** Prisma-схема `Channel`/`Post` (поля `status`, `pubDate`, `finalTitle`/`finalText`, `images` (`[{url,type,origin,fileId,chosen}]`), `publishedMessageId: BigInt?`, `publishedAt: DateTime?`, `channelId`, `channel.mainChatId`), миграция применена; `src/db/client.ts` (`prisma`), `src/errors.ts` (`AppError`, `asyncHandler`), `src/app.ts` (`createApp`), `src/config/env.ts` (`env`), `src/bigint.ts` (BigInt→JSON строкой), `src/normalize/normalizeItem.ts` (экспортирует `interface ImageCandidate { url; type; origin; fileId; chosen }`), `src/services/postService.ts` (`ingest`/`listPosts`/`getPost`/`patchPost`), `src/routes/posts.ts`, тест-хелперы `tests/helpers/db.ts` (`resetDb`, `makeChannel`).
- **Фаза 2:** ИИ-воркер и очередь; под `VITEST` фоновый ИИ-триггер не влияет на синхронные ответы.
- **Фаза 3 (SHARED CONTRACTS — Фаза 4 их только потребляет, НЕ создаёт и НЕ редактирует):**
  - `src/status.ts` экспортирует `assertTransition(from: string, to: string): void`, бросает `AppError(409, 'invalid_transition')`. Карта переходов уже включает `ready_to_publish → published`. Фаза 4 берёт текущий `status` поста из БД как `from` и вызывает `assertTransition(post.status, 'published')`.
  - `src/telegram/html.ts` экспортирует `escapeHtml(s: string): string` и `buildCaption(finalTitle: string, finalText: string): string`. Фаза 4 импортирует `buildCaption` для сериализации очереди (HTML-экранирование и сборку caption делает он).

> Эти два файла НЕ создаются и НЕ переопределяются в Фазе 4. Если на момент старта их ещё нет (Фаза 3 пишется параллельно) — дождаться их появления перед прогоном тестов Task 1/Task 2.

Тестовое окружение: Postgres на 5436, `vitest.config.ts` c `setupFiles: ['dotenv/config']`, `fileParallelism: false`. Тесты: `createApp()` + supertest, `beforeEach(resetDb)`, `afterAll(() => prisma.$disconnect())`.

---

## Структура файлов

```
src/services/postService.ts   # МОДИФИКАЦИЯ: listPublishQueue(...) + markPublished(...)
src/routes/posts.ts           # МОДИФИКАЦИЯ: GET /posts/queue (до /:id) + PATCH /posts/:id/published
tests/routes/queue.test.ts    # НОВЫЙ: очередь публикации
tests/routes/published.test.ts# НОВЫЙ: callback публикации
docs/plans/2026-07-07-phase-4-publish-queue.md  # этот план (раздел контракта n8n — Task 3)
```

**Границы файлов:** вся выборка/сериализация очереди и переход `→ published` живут в `postService.ts` (единственное место с Prisma-запросами и бизнес-правилами). Роут только парсит query/body через Zod и приводит `req.params.id` к `BigInt`. Постинг в Telegram Фаза 4 не реализует — это n8n (Task 3, документация контракта).

**Важно про порядок роутов (Express 5):** `GET /posts/queue` ДОЛЖЕН быть зарегистрирован **до** `GET /posts/:id`, иначе `/queue` попадёт в `/:id` (`id='queue'`) и `BigInt('queue')` бросит. PATCH `/:id/published` и PATCH `/:id` не конфликтуют (разная глубина сегментов).

---

## Task 1: Очередь публикации — сервис + `GET /posts/queue` (TDD)

**Files:**
- Modify: `src/services/postService.ts` (добавить `listPublishQueue` + импорты `ImageCandidate`, `buildCaption`)
- Modify: `src/routes/posts.ts` (добавить `GET /queue` перед `GET /:id`, импорт `listPublishQueue`)
- Test: `tests/routes/queue.test.ts`

Форма ответа — массив `QueueItem` (уже отсортирован, готов к постингу без дозапросов): каждый пост как `{ id, channelId, pubDate, caption, fileId, mainChatId }`. `caption` — результат `buildCaption(finalTitle, finalText)` (экранирование внутри). `fileId` — из `images`-элемента с `chosen === true` (или `null`, если картинки нет / не выбрана / не залита → n8n пойдёт по ветке `sendMessage`). `mainChatId` — из канала. Фильтр: только `status === 'ready_to_publish'` конкретного канала, `ORDER BY pubDate ASC` (старые первыми — ровный тайминг), `take = limit`.

- [ ] **Step 1: Написать падающий тест очереди**

Создать `tests/routes/queue.test.ts`:
```ts
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/db/client.js'
import { makeChannel, resetDb } from '../helpers/db.js'

const app = createApp()

beforeEach(resetDb)
afterAll(() => prisma.$disconnect())

async function seedPost(
  channelId: bigint,
  over: Record<string, unknown> = {},
) {
  return prisma.post.create({
    data: {
      channelId,
      source: 'rbc',
      sourceLang: 'ru',
      link: `https://a/${Math.random()}`,
      origTitle: 'T',
      origText: 'B',
      categories: [],
      pubDate: new Date('2026-07-07T10:00:00.000Z'),
      images: [],
      finalTitle: 'Заголовок',
      finalText: 'Тело поста',
      status: 'ready_to_publish',
      ...over,
    },
  })
}

describe('GET /posts/queue', () => {
  it('отдаёт только ready_to_publish этого канала', async () => {
    const ch = await makeChannel()
    const other = await makeChannel()
    await seedPost(ch.id, { link: 'https://a/1' })
    await seedPost(ch.id, { link: 'https://a/2', status: 'pending' }) // не готов
    await seedPost(other.id, { link: 'https://a/3' }) // другой канал

    const res = await request(app).get(`/posts/queue?channelId=${ch.id}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBe(1)
    expect(res.body[0].mainChatId).toBe(ch.mainChatId)
  })

  it('порядок по pubDate ASC (старые первыми)', async () => {
    const ch = await makeChannel()
    await seedPost(ch.id, { link: 'https://a/new', pubDate: new Date('2026-07-07T12:00:00.000Z') })
    await seedPost(ch.id, { link: 'https://a/old', pubDate: new Date('2026-07-07T08:00:00.000Z') })
    const res = await request(app).get(`/posts/queue?channelId=${ch.id}`)
    expect(res.status).toBe(200)
    const dates = res.body.map((p: { pubDate: string }) => p.pubDate)
    expect(new Date(dates[0]).getTime()).toBeLessThan(new Date(dates[1]).getTime())
  })

  it('caption собран из final-полей, fileId — из выбранной картинки', async () => {
    const ch = await makeChannel()
    await seedPost(ch.id, {
      link: 'https://a/img',
      finalTitle: 'Заг',
      finalText: 'Тело',
      images: [
        { url: 'https://i/skip.jpg', type: 'image/jpeg', origin: 'content', fileId: 'FID_SKIP', chosen: false },
        { url: 'https://i/use.jpg', type: 'image/jpeg', origin: 'uploaded', fileId: 'FID_USE', chosen: true },
      ],
    })
    const res = await request(app).get(`/posts/queue?channelId=${ch.id}`)
    expect(res.status).toBe(200)
    expect(res.body[0].fileId).toBe('FID_USE')
    expect(typeof res.body[0].caption).toBe('string')
    expect(res.body[0].caption).toContain('Заг')
    expect(res.body[0].caption).toContain('Тело')
  })

  it('пост без картинки -> fileId=null (n8n пойдёт в sendMessage)', async () => {
    const ch = await makeChannel()
    await seedPost(ch.id, { link: 'https://a/text', images: [] })
    const res = await request(app).get(`/posts/queue?channelId=${ch.id}`)
    expect(res.status).toBe(200)
    expect(res.body[0].fileId).toBeNull()
  })

  it('limit ограничивает выдачу', async () => {
    const ch = await makeChannel()
    await seedPost(ch.id, { link: 'https://a/1' })
    await seedPost(ch.id, { link: 'https://a/2' })
    await seedPost(ch.id, { link: 'https://a/3' })
    const res = await request(app).get(`/posts/queue?channelId=${ch.id}&limit=2`)
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(2)
  })

  it('400 без channelId', async () => {
    const res = await request(app).get('/posts/queue')
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/routes/queue.test.ts`
Expected: FAIL — роута `/queue` нет (перехватывает `GET /:id` → `BigInt('queue')` бросает / 404), либо `listPublishQueue` не найден.

- [ ] **Step 3: Реализовать `listPublishQueue` в postService.ts**

В `src/services/postService.ts` дополнить импорты в начале файла. Было:
```ts
import { normalizeItem, type RawItem } from '../normalize/normalizeItem.js'
```
Стало (добавить тип картинки + сериализатор caption из Фазы 3):
```ts
import { normalizeItem, type ImageCandidate, type RawItem } from '../normalize/normalizeItem.js'
import { buildCaption } from '../telegram/html.js'
```

Добавить в конец `src/services/postService.ts`:
```ts
export interface QueueItem {
  id: bigint
  channelId: bigint
  pubDate: Date
  caption: string
  fileId: string | null
  mainChatId: string
}

const QUEUE_LIMIT_DEFAULT = 10

// Готовая к постингу очередь канала: только ready_to_publish, старые первыми
// (ровный тайминг). Возвращаем всё, что n8n нужно для sendPhoto/sendMessage,
// одним запросом — сам сервис в Telegram не ходит.
export async function listPublishQueue(filter: {
  channelId: bigint
  limit?: number
}): Promise<QueueItem[]> {
  const posts = await prisma.post.findMany({
    where: { channelId: filter.channelId, status: 'ready_to_publish' },
    orderBy: { pubDate: 'asc' },
    take: filter.limit ?? QUEUE_LIMIT_DEFAULT,
    include: { channel: true },
  })

  return posts.map((p) => {
    const images = (p.images as unknown as ImageCandidate[]) ?? []
    const chosen = Array.isArray(images) ? images.find((img) => img.chosen) : undefined
    return {
      id: p.id,
      channelId: p.channelId,
      pubDate: p.pubDate,
      caption: buildCaption(p.finalTitle ?? '', p.finalText ?? ''),
      fileId: chosen?.fileId ?? null,
      mainChatId: p.channel.mainChatId,
    }
  })
}
```

- [ ] **Step 4: Добавить роут `GET /posts/queue` (до `GET /:id`)**

В `src/routes/posts.ts` дополнить импорт сервиса. Было:
```ts
import { getPost, ingest, listPosts, patchPost } from '../services/postService.js'
```
Стало:
```ts
import { getPost, ingest, listPosts, listPublishQueue, patchPost } from '../services/postService.js'
```

Вставить блок **сразу после** обработчика `postsRouter.get('/', ...)` и **строго до** `postsRouter.get('/:id', ...)` (иначе `/queue` уйдёт в `/:id`):
```ts
const queueSchema = z.object({
  channelId: z.coerce.bigint(),
  limit: z.coerce.number().int().min(1).max(100).default(10),
})

postsRouter.get(
  '/queue',
  asyncHandler(async (req, res) => {
    const q = queueSchema.parse(req.query)
    res.json(await listPublishQueue(q))
  }),
)
```

- [ ] **Step 5: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/routes/queue.test.ts`
Expected: PASS (фильтр по каналу + только ready_to_publish, порядок ASC, caption/fileId, text-only, limit, 400 без channelId).

- [ ] **Step 6: Проверить, что не сломан `GET /posts` (desc-семантика)**

Run: `npx vitest run tests/routes/posts.test.ts`
Expected: PASS — существующий список постов не затронут.

- [ ] **Step 7: Commit**

```bash
git add src/services/postService.ts src/routes/posts.ts tests/routes/queue.test.ts
git commit -m "feat: GET /posts/queue — per-channel ready_to_publish queue (pubDate ASC)"
```

---

## Task 2: `PATCH /posts/:id/published` — рапорт джобы (TDD)

**Files:**
- Modify: `src/services/postService.ts` (добавить `markPublished` + импорт `assertTransition`)
- Modify: `src/routes/posts.ts` (добавить `PATCH /:id/published`, импорт `markPublished`)
- Test: `tests/routes/published.test.ts`

Джоба после успешного постинга рапортует: `ready_to_publish → published`, пишет `publishedMessageId` (из тела, `BigInt`) и `publishedAt = now`. Текущий `status` берём из БД как `from` и валидируем через общий `assertTransition` (Фаза 3): любой невалидный источник (напр. `pending`) → `409 invalid_transition`; несуществующий id → `404`.

- [ ] **Step 1: Написать падающий тест**

Создать `tests/routes/published.test.ts`:
```ts
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/db/client.js'
import { makeChannel, resetDb } from '../helpers/db.js'

const app = createApp()

beforeEach(resetDb)
afterAll(() => prisma.$disconnect())

async function seedPost(channelId: bigint, over: Record<string, unknown> = {}) {
  return prisma.post.create({
    data: {
      channelId,
      source: 'rbc',
      sourceLang: 'ru',
      link: `https://a/${Math.random()}`,
      origTitle: 'T',
      origText: 'B',
      categories: [],
      pubDate: new Date('2026-07-07T10:00:00.000Z'),
      images: [],
      finalTitle: 'Заг',
      finalText: 'Тело',
      status: 'ready_to_publish',
      ...over,
    },
  })
}

describe('PATCH /posts/:id/published', () => {
  it('ready_to_publish -> published + publishedMessageId + publishedAt', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id)
    const res = await request(app)
      .patch(`/posts/${post.id}/published`)
      .send({ publishedMessageId: '4242' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('published')
    expect(res.body.publishedMessageId).toBe('4242') // BigInt сериализуется строкой
    expect(res.body.publishedAt).not.toBeNull()
  })

  it('невалидный переход (pending) -> 409 invalid_transition', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, { status: 'pending' })
    const res = await request(app)
      .patch(`/posts/${post.id}/published`)
      .send({ publishedMessageId: '1' })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('invalid_transition')
  })

  it('несуществующий id -> 404', async () => {
    const res = await request(app)
      .patch('/posts/999999/published')
      .send({ publishedMessageId: '1' })
    expect(res.status).toBe(404)
  })

  it('400 без publishedMessageId', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id)
    const res = await request(app).patch(`/posts/${post.id}/published`).send({})
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/routes/published.test.ts`
Expected: FAIL — роута/сервиса нет (404 на существующем id или `markPublished` не найден).

- [ ] **Step 3: Реализовать `markPublished` в postService.ts**

В `src/services/postService.ts` добавить импорт валидатора переходов (Фаза 3), рядом с прочими импортами:
```ts
import { assertTransition } from '../status.js'
```

Добавить в конец `src/services/postService.ts`:
```ts
// Callback публикующей джобы: перевод в published после успешного постинга n8n.
// from берём из БД, переход валидирует общий assertTransition (409 invalid_transition).
export async function markPublished(id: bigint, publishedMessageId: bigint) {
  const post = await getPost(id) // 404, если нет
  assertTransition(post.status, 'published')
  return prisma.post.update({
    where: { id },
    data: {
      status: 'published',
      publishedMessageId,
      publishedAt: new Date(),
    },
  })
}
```

- [ ] **Step 4: Добавить роут `PATCH /posts/:id/published`**

В `src/routes/posts.ts` дополнить импорт сервиса (теперь с `markPublished`):
```ts
import { getPost, ingest, listPosts, listPublishQueue, markPublished, patchPost } from '../services/postService.js'
```

Добавить обработчик в конец файла (после `PATCH /:id` / `POST /:id/rewrite`):
```ts
const publishedSchema = z.object({
  publishedMessageId: z.coerce.bigint(),
})

postsRouter.patch(
  '/:id/published',
  asyncHandler(async (req, res) => {
    const id = BigInt(String(req.params.id)) // Express 5: params.id имеет тип string | string[]
    const dto = publishedSchema.parse(req.body)
    res.json(await markPublished(id, dto.publishedMessageId))
  }),
)
```

- [ ] **Step 5: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/routes/published.test.ts`
Expected: PASS (успешный переход; `pending → published` → 409 `invalid_transition`; 404; 400 без тела).

- [ ] **Step 6: Прогнать весь сьют + сборку**

Run:
```bash
npm test
npx tsc --noEmit
```
Expected: все тест-файлы Фаз 1–4 зелёные; компиляция без ошибок (импорты `src/status.js` и `src/telegram/html.js` из Фазы 3 разрешаются).

- [ ] **Step 7: Commit**

```bash
git add src/services/postService.ts src/routes/posts.ts tests/routes/published.test.ts
git commit -m "feat: PATCH /posts/:id/published — publish callback via assertTransition"
```

---

## Task 3: Контракт с публикующей джобой n8n (документация, без кода)

**Files:** только этот план (раздел ниже). Кода не добавляем — постинг в основной канал исполняет n8n.

Зафиксировать в репозитории контракт, по которому n8n-воркфлоу публикации потребляет два эндпоинта Фазы 4. **Постинг в основной канал (`channels.mainChatId`) делает n8n; сервис в Telegram НЕ ходит — только отдаёт очередь и принимает callback.**

- [ ] **Step 1: Зафиксировать контракт публикующей джобы**

Публикующий воркфлоу n8n — **отдельный на каждый канал, по своему расписанию** из `channels.schedule` (cron/интервал). Цикл одного тика:

1. **Забор очереди.** `GET /posts/queue?channelId=<id>&limit=<N>` → массив `QueueItem`, уже отсортированный `pubDate ASC` (старые первыми — ровный тайминг). Обрабатывать по одному (напр. `limit=1` на тик, либо `limit=N` и постить по очереди с паузами). Каждый элемент:
   ```json
   {
     "id": "123",
     "channelId": "1",
     "pubDate": "2026-07-07T10:00:00.000Z",
     "caption": "<b>Заголовок</b>\n\nТело (уже HTML-экранировано сервисом)",
     "fileId": "AgACAgIAAx...",   // или null
     "mainChatId": "-1001234567890"
   }
   ```
2. **Постинг в основной канал** (`mainChatId` из элемента), один бот (`BOT_TOKEN` в env n8n):
   - **есть `fileId`** → `sendPhoto`: `{ chat_id: mainChatId, photo: fileId, caption, parse_mode: "HTML" }`. `caption` ограничен Telegram в **≤ 1024** символа — сервис уже собрал его через `buildCaption` с учётом лимита; n8n при необходимости дополнительно усекает.
   - **`fileId === null`** → `sendMessage`: `{ chat_id: mainChatId, text: caption, parse_mode: "HTML" }`, лимит **≤ 4096**.
3. **Фолбэк.** Если `sendPhoto` упал (битый/протухший `file_id`, картинка не прикрепилась) → повторить как `sendMessage` без картинки (тем же `caption`). Пост не теряется.
4. **Рапорт об успехе.** После успешного постинга (в т.ч. после фолбэка) → `PATCH /posts/:id/published` с телом `{ "publishedMessageId": <message_id из ответа Telegram> }`. Сервис переведёт `ready_to_publish → published`, запишет `publishedMessageId` и `publishedAt`. Повторный вызов на уже `published`-посте → `409 invalid_transition` (идемпотентная защита от двойной публикации: джоба трактует 409 как «уже опубликован, не постить снова»).

Разделение ответственности:

| Шаг | Кто делает |
|---|---|
| Хранение статусов, сериализация caption (`buildCaption`, HTML-экранирование), выбор картинки (`chosen`/`fileId`), сортировка очереди | **Сервис** |
| Расписание, вызовы Telegram (`sendPhoto`/`sendMessage`), фолбэк, извлечение `message_id` | **n8n** |
| Перевод в `published` + `publishedMessageId`/`publishedAt`, валидация перехода | **Сервис** (через callback) |

- [ ] **Step 2: Commit**

```bash
git add docs/plans/2026-07-07-phase-4-publish-queue.md
git commit -m "docs: n8n publish-job contract for phase 4 queue"
```

---

## Self-Review (выполнено при написании плана)

**Покрытие ТЗ (раздел 7 + строки REST раздела 6 про очередь и published):**
- Очередь публикации канала, `ORDER BY pubDate ASC`, только `ready_to_publish` — `listPublishQueue` + `GET /posts/queue` (Task 1). ✔
- Выделенный эндпоинт `GET /posts/queue?channelId=&limit=` (дефолт 10), **семантика `GET /posts` (desc + пагинация) не тронута** — отдельная сервисная функция и роут (Task 1, Step 6 проверяет регрессию). ✔
- В ответ по каждому посту — готовый материал: `caption` через `buildCaption` (Фаза 3, экранирование внутри), `fileId` выбранной (`chosen === true`) картинки, `mainChatId` канала (Task 1). ✔
- `PATCH /posts/:id/published`: `ready_to_publish → published` через `assertTransition` (Фаза 3), `publishedMessageId` (BigInt из тела), `publishedAt = now` (Task 2). ✔
- Невалидный переход (напр. из `pending`) → `409 invalid_transition`; несуществующий id → `404` (Task 2). ✔
- Контракт n8n-джобы: per-channel расписание из `channels.schedule`, `sendPhoto` (≤1024, `parse_mode=HTML`) при `fileId`, иначе `sendMessage` (≤4096), фолбэк `sendPhoto`→`sendMessage`, callback `PATCH …/published`; постинг делает n8n, сервис в Telegram не ходит (Task 3). ✔

**SHARED CONTRACTS (Фаза 4 — потребитель):** `src/status.ts` (`assertTransition`) и `src/telegram/html.ts` (`buildCaption`) НЕ создаются и НЕ редактируются здесь — только импортируются. `from` для перехода берётся из БД (`post.status`), а не хардкодится. ✔

**Порядок роутов:** `GET /posts/queue` регистрируется до `GET /posts/:id` (иначе `/queue` уйдёт в `/:id` и `BigInt('queue')` бросит) — явно зафиксировано в Task 1 Step 4. ✔

**Консистентность типов и имён:** `QueueItem{ id, channelId, pubDate, caption, fileId, mainChatId }`; `listPublishQueue({channelId, limit?})`; `markPublished(id: bigint, publishedMessageId: bigint)`; `ImageCandidate` берётся из `normalizeItem.ts` (Фаза 1), `buildCaption`/`escapeHtml` — из `telegram/html.ts` (Фаза 3), `assertTransition` — из `status.ts` (Фаза 3). Роуты приводят query/params через `z.coerce.bigint()` / `BigInt(String(req.params.id))`. BigInt в JSON-ответах — строкой (`src/bigint.ts`, Фаза 1), поэтому тест сверяет `publishedMessageId === '4242'`.

**Плейсхолдеры:** не найдено — весь код приведён целиком.

---

## Definition of Done (Фаза 4)

- `npm test` — зелёный, включая новые `tests/routes/queue.test.ts` и `tests/routes/published.test.ts`, плюс все тесты Фаз 1–3.
- `npx tsc --noEmit` / `npm run build` — без ошибок (импорты `src/status.js`, `src/telegram/html.js` из Фазы 3 разрешаются).
- `GET /posts/queue` отдаёт только `ready_to_publish` канала в порядке `pubDate ASC` с `caption`/`fileId`/`mainChatId`; `GET /posts` (desc) не изменён.
- `PATCH /posts/:id/published` двигает `ready_to_publish → published` и ловит невалидный переход `409` / отсутствие `404`.
- Контракт с публикующей джобой n8n задокументирован; сервис в Telegram не ходит.
- Все задачи закоммичены.
