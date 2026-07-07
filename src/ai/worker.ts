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
