import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  PREVIEW_TTL_DEFAULT: z.coerce.number().default(1440),

  OLLAMA_URL: z.string().default('http://localhost:11434'),
  EMBED_MODEL: z.string().default('bge-m3'),

  OPENROUTER_URL: z.string().default('https://openrouter.ai/api/v1/chat/completions'),
  OPENROUTER_API_KEY: z.string().default(''),
  REWRITE_MODEL: z.string().default('openai/gpt-4o-mini'),

  DEDUP_THRESHOLD: z.coerce.number().default(0.85),
  DEDUP_WINDOW_HOURS: z.coerce.number().default(24),
})

export const env = schema.parse(process.env)
