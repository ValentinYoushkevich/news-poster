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
