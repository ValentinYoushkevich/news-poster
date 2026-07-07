import { AppError } from './errors.js'

// Полная карта статус-переходов. ВЛАДЕЛЕЦ — Фаза 3; Фаза 4 её только читает
// (вызывает assertTransition('ready_to_publish', 'published'), файл не редактирует).
//
// Примечание к 'ready_to_publish': 'rejected' добавлен к целям, чтобы soft-delete
// уже заапрувленной карточки (DELETE /posts/:id, раздел 5.4 ТЗ) шёл через
// assertTransition. Это надмножество зафиксированной в SHARED CONTRACTS карты;
// нужный Фазе 4 переход ready_to_publish -> published остаётся валидным.
// Примечание к 'processing' в целях pending/failed: это пере-рерайт
// (POST /posts/:id/rewrite) — разрешён ТОЛЬКО из этих двух статусов, чтобы
// нельзя было «воскресить» rejected или рассинхронизировать published
// с уже опубликованным сообщением. Тоже надмножество исходной карты.
const TRANSITIONS: Record<string, readonly string[]> = {
  ingested: ['processing'],
  processing: ['pending', 'failed', 'rejected'],
  pending: ['ready_to_publish', 'rejected', 'processing'],
  failed: ['processing'],
  ready_to_publish: ['pending', 'published', 'rejected'],
}

export function assertTransition(from: string, to: string): void {
  const allowed = TRANSITIONS[from] ?? []
  if (!allowed.includes(to)) {
    throw new AppError(409, 'invalid_transition')
  }
}
