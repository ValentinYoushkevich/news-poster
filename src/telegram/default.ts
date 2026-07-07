import { env } from '../config/env.js'
import { createTelegramClient } from './client.js'
import type { TelegramClient } from './types.js'

// Реальный клиент из env (один бот на все каналы). Инъектируется в approvePost;
// в тестах роута аппрува модуль мокается через vi.mock.
export function defaultTelegram(): TelegramClient {
  return createTelegramClient({ botToken: env.BOT_TOKEN })
}
