> ⚠️ **Исторический документ: план выполнен.** Отдельные детали устарели (создание каналов теперь через UI админки, порт 3000 наружу не публикуется, добавлена аутентификация `/login`). Актуальное описание системы — [docs/устройство системы.md](../устройство%20системы.md).

# Фаза 2 — ИИ-воркер — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Асинхронный ИИ-воркер, который на карточке в статусе `ingested` прогоняет конвейер эмбеддинг → смысловой дедуп → классификация бакета → рерайт+перевод (один промпт) и доводит её до `pending` (или `rejected` при дубле / `failed` при ошибке).

**Architecture:** Воркер запускается заглушкой-триггером из Фазы 1 (`src/ai/trigger.ts`), которую эта фаза заменяет реальной реализацией. Триггер кладёт задачу в **последовательную in-process очередь** (промис-цепочка) — карточки одного процесса обрабатываются строго по одной, что полностью снимает гонку смыслового дедупа без блокировок БД (для сотен постов/сутки достаточно). Внешние провайдеры (Ollama-эмбеддинги, OpenRouter-рерайт) спрятаны за интерфейсами `EmbeddingProvider`/`LlmProvider` — оркестратор `processPost(postId, deps)` принимает их инъекцией, поэтому тестируется на фейках без сети. Векторы хранятся как Json, косинус считается брутфорсом в коде. Перевод EN — частью единого промпта рерайта. Ошибка любого шага → `failed` + `aiError`, карточка не теряется.

**Tech Stack:** Node.js (глобальный `fetch`, без HTTP-библиотек), TypeScript, Prisma (из Фазы 1), Vitest. Внешние сервисы вызываются только в реальных провайдерах; вся логика — на чистых функциях и инъекции.

---

## Предпосылки

Фаза 1 завершена: есть Prisma-схема с моделями `Channel`/`Post` (поля `embedding`, `bucket`, `rewrittenTitle/Text`, `finalTitle/Text`, `status`, `aiError`, `rejectReason`), применённая миграция, `src/db/client.ts` (`prisma`), `src/normalize/normalizeItem.ts`, `src/services/postService.ts`, `src/routes/posts.ts` (ingest дергает `triggerAiProcessing(post.id)`), заглушка `src/ai/trigger.ts`, тест-хелперы `tests/helpers/db.ts` (`resetDb`, `makeChannel`).

## Структура файлов

```
src/ai/
  providers/
    types.ts          # EmbeddingProvider, LlmProvider, WorkerDeps, RewriteInput/Result
    prompts.ts        # buildClassifyMessages, buildRewriteMessages, parseRewriteOutput (чистые)
    ollama.ts         # createOllamaEmbeddingProvider (fetch)
    openrouter.ts     # createOpenRouterLlm (fetch)
    default.ts        # defaultDeps() — сборка реальных провайдеров из env
  cosine.ts           # cosineSimilarity (чистая)
  dedup.ts            # findDuplicateId (чистая)
  bucket.ts           # pickBucket (чистая)
  worker.ts           # processPost, reRewritePost — оркестрация поверх prisma + deps
  queue.ts            # последовательная очередь (enqueue)
  trigger.ts          # ЗАМЕНА заглушки: triggerAiProcessing -> enqueue(processPost)
src/config/env.ts     # МОДИФИКАЦИЯ: добавить OLLAMA/OPENROUTER/DEDUP настройки
src/services/postService.ts  # МОДИФИКАЦИЯ: requirePost для /rewrite (переиспользуем getPost)
src/routes/posts.ts   # МОДИФИКАЦИЯ: POST /:id/rewrite (202, async)
tests/ai/cosine.test.ts
tests/ai/dedup.test.ts
tests/ai/bucket.test.ts
tests/ai/prompts.test.ts
tests/ai/providers.test.ts
tests/ai/worker.test.ts
tests/ai/queue.test.ts
tests/routes/rewrite.test.ts
```

**Границы:** `cosine`/`dedup`/`bucket`/`prompts` — чистые функции без БД и без сети (юнит-тесты мгновенные). `worker` — единственное место, где оркестрация трогает и БД (Prisma), и провайдеры (через инъекцию). Реальные провайдеры (`ollama`/`openrouter`) — тонкие обёртки над `fetch`, тестируются с замоканным `fetch`. `queue`/`trigger` — доставка задач.

---

## Task 1: Интерфейсы провайдеров + расширение env

**Files:**
- Create: `src/ai/providers/types.ts`
- Modify: `src/config/env.ts`

- [ ] **Step 1: Записать интерфейсы**

Создать `src/ai/providers/types.ts`:
```ts
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>
}

export interface RewriteInput {
  origTitle: string
  origText: string
  sourceLang: string
  bucket: string
  isSvo: boolean
  promptTemplate?: string | null
}

export interface RewriteResult {
  title: string
  text: string
}

export interface LlmProvider {
  classify(input: { text: string; buckets: string[] }): Promise<string>
  rewrite(input: RewriteInput): Promise<RewriteResult>
}

export interface WorkerDeps {
  embedding: EmbeddingProvider
  llm: LlmProvider
}
```

- [ ] **Step 2: Расширить env-конфиг**

Заменить содержимое `src/config/env.ts` на:
```ts
import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  PREVIEW_TTL_DEFAULT: z.coerce.number().default(1440),

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

- [ ] **Step 3: Дополнить .env.example**

Добавить в конец `.env.example`:
```
OLLAMA_URL="http://localhost:11434"
EMBED_MODEL="bge-m3"
OPENROUTER_URL="https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_API_KEY=""
REWRITE_MODEL="openai/gpt-4o-mini"
DEDUP_THRESHOLD=0.85
DEDUP_WINDOW_HOURS=24
```
(Те же ключи скопировать в `.env`.)

- [ ] **Step 4: Проверить компиляцию**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 5: Commit**

```bash
git add src/ai/providers/types.ts src/config/env.ts .env.example
git commit -m "feat(ai): provider interfaces + ai/dedup env config"
```

---

## Task 2: Косинусная близость (TDD, чистая)

**Files:**
- Create: `src/ai/cosine.ts`
- Test: `tests/ai/cosine.test.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `tests/ai/cosine.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { cosineSimilarity } from '../../src/ai/cosine.js'

describe('cosineSimilarity', () => {
  it('идентичные векторы -> 1', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6)
  })
  it('ортогональные -> 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6)
  })
  it('противоположные -> -1', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 6)
  })
  it('нулевой вектор -> 0 (без деления на ноль)', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0)
  })
  it('разная длина -> ошибка', () => {
    expect(() => cosineSimilarity([1, 2], [1])).toThrow()
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/ai/cosine.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать cosine.ts**

Создать `src/ai/cosine.ts`:
```ts
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`vector length mismatch: ${a.length} vs ${b.length}`)
  }
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/ai/cosine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/cosine.ts tests/ai/cosine.test.ts
git commit -m "feat(ai): cosine similarity"
```

---

## Task 3: Поиск дубля (TDD, чистая)

**Files:**
- Create: `src/ai/dedup.ts`
- Test: `tests/ai/dedup.test.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `tests/ai/dedup.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { findDuplicateId } from '../../src/ai/dedup.js'

describe('findDuplicateId', () => {
  const target = [1, 0, 0]

  it('возвращает id первого кандидата выше порога', () => {
    const dup = findDuplicateId(
      target,
      [
        { id: 10n, embedding: [0, 1, 0] }, // косинус 0
        { id: 20n, embedding: [0.99, 0.01, 0] }, // близко к 1
      ],
      0.85,
    )
    expect(dup).toBe(20n)
  })

  it('null, если все ниже порога', () => {
    const dup = findDuplicateId(target, [{ id: 10n, embedding: [0, 1, 0] }], 0.85)
    expect(dup).toBeNull()
  })

  it('пропускает кандидатов с некорректным вектором', () => {
    const dup = findDuplicateId(
      target,
      [{ id: 10n, embedding: [1, 0] }], // другая длина -> пропуск, не падаем
      0.85,
    )
    expect(dup).toBeNull()
  })

  it('пустой список -> null', () => {
    expect(findDuplicateId(target, [], 0.85)).toBeNull()
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/ai/dedup.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать dedup.ts**

Создать `src/ai/dedup.ts`:
```ts
import { cosineSimilarity } from './cosine.js'

export interface Candidate {
  id: bigint
  embedding: number[]
}

export function findDuplicateId(
  embedding: number[],
  candidates: Candidate[],
  threshold: number,
): bigint | null {
  for (const c of candidates) {
    if (!Array.isArray(c.embedding) || c.embedding.length !== embedding.length) continue
    if (cosineSimilarity(embedding, c.embedding) >= threshold) return c.id
  }
  return null
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/ai/dedup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/dedup.ts tests/ai/dedup.test.ts
git commit -m "feat(ai): semantic duplicate finder"
```

---

## Task 4: Нормализация бакета от классификатора (TDD, чистая)

**Files:**
- Create: `src/ai/bucket.ts`
- Test: `tests/ai/bucket.test.ts`

LLM-классификатор может вернуть бакет с лишними кавычками/регистром/точкой. `pickBucket` приводит его к одному из валидных бакетов канала либо `null`.

- [ ] **Step 1: Написать падающий тест**

Создать `tests/ai/bucket.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { pickBucket } from '../../src/ai/bucket.js'

const buckets = ['рф-внутр', 'сво', 'мир-с-рф', 'мир-без-рф']

describe('pickBucket', () => {
  it('точное совпадение', () => {
    expect(pickBucket('сво', buckets)).toBe('сво')
  })
  it('игнорирует кавычки/пробелы/точку/регистр', () => {
    expect(pickBucket('  "РФ-Внутр". ', buckets)).toBe('рф-внутр')
  })
  it('находит бакет внутри болтливого ответа', () => {
    expect(pickBucket('Это относится к бакету мир-без-рф однозначно', buckets)).toBe('мир-без-рф')
  })
  it('неизвестный -> null', () => {
    expect(pickBucket('спорт', buckets)).toBeNull()
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/ai/bucket.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать bucket.ts**

Создать `src/ai/bucket.ts`:
```ts
export function pickBucket(raw: string, buckets: string[]): string | null {
  const cleaned = raw.trim().replace(/^["'\s]+|["'\s.]+$/g, '').toLowerCase()
  // 1) точное совпадение по очищенной строке
  const exact = buckets.find((b) => b.toLowerCase() === cleaned)
  if (exact) return exact
  // 2) бакет как подстрока болтливого ответа
  const lowerRaw = raw.toLowerCase()
  const contained = buckets.find((b) => lowerRaw.includes(b.toLowerCase()))
  return contained ?? null
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/ai/bucket.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/bucket.ts tests/ai/bucket.test.ts
git commit -m "feat(ai): normalize classifier output to a valid bucket"
```

---

## Task 5: Промпты классификации и рерайта + парсинг (TDD, чистые)

**Files:**
- Create: `src/ai/providers/prompts.ts`
- Test: `tests/ai/prompts.test.ts`

Единый промпт «переведи+перепиши»: перевод включается, если `sourceLang==='en'`. Спец-путь `сво` даёт минимальную инструкцию (пересказ офиц. сводки). Модель обязана вернуть JSON `{"title","text"}` — `parseRewriteOutput` терпит обёртку в ```code fences```.

- [ ] **Step 1: Написать падающий тест**

Создать `tests/ai/prompts.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  buildClassifyMessages,
  buildRewriteMessages,
  parseRewriteOutput,
} from '../../src/ai/providers/prompts.js'

describe('buildClassifyMessages', () => {
  it('включает список бакетов и текст', () => {
    const msgs = buildClassifyMessages('текст новости', ['a', 'b'])
    const joined = JSON.stringify(msgs)
    expect(joined).toContain('a')
    expect(joined).toContain('b')
    expect(joined).toContain('текст новости')
    expect(msgs[msgs.length - 1].role).toBe('user')
  })
})

describe('buildRewriteMessages', () => {
  const base = {
    origTitle: 'T',
    origText: 'B',
    sourceLang: 'ru',
    bucket: 'рф-внутр',
    isSvo: false,
    promptTemplate: null,
  }

  it('для en добавляет инструкцию перевода', () => {
    const msgs = buildRewriteMessages({ ...base, sourceLang: 'en' })
    expect(JSON.stringify(msgs).toLowerCase()).toContain('перев')
  })
  it('для ru не требует перевода', () => {
    const msgs = buildRewriteMessages(base)
    expect(JSON.stringify(msgs).toLowerCase()).not.toContain('переведи')
  })
  it('для сво добавляет минимальную инструкцию (офиц. сводка)', () => {
    const msgs = buildRewriteMessages({ ...base, bucket: 'сво', isSvo: true })
    expect(JSON.stringify(msgs).toLowerCase()).toContain('офиц')
  })
  it('подмешивает per-bucket promptTemplate', () => {
    const msgs = buildRewriteMessages({ ...base, promptTemplate: 'ГОЛОС-КАНАЛА-XYZ' })
    expect(JSON.stringify(msgs)).toContain('ГОЛОС-КАНАЛА-XYZ')
  })
})

describe('parseRewriteOutput', () => {
  it('парсит чистый JSON', () => {
    expect(parseRewriteOutput('{"title":"Заг","text":"Тело"}')).toEqual({ title: 'Заг', text: 'Тело' })
  })
  it('парсит JSON в code fences', () => {
    const raw = '```json\n{"title":"Z","text":"B"}\n```'
    expect(parseRewriteOutput(raw)).toEqual({ title: 'Z', text: 'B' })
  })
  it('битый ответ -> ошибка', () => {
    expect(() => parseRewriteOutput('не json')).toThrow()
  })
  it('нет полей title/text -> ошибка', () => {
    expect(() => parseRewriteOutput('{"foo":1}')).toThrow()
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/ai/prompts.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать prompts.ts**

Создать `src/ai/providers/prompts.ts`:
```ts
import type { RewriteInput, RewriteResult } from './types.js'

export interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

export function buildClassifyMessages(text: string, buckets: string[]): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'Ты классификатор новостей. Верни РОВНО одно значение из списка бакетов, без пояснений.\n' +
        `Бакеты: ${buckets.join(', ')}`,
    },
    { role: 'user', content: text },
  ]
}

export function buildRewriteMessages(input: RewriteInput): ChatMessage[] {
  const lines: string[] = [
    'Ты редактор Telegram-канала новостей. Перепиши новость в лаконичный пост.',
    'Верни СТРОГО JSON вида {"title": "...", "text": "..."} без markdown-обёрток.',
  ]
  if (input.sourceLang === 'en') {
    lines.push('Исходник на английском — переведи на русский и перепиши за один проход.')
  }
  if (input.isSvo) {
    lines.push(
      'Тема СВО: только нейтральный пересказ официальной сводки («по данным ведомства»), ' +
        'без собственных формулировок и оценок.',
    )
  }
  if (input.promptTemplate) {
    lines.push(`Голос и примеры канала:\n${input.promptTemplate}`)
  }

  return [
    { role: 'system', content: lines.join('\n') },
    {
      role: 'user',
      content: `Бакет: ${input.bucket}\nЗаголовок: ${input.origTitle}\nТекст: ${input.origText}`,
    },
  ]
}

export function parseRewriteOutput(raw: string): RewriteResult {
  const stripped = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    throw new Error('rewrite_output_not_json')
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as Record<string, unknown>).title !== 'string' ||
    typeof (parsed as Record<string, unknown>).text !== 'string'
  ) {
    throw new Error('rewrite_output_missing_fields')
  }
  const p = parsed as { title: string; text: string }
  return { title: p.title, text: p.text }
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/ai/prompts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/providers/prompts.ts tests/ai/prompts.test.ts
git commit -m "feat(ai): classify/rewrite prompt builders + output parser"
```

---

## Task 6: Реальные провайдеры Ollama и OpenRouter (TDD с моком fetch)

**Files:**
- Create: `src/ai/providers/ollama.ts`, `src/ai/providers/openrouter.ts`
- Test: `tests/ai/providers.test.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `tests/ai/providers.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOllamaEmbeddingProvider } from '../../src/ai/providers/ollama.js'
import { createOpenRouterLlm } from '../../src/ai/providers/openrouter.js'

afterEach(() => vi.unstubAllGlobals())

function mockFetch(body: unknown, ok = true, status = 200) {
  const fn = vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
  }))
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('ollama embedding provider', () => {
  it('шлёт model+prompt и возвращает embedding', async () => {
    const fetchMock = mockFetch({ embedding: [0.1, 0.2, 0.3] })
    const provider = createOllamaEmbeddingProvider({ url: 'http://x', model: 'bge-m3' })
    const vec = await provider.embed('текст')
    expect(vec).toEqual([0.1, 0.2, 0.3])
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      model: 'bge-m3',
      prompt: 'текст',
    })
  })
  it('не-ok ответ -> ошибка', async () => {
    mockFetch({}, false, 500)
    const provider = createOllamaEmbeddingProvider({ url: 'http://x', model: 'bge-m3' })
    await expect(provider.embed('t')).rejects.toThrow()
  })
})

describe('openrouter llm provider', () => {
  it('classify возвращает content первого choice', async () => {
    mockFetch({ choices: [{ message: { content: 'сво' } }] })
    const llm = createOpenRouterLlm({ url: 'http://x', apiKey: 'k', model: 'm' })
    expect(await llm.classify({ text: 't', buckets: ['сво'] })).toBe('сво')
  })
  it('rewrite парсит JSON из content', async () => {
    mockFetch({ choices: [{ message: { content: '{"title":"Z","text":"B"}' } }] })
    const llm = createOpenRouterLlm({ url: 'http://x', apiKey: 'k', model: 'm' })
    const r = await llm.rewrite({
      origTitle: 'T',
      origText: 'B',
      sourceLang: 'ru',
      bucket: 'a',
      isSvo: false,
      promptTemplate: null,
    })
    expect(r).toEqual({ title: 'Z', text: 'B' })
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/ai/providers.test.ts`
Expected: FAIL — модули не найдены.

- [ ] **Step 3: Реализовать ollama.ts**

Создать `src/ai/providers/ollama.ts`:
```ts
import type { EmbeddingProvider } from './types.js'

export function createOllamaEmbeddingProvider(cfg: {
  url: string
  model: string
}): EmbeddingProvider {
  return {
    async embed(text: string): Promise<number[]> {
      const res = await fetch(`${cfg.url}/api/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: cfg.model, prompt: text }),
      })
      if (!res.ok) throw new Error(`ollama_embed_failed:${res.status}`)
      const data = (await res.json()) as { embedding?: number[] }
      if (!Array.isArray(data.embedding)) throw new Error('ollama_embed_no_vector')
      return data.embedding
    },
  }
}
```

- [ ] **Step 4: Реализовать openrouter.ts**

Создать `src/ai/providers/openrouter.ts`:
```ts
import {
  buildClassifyMessages,
  buildRewriteMessages,
  parseRewriteOutput,
  type ChatMessage,
} from './prompts.js'
import type { LlmProvider, RewriteInput, RewriteResult } from './types.js'

export function createOpenRouterLlm(cfg: {
  url: string
  apiKey: string
  model: string
}): LlmProvider {
  async function chat(messages: ChatMessage[]): Promise<string> {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({ model: cfg.model, messages, temperature: 0.3 }),
    })
    if (!res.ok) throw new Error(`openrouter_failed:${res.status}`)
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string') throw new Error('openrouter_no_content')
    return content
  }

  return {
    async classify(input: { text: string; buckets: string[] }): Promise<string> {
      return chat(buildClassifyMessages(input.text, input.buckets))
    },
    async rewrite(input: RewriteInput): Promise<RewriteResult> {
      const content = await chat(buildRewriteMessages(input))
      return parseRewriteOutput(content)
    },
  }
}
```

- [ ] **Step 5: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/ai/providers.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ai/providers/ollama.ts src/ai/providers/openrouter.ts tests/ai/providers.test.ts
git commit -m "feat(ai): ollama embedding + openrouter llm providers"
```

---

## Task 7: Оркестратор processPost (TDD с фейками + реальная БД)

**Files:**
- Create: `src/ai/worker.ts`
- Test: `tests/ai/worker.test.ts`

`processPost(postId, deps)` ведёт карточку `ingested → processing → pending`, при дубле → `rejected`, при ошибке провайдера → `failed` + `aiError`. Дедуп сравнивает с постами того же канала за окно, исключая `rejected`/`failed` и саму карточку.

- [ ] **Step 1: Написать падающий тест**

Создать `tests/ai/worker.test.ts`:
```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { processPost } from '../../src/ai/worker.js'
import type { RewriteInput, WorkerDeps } from '../../src/ai/providers/types.js'
import { prisma } from '../../src/db/client.js'
import { makeChannel, resetDb } from '../helpers/db.js'

beforeEach(resetDb)
afterAll(() => prisma.$disconnect())

function fakeDeps(over: Partial<{ vector: number[]; bucket: string; capture: (i: RewriteInput) => void }> = {}): WorkerDeps {
  return {
    embedding: { embed: async () => over.vector ?? [1, 0, 0] },
    llm: {
      classify: async () => over.bucket ?? 'рф-внутр',
      rewrite: async (input) => {
        over.capture?.(input)
        return { title: 'РТ', text: 'РТело' }
      },
    },
  }
}

async function makePost(channelId: bigint, over: Record<string, unknown> = {}) {
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
      status: 'ingested',
      ...over,
    },
  })
}

describe('processPost — happy path', () => {
  it('доводит до pending, пишет embedding/bucket/rewritten/final', async () => {
    const ch = await makeChannel()
    const post = await makePost(ch.id)
    await processPost(post.id, fakeDeps({ vector: [1, 0, 0], bucket: 'сво' }))
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.status).toBe('pending')
    expect(updated.bucket).toBe('сво')
    expect(updated.rewrittenTitle).toBe('РТ')
    expect(updated.finalText).toBe('РТело')
    expect(Array.isArray(updated.embedding)).toBe(true)
  })

  it('сво прокидывает isSvo=true в рерайт', async () => {
    const ch = await makeChannel()
    const post = await makePost(ch.id)
    let captured: RewriteInput | null = null
    await processPost(post.id, fakeDeps({ bucket: 'сво', capture: (i) => (captured = i) }))
    expect(captured!.isSvo).toBe(true)
  })
})

describe('processPost — дедуп', () => {
  it('дубль того же канала -> rejected', async () => {
    const ch = await makeChannel()
    // существующий пост с тем же вектором
    await makePost(ch.id, { status: 'pending', embedding: [1, 0, 0] })
    const post = await makePost(ch.id)
    await processPost(post.id, fakeDeps({ vector: [1, 0, 0] }))
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.status).toBe('rejected')
    expect(updated.rejectReason).toContain('semantic_duplicate')
  })

  it('похожий пост из ДРУГОГО канала не считается дублем', async () => {
    const ch1 = await makeChannel()
    const ch2 = await makeChannel()
    await makePost(ch1.id, { status: 'pending', embedding: [1, 0, 0] })
    const post = await makePost(ch2.id)
    await processPost(post.id, fakeDeps({ vector: [1, 0, 0] }))
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.status).toBe('pending')
  })
})

describe('processPost — ошибка', () => {
  it('падение провайдера -> failed + aiError', async () => {
    const ch = await makeChannel()
    const post = await makePost(ch.id)
    const deps: WorkerDeps = {
      embedding: { embed: async () => { throw new Error('ollama down') } },
      llm: { classify: async () => 'x', rewrite: async () => ({ title: '', text: '' }) },
    }
    await processPost(post.id, deps)
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.status).toBe('failed')
    expect(updated.aiError).toContain('ollama down')
  })

  it('классификатор вернул неизвестный бакет -> failed', async () => {
    const ch = await makeChannel()
    const post = await makePost(ch.id)
    await processPost(post.id, fakeDeps({ bucket: 'спорт' }))
    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.status).toBe('failed')
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/ai/worker.test.ts`
Expected: FAIL — модуль `worker` не найден.

- [ ] **Step 3: Реализовать worker.ts**

Создать `src/ai/worker.ts`:
```ts
import { env } from '../config/env.js'
import { prisma } from '../db/client.js'
import { pickBucket } from './bucket.js'
import { findDuplicateId, type Candidate } from './dedup.js'
import type { WorkerDeps } from './providers/types.js'

export async function processPost(postId: bigint, deps: WorkerDeps): Promise<void> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { channel: true },
  })
  if (!post) return

  try {
    await prisma.post.update({
      where: { id: postId },
      data: { status: 'processing', aiError: null },
    })

    // 1. Эмбеддинг
    const embedding = await deps.embedding.embed(`${post.origTitle}\n${post.origText}`)
    await prisma.post.update({ where: { id: postId }, data: { embedding } })

    // 2. Смысловой дедуп в скоупе канала за окно
    const since = new Date(Date.now() - env.DEDUP_WINDOW_HOURS * 3_600_000)
    const others = await prisma.post.findMany({
      where: {
        channelId: post.channelId,
        id: { not: postId },
        createdAt: { gte: since },
        status: { notIn: ['rejected', 'failed'] },
      },
      select: { id: true, embedding: true },
    })
    const candidates: Candidate[] = others
      .filter((o) => Array.isArray(o.embedding))
      .map((o) => ({ id: o.id, embedding: o.embedding as number[] }))
    const dupId = findDuplicateId(embedding, candidates, env.DEDUP_THRESHOLD)
    if (dupId !== null) {
      await prisma.post.update({
        where: { id: postId },
        data: { status: 'rejected', rejectReason: `semantic_duplicate:${dupId}` },
      })
      return
    }

    // 3. Классификация бакета из конфига канала
    const buckets = (post.channel.buckets as string[]) ?? []
    const rawBucket = await deps.llm.classify({
      text: `${post.origTitle}\n${post.origText}`,
      buckets,
    })
    const bucket = pickBucket(rawBucket, buckets)
    if (!bucket) throw new Error(`classify_unknown_bucket:${rawBucket}`)
    await prisma.post.update({ where: { id: postId }, data: { bucket } })

    // 4+5. Рерайт+перевод одним промптом (per-bucket шаблон, спец-путь сво)
    const prompts = (post.channel.rewritePrompts as Record<string, string>) ?? {}
    const rr = await deps.llm.rewrite({
      origTitle: post.origTitle,
      origText: post.origText,
      sourceLang: post.sourceLang,
      bucket,
      isSvo: bucket === 'сво',
      promptTemplate: prompts[bucket] ?? null,
    })
    await prisma.post.update({
      where: { id: postId },
      data: {
        rewrittenTitle: rr.title,
        rewrittenText: rr.text,
        finalTitle: rr.title,
        finalText: rr.text,
        status: 'pending',
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // best-effort: карточку могли удалить (чистка БД в тестах / гонки) — воркер не должен падать.
    // Гарантирует, что processPost НИКОГДА не реджектится => нет unhandledRejection в тестах.
    await prisma.post
      .update({ where: { id: postId }, data: { status: 'failed', aiError: msg } })
      .catch(() => undefined)
  }
}

// Пере-запуск только шага рерайта поверх уже классифицированной карточки.
export async function reRewritePost(postId: bigint, deps: WorkerDeps): Promise<void> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { channel: true },
  })
  if (!post) return
  try {
    await prisma.post.update({
      where: { id: postId },
      data: { status: 'processing', aiError: null },
    })
    const buckets = (post.channel.buckets as string[]) ?? []
    const bucket = post.bucket ?? pickBucket(
      await deps.llm.classify({ text: `${post.origTitle}\n${post.origText}`, buckets }),
      buckets,
    )
    if (!bucket) throw new Error('rewrite_no_bucket')
    const prompts = (post.channel.rewritePrompts as Record<string, string>) ?? {}
    const rr = await deps.llm.rewrite({
      origTitle: post.origTitle,
      origText: post.origText,
      sourceLang: post.sourceLang,
      bucket,
      isSvo: bucket === 'сво',
      promptTemplate: prompts[bucket] ?? null,
    })
    await prisma.post.update({
      where: { id: postId },
      data: {
        bucket,
        rewrittenTitle: rr.title,
        rewrittenText: rr.text,
        finalTitle: rr.title,
        finalText: rr.text,
        status: 'pending',
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // best-effort: карточку могли удалить (чистка БД в тестах / гонки) — воркер не должен падать.
    // Гарантирует, что processPost НИКОГДА не реджектится => нет unhandledRejection в тестах.
    await prisma.post
      .update({ where: { id: postId }, data: { status: 'failed', aiError: msg } })
      .catch(() => undefined)
  }
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/ai/worker.test.ts`
Expected: PASS (happy/сво/дедуп/ошибки).

- [ ] **Step 5: Commit**

```bash
git add src/ai/worker.ts tests/ai/worker.test.ts
git commit -m "feat(ai): processPost orchestration + reRewritePost"
```

---

## Task 8: Очередь + триггер (замена заглушки) (TDD)

**Files:**
- Create: `src/ai/queue.ts`, `src/ai/providers/default.ts`
- Modify: `src/ai/trigger.ts` (замена заглушки Фазы 1)
- Test: `tests/ai/queue.test.ts`

- [ ] **Step 1: Написать падающий тест очереди**

Создать `tests/ai/queue.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { enqueue } from '../../src/ai/queue.js'

describe('enqueue — последовательная очередь', () => {
  it('выполняет задачи строго по одной, в порядке постановки', async () => {
    const order: number[] = []
    const running: number[] = []
    const task = (n: number) => async () => {
      running.push(n)
      expect(running.length).toBe(1) // никогда не пересекаются
      await new Promise((r) => setTimeout(r, 5))
      order.push(n)
      running.pop()
    }
    enqueue(task(1))
    enqueue(task(2))
    await enqueue(task(3))
    expect(order).toEqual([1, 2, 3])
  })

  it('ошибка задачи не рушит очередь', async () => {
    const done: number[] = []
    enqueue(async () => {
      throw new Error('boom')
    })
    await enqueue(async () => {
      done.push(2)
    })
    expect(done).toEqual([2])
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/ai/queue.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать queue.ts**

Создать `src/ai/queue.ts`:
```ts
// Последовательная in-process очередь: задачи идут строго по одной.
// Снимает гонку смыслового дедупа без блокировок БД.
let tail: Promise<unknown> = Promise.resolve()

export function enqueue(task: () => Promise<unknown>): Promise<unknown> {
  const run = tail.then(task, task) // выполнить task независимо от исхода предыдущей
  // хвост не должен зависать на реджекте предыдущей задачи
  tail = run.catch(() => undefined)
  return run
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/ai/queue.test.ts`
Expected: PASS.

- [ ] **Step 5: Реализовать сборку провайдеров из env**

Создать `src/ai/providers/default.ts`:
```ts
import { env } from '../../config/env.js'
import { createOllamaEmbeddingProvider } from './ollama.js'
import { createOpenRouterLlm } from './openrouter.js'
import type { WorkerDeps } from './types.js'

export function defaultDeps(): WorkerDeps {
  return {
    embedding: createOllamaEmbeddingProvider({ url: env.OLLAMA_URL, model: env.EMBED_MODEL }),
    llm: createOpenRouterLlm({
      url: env.OPENROUTER_URL,
      apiKey: env.OPENROUTER_API_KEY,
      model: env.REWRITE_MODEL,
    }),
  }
}
```

- [ ] **Step 6: Заменить заглушку триггера**

Заменить содержимое `src/ai/trigger.ts` на:
```ts
import { defaultDeps } from './providers/default.js'
import type { WorkerDeps } from './providers/types.js'
import { enqueue } from './queue.js'
import { processPost, reRewritePost } from './worker.js'

// Ставит обработку карточки в последовательную очередь. Не ждём завершения —
// ingest отвечает сразу (ИИ имеет задержку). Возвращаем промис только для тестов.
export function triggerAiProcessing(postId: bigint, deps: WorkerDeps = defaultDeps()): Promise<unknown> {
  return enqueue(() => processPost(postId, deps))
}

export function triggerRewrite(postId: bigint, deps: WorkerDeps = defaultDeps()): Promise<unknown> {
  return enqueue(() => reRewritePost(postId, deps))
}
```

- [ ] **Step 7: Убрать `await` у триггера в ingest-роуте**

В `src/routes/posts.ts` в обработчике `POST /` заменить строку:
```ts
    await triggerAiProcessing(post.id)
```
на (fire-and-forget — не блокируем HTTP-ответ; ошибки гасит очередь):
```ts
    void triggerAiProcessing(post.id)
```

- [ ] **Step 8: Прогнать очередь + существующие тесты ingest**

Run: `npx vitest run tests/ai/queue.test.ts tests/routes/posts.test.ts`
Expected: PASS (ingest всё ещё создаёт `ingested`; триггер теперь реальный, но с дефолтными провайдерами он лишь ставит в очередь и не влияет на синхронный ответ).
> Примечание: в тестах ingest реальные провайдеры не вызываются синхронно, ответ 201 отдаётся сразу. Фоновая обработка с недоступными Ollama/OpenRouter завершится `failed`, но это вне проверки данного теста.

- [ ] **Step 9: Commit**

```bash
git add src/ai/queue.ts src/ai/providers/default.ts src/ai/trigger.ts src/routes/posts.ts tests/ai/queue.test.ts
git commit -m "feat(ai): serial queue + real trigger wiring (replace stub)"
```

---

## Task 9: Эндпоинт POST /posts/:id/rewrite (TDD)

**Files:**
- Modify: `src/routes/posts.ts` (добавить роут)
- Test: `tests/routes/rewrite.test.ts`

`/rewrite` — idempotent, async: ставит пере-рерайт в очередь и сразу отвечает `202`. Реальную обработку тестируем через прямой вызов `reRewritePost` с фейками (в Task 7 покрыт worker); здесь проверяем контракт роута.

- [ ] **Step 1: Написать падающий тест**

Создать `tests/routes/rewrite.test.ts`:
```ts
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/db/client.js'
import { makeChannel, resetDb } from '../helpers/db.js'

const app = createApp()

beforeEach(resetDb)
afterAll(() => prisma.$disconnect())

async function seedPost(channelId: bigint) {
  return prisma.post.create({
    data: {
      channelId,
      source: 'rbc',
      sourceLang: 'ru',
      link: 'https://a/x',
      origTitle: 'T',
      origText: 'B',
      categories: [],
      pubDate: new Date('2026-07-07T10:00:00Z'),
      images: [],
      status: 'pending',
      bucket: 'рф-внутр',
    },
  })
}

describe('POST /posts/:id/rewrite', () => {
  it('существующая карточка -> 202 accepted', async () => {
    const ch = await makeChannel()
    const post = await seedPost(ch.id)
    const res = await request(app).post(`/posts/${post.id}/rewrite`)
    expect(res.status).toBe(202)
  })

  it('несуществующая -> 404', async () => {
    const res = await request(app).post('/posts/999999/rewrite')
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run tests/routes/rewrite.test.ts`
Expected: FAIL — роут отдаёт 404 на существующем id (нет обработчика) или 200.

- [ ] **Step 3: Добавить роут /rewrite**

В `src/routes/posts.ts`:
- дополнить импорт триггера в начале файла:
```ts
import { triggerAiProcessing, triggerRewrite } from '../ai/trigger.js'
```
- добавить обработчик (после `PATCH /:id`):
```ts
postsRouter.post(
  '/:id/rewrite',
  asyncHandler(async (req, res) => {
    const id = BigInt(String(req.params.id)) // Express 5: params.id имеет тип string | string[]
    await getPost(id) // 404, если нет
    void triggerRewrite(id)
    res.status(202).json({ accepted: true })
  }),
)
```
> `getPost` уже импортирован из Фазы 1. `triggerAiProcessing` в импорте остаётся (используется в ingest).

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npx vitest run tests/routes/rewrite.test.ts`
Expected: PASS.

- [ ] **Step 5: Прогнать весь сьют + сборку**

Run:
```bash
npm test
npx tsc --noEmit
```
Expected: все тест-файлы Фаз 1 и 2 зелёные; компиляция без ошибок.

- [ ] **Step 6: Commit**

```bash
git add src/routes/posts.ts tests/routes/rewrite.test.ts
git commit -m "feat(ai): POST /posts/:id/rewrite (async, 202)"
```

---

## Self-Review (выполнено при написании плана)

**Покрытие ТЗ (раздел 4 + строки REST `/posts/:id/rewrite`):**
- Асинхронность (ИИ не висит в HTTP-ответе) — очередь + fire-and-forget в ingest (Task 8). ✔
- Запуск на `ingested`, ведёт `processing → pending` — `processPost` (Task 7). ✔
- Эмбеддинг Ollama `bge-m3` → `embedding` — провайдер (Task 6) + шаг 1 воркера. ✔
- Смысловой дедуп: косинус, скоуп по каналу, окно 24ч, Json-брутфорс — `cosine`+`dedup`+шаг 2 воркера; тест «другой канал не дубль» (Task 3, 7). ✔
- Классификация из `channels.buckets` (не хардкод) — шаг 3 воркера + `pickBucket` (Task 4, 7). ✔
- Перевод EN одним промптом «переведи+перепиши» — `buildRewriteMessages` ветка `sourceLang==='en'` (Task 5). ✔
- Рерайт few-shot из `channels.rewritePrompts` per-bucket → `rewritten*`, копия в `final*` — шаг 4+5 воркера (Task 5, 7). ✔
- Спец-путь `сво` (минимальный рерайт) — `isSvo` в промпте + тест прокидывания (Task 5, 7). ✔
- Провайдеры за интерфейсом (сменить конфигом) — `types.ts` + `default.ts` из env (Task 1, 8). ✔
- Ошибка шага → `failed` + `aiError`, карточка не теряется — catch в воркере + тесты (Task 7). ✔
- `POST /posts/:id/rewrite` idempotent, async — Task 9. ✔

**Решение по гонке дедупа:** вместо БД-транзакции — последовательная in-process очередь (`queue.ts`), карточки обрабатываются по одной. Для сотен постов/сутки достаточно и проще; при будущем масштабировании/нескольких воркерах вернуться к advisory-lock/транзакции.

**Консистентность типов и имён:** `WorkerDeps{embedding,llm}`; `EmbeddingProvider.embed(text):number[]`; `LlmProvider.classify({text,buckets}):string` и `rewrite(RewriteInput):RewriteResult{title,text}`; `Candidate{id:bigint,embedding:number[]}`; `processPost`/`reRewritePost`/`triggerAiProcessing`/`triggerRewrite`/`enqueue`/`defaultDeps`/`pickBucket`/`findDuplicateId`/`cosineSimilarity` — имена едины между модулями и тестами. `embedding` пишется как `number[]` (Prisma Json примет массив).

**Плейсхолдеры:** не найдено — весь код приведён целиком.

---

## Definition of Done (Фаза 2)

- `npm test` — зелёный, включая новые файлы `tests/ai/*` и `tests/routes/rewrite.test.ts`, плюс все тесты Фазы 1.
- `npx tsc --noEmit` / `npm run build` — без ошибок.
- Заглушка `trigger.ts` заменена реальной очередью; ingest не блокируется на ИИ.
- Провайдеры вынесены за интерфейс, оркестратор покрыт тестами на фейках (без сети).
