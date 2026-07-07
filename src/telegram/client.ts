import type {
  SendMessageInput,
  SendPhotoInput,
  TelegramClient,
  TelegramSendResult,
} from './types.js'

interface TgPhotoSize {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  file_size?: number
}

interface TgResult {
  message_id: number
  photo?: TgPhotoSize[]
}

interface TgResponse {
  ok: boolean
  result?: TgResult
  description?: string
}

// file_id крупнейшего элемента photo[] (Telegram отдаёт несколько размеров).
function largestFileId(photo?: TgPhotoSize[]): string | undefined {
  if (!photo || photo.length === 0) return undefined
  const largest = photo.reduce((a, b) => {
    const sa = a.file_size ?? a.width * a.height
    const sb = b.file_size ?? b.width * b.height
    return sb > sa ? b : a
  })
  return largest.file_id
}

export function createTelegramClient(cfg: { botToken: string }): TelegramClient {
  async function call(method: string, payload: Record<string, unknown>): Promise<TgResult> {
    const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = (await res.json()) as TgResponse
    if (!res.ok || !data.ok || !data.result) {
      throw new Error(`telegram_${method}_failed:${res.status}:${data.description ?? ''}`)
    }
    return data.result
  }

  return {
    async sendPhoto(input: SendPhotoInput): Promise<TelegramSendResult> {
      const result = await call('sendPhoto', {
        chat_id: input.chatId,
        photo: input.photo,
        caption: input.caption,
        parse_mode: 'HTML',
      })
      return { messageId: result.message_id, fileId: largestFileId(result.photo) }
    },
    async sendMessage(input: SendMessageInput): Promise<TelegramSendResult> {
      const result = await call('sendMessage', {
        chat_id: input.chatId,
        text: input.text,
        parse_mode: 'HTML',
      })
      return { messageId: result.message_id }
    },
  }
}
