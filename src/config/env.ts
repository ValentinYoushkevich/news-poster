import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  PREVIEW_TTL_DEFAULT: z.coerce.number().default(1440),

  BOT_TOKEN: z.string().default(''),
  SERVICE_CHAT_ID: z.string().default(''),

  OLLAMA_URL: z.string().default('http://localhost:11434'),
  EMBED_MODEL: z.string().default('bge-m3'),

  OPENROUTER_URL: z.string().default('https://openrouter.ai/api/v1/chat/completions'),
  OPENROUTER_API_KEY: z.string().default(''),
  REWRITE_MODEL: z.string().default('openai/gpt-4o-mini'),

  DEDUP_THRESHOLD: z.coerce.number().default(0.85),
  DEDUP_WINDOW_HOURS: z.coerce.number().default(24),
})

export const env = schema.parse(process.env)

// Конфиг админ-аутентификации. Читается ФУНКЦИЕЙ на каждый запрос, а не один раз
// на старте, как env выше: тесты auth мутируют process.env в рантайме, и роуты
// должны видеть актуальные значения. Пустые строки схлопываем в undefined —
// незаданные креды означают «auth выключен» (fail-open по дизайну dev-режима).
const adminSchema = z.object({
  ADMIN_LOGIN: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  ADMIN_PASSWORD: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  ADMIN_COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
})

export type AdminEnv = z.infer<typeof adminSchema>

export function adminEnv(): AdminEnv {
  return adminSchema.parse(process.env)
}
