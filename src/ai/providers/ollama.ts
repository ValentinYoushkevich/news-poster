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
