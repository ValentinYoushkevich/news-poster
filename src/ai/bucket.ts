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
