import { env } from '../config/env.js'
import { prisma } from '../db/client.js'
import { assertTransition } from '../status.js'
import { pickBucket } from './bucket.js'
import { findDuplicateId, type Candidate } from './dedup.js'
import type { WorkerDeps } from './providers/types.js'

// Безопасный статус-переход воркера: валидирует через общую карту (assertTransition)
// и защищает от гонок — обновляет только если статус в БД всё ещё `from`
// (updateMany с условием). Возвращает false, если статус изменили конкурентно
// (например, оператор reject-нул карточку, пока воркер её обрабатывал) —
// тогда вызывающий код прекращает обработку, ничего не перетирая.
async function transition(
  postId: bigint,
  from: string,
  to: string,
  data: Record<string, unknown> = {},
): Promise<boolean> {
  assertTransition(from, to)
  const { count } = await prisma.post.updateMany({
    where: { id: postId, status: from },
    data: { ...data, status: to },
  })
  return count === 1
}

// Провал в failed из catch: гонки не перетираем (условие status='processing'),
// updateMany не бросает на исчезнувшей карточке — воркер НИКОГДА не реджектится.
async function failSafely(postId: bigint, msg: string): Promise<void> {
  await prisma.post
    .updateMany({
      where: { id: postId, status: 'processing' },
      data: { status: 'failed', aiError: msg },
    })
    .catch(() => undefined)
}

// Автоматическая часть пайплайна: только эмбеддинг и смысловой дедуп.
// Классификация и рерайт вынесены в отдельные шаги по запросу человека
// (classifyPost / reRewritePost).
export async function processPost(postId: bigint, deps: WorkerDeps): Promise<void> {
  const post = await prisma.post.findUnique({ where: { id: postId } })
  if (!post) return

  try {
    // Статус мог смениться между findUnique и переходом — тогда выходим молча.
    if (!(await transition(postId, post.status, 'processing', { aiError: null }))) return

    // 1. Эмбеддинг
    const embedding = await deps.embedding.embed(`${post.origTitle}\n${post.origText}`)
    await prisma.post.updateMany({ where: { id: postId }, data: { embedding } })

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
      await transition(postId, 'processing', 'rejected', {
        rejectReason: `semantic_duplicate:${dupId}`,
      })
      return
    }

    // 3. Не дубль — карточка уходит в pending и ждёт решения человека:
    // классификация (POST /posts/:id/classify) и рерайт (POST /posts/:id/rewrite)
    // запускаются только по явному запросу оператора. bucket и rewrite-поля
    // остаются null, deps.llm здесь не вызывается.
    await transition(postId, 'processing', 'pending')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await failSafely(postId, msg)
  }
}

// Классификация бакета по запросу человека. Разрешена только из pending/failed
// (та же карта переходов, что и у рерайта). Рерайт НЕ запускается — оператор
// проверяет бакет и запускает его отдельно.
export async function classifyPost(postId: bigint, deps: WorkerDeps): Promise<void> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { channel: true },
  })
  if (!post) return
  try {
    // Гонки не перетираем: если статус сменился после проверки в роуте,
    // updateMany не пройдёт (или assertTransition бросит) — выходим молча.
    if (!(await transition(postId, post.status, 'processing', { aiError: null }))) return
    const buckets = (post.channel.buckets as string[]) ?? []
    const rawBucket = await deps.llm.classify({
      text: `${post.origTitle}\n${post.origText}`,
      buckets,
    })
    const bucket = pickBucket(rawBucket, buckets)
    if (!bucket) throw new Error(`classify_unknown_bucket:${rawBucket}`)
    await transition(postId, 'processing', 'pending', { bucket })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await failSafely(postId, msg)
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
    // Карта разрешает →processing только из pending/failed: rejected/published
    // не «воскрешаются», даже если карточка успела сменить статус после
    // проверки в роуте (assertTransition бросит, catch ничего не перетрёт).
    if (!(await transition(postId, post.status, 'processing', { aiError: null }))) return
    // Рерайт возможен только при уже выставленном бакете (человеком или через
    // classifyPost) — авто-классификации здесь больше нет. Роут отсекает такие
    // карточки раньше (409 rewrite_no_bucket), это подстраховка от гонок.
    const bucket = post.bucket
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
    await transition(postId, 'processing', 'pending', {
      bucket,
      rewrittenTitle: rr.title,
      rewrittenText: rr.text,
      finalTitle: rr.title,
      finalText: rr.text,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await failSafely(postId, msg)
  }
}
