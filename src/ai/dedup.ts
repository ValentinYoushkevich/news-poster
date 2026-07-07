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
