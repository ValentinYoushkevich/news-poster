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
