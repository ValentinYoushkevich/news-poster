> ⚠️ **Исторический документ: план выполнен.** Отдельные детали устарели (создание каналов теперь через UI админки, порт 3000 наружу не публикуется, добавлена аутентификация `/login`). Актуальное описание системы — [docs/устройство системы.md](../устройство%20системы.md).

# Фаза 3 — Telegram + аппрув — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать человеку через REST заапрувить карточку в статусе `pending`: собрать HTML-caption, отправить выбранную/загруженную картинку (или текст) в **служебный канал** (`SERVICE_CHAT_ID`) через тонкий Telegram-клиент (один бот, `BOT_TOKEN`), разобрать ответ (`file_id` крупнейшего `photo[]` + `message_id`), записать `fileId`/`previewMessageId` и перевести `pending → ready_to_publish`. Плюс работа с картинкой (добавить свою / выбрать одну / убрать), откат аппрува и soft-delete. Все статус-переходы — через единый валидатор `assertTransition`.

**Architecture:** Слои Фаз 1–2 сохраняются: `routes` (парсинг DTO Zod) → `services/postService` (бизнес-логика поверх Prisma) → `db`. Новое: Telegram спрятан за интерфейсом `TelegramClient` — тонкая обёртка над глобальным `fetch` (как ИИ-провайдеры Фазы 2). `approvePost(id, telegram = defaultTelegram())` принимает клиент инъекцией, поэтому тестируется без сети (в тестах роута модуль `telegram/default` мокается через `vi.mock`; юнит-тест самого клиента — со стабом `global fetch`). Чистые функции `escapeHtml`/`buildCaption` (`telegram/html.ts`) и валидатор `assertTransition` (`status.ts`) не зависят от БД. `status.ts` — единый владелец карты статус-переходов (Фаза 4 её только читает).

**Tech Stack:** Node.js (глобальный `fetch`, без HTTP-библиотек), TypeScript, Express 5, Prisma 6 (из Фаз 1–2), Zod 4, Vitest + Supertest. Telegram Bot API вызывается только в реальном клиенте; вся логика — на чистых функциях и инъекции.

---

## Предпосылки

Фазы 1–2 завершены. Доступно:

- Prisma-модель `Post` с полями `images` (Json: `[{url,type,origin,fileId,chosen}]`), `finalTitle`/`finalText`, `status`, `previewMessageId` (BigInt?), `approvedAt`, `rejectReason`, `publishedMessageId`; модель `Channel` (`previewTtl`, `buckets`, `rewritePrompts`, `mainChatId`).
- `src/db/client.ts` → `prisma`; `src/bigint.ts` (BigInt → строка в JSON).
- `src/errors.ts` → `AppError(status, message, code?)`, `asyncHandler`; `src/middleware/errorHandler.ts` ловит `AppError` (отдаёт `{ error: message, code }`) и `ZodError` (400).
- `src/app.ts` → `createApp()` монтирует `/channels` и `/posts`.
- `src/services/postService.ts` → `ingest`, `listPosts`, `getPost`, `patchPost`.
- `src/routes/posts.ts` → ingest/list/get/patch/rewrite.
- `src/normalize/normalizeItem.ts` экспортирует тип `ImageCandidate` = `{ url: string; type: string | null; origin: 'enclosure' | 'content' | 'uploaded'; fileId: string | null; chosen: boolean }`.
- `src/config/env.ts` содержит `DATABASE_URL`, `PORT`, `PREVIEW_TTL_DEFAULT`, ИИ-ключи. **`BOT_TOKEN`/`SERVICE_CHAT_ID` пока ОТСУТСТВУЮТ** — добавляются в Task 1.
- `tests/helpers/db.ts` → `resetDb`, `makeChannel`. Vitest: `setupFiles: ['dotenv/config']`, `fileParallelism: false`, `hookTimeout: 30000`. Под `VITEST=true` фоновый ИИ-триггер отключён (не мешает тестам аппрува).
- `.env`/`.env.example` уже содержат `BOT_TOKEN=""` и `SERVICE_CHAT_ID=""` (заведены в Фазе 1).

**Express 5:** `req.params.id` имеет тип `string | string[]` — везде `BigInt(String(req.params.id))`.
**Zod 4:** для произвольного JSON — `z.record(z.string(), z.any())`.

## Структура файлов

```
src/telegram/
  types.ts        # TelegramClient, SendPhotoInput/SendMessageInput, TelegramSendResult
  client.ts       # createTelegramClient({botToken}) — тонкая обёртка над fetch
  default.ts      # defaultTelegram() из env.BOT_TOKEN
  html.ts         # escapeHtml, buildCaption (учёт лимита caption ≤1024)
src/status.ts     # assertTransition — полная карта статус-переходов (владелец Фаза 3)
src/config/env.ts            # МОДИФИКАЦИЯ: + BOT_TOKEN, SERVICE_CHAT_ID
src/services/postService.ts  # МОДИФИКАЦИЯ: addImage, selectImage, approvePost, unapprovePost, softDeletePost
src/routes/posts.ts          # МОДИФИКАЦИЯ: POST /:id/images, PATCH /:id/images/select,
                             #             POST /:id/approve, POST /:id/unapprove, DELETE /:id
tests/telegram/html.test.ts
tests/telegram/client.test.ts
tests/status.test.ts
tests/routes/images.test.ts
tests/routes/approve.test.ts
tests/routes/moderation.test.ts   # unapprove + delete
```

**Границы:** `telegram/html.ts` и `status.ts` — чистые функции без БД и сети (юнит-тесты мгновенные). `telegram/client.ts` — единственное место, где логика ходит в сеть (`fetch`), тестируется со стабом `global fetch`. `postService` — единственное место, где бизнес-логика трогает Prisma и (через инъекцию) Telegram. `routes` — только Zod-парсинг и вызов сервиса.

**Решение по загрузке картинки (п. 4 ТЗ, раздел 5.1):** `POST /posts/:id/images` принимает **JSON `{ url, type? }`** (не multipart). Причина: Telegram `sendPhoto` принимает удалённый URL в поле `photo` напрямую, поэтому загруженная человеком картинка отправляема в служебку на аппруве **без промежуточной заливки файла на нашей стороне**; клиент остаётся тонкой JSON-обёрткой над `fetch` (без multer/FormData), а всё покрывается юнит-тестами. Фронтенд (Фаза 5) отвечает за выбор файла и получение прямой ссылки. Кандидат кладётся в `images[]` с `origin='uploaded'`; если выбранной картинки ещё нет — новый кандидат автоматически становится `chosen`.

---

## Task 1: Telegram-клиент за интерфейсом + env (TDD, мок fetch)

**Files:**
- Create: `src/telegram/types.ts`, `src/telegram/client.ts`, `src/telegram/default.ts`
- Modify: `src/config/env.ts`
- Test: `tests/telegram/client.test.ts`

`createTelegramClient({ botToken })` — тонкая обёртка: `sendPhoto`/`sendMessage` шлют JSON в `https://api.telegram.org/bot<token>/<method>`. Из ответа `sendPhoto` достаётся `file_id` **крупнейшего** элемента `photo[]`. Служебку выбирает вызывающий (передаёт `chatId`), чтобы клиент оставался переиспользуемым.

- [ ] **Step 1: Записать интерфейсы**

Создать `src/telegram/types.ts`:
```ts
export interface TelegramSendResult {
  messageId: number
  fileId?: string
}

export interface SendPhotoInput {
  chatId: string
  photo: string // URL или уже готовый file_id
  caption?: string
}

export interface SendMessageInput {
  chatId: string
  text: string
}

export interface TelegramClient {
  sendPhoto(input: SendPhotoInput): Promise<TelegramSendResult>
  sendMessage(input: SendMessageInput): Promise<TelegramSendResult>
}
```

- [ ] **Step 2: Расширить env-конфиг (BOT_TOKEN, SERVICE_CHAT_ID)**

Заменить содержимое `src/config/env.ts` на:
```ts
import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  PREVIEW_TTL_DEFAULT: z.coerce.number().default(1440),

  BOT_TOKEN: z.string().default(''),
  SERVICE_CHAT_ID: z.string().default(''),

  OLLAMA_URL: z.string().default('http://localhost:11434'),
  EMBED_MODEL: z.string().default('bge-m3'),

  OPENROUTER_URL: z.string().default('https://openrouter.ai/api/v1/chat/completions'),
  OPENROUTER_API_KEY: z.string().default(''),
  REWRITE_MODEL: z.string().default('openai/gpt-4o-mini'),

  DEDUP_THRESHOLD: z.coerce.number().default(0.85),
  DEDUP_WINDOW_HOURS: z.coerce.number().default(24),
})

export const env = schema.parse(process.env)
```
(`BOT_TOKEN`/`SERVICE_CHAT_ID` уже объявлены в `.env`/`.env.example` из Фазы 1; `default('')` покрывает пустые значения в тестах.)

- [ ] **Step 3: Написать падающий тест клиента**

Создать `tests/telegram/client.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTelegramClient } from '../../src/telegram/client.js'

afterEach(() => vi.unstubAllGlobals())

function mockFetch(body: unknown, ok = true, status = 200) {
  const fn = vi.fn(async () => ({ ok, status, json: async () => body }))
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('createTelegramClient.sendPhoto', () => {
  it('шлёт chat_id/photo/caption/parse_mode и возвращает messageId + крупнейший file_id', async () => {
    const fetchMock = mockFetch({
      ok: true,
      result: {
        message_id: 555,
        photo: [
          { file_id: 'small', file_unique_id: 'u1', width: 90, height: 60, file_size: 1000 },
          { file_id: 'big', file_unique_id: 'u2', width: 1280, height: 720, file_size: 90000 },
        ],
      },
    })
    const tg = createTelegramClient({ botToken: 'TOKEN' })
    const res = await tg.sendPhoto({ chatId: '-100777', photo: 'https://img/a.jpg', caption: 'Привет' })
    expect(res).toEqual({ messageId: 555, fileId: 'big' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://api.telegram.org/botTOKEN/sendPhoto')
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      chat_id: '-100777',
      photo: 'https://img/a.jpg',
      caption: 'Привет',
      parse_mode: 'HTML',
    })
  })

  it('не-ok HTTP -> ошибка', async () => {
    mockFetch({ ok: false, description: 'boom' }, false, 500)
    const tg = createTelegramClient({ botToken: 'T' })
    await expect(tg.sendPhoto({ chatId: 'c', photo: 'p' })).rejects.toThrow()
  })

  it('ok:false в теле -> ошибка', async () => {
    mockFetch({ ok: false, description: 'chat not found' }, true, 200)
    const tg = createTelegramClient({ botToken: 'T' })
    await expect(tg.sendPhoto({ chatId: 'c', photo: 'p' })).rejects.toThrow()
  })
})

describe('createTelegramClient.sendMessage', () => {
  it('возвращает messageId без fileId', async () => {
    const fetchMock = mockFetch({ ok: true, result: { message_id: 777 } })
    const tg = createTelegramClient({ botToken: 'T' })
    const res = await tg.sendMessage({ chatId: '-100', text: 'текст' })
    expect(res).toEqual({ messageId: 777 })

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://api.telegram.org/botT/sendMessage')
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      chat_id: '-100',
      text: 'текст',
      parse_mode: 'HTML',
    })
  })
})
```

- [ ] **Step 4: Запустить — убедиться, что падает**

Run: `npx vitest run tests/telegram/client.test.ts`
Expected: FAIL — модуль `../../src/telegram/client.js` не найден.

- [ ] **Step 5: Реализовать client.ts**

Создать `src/telegram/client.ts`:
```ts
import type {
  SendMessageInput,
  SendPhotoInput,
  TelegramClient,
  TelegramSendResult,
} from './types.js'

interface TgPhotoSize {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  file_size?: number
}

interface TgResult {
  message_id: number
  photo?: TgPhotoSize[]
}

interface TgResponse {
  ok: boolean
  result?: TgResult
  description?: string
}

// file_id крупнейшего элемента photo[] (Telegram отдаёт несколько размеров).
function largestFileId(photo?: TgPhotoSize[]): string | undefined {
  if (!photo || photo.length === 0) return undefined
  const largest = photo.reduce((a, b) => {
    const sa = a.file_size ?? a.width * a.height
    const sb = b.file_size ?? b.width * b.height
    return sb > sa ? b : a
  })
  return largest.file_id
}

export function createTelegramClient(cfg: { botToken: string }): TelegramClient {
  async function call(method: string, payload: Record<string, unknown>): Promise<TgResult> {
    const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = (await res.json()) as TgResponse
    if (!res.ok || !data.ok || !data.result) {
      throw new Error(`telegram_${method}_failed:${res.status}:${data.description ?? ''}`)
    }
    return data.result
  }

  return {
    async sendPhoto(input: SendPhotoInput): Promise<TelegramSendResult> {
      const result = await call('sendPhoto', {
        chat_id: input.chatId,
        photo: input.photo,
        caption: input.caption,
        parse_mode: 'HTML',
      })
      return { messageId: result.message_id, fileId: largestFileId(result.photo) }
    },
    async sendMessage(input: SendMessageInput): Promise<TelegramSendResult> {
      const result = await call('sendMessage', {
        chat_id: input.chatId,
        text: input.text,
        parse_mode: 'HTML',
      })
      return { messageId: result.message_id }
    },
  }
}
```

- [ ] **Step 6: Реализовать default.ts**

Создать `src/telegram/default.ts`:
```ts
import { env } from '../config/env.js'
import { createTelegramClient } from './client.js'
import type { TelegramClient } from './types.js'

// Реальный клиент из env (один бот на все каналы). Инъектируется в approvePost;
// в тестах роута аппрува модуль мокается через vi.mock.
export function defaultTelegram(): TelegramClient {
  return createTelegramClient({ botToken: env.BOT_TOKEN })
}
```

- [ ] **Step 7: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/telegram/client.test.ts`
Expected: PASS (крупнейший file_id, отправка полей, обе ветки ошибок, sendMessage без fileId).

- [ ] **Step 8: Проверить компиляцию**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 9: Commit**

```bash
git add src/telegram/types.ts src/telegram/client.ts src/telegram/default.ts src/config/env.ts tests/telegram/client.test.ts
git commit -m "feat(tg): telegram client (sendPhoto/sendMessage) + env bot/service chat"
```

---

## Task 2: HTML-экранирование и caption (TDD, чистые)

**Files:**
- Create: `src/telegram/html.ts`
- Test: `tests/telegram/html.test.ts`

`escapeHtml` экранирует `& < >` (порядок важен: `&` первым). `buildCaption` собирает `<b>заголовок</b>\n\nтело` из экранированных частей и держит лимит caption `≤ 1024` (лимит Telegram для `sendPhoto`). При переполнении режем **сырой** текст посимвольно и экранируем — чтобы не разрезать HTML-сущность (`&amp;`). Владелец файла — Фаза 3; Фаза 4 переиспользует эти функции для сериализации очереди.

- [ ] **Step 1: Написать падающий тест**

Создать `tests/telegram/html.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { buildCaption, escapeHtml } from '../../src/telegram/html.js'

describe('escapeHtml', () => {
  it('экранирует & < > (амперсанд первым)', () => {
    expect(escapeHtml('a & b <c> "d"')).toBe('a &amp; b &lt;c&gt; "d"')
  })
  it('пустая строка -> пустая', () => {
    expect(escapeHtml('')).toBe('')
  })
})

describe('buildCaption', () => {
  it('оборачивает экранированный заголовок в <b> и добавляет тело через пустую строку', () => {
    expect(buildCaption('Заголовок', 'Тело')).toBe('<b>Заголовок</b>\n\nТело')
  })
  it('экранирует спецсимволы и в заголовке, и в теле', () => {
    expect(buildCaption('A & B', 'x < y')).toBe('<b>A &amp; B</b>\n\nx &lt; y')
  })
  it('пустой заголовок -> без <b>', () => {
    expect(buildCaption('', 'только тело')).toBe('только тело')
  })
  it('пустое тело -> только заголовок', () => {
    expect(buildCaption('Только заголовок', '')).toBe('<b>Только заголовок</b>')
  })
  it('держит лимит 1024 символа', () => {
    const cap = buildCaption('T', 'я'.repeat(5000))
    expect(cap.length).toBeLessThanOrEqual(1024)
    expect(cap.endsWith('…')).toBe(true)
  })
  it('не рвёт HTML-сущность при обрезке', () => {
    const cap = buildCaption('', '&'.repeat(5000))
    expect(cap.length).toBeLessThanOrEqual(1024)
    // каждая & превратилась в &amp;; обрезка по сырому тексту не оставит "&amp" без ";"
    expect(cap.replace(/…$/, '').endsWith('&amp;') || cap === '…').toBe(true)
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/telegram/html.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать html.ts**

Создать `src/telegram/html.ts`:
```ts
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const CAPTION_LIMIT = 1024

// <b>заголовок</b>\n\nтело из экранированных частей, с лимитом caption ≤ 1024.
// При переполнении режем СЫРОЙ текст посимвольно, затем экранируем — так обрезка
// никогда не рвёт HTML-сущность посередине (напр. &amp;).
export function buildCaption(finalTitle: string, finalText: string): string {
  const title = (finalTitle ?? '').trim()
  const text = (finalText ?? '').trim()
  const titleHtml = title ? `<b>${escapeHtml(title)}</b>` : ''
  const glue = titleHtml && text ? '\n\n' : ''

  let caption = titleHtml + glue + escapeHtml(text)
  if (caption.length > CAPTION_LIMIT) {
    let body = text
    while ((titleHtml + glue + escapeHtml(body) + '…').length > CAPTION_LIMIT && body.length > 0) {
      body = body.slice(0, -1)
    }
    caption = titleHtml + glue + escapeHtml(body) + '…'
  }
  return caption
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/telegram/html.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/telegram/html.ts tests/telegram/html.test.ts
git commit -m "feat(tg): html escape + caption builder with 1024 limit"
```

---

## Task 3: Валидатор статус-переходов (TDD, чистая)

**Files:**
- Create: `src/status.ts`
- Test: `tests/status.test.ts`

`assertTransition(from, to)` бросает `AppError(409, 'invalid_transition')` на запрещённый переход. Владелец карты — Фаза 3; Фаза 4 её только **читает** (вызывает `assertTransition('ready_to_publish', 'published')`).

- [ ] **Step 1: Написать падающий тест**

Создать `tests/status.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { AppError } from '../src/errors.js'
import { assertTransition } from '../src/status.js'

describe('assertTransition — разрешённые', () => {
  const ok: [string, string][] = [
    ['ingested', 'processing'],
    ['processing', 'pending'],
    ['processing', 'failed'],
    ['processing', 'rejected'],
    ['pending', 'ready_to_publish'],
    ['pending', 'rejected'],
    ['ready_to_publish', 'pending'],
    ['ready_to_publish', 'published'],
    ['ready_to_publish', 'rejected'],
  ]
  for (const [from, to] of ok) {
    it(`${from} -> ${to}`, () => {
      expect(() => assertTransition(from, to)).not.toThrow()
    })
  }
})

describe('assertTransition — запрещённые', () => {
  it('бросает AppError(409, "invalid_transition")', () => {
    try {
      assertTransition('ingested', 'published')
      throw new Error('должно было бросить')
    } catch (e) {
      expect(e).toBeInstanceOf(AppError)
      expect((e as AppError).status).toBe(409)
      expect((e as AppError).message).toBe('invalid_transition')
    }
  })
  it('published — терминальный', () => {
    expect(() => assertTransition('published', 'pending')).toThrow()
  })
  it('rejected — терминальный', () => {
    expect(() => assertTransition('rejected', 'pending')).toThrow()
  })
  it('неизвестный статус -> запрещено', () => {
    expect(() => assertTransition('zzz', 'pending')).toThrow()
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/status.test.ts`
Expected: FAIL — модуль `../src/status.js` не найден.

- [ ] **Step 3: Реализовать status.ts**

Создать `src/status.ts`:
```ts
import { AppError } from './errors.js'

// Полная карта статус-переходов. ВЛАДЕЛЕЦ — Фаза 3; Фаза 4 её только читает
// (вызывает assertTransition('ready_to_publish', 'published'), файл не редактирует).
//
// Примечание к 'ready_to_publish': 'rejected' добавлен к целям, чтобы soft-delete
// уже заапрувленной карточки (DELETE /posts/:id, раздел 5.4 ТЗ) шёл через
// assertTransition. Это надмножество зафиксированной в SHARED CONTRACTS карты;
// нужный Фазе 4 переход ready_to_publish -> published остаётся валидным.
const TRANSITIONS: Record<string, readonly string[]> = {
  ingested: ['processing'],
  processing: ['pending', 'failed', 'rejected'],
  pending: ['ready_to_publish', 'rejected'],
  ready_to_publish: ['pending', 'published', 'rejected'],
}

export function assertTransition(from: string, to: string): void {
  const allowed = TRANSITIONS[from] ?? []
  if (!allowed.includes(to)) {
    throw new AppError(409, 'invalid_transition')
  }
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/status.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/status.ts tests/status.test.ts
git commit -m "feat: status transition validator (assertTransition, 409)"
```

---

## Task 4: Картинки — загрузка своей и выбор (TDD)

**Files:**
- Modify: `src/services/postService.ts` (добавить `addImage`, `selectImage`)
- Modify: `src/routes/posts.ts` (добавить `POST /:id/images`, `PATCH /:id/images/select`)
- Test: `tests/routes/images.test.ts`

`POST /posts/:id/images` принимает JSON `{ url, type? }` → кладёт кандидата `origin='uploaded'` в `images[]`; если выбранной картинки ещё нет — новый кандидат становится `chosen`. `PATCH /posts/:id/images/select` с `{ url }` делает `chosen=true` у совпадающей и `false` у остальных; с `{ url: null }` — снимает выбор со всех (пост станет текстовым).

- [ ] **Step 1: Написать падающий тест**

Создать `tests/routes/images.test.ts`:
```ts
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/db/client.js'
import { makeChannel, resetDb } from '../helpers/db.js'

const app = createApp()

beforeEach(resetDb)
afterAll(() => prisma.$disconnect())

async function seedPost(channelId: bigint, images: unknown[] = [], status = 'pending') {
  return prisma.post.create({
    data: {
      channelId,
      source: 'rbc',
      sourceLang: 'ru',
      link: `https://a/${Math.random()}`,
      origTitle: 'T',
      origText: 'B',
      categories: [],
      pubDate: new Date('2026-07-07T10:00:00Z'),
      images: images as never,
      finalTitle: 'Заг',
      finalText: 'Тело',
      status,
    },
  })
}

describe('POST /posts/:id/images', () => {
  it('добавляет uploaded-кандидата и авто-выбирает его, если выбранной нет', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, [])
    const res = await request(app)
      .post(`/posts/${post.id}/images`)
      .send({ url: 'https://my/pic.jpg', type: 'image/jpeg' })
    expect(res.status).toBe(201)
    expect(res.body.images).toEqual([
      { url: 'https://my/pic.jpg', type: 'image/jpeg', origin: 'uploaded', fileId: null, chosen: true },
    ])
  })

  it('не перевыбирает, если уже есть chosen', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, [
      { url: 'https://a.jpg', type: null, origin: 'enclosure', fileId: null, chosen: true },
    ])
    const res = await request(app).post(`/posts/${post.id}/images`).send({ url: 'https://b.jpg' })
    expect(res.status).toBe(201)
    const uploaded = res.body.images.find((i: { origin: string }) => i.origin === 'uploaded')
    expect(uploaded.chosen).toBe(false)
    expect(res.body.images.find((i: { url: string }) => i.url === 'https://a.jpg').chosen).toBe(true)
  })

  it('404 для несуществующего поста', async () => {
    const res = await request(app).post('/posts/999999/images').send({ url: 'https://x.jpg' })
    expect(res.status).toBe(404)
  })

  it('400 без url', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, [])
    const res = await request(app).post(`/posts/${post.id}/images`).send({})
    expect(res.status).toBe(400)
  })
})

describe('PATCH /posts/:id/images/select', () => {
  it('выбирает одну (chosen=true у неё, false у остальных)', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, [
      { url: 'https://a.jpg', type: null, origin: 'enclosure', fileId: null, chosen: true },
      { url: 'https://b.jpg', type: null, origin: 'uploaded', fileId: null, chosen: false },
    ])
    const res = await request(app).patch(`/posts/${post.id}/images/select`).send({ url: 'https://b.jpg' })
    expect(res.status).toBe(200)
    expect(res.body.images.find((i: { url: string }) => i.url === 'https://a.jpg').chosen).toBe(false)
    expect(res.body.images.find((i: { url: string }) => i.url === 'https://b.jpg').chosen).toBe(true)
  })

  it('url:null снимает выбор со всех (текстовый пост)', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, [
      { url: 'https://a.jpg', type: null, origin: 'enclosure', fileId: null, chosen: true },
    ])
    const res = await request(app).patch(`/posts/${post.id}/images/select`).send({ url: null })
    expect(res.status).toBe(200)
    expect(res.body.images.every((i: { chosen: boolean }) => i.chosen === false)).toBe(true)
  })

  it('404, если url нет среди кандидатов', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, [
      { url: 'https://a.jpg', type: null, origin: 'enclosure', fileId: null, chosen: true },
    ])
    const res = await request(app).patch(`/posts/${post.id}/images/select`).send({ url: 'https://nope.jpg' })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/routes/images.test.ts`
Expected: FAIL — роутов нет (404/ошибка).

- [ ] **Step 3: Дописать функции в postService.ts**

Добавить в конец `src/services/postService.ts` (и дополнить импорты, см. блок ниже):
```ts
export async function addImage(
  id: bigint,
  input: { url: string; type?: string | null },
) {
  const post = await getPost(id)
  const images = (post.images as unknown as ImageCandidate[]) ?? []
  const hasChosen = images.some((i) => i.chosen)
  const candidate: ImageCandidate = {
    url: input.url,
    type: input.type ?? null,
    origin: 'uploaded',
    fileId: null,
    chosen: !hasChosen, // авто-выбор, если выбранной ещё нет
  }
  const next = [...images, candidate]
  return prisma.post.update({
    where: { id },
    data: { images: next as unknown as Prisma.InputJsonValue },
  })
}

export async function selectImage(id: bigint, url: string | null) {
  const post = await getPost(id)
  const images = (post.images as unknown as ImageCandidate[]) ?? []
  if (url === null) {
    const next = images.map((i) => ({ ...i, chosen: false }))
    return prisma.post.update({
      where: { id },
      data: { images: next as unknown as Prisma.InputJsonValue },
    })
  }
  if (!images.some((i) => i.url === url)) throw new AppError(404, 'image_not_found')
  const next = images.map((i) => ({ ...i, chosen: i.url === url }))
  return prisma.post.update({
    where: { id },
    data: { images: next as unknown as Prisma.InputJsonValue },
  })
}
```
Дополнить импорты в начале файла (к уже существующим `Prisma`, `prisma`, `AppError`, `normalizeItem`/`RawItem`):
```ts
import type { ImageCandidate } from '../normalize/normalizeItem.js'
```

- [ ] **Step 4: Дописать роуты в posts.ts**

В `src/routes/posts.ts` дополнить импорт из сервиса и добавить обработчики (после `PATCH /:id`, до `POST /:id/rewrite`):
```ts
const addImageSchema = z.object({
  url: z.string().min(1),
  type: z.string().optional(),
})

postsRouter.post(
  '/:id/images',
  asyncHandler(async (req, res) => {
    const dto = addImageSchema.parse(req.body)
    const post = await addImage(BigInt(String(req.params.id)), dto)
    res.status(201).json(post)
  }),
)

const selectImageSchema = z.object({
  url: z.string().min(1).nullable(),
})

postsRouter.patch(
  '/:id/images/select',
  asyncHandler(async (req, res) => {
    const dto = selectImageSchema.parse(req.body)
    res.json(await selectImage(BigInt(String(req.params.id)), dto.url))
  }),
)
```
Итоговая строка импорта сервиса в начале файла:
```ts
import { addImage, getPost, ingest, listPosts, patchPost, selectImage } from '../services/postService.js'
```

- [ ] **Step 5: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/routes/images.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/postService.ts src/routes/posts.ts tests/routes/images.test.ts
git commit -m "feat: upload own image (uploaded) + select/clear image"
```

---

## Task 5: Аппрув — превью в служебку (TDD, Telegram через vi.mock)

**Files:**
- Modify: `src/services/postService.ts` (добавить `approvePost`)
- Modify: `src/routes/posts.ts` (добавить `POST /:id/approve`)
- Test: `tests/routes/approve.test.ts`

`approvePost(id, telegram = defaultTelegram())`: требует `pending` (через `assertTransition(status, 'ready_to_publish')`), собирает caption (`buildCaption` — экранирование), отправляет выбранную картинку в служебку (`sendPhoto`, `photo = fileId ?? url`) или текст (`sendMessage`, если выбранной картинки нет), разбирает ответ (есть `file_id` → пишем в выбранную картинку; `message_id` → `previewMessageId`), ставит `status='ready_to_publish'`, `approvedAt=now`. В тестах роута модуль `telegram/default` мокается через `vi.mock` — сеть не трогаем, `BOT_TOKEN`/`SERVICE_CHAT_ID` не нужны.

- [ ] **Step 1: Написать падающий тест**

Создать `tests/routes/approve.test.ts`:
```ts
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Хойстим спаи, чтобы vi.mock (тоже хойстится) их видел.
const { sendPhotoMock, sendMessageMock } = vi.hoisted(() => ({
  sendPhotoMock: vi.fn(),
  sendMessageMock: vi.fn(),
}))

vi.mock('../../src/telegram/default.js', () => ({
  defaultTelegram: () => ({ sendPhoto: sendPhotoMock, sendMessage: sendMessageMock }),
}))

import { createApp } from '../../src/app.js'
import { prisma } from '../../src/db/client.js'
import { makeChannel, resetDb } from '../helpers/db.js'

const app = createApp()

beforeEach(async () => {
  await resetDb()
  sendPhotoMock.mockReset()
  sendMessageMock.mockReset()
})
afterEach(() => vi.clearAllMocks())
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
      pubDate: new Date('2026-07-07T10:00:00Z'),
      images: [],
      finalTitle: 'Заголовок & факты',
      finalText: 'Тело поста',
      status: 'pending',
      ...over,
    },
  })
}

describe('POST /posts/:id/approve — с картинкой', () => {
  it('шлёт sendPhoto, пишет fileId + previewMessageId, статус ready_to_publish', async () => {
    sendPhotoMock.mockResolvedValue({ messageId: 555, fileId: 'FILE_123' })
    const ch = await makeChannel()
    const post = await seedPost(ch.id, {
      images: [{ url: 'https://a.jpg', type: null, origin: 'enclosure', fileId: null, chosen: true }],
    })

    const res = await request(app).post(`/posts/${post.id}/approve`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ready_to_publish')
    expect(res.body.previewMessageId).toBe('555')
    expect(res.body.approvedAt).not.toBeNull()
    expect(res.body.images[0].fileId).toBe('FILE_123')

    expect(sendPhotoMock).toHaveBeenCalledTimes(1)
    expect(sendMessageMock).not.toHaveBeenCalled()
    // caption экранирован: & -> &amp;, заголовок в <b>
    const captionArg = sendPhotoMock.mock.calls[0][0].caption as string
    expect(captionArg).toContain('<b>Заголовок &amp; факты</b>')
    // выбранная картинка ушла в photo
    expect(sendPhotoMock.mock.calls[0][0].photo).toBe('https://a.jpg')
  })

  it('уже имеющийся fileId используется как photo (переиспользование CDN)', async () => {
    sendPhotoMock.mockResolvedValue({ messageId: 1, fileId: 'NEW' })
    const ch = await makeChannel()
    const post = await seedPost(ch.id, {
      images: [{ url: 'https://a.jpg', type: null, origin: 'enclosure', fileId: 'OLD_FILE', chosen: true }],
    })
    await request(app).post(`/posts/${post.id}/approve`)
    expect(sendPhotoMock.mock.calls[0][0].photo).toBe('OLD_FILE')
  })
})

describe('POST /posts/:id/approve — без картинки', () => {
  it('шлёт sendMessage, пишет previewMessageId, статус ready_to_publish', async () => {
    sendMessageMock.mockResolvedValue({ messageId: 777 })
    const ch = await makeChannel()
    const post = await seedPost(ch.id, { images: [] })

    const res = await request(app).post(`/posts/${post.id}/approve`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ready_to_publish')
    expect(res.body.previewMessageId).toBe('777')
    expect(sendMessageMock).toHaveBeenCalledTimes(1)
    expect(sendPhotoMock).not.toHaveBeenCalled()
  })
})

describe('POST /posts/:id/approve — ошибки', () => {
  it('не из pending -> 409 invalid_transition', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, { status: 'ready_to_publish' })
    const res = await request(app).post(`/posts/${post.id}/approve`)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('invalid_transition')
    expect(sendPhotoMock).not.toHaveBeenCalled()
    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it('404 для несуществующего', async () => {
    const res = await request(app).post('/posts/999999/approve')
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/routes/approve.test.ts`
Expected: FAIL — роут `/:id/approve` отсутствует.

- [ ] **Step 3: Дописать approvePost в postService.ts**

Добавить в конец `src/services/postService.ts`:
```ts
export async function approvePost(id: bigint, telegram: TelegramClient = defaultTelegram()) {
  const post = await getPost(id)
  assertTransition(post.status, 'ready_to_publish') // требует pending

  const caption = buildCaption(post.finalTitle ?? '', post.finalText ?? '')
  const images = (post.images as unknown as ImageCandidate[]) ?? []
  const chosen = images.find((i) => i.chosen)

  let previewMessageId: number
  let nextImages = images

  if (chosen) {
    const sent = await telegram.sendPhoto({
      chatId: env.SERVICE_CHAT_ID,
      photo: chosen.fileId ?? chosen.url,
      caption,
    })
    previewMessageId = sent.messageId
    if (sent.fileId) {
      nextImages = images.map((i) =>
        i.url === chosen.url ? { ...i, fileId: sent.fileId ?? null } : i,
      )
    }
  } else {
    const sent = await telegram.sendMessage({
      chatId: env.SERVICE_CHAT_ID,
      text: caption,
    })
    previewMessageId = sent.messageId
  }

  return prisma.post.update({
    where: { id },
    data: {
      images: nextImages as unknown as Prisma.InputJsonValue,
      previewMessageId: BigInt(previewMessageId),
      status: 'ready_to_publish',
      approvedAt: new Date(),
    },
  })
}
```
Дополнить импорты в начале файла (к уже добавленному `ImageCandidate` из Task 4):
```ts
import { env } from '../config/env.js'
import { assertTransition } from '../status.js'
import { defaultTelegram } from '../telegram/default.js'
import { buildCaption } from '../telegram/html.js'
import type { TelegramClient } from '../telegram/types.js'
```

- [ ] **Step 4: Дописать роут /approve в posts.ts**

В `src/routes/posts.ts` добавить обработчик (после `PATCH /:id/images/select`) и `approvePost` в импорт сервиса:
```ts
postsRouter.post(
  '/:id/approve',
  asyncHandler(async (req, res) => {
    const post = await approvePost(BigInt(String(req.params.id)))
    res.json(post)
  }),
)
```
Итоговая строка импорта сервиса:
```ts
import {
  addImage,
  approvePost,
  getPost,
  ingest,
  listPosts,
  patchPost,
  selectImage,
} from '../services/postService.js'
```

- [ ] **Step 5: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/routes/approve.test.ts`
Expected: PASS (с картинкой / без / 409 / 404).

- [ ] **Step 6: Commit**

```bash
git add src/services/postService.ts src/routes/posts.ts tests/routes/approve.test.ts
git commit -m "feat: approve — send preview to service chat, store fileId + previewMessageId"
```

---

## Task 6: Отмена аппрува и soft-delete (TDD)

**Files:**
- Modify: `src/services/postService.ts` (добавить `unapprovePost`, `softDeletePost`)
- Modify: `src/routes/posts.ts` (добавить `POST /:id/unapprove`, `DELETE /:id`)
- Test: `tests/routes/moderation.test.ts`

`unapprovePost`: `ready_to_publish → pending` (через `assertTransition`); сообщение-превью в служебке **не удаляем** (TTL-автоудаление снаружи). `softDeletePost`: `→ rejected` (через `assertTransition`; разрешено из `pending`/`processing`/`ready_to_publish`), `rejectReason` опционально; карточка убирается из рабочей выдачи (фильтр `status`).

- [ ] **Step 1: Написать падающий тест**

Создать `tests/routes/moderation.test.ts`:
```ts
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/db/client.js'
import { makeChannel, resetDb } from '../helpers/db.js'

const app = createApp()

beforeEach(resetDb)
afterAll(() => prisma.$disconnect())

async function seedPost(channelId: bigint, status: string) {
  return prisma.post.create({
    data: {
      channelId,
      source: 'rbc',
      sourceLang: 'ru',
      link: `https://a/${Math.random()}`,
      origTitle: 'T',
      origText: 'B',
      categories: [],
      pubDate: new Date('2026-07-07T10:00:00Z'),
      images: [],
      status,
    },
  })
}

describe('POST /posts/:id/unapprove', () => {
  it('ready_to_publish -> pending', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, 'ready_to_publish')
    const res = await request(app).post(`/posts/${post.id}/unapprove`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('pending')
  })

  it('из pending -> 409', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, 'pending')
    const res = await request(app).post(`/posts/${post.id}/unapprove`)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('invalid_transition')
  })

  it('404 для несуществующего', async () => {
    const res = await request(app).post('/posts/999999/unapprove')
    expect(res.status).toBe(404)
  })
})

describe('DELETE /posts/:id', () => {
  it('pending -> rejected с rejectReason', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, 'pending')
    const res = await request(app).delete(`/posts/${post.id}`).send({ rejectReason: 'дубль' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('rejected')
    expect(res.body.rejectReason).toBe('дубль')
  })

  it('ready_to_publish -> rejected (без причины)', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, 'ready_to_publish')
    const res = await request(app).delete(`/posts/${post.id}`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('rejected')
    expect(res.body.rejectReason).toBeNull()
  })

  it('processing -> rejected', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, 'processing')
    const res = await request(app).delete(`/posts/${post.id}`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('rejected')
  })

  it('уже published -> 409 (нельзя удалить)', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, 'published')
    const res = await request(app).delete(`/posts/${post.id}`)
    expect(res.status).toBe(409)
  })

  it('удалённая карточка пропадает из рабочей выдачи (?status=pending)', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id, 'pending')
    await request(app).delete(`/posts/${post.id}`)
    const list = await request(app).get(`/posts?channelId=${ch.id}&status=pending`)
    expect(list.body.total).toBe(0)
  })

  it('404 для несуществующего', async () => {
    const res = await request(app).delete('/posts/999999')
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/routes/moderation.test.ts`
Expected: FAIL — роутов `/unapprove` и `DELETE /:id` нет.

- [ ] **Step 3: Дописать функции в postService.ts**

Добавить в конец `src/services/postService.ts`:
```ts
export async function unapprovePost(id: bigint) {
  const post = await getPost(id)
  assertTransition(post.status, 'pending') // требует ready_to_publish
  // Превью-сообщение в служебке НЕ удаляем — там TTL-автоудаление снаружи.
  return prisma.post.update({ where: { id }, data: { status: 'pending' } })
}

export async function softDeletePost(id: bigint, rejectReason?: string) {
  const post = await getPost(id)
  assertTransition(post.status, 'rejected')
  return prisma.post.update({
    where: { id },
    data: { status: 'rejected', rejectReason: rejectReason ?? null },
  })
}
```

- [ ] **Step 4: Дописать роуты в posts.ts**

В `src/routes/posts.ts` добавить обработчики (после `POST /:id/approve`) и дополнить импорт сервиса:
```ts
postsRouter.post(
  '/:id/unapprove',
  asyncHandler(async (req, res) => {
    res.json(await unapprovePost(BigInt(String(req.params.id))))
  }),
)

const deleteSchema = z.object({
  rejectReason: z.string().optional(),
})

postsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const dto = deleteSchema.parse(req.body ?? {})
    res.json(await softDeletePost(BigInt(String(req.params.id)), dto.rejectReason))
  }),
)
```
Итоговая строка импорта сервиса:
```ts
import {
  addImage,
  approvePost,
  getPost,
  ingest,
  listPosts,
  patchPost,
  selectImage,
  softDeletePost,
  unapprovePost,
} from '../services/postService.js'
```

- [ ] **Step 5: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/routes/moderation.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/postService.ts src/routes/posts.ts tests/routes/moderation.test.ts
git commit -m "feat: unapprove (ready_to_publish->pending) + soft-delete (->rejected)"
```

---

## Task 7: Полный прогон сьюта и сборки

**Files:** —

- [ ] **Step 1: Прогнать весь тест-сьют**

Run: `npm test`
Expected: PASS — все файлы Фаз 1–3 (`normalize/*`, `routes/channels`, `routes/posts`, `ai/*`, `routes/rewrite`, `telegram/html`, `telegram/client`, `status`, `routes/images`, `routes/approve`, `routes/moderation`).

- [ ] **Step 2: Проверить сборку/типы**

Run:
```bash
npx tsc --noEmit
npm run build
```
Expected: без ошибок; появляется/обновляется `dist/`.

- [ ] **Step 3: Ручной smoke-тест (опционально, с реальными BOT_TOKEN/SERVICE_CHAT_ID в .env)**

Run: `npm run dev`. В другом терминале — создать канал, заслать ingest, довести до `pending` (или вручную выставить статус), затем:
```bash
curl -s -X POST localhost:3000/posts/1/images -H 'content-type: application/json' -d '{"url":"https://picsum.photos/600"}'
curl -s -X POST localhost:3000/posts/1/approve
```
Expected: превью улетает в служебку, ответ содержит `"status":"ready_to_publish"`, `"previewMessageId"` и `fileId` у выбранной картинки.

- [ ] **Step 4: Commit (если были доп. правки)**

```bash
git add -A
git commit -m "test: full suite green for phase 3 (telegram + approve)"
```

---

## Self-Review (выполнено при написании плана)

**Покрытие ТЗ (разделы 5, 8 и строки REST раздела 6):**
- Telegram-клиент за интерфейсом, один бот `BOT_TOKEN`, тонкая обёртка над `fetch`, `sendPhoto`/`sendMessage`, разбор крупнейшего `file_id` из `photo[]` — Task 1. ✔
- HTML-экранирование `& < >` + `buildCaption` (`<b>title</b>\n\ntext`, лимит caption ≤1024, без разрыва сущностей) — Task 2. ✔
- Валидатор статус-переходов `assertTransition` с полной картой — Task 3. ✔
- `POST /posts/:id/images` — загрузка своей картинки (`origin='uploaded'`, JSON `{url,type?}`, авто-выбор при отсутствии chosen) — Task 4. ✔
- `PATCH /posts/:id/images/select` — выбрать одну (`chosen` эксклюзивно) либо `url:null` → текстовый пост — Task 4. ✔
- `POST /posts/:id/approve` — caption + отправка выбранной картинки (или текст) в служебку (`SERVICE_CHAT_ID`), разбор ответа (`file_id`→в выбранную картинку, `message_id`→`previewMessageId`), `pending→ready_to_publish`, `approvedAt=now`, возврат превью — Task 5. ✔
- `POST /posts/:id/unapprove` — `ready_to_publish→pending`, превью в служебке не удаляется — Task 6. ✔
- `DELETE /posts/:id` — soft-delete `→rejected` (из pending/processing/ready_to_publish), `rejectReason` опц., уходит из рабочей выдачи — Task 6. ✔
- Служебный канал (раздел 8): один общий `SERVICE_CHAT_ID`, заполняется на аппруве, отдаёт `file_id`+`message_id`; чистка только TTL — превью на unapprove не трогаем. ✔

**SHARED CONTRACTS с Фазой 4:**
- `src/status.ts` — владелец Фаза 3. Экспорт `assertTransition(from, to): void`, `AppError(409,'invalid_transition')`. Карта включает `ready_to_publish→published` (Фаза 4 только вызывает). Отступление от буквальной enumeration: к `ready_to_publish` добавлен целевой `rejected` — это надмножество, нужное для soft-delete заапрувленных карточек (item 8); `ready_to_publish→published` не затронут, Фаза 4 читает файл, не редактирует. ✔
- `src/telegram/html.ts` — владелец Фаза 3. Экспорт `escapeHtml(s): string`, `buildCaption(finalTitle, finalText): string`. Фаза 4 переиспользует для сериализации очереди. ✔
- Постинг в основной канал — n8n, не сервис. Фаза 3 шлёт ТОЛЬКО в служебку (превью). ✔

**Консистентность типов и имён:** `TelegramClient{sendPhoto,sendMessage}`; `TelegramSendResult{messageId, fileId?}`; `SendPhotoInput{chatId,photo,caption?}`/`SendMessageInput{chatId,text}`; `createTelegramClient({botToken})`/`defaultTelegram()`. `ImageCandidate` переиспользован из `normalize/normalizeItem.ts` (не продублирован). Функции сервиса `addImage`/`selectImage`/`approvePost`/`unapprovePost`/`softDeletePost` едины между сервисом, роутами и тестами. `assertTransition` вызывается только в сервисе (роуты статусов не знают). Express 5: везде `BigInt(String(req.params.id))`. `previewMessageId` пишется как `BigInt(previewMessageId)` (в JSON сериализуется строкой через `src/bigint.ts`). Telegram в тестах роута аппрува — `vi.mock('../../src/telegram/default.js')` с хойстнутыми спаями; юнит-тест клиента — стаб `global fetch` (как `tests/ai/providers.test.ts`); `BOT_TOKEN`/`SERVICE_CHAT_ID` в тестах не требуются (клиент замокан), значения по умолчанию `''`.

**Плейсхолдеры:** не найдено — весь код приведён целиком (никаких TBD/«аналогично»).

---

## Definition of Done (Фаза 3)

- `npm test` — зелёный, включая новые `tests/telegram/*`, `tests/status.test.ts`, `tests/routes/{images,approve,moderation}.test.ts`, плюс все тесты Фаз 1–2.
- `npx tsc --noEmit` / `npm run build` — без ошибок.
- Telegram спрятан за `TelegramClient`; `approvePost` тестируется без сети (мок клиента), клиент — со стабом `fetch`.
- `assertTransition` — единый валидатор статусов; аппрув/отмена/удаление проходят только по карте (иначе 409).
- Аппрув отправляет превью в служебку, сохраняет `fileId`/`previewMessageId`, двигает `pending→ready_to_publish`; unapprove и soft-delete работают, удалённая карточка уходит из рабочей выдачи.
- Все задачи закоммичены.
