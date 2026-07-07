> ⚠️ **Исторический документ: план выполнен.** Отдельные детали устарели (создание каналов теперь через UI админки, порт 3000 наружу не публикуется, добавлена аутентификация `/login`). Актуальное описание системы — [docs/устройство системы.md](../устройство%20системы.md).

# Фаза 1 — Фундамент: БД, каналы, ingest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Поднять бэкенд-фундамент: PostgreSQL+Prisma со схемой `channels`/`posts`, каркас Express, CRUD каналов, слой нормализации сырых айтемов и ingest-эндпоинт `POST /posts` с дедупом по `(channelId, link)`, плюс базовое чтение/правку постов.

**Architecture:** TypeScript-сервис на Express. Слои: `routes` (HTTP) → `services` (бизнес-логика поверх Prisma) → `db` (Prisma-клиент). Чистые функции нормализации (`normalize/`) не зависят от БД и покрываются юнит-тестами. Ошибки идут через `AppError` и единый error-middleware. ИИ-обработка в этой фазе не реализуется — ingest лишь ставит статус `ingested` (триггер воркера — заглушка-хук для Фазы 2).

**Tech Stack:** Node.js, TypeScript, Express, Prisma, PostgreSQL, Vitest, Supertest, Zod (валидация входных DTO), tsx.

---

## Структура файлов

```
docker-compose.yml            # локальный Postgres (dev + test)
package.json
tsconfig.json
vitest.config.ts
.env.example
.env                          # локальный, в .gitignore
prisma/
  schema.prisma               # модели Channel, Post
src/
  config/env.ts               # чтение и валидация env
  bigint.ts                   # BigInt.prototype.toJSON патч
  db/client.ts                # singleton PrismaClient
  errors.ts                   # AppError + asyncHandler
  middleware/errorHandler.ts  # express error middleware
  normalize/
    html.ts                   # stripHtml, cutReadMoreTail, extractFirstImgSrc
    normalizeItem.ts          # сырой айтем n8n -> поля карточки
  services/
    channelService.ts         # CRUD каналов
    postService.ts            # ingest, list, get, patch
  routes/
    channels.ts               # /channels
    posts.ts                  # /posts
  ai/trigger.ts               # заглушка триггера ИИ-воркера (Фаза 2)
  app.ts                      # фабрика Express-приложения
  server.ts                   # entrypoint
tests/
  helpers/db.ts               # reset БД, фабрики каналов
  normalize/html.test.ts
  normalize/normalizeItem.test.ts
  routes/channels.test.ts
  routes/posts.test.ts
```

**Границы файлов:** нормализация — чистые функции без БД; сервисы — единственное место, где живут Prisma-запросы и бизнес-правила (дедуп, статусы); роуты — только парсинг DTO (Zod) и вызов сервисов. Триггер ИИ вынесен за интерфейс `ai/trigger.ts`, чтобы Фаза 2 заменила заглушку реальным воркером, не трогая ingest.

---

## Task 0: Скаффолдинг проекта

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `docker-compose.yml`, `.env.example`, `.env`

- [ ] **Step 1: Инициализировать package.json и поставить зависимости**

Run (из корня репо):
```bash
npm init -y
npm i express zod @prisma/client
npm i -D typescript tsx prisma vitest supertest @types/express @types/node @types/supertest
```

- [ ] **Step 2: Записать package.json (скрипты и type=module)**

Заменить содержимое `package.json` на:
```json
{
  "name": "news-poster",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "node dist/server.js",
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "prisma:migrate": "prisma migrate dev",
    "prisma:generate": "prisma generate"
  }
}
```
(Секции `dependencies`/`devDependencies` оставить как их записал npm на шаге 1.)

- [ ] **Step 3: Записать tsconfig.json**

Создать `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Записать vitest.config.ts**

Создать `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    hookTimeout: 30000,
  },
})
```
(`fileParallelism: false` — тестовые файлы делят одну БД, гоняем последовательно, чтобы truncate не мешал параллельным файлам.)

- [ ] **Step 5: Записать docker-compose.yml (Postgres для dev и test)**

Создать `docker-compose.yml`:
```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: newsposter
      POSTGRES_PASSWORD: newsposter
      POSTGRES_DB: newsposter
    ports:
      - "5433:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```
(Порт 5433 наружу, чтобы не конфликтовать с локальным Postgres на 5432.)

- [ ] **Step 6: Записать .env.example и .env**

Создать `.env.example`:
```
DATABASE_URL="postgresql://newsposter:newsposter@localhost:5433/newsposter?schema=public"
PORT=3000
# Заполняются в Фазе 3, но объявлены заранее:
BOT_TOKEN=""
SERVICE_CHAT_ID=""
PREVIEW_TTL_DEFAULT=1440
```
Скопировать в `.env` (тем же содержимым; `.env` уже в `.gitignore`).

- [ ] **Step 7: Поднять БД и убедиться, что контейнер жив**

Run:
```bash
docker compose up -d
docker compose ps
```
Expected: сервис `db` в состоянии `running`/`healthy`.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts docker-compose.yml .env.example
git commit -m "chore: bootstrap typescript+express+prisma project scaffold"
```

---

## Task 1: Prisma-схема, миграция, клиент, BigInt-сериализация

**Files:**
- Create: `prisma/schema.prisma`, `src/db/client.ts`, `src/bigint.ts`, `src/config/env.ts`

- [ ] **Step 1: Записать Prisma-схему**

Создать `prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Channel {
  id             BigInt   @id @default(autoincrement())
  name           String
  mainChatId     String
  buckets        Json
  rewritePrompts Json
  schedule       String
  previewTtl     Int?
  active         Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  posts          Post[]

  @@map("channels")
}

model Post {
  id                 BigInt    @id @default(autoincrement())
  channelId          BigInt
  channel            Channel   @relation(fields: [channelId], references: [id])
  source             String
  sourceLang         String
  link               String
  guid               String?
  origTitle          String
  origText           String
  author             String?
  categories         Json
  pubDate            DateTime
  images             Json
  bucket             String?
  embedding          Json?
  rewrittenTitle     String?
  rewrittenText      String?
  finalTitle         String?
  finalText          String?
  status             String    @default("ingested")
  previewMessageId   BigInt?
  publishedMessageId BigInt?
  aiError            String?
  rejectReason       String?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
  approvedAt         DateTime?
  publishedAt        DateTime?

  @@unique([channelId, link])
  @@index([channelId, status, pubDate])
  @@index([channelId, bucket])
  @@index([pubDate])
  @@map("posts")
}
```

- [ ] **Step 2: Создать миграцию**

Run:
```bash
npx prisma migrate dev --name init
```
Expected: создан `prisma/migrations/<ts>_init/`, вывод `Your database is now in sync with your schema`, сгенерирован клиент.

- [ ] **Step 3: Записать env-конфиг**

Создать `src/config/env.ts`:
```ts
import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  PREVIEW_TTL_DEFAULT: z.coerce.number().default(1440),
})

export const env = schema.parse(process.env)
```

- [ ] **Step 4: Записать BigInt-патч**

Создать `src/bigint.ts` (без этого `res.json` падает на BigInt-полях `id`, `channelId` и т.д.):
```ts
// Prisma отдаёт BigInt; JSON.stringify по умолчанию бросает TypeError.
// Сериализуем BigInt как строку во всём приложении.
;(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString()
}
```

- [ ] **Step 5: Записать Prisma singleton**

Создать `src/db/client.ts`:
```ts
import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()
```

- [ ] **Step 6: Проверить, что схема компилируется и клиент импортируется**

Run:
```bash
npx tsc --noEmit
```
Expected: без ошибок.

- [ ] **Step 7: Commit**

```bash
git add prisma src/config src/db src/bigint.ts
git commit -m "feat: prisma schema for channels/posts + client + bigint json"
```

---

## Task 2: Инфраструктура ошибок

**Files:**
- Create: `src/errors.ts`, `src/middleware/errorHandler.ts`

- [ ] **Step 1: Записать AppError и asyncHandler**

Создать `src/errors.ts`:
```ts
import type { NextFunction, Request, Response } from 'express'

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message)
  }
}

// Оборачивает async-хендлер, пробрасывая reject в next().
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
```

- [ ] **Step 2: Записать error-middleware**

Создать `src/middleware/errorHandler.ts`:
```ts
import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { AppError } from '../errors.js'

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message, code: err.code })
    return
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'validation_failed', issues: err.issues })
    return
  }
  console.error(err)
  res.status(500).json({ error: 'internal_error' })
}
```

- [ ] **Step 3: Проверить компиляцию**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 4: Commit**

```bash
git add src/errors.ts src/middleware
git commit -m "feat: AppError, asyncHandler and error middleware"
```

---

## Task 3: HTML-утилиты нормализации (TDD)

**Files:**
- Create: `src/normalize/html.ts`
- Test: `tests/normalize/html.test.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `tests/normalize/html.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { cutReadMoreTail, extractFirstImgSrc, stripHtml } from '../../src/normalize/html.js'

describe('stripHtml', () => {
  it('удаляет теги и схлопывает пробелы', () => {
    expect(stripHtml('<p>Привет  <b>мир</b></p>')).toBe('Привет мир')
  })
  it('декодирует базовые сущности', () => {
    expect(stripHtml('a &amp; b &lt;c&gt;')).toBe('a & b <c>')
  })
  it('пустой/undefined -> пустая строка', () => {
    expect(stripHtml(undefined)).toBe('')
    expect(stripHtml('')).toBe('')
  })
})

describe('cutReadMoreTail', () => {
  it('срезает "Continue reading..."', () => {
    expect(cutReadMoreTail('Текст новости. Continue reading...')).toBe('Текст новости.')
  })
  it('срезает "Читать далее"', () => {
    expect(cutReadMoreTail('Событие произошло. Читать далее')).toBe('Событие произошло.')
  })
  it('без хвоста возвращает как есть', () => {
    expect(cutReadMoreTail('Просто текст')).toBe('Просто текст')
  })
})

describe('extractFirstImgSrc', () => {
  it('достаёт src первой картинки', () => {
    expect(extractFirstImgSrc('<p>x</p><img src="https://a/b.jpg"> y')).toBe('https://a/b.jpg')
  })
  it('нет картинки -> null', () => {
    expect(extractFirstImgSrc('<p>no image</p>')).toBeNull()
  })
})
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `npx vitest run tests/normalize/html.test.ts`
Expected: FAIL — `Cannot find module '../../src/normalize/html.js'`.

- [ ] **Step 3: Реализовать html.ts**

Создать `src/normalize/html.ts`:
```ts
const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
}

export function stripHtml(input: string | undefined | null): string {
  if (!input) return ''
  const noTags = input.replace(/<[^>]*>/g, ' ')
  const decoded = noTags.replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m] ?? m)
  return decoded.replace(/\s+/g, ' ').trim()
}

const TAIL_PATTERNS = [
  /\s*Continue reading[.…]*.*$/is,
  /\s*Читать далее[.…]*.*$/is,
  /\s*Read more[.…]*.*$/is,
]

export function cutReadMoreTail(input: string): string {
  let out = input
  for (const re of TAIL_PATTERNS) out = out.replace(re, '')
  return out.trim()
}

export function extractFirstImgSrc(html: string | undefined | null): string | null {
  if (!html) return null
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  return m ? m[1] : null
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `npx vitest run tests/normalize/html.test.ts`
Expected: PASS (все кейсы).

- [ ] **Step 5: Commit**

```bash
git add src/normalize/html.ts tests/normalize/html.test.ts
git commit -m "feat: html normalization utils (strip, cut tail, extract img)"
```

---

## Task 4: Нормализация айтема n8n (TDD)

**Files:**
- Create: `src/normalize/normalizeItem.ts`
- Test: `tests/normalize/normalizeItem.test.ts`

Контракт: n8n шлёт сырой RSS-айтем (стиль `rss-parser`) + добавленные им `channelId`, `source`, `sourceLang`. Нормализатор — чистая функция, возвращает поля карточки (без `status`/таймингов — их ставит сервис).

- [ ] **Step 1: Написать падающий тест**

Создать `tests/normalize/normalizeItem.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { normalizeItem } from '../../src/normalize/normalizeItem.js'

const base = {
  channelId: '1',
  source: 'rbc',
  sourceLang: 'ru',
  title: 'Заголовок',
  link: 'https://rbc.ru/a',
  isoDate: '2026-07-07T10:00:00.000Z',
}

describe('normalizeItem', () => {
  it('author = creator || author || dc:creator || null', () => {
    expect(normalizeItem({ ...base, creator: 'Иван' }).author).toBe('Иван')
    expect(normalizeItem({ ...base, author: 'Пётр' }).author).toBe('Пётр')
    expect(normalizeItem({ ...base, 'dc:creator': 'Сидор' }).author).toBe('Сидор')
    expect(normalizeItem({ ...base }).author).toBeNull()
  })

  it('categories: строки RBC как есть', () => {
    expect(normalizeItem({ ...base, categories: ['Политика', 'Экономика'] }).categories).toEqual([
      'Политика',
      'Экономика',
    ])
  })

  it('categories: Guardian — берём cat._ из объектов', () => {
    const item = { ...base, categories: [{ _: 'World' }, { _: 'UK' }] }
    expect(normalizeItem(item).categories).toEqual(['World', 'UK'])
  })

  it('categories: отсутствуют -> пустой массив (BBC)', () => {
    expect(normalizeItem({ ...base }).categories).toEqual([])
  })

  it('origText: снят HTML и хвост', () => {
    const item = { ...base, contentSnippet: '<p>Тело новости.</p> Continue reading...' }
    expect(normalizeItem(item).origText).toBe('Тело новости.')
  })

  it('pubDate из isoDate как Date', () => {
    const r = normalizeItem({ ...base })
    expect(r.pubDate).toBeInstanceOf(Date)
    expect(r.pubDate.toISOString()).toBe('2026-07-07T10:00:00.000Z')
  })

  it('images: enclosure.url -> один кандидат (length игнорируем)', () => {
    const item = {
      ...base,
      enclosure: { url: 'https://img/a.jpg', length: '0', type: 'image/jpeg' },
    }
    expect(normalizeItem(item).images).toEqual([
      { url: 'https://img/a.jpg', type: 'image/jpeg', origin: 'enclosure', fileId: null, chosen: true },
    ])
  })

  it('images: без enclosure -> первый <img> из content', () => {
    const item = { ...base, content: '<p>x</p><img src="https://img/b.jpg">' }
    expect(normalizeItem(item).images).toEqual([
      { url: 'https://img/b.jpg', type: null, origin: 'content', fileId: null, chosen: true },
    ])
  })

  it('images: ничего -> пустой массив (text-only)', () => {
    expect(normalizeItem({ ...base }).images).toEqual([])
  })

  it('channelId приводится к BigInt', () => {
    expect(normalizeItem({ ...base }).channelId).toBe(1n)
  })
})
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `npx vitest run tests/normalize/normalizeItem.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать normalizeItem.ts**

Создать `src/normalize/normalizeItem.ts`:
```ts
import { cutReadMoreTail, extractFirstImgSrc, stripHtml } from './html.js'

export interface RawItem {
  channelId: string | number
  source: string
  sourceLang: string
  title?: string
  link: string
  guid?: string
  isoDate?: string
  contentSnippet?: string
  content?: string
  creator?: string
  author?: string
  'dc:creator'?: string
  categories?: unknown
  enclosure?: { url?: string; length?: string; type?: string }
}

export interface ImageCandidate {
  url: string
  type: string | null
  origin: 'enclosure' | 'content' | 'uploaded'
  fileId: string | null
  chosen: boolean
}

export interface NormalizedCard {
  channelId: bigint
  source: string
  sourceLang: string
  link: string
  guid: string | null
  origTitle: string
  origText: string
  author: string | null
  categories: string[]
  pubDate: Date
  images: ImageCandidate[]
}

function normalizeCategories(categories: unknown): string[] {
  if (!Array.isArray(categories)) return []
  return categories
    .map((c) => {
      if (typeof c === 'string') return c
      if (c && typeof c === 'object' && '_' in c && typeof (c as { _: unknown })._ === 'string') {
        return (c as { _: string })._
      }
      return null
    })
    .filter((c): c is string => c !== null)
}

function normalizeImages(item: RawItem): ImageCandidate[] {
  const encUrl = item.enclosure?.url
  if (encUrl) {
    return [
      {
        url: encUrl,
        type: item.enclosure?.type ?? null,
        origin: 'enclosure',
        fileId: null,
        chosen: true,
      },
    ]
  }
  const contentImg = extractFirstImgSrc(item.content)
  if (contentImg) {
    return [{ url: contentImg, type: null, origin: 'content', fileId: null, chosen: true }]
  }
  return []
}

export function normalizeItem(item: RawItem): NormalizedCard {
  return {
    channelId: BigInt(item.channelId),
    source: item.source,
    sourceLang: item.sourceLang,
    link: item.link,
    guid: item.guid ?? null,
    origTitle: item.title ?? '',
    origText: cutReadMoreTail(stripHtml(item.contentSnippet)),
    author: item.creator ?? item.author ?? item['dc:creator'] ?? null,
    categories: normalizeCategories(item.categories),
    pubDate: item.isoDate ? new Date(item.isoDate) : new Date(0),
    images: normalizeImages(item),
  }
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `npx vitest run tests/normalize/normalizeItem.test.ts`
Expected: PASS (все кейсы).

- [ ] **Step 5: Commit**

```bash
git add src/normalize/normalizeItem.ts tests/normalize/normalizeItem.test.ts
git commit -m "feat: normalize raw n8n item into post card"
```

---

## Task 5: Заглушка триггера ИИ + фабрика Express-приложения

**Files:**
- Create: `src/ai/trigger.ts`, `src/app.ts`

- [ ] **Step 1: Записать заглушку триггера ИИ**

Создать `src/ai/trigger.ts` (в Фазе 2 заменится реальным воркером; сейчас — no-op, чтобы ingest уже дергал стабильную точку):
```ts
// Заглушка. Фаза 2 подключит здесь запуск асинхронного ИИ-воркера
// (embedding -> дедуп -> классификация -> рерайт). Сейчас — no-op.
export async function triggerAiProcessing(postId: bigint): Promise<void> {
  void postId
}
```

- [ ] **Step 2: Записать фабрику приложения (health + монтирование роутов)**

Создать `src/app.ts` (роуты подключаются в Task 6–7; пока — только health и error-middleware):
```ts
import '../src/bigint.js'
import express from 'express'
import { errorHandler } from './middleware/errorHandler.js'
import { channelsRouter } from './routes/channels.js'
import { postsRouter } from './routes/posts.js'

export function createApp() {
  const app = express()
  app.use(express.json({ limit: '2mb' }))

  app.get('/health', (_req, res) => res.json({ ok: true }))
  app.use('/channels', channelsRouter)
  app.use('/posts', postsRouter)

  app.use(errorHandler)
  return app
}
```
> Примечание: импорты `channelsRouter`/`postsRouter` появятся в Task 6 и Task 7. До их создания `app.ts` не скомпилируется — это нормально, `createApp` собирается целиком к концу Task 7. Health-эндпоинт уже рабочий.

- [ ] **Step 3: Commit**

```bash
git add src/ai/trigger.ts src/app.ts
git commit -m "feat: express app factory + ai trigger stub"
```

---

## Task 6: CRUD каналов (TDD)

**Files:**
- Create: `src/services/channelService.ts`, `src/routes/channels.ts`, `tests/helpers/db.ts`
- Test: `tests/routes/channels.test.ts`

- [ ] **Step 1: Записать тест-хелпер сброса БД**

Создать `tests/helpers/db.ts`:
```ts
import { prisma } from '../../src/db/client.js'

export async function resetDb() {
  // порядок важен: posts ссылается на channels
  await prisma.post.deleteMany()
  await prisma.channel.deleteMany()
}

export async function makeChannel(overrides: Record<string, unknown> = {}) {
  return prisma.channel.create({
    data: {
      name: 'Тест-канал',
      mainChatId: '-1001',
      buckets: ['рф-внутр', 'сво', 'мир-с-рф', 'мир-без-рф'],
      rewritePrompts: {},
      schedule: '*/30 * * * *',
      ...overrides,
    },
  })
}
```

- [ ] **Step 2: Написать падающий тест роутов каналов**

Создать `tests/routes/channels.test.ts`:
```ts
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/db/client.js'
import { resetDb } from '../helpers/db.js'

const app = createApp()

beforeEach(resetDb)
afterAll(() => prisma.$disconnect())

describe('POST /channels', () => {
  it('создаёт канал и возвращает 201 с id-строкой', async () => {
    const res = await request(app)
      .post('/channels')
      .send({
        name: 'Новости',
        mainChatId: '-1001',
        buckets: ['рф-внутр', 'сво'],
        rewritePrompts: { 'рф-внутр': 'промпт' },
        schedule: '*/30 * * * *',
      })
    expect(res.status).toBe(201)
    expect(typeof res.body.id).toBe('string')
    expect(res.body.active).toBe(true)
  })

  it('400 при отсутствии обязательного поля', async () => {
    const res = await request(app).post('/channels').send({ name: 'X' })
    expect(res.status).toBe(400)
  })
})

describe('GET /channels', () => {
  it('возвращает список', async () => {
    await request(app)
      .post('/channels')
      .send({ name: 'A', mainChatId: '-1', buckets: [], rewritePrompts: {}, schedule: 'x' })
    const res = await request(app).get('/channels')
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(1)
  })
})

describe('PATCH /channels/:id', () => {
  it('обновляет расписание и бакеты', async () => {
    const created = await request(app)
      .post('/channels')
      .send({ name: 'A', mainChatId: '-1', buckets: [], rewritePrompts: {}, schedule: 'x' })
    const id = created.body.id
    const res = await request(app)
      .patch(`/channels/${id}`)
      .send({ schedule: '0 * * * *', buckets: ['новый'] })
    expect(res.status).toBe(200)
    expect(res.body.schedule).toBe('0 * * * *')
    expect(res.body.buckets).toEqual(['новый'])
  })

  it('404 для несуществующего id', async () => {
    const res = await request(app).patch('/channels/999999').send({ schedule: 'y' })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 3: Запустить тест — убедиться, что падает**

Run: `npx vitest run tests/routes/channels.test.ts`
Expected: FAIL — модуль `channelService`/`channels` роут не найден (или ошибка компиляции `app.ts`).

- [ ] **Step 4: Реализовать channelService**

Создать `src/services/channelService.ts`:
```ts
import type { Prisma } from '@prisma/client'
import { prisma } from '../db/client.js'
import { AppError } from '../errors.js'

export function listChannels() {
  return prisma.channel.findMany({ orderBy: { id: 'asc' } })
}

export function createChannel(data: {
  name: string
  mainChatId: string
  buckets: string[]
  rewritePrompts: Prisma.InputJsonValue
  schedule: string
  previewTtl?: number | null
  active?: boolean
}) {
  return prisma.channel.create({ data })
}

export async function updateChannel(
  id: bigint,
  data: Partial<{
    name: string
    mainChatId: string
    buckets: string[]
    rewritePrompts: Prisma.InputJsonValue
    schedule: string
    previewTtl: number | null
    active: boolean
  }>,
) {
  const existing = await prisma.channel.findUnique({ where: { id } })
  if (!existing) throw new AppError(404, 'channel_not_found')
  return prisma.channel.update({ where: { id }, data })
}
```

- [ ] **Step 5: Реализовать роут каналов**

Создать `src/routes/channels.ts`:
```ts
import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../errors.js'
import { createChannel, listChannels, updateChannel } from '../services/channelService.js'

export const channelsRouter = Router()

const createSchema = z.object({
  name: z.string().min(1),
  mainChatId: z.string().min(1),
  buckets: z.array(z.string()),
  rewritePrompts: z.record(z.string(), z.unknown()),
  schedule: z.string().min(1),
  previewTtl: z.number().int().nullable().optional(),
  active: z.boolean().optional(),
})

const updateSchema = createSchema.partial()

channelsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await listChannels())
  }),
)

channelsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const dto = createSchema.parse(req.body)
    const channel = await createChannel(dto)
    res.status(201).json(channel)
  }),
)

channelsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const dto = updateSchema.parse(req.body)
    const channel = await updateChannel(BigInt(req.params.id), dto)
    res.json(channel)
  }),
)
```

- [ ] **Step 6: Запустить тест — убедиться, что проходит**

Run: `npx vitest run tests/routes/channels.test.ts`
Expected: PASS (все кейсы).

- [ ] **Step 7: Commit**

```bash
git add src/services/channelService.ts src/routes/channels.ts tests/helpers/db.ts tests/routes/channels.test.ts
git commit -m "feat: channels CRUD (service + routes)"
```

---

## Task 7: Ingest POST /posts с дедупом (TDD)

**Files:**
- Create: `src/services/postService.ts`, `src/routes/posts.ts`
- Test: `tests/routes/posts.test.ts`

- [ ] **Step 1: Написать падающий тест ingest**

Создать `tests/routes/posts.test.ts`:
```ts
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/db/client.js'
import { makeChannel, resetDb } from '../helpers/db.js'

const app = createApp()

beforeEach(resetDb)
afterAll(() => prisma.$disconnect())

function ingestBody(channelId: string, overrides: Record<string, unknown> = {}) {
  return {
    channelId,
    source: 'rbc',
    sourceLang: 'ru',
    title: 'Заголовок',
    link: 'https://rbc.ru/a',
    isoDate: '2026-07-07T10:00:00.000Z',
    contentSnippet: '<p>Тело.</p> Continue reading...',
    ...overrides,
  }
}

describe('POST /posts (ingest)', () => {
  it('создаёт карточку в статусе ingested, нормализует поля', async () => {
    const ch = await makeChannel()
    const res = await request(app).post('/posts').send(ingestBody(String(ch.id)))
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('ingested')
    expect(res.body.origText).toBe('Тело.')
    expect(res.body.channelId).toBe(String(ch.id))
  })

  it('дедуп: повтор пары (channelId, link) -> 409', async () => {
    const ch = await makeChannel()
    await request(app).post('/posts').send(ingestBody(String(ch.id)))
    const res = await request(app).post('/posts').send(ingestBody(String(ch.id)))
    expect(res.status).toBe(409)
  })

  it('та же ссылка в другом канале -> ok (скоуп дедупа по каналу)', async () => {
    const ch1 = await makeChannel()
    const ch2 = await makeChannel()
    await request(app).post('/posts').send(ingestBody(String(ch1.id)))
    const res = await request(app).post('/posts').send(ingestBody(String(ch2.id)))
    expect(res.status).toBe(201)
  })

  it('400 без channelId', async () => {
    const res = await request(app).post('/posts').send({ source: 'rbc', sourceLang: 'ru', link: 'x' })
    expect(res.status).toBe(400)
  })

  it('404 при несуществующем channelId', async () => {
    const res = await request(app).post('/posts').send(ingestBody('999999'))
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `npx vitest run tests/routes/posts.test.ts`
Expected: FAIL — модуль `postService`/`posts` роут не найден.

- [ ] **Step 3: Реализовать postService (ingest)**

Создать `src/services/postService.ts`:
```ts
import { Prisma } from '@prisma/client'
import { prisma } from '../db/client.js'
import { AppError } from '../errors.js'
import { normalizeItem, type RawItem } from '../normalize/normalizeItem.js'

export async function ingest(item: RawItem) {
  const card = normalizeItem(item)

  const channel = await prisma.channel.findUnique({ where: { id: card.channelId } })
  if (!channel) throw new AppError(404, 'channel_not_found')

  try {
    return await prisma.post.create({
      data: {
        channelId: card.channelId,
        source: card.source,
        sourceLang: card.sourceLang,
        link: card.link,
        guid: card.guid,
        origTitle: card.origTitle,
        origText: card.origText,
        author: card.author,
        categories: card.categories,
        pubDate: card.pubDate,
        images: card.images as unknown as Prisma.InputJsonValue,
        status: 'ingested',
      },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new AppError(409, 'duplicate_link')
    }
    throw e
  }
}
```

- [ ] **Step 4: Реализовать роут /posts (ingest) + подключить триггер ИИ**

Создать `src/routes/posts.ts`:
```ts
import { Router } from 'express'
import { z } from 'zod'
import { triggerAiProcessing } from '../ai/trigger.js'
import { asyncHandler } from '../errors.js'
import { ingest } from '../services/postService.js'

export const postsRouter = Router()

const ingestSchema = z.object({
  channelId: z.union([z.string(), z.number()]),
  source: z.string().min(1),
  sourceLang: z.string().min(1),
  link: z.string().min(1),
  title: z.string().optional(),
  guid: z.string().optional(),
  isoDate: z.string().optional(),
  contentSnippet: z.string().optional(),
  content: z.string().optional(),
  creator: z.string().optional(),
  author: z.string().optional(),
  'dc:creator': z.string().optional(),
  categories: z.unknown().optional(),
  enclosure: z
    .object({ url: z.string().optional(), length: z.string().optional(), type: z.string().optional() })
    .optional(),
})

postsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const dto = ingestSchema.parse(req.body)
    const post = await ingest(dto)
    await triggerAiProcessing(post.id)
    res.status(201).json(post)
  }),
)
```

- [ ] **Step 5: Запустить тест — убедиться, что проходит**

Run: `npx vitest run tests/routes/posts.test.ts`
Expected: PASS (все кейсы).

- [ ] **Step 6: Проверить сборку всего приложения**

Run: `npx tsc --noEmit`
Expected: без ошибок (все импорты `app.ts` теперь существуют).

- [ ] **Step 7: Commit**

```bash
git add src/services/postService.ts src/routes/posts.ts tests/routes/posts.test.ts
git commit -m "feat: ingest POST /posts with per-channel link dedup (409)"
```

---

## Task 8: Чтение и правка постов — GET list/one, PATCH (TDD)

**Files:**
- Modify: `src/services/postService.ts` (добавить функции), `src/routes/posts.ts` (добавить роуты)
- Test: `tests/routes/posts.test.ts` (добавить describe-блоки)

- [ ] **Step 1: Дописать падающие тесты в tests/routes/posts.test.ts**

Добавить в конец `tests/routes/posts.test.ts`:
```ts
describe('GET /posts', () => {
  it('фильтрует по channelId и status, отдаёт пагинацию', async () => {
    const ch = await makeChannel()
    await request(app).post('/posts').send(ingestBody(String(ch.id), { link: 'https://a/1' }))
    await request(app).post('/posts').send(ingestBody(String(ch.id), { link: 'https://a/2' }))
    const res = await request(app).get(`/posts?channelId=${ch.id}&status=ingested&page=1`)
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(2)
    expect(res.body.items.length).toBe(2)
    expect(res.body.page).toBe(1)
  })
})

describe('GET /posts/:id', () => {
  it('отдаёт карточку', async () => {
    const ch = await makeChannel()
    const created = await request(app).post('/posts').send(ingestBody(String(ch.id)))
    const res = await request(app).get(`/posts/${created.body.id}`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(created.body.id)
  })

  it('404 для несуществующего', async () => {
    const res = await request(app).get('/posts/999999')
    expect(res.status).toBe(404)
  })
})

describe('PATCH /posts/:id', () => {
  it('правит finalTitle/finalText/bucket', async () => {
    const ch = await makeChannel()
    const created = await request(app).post('/posts').send(ingestBody(String(ch.id)))
    const res = await request(app)
      .patch(`/posts/${created.body.id}`)
      .send({ finalTitle: 'Правл. заголовок', finalText: 'Правл. текст', bucket: 'рф-внутр' })
    expect(res.status).toBe(200)
    expect(res.body.finalTitle).toBe('Правл. заголовок')
    expect(res.body.bucket).toBe('рф-внутр')
  })

  it('404 для несуществующего', async () => {
    const res = await request(app).patch('/posts/999999').send({ finalTitle: 'x' })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что новые тесты падают**

Run: `npx vitest run tests/routes/posts.test.ts`
Expected: FAIL на новых блоках (`GET /posts` отдаёт 404/нет роута, `PATCH` нет роута).

- [ ] **Step 3: Дописать функции в postService.ts**

Добавить в `src/services/postService.ts`:
```ts
const PAGE_SIZE = 20

export async function listPosts(filter: {
  channelId?: bigint
  status?: string
  bucket?: string
  source?: string
  date?: string
  page: number
}) {
  const where: Prisma.PostWhereInput = {}
  if (filter.channelId !== undefined) where.channelId = filter.channelId
  if (filter.status) where.status = filter.status
  if (filter.bucket) where.bucket = filter.bucket
  if (filter.source) where.source = filter.source
  if (filter.date) {
    const from = new Date(`${filter.date}T00:00:00.000Z`)
    const to = new Date(`${filter.date}T23:59:59.999Z`)
    where.pubDate = { gte: from, lte: to }
  }

  const [items, total] = await Promise.all([
    prisma.post.findMany({
      where,
      orderBy: { pubDate: 'desc' },
      skip: (filter.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.post.count({ where }),
  ])
  return { items, total, page: filter.page, pageSize: PAGE_SIZE }
}

export async function getPost(id: bigint) {
  const post = await prisma.post.findUnique({ where: { id } })
  if (!post) throw new AppError(404, 'post_not_found')
  return post
}

export async function patchPost(
  id: bigint,
  data: Partial<{ finalTitle: string; finalText: string; bucket: string }>,
) {
  await getPost(id)
  return prisma.post.update({ where: { id }, data })
}
```

- [ ] **Step 4: Дописать роуты в posts.ts**

Добавить в `src/routes/posts.ts` (импорты дополнить: `getPost, listPosts, patchPost`):
```ts
const listSchema = z.object({
  channelId: z.coerce.bigint().optional(),
  status: z.string().optional(),
  bucket: z.string().optional(),
  source: z.string().optional(),
  date: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
})

postsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = listSchema.parse(req.query)
    res.json(await listPosts(q))
  }),
)

postsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await getPost(BigInt(req.params.id)))
  }),
)

const patchSchema = z.object({
  finalTitle: z.string().optional(),
  finalText: z.string().optional(),
  bucket: z.string().optional(),
})

postsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const dto = patchSchema.parse(req.body)
    res.json(await patchPost(BigInt(req.params.id), dto))
  }),
)
```
Итоговая строка импорта в начале файла:
```ts
import { getPost, ingest, listPosts, patchPost } from '../services/postService.js'
```

- [ ] **Step 5: Запустить весь тест-файл — убедиться, что всё зелёное**

Run: `npx vitest run tests/routes/posts.test.ts`
Expected: PASS (ingest + list + get + patch).

- [ ] **Step 6: Commit**

```bash
git add src/services/postService.ts src/routes/posts.ts tests/routes/posts.test.ts
git commit -m "feat: posts read/patch — list with filters, get one, patch final fields"
```

---

## Task 9: Entrypoint сервера и запуск

**Files:**
- Create: `src/server.ts`

- [ ] **Step 1: Записать entrypoint**

Создать `src/server.ts`:
```ts
import { createApp } from './app.js'
import { env } from './config/env.js'

const app = createApp()
app.listen(env.PORT, () => {
  console.log(`news-poster listening on :${env.PORT}`)
})
```

- [ ] **Step 2: Прогнать весь тест-сьют**

Run: `npm test`
Expected: PASS — все файлы (`html`, `normalizeItem`, `channels`, `posts`).

- [ ] **Step 3: Проверить сборку**

Run: `npm run build`
Expected: без ошибок, появился `dist/`.

- [ ] **Step 4: Ручной smoke-тест сервера**

Run:
```bash
npm run dev
```
В другом терминале:
```bash
curl -s localhost:3000/health
curl -s -X POST localhost:3000/channels -H 'content-type: application/json' \
  -d '{"name":"Новости","mainChatId":"-1001","buckets":["рф-внутр","сво"],"rewritePrompts":{},"schedule":"*/30 * * * *"}'
```
Expected: `{"ok":true}`; затем JSON канала с `"id":"1"` и `"active":true`.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts
git commit -m "feat: server entrypoint"
```

---

## Self-Review (выполнено при написании плана)

**Покрытие ТЗ (раздел 1 и 3, часть раздела 6):**
- Таблица `channels` со всеми полями и `@@map` — Task 1. ✔
- Таблица `posts` со всеми полями, `@@unique([channelId, link])`, индексы — Task 1. ✔
- Нормализация: author-цепочка, categories (RBC/Guardian/BBC), origText (strip+cut tail), pubDate из isoDate, images (enclosure→content→пусто), игнор `enclosure.length` — Task 3–4. ✔
- Дедуп по паре `(channelId, link)` → 409, скоуп по каналу — Task 7. ✔
- Триггер ИИ на `ingested` — заглушка `ai/trigger.ts`, Task 5 (реальный воркер — Фаза 2). ✔
- REST этой фазы: `POST /posts`, `GET /posts` (фильтры+пагинация), `GET /posts/:id`, `PATCH /posts/:id`, `/channels` GET/POST/PATCH — Task 6–8. ✔
- BigInt в JSON-ответах — Task 1 (`bigint.ts`). ✔

**Вне Фазы 1 (осознанно отложено):** статусные переходы-валидатор, `/posts/:id/images`, `select`, `approve`, `unapprove`, `DELETE`, `rewrite`, `published`, очередь — Фазы 2–4. Эндпоинты `finalTitle` HTML-экранирование — Фаза 4 (при формировании публикации).

**Консистентность типов:** `NormalizedCard.channelId: bigint`; сервисы принимают `bigint` (роуты приводят `BigInt(...)`/`z.coerce.bigint()`); `images` — массив `ImageCandidate` с полями `{url,type,origin,fileId,chosen}`, совпадает между `normalizeItem` и тестами. Имена функций сервисов (`ingest`, `listPosts`, `getPost`, `patchPost`, `listChannels`, `createChannel`, `updateChannel`) едины между сервисом и роутами.

**Плейсхолдеры:** не найдено — весь код приведён целиком.

---

## Definition of Done (Фаза 1)

- `npm test` — зелёный, все 4 тест-файла.
- `npm run build` — без ошибок.
- Smoke: сервер поднимается, `/health` отвечает, канал создаётся, ingest кладёт карточку и ловит дубль 409.
- Все задачи закоммичены.
