import { defaultDeps } from './providers/default.js'
import type { WorkerDeps } from './providers/types.js'
import { enqueue } from './queue.js'
import { classifyPost, processPost, reRewritePost } from './worker.js'

// Под тест-раннером фоновая обработка отключается: ingest-роут по-прежнему
// вызывает настоящий триггер, но его fire-and-forget сторона (постановка в
// последовательную очередь с реальными провайдерами) не должна асинхронно
// менять статусы карточек, которые проверяют юнит-тесты роутов Фазы 1.
// Сама очередь и оркестратор покрыты прямыми тестами (queue.test / worker.test).
const AI_TRIGGER_DISABLED = process.env.VITEST === 'true'

// Ставит обработку карточки в последовательную очередь. Не ждём завершения —
// ingest отвечает сразу (ИИ имеет задержку). Возвращаем промис только для тестов.
export function triggerAiProcessing(postId: bigint, deps: WorkerDeps = defaultDeps()): Promise<unknown> {
  if (AI_TRIGGER_DISABLED) return Promise.resolve()
  return enqueue(() => processPost(postId, deps))
}

export function triggerRewrite(postId: bigint, deps: WorkerDeps = defaultDeps()): Promise<unknown> {
  if (AI_TRIGGER_DISABLED) return Promise.resolve()
  return enqueue(() => reRewritePost(postId, deps))
}

export function triggerClassify(postId: bigint, deps: WorkerDeps = defaultDeps()): Promise<unknown> {
  if (AI_TRIGGER_DISABLED) return Promise.resolve()
  return enqueue(() => classifyPost(postId, deps))
}
