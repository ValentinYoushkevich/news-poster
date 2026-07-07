// Последовательная in-process очередь: задачи идут строго по одной.
// Снимает гонку смыслового дедупа без блокировок БД.
let tail: Promise<unknown> = Promise.resolve()

export function enqueue(task: () => Promise<unknown>): Promise<unknown> {
  const run = tail.then(task, task) // выполнить task независимо от исхода предыдущей
  // хвост не должен зависать на реджекте предыдущей задачи
  tail = run.catch(() => undefined)
  return run
}
