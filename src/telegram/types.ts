export interface TelegramSendResult {
  messageId: number
  fileId?: string
}

export interface SendPhotoInput {
  chatId: string
  photo: string // URL или уже готовый file_id
  caption?: string
}

export interface SendMessageInput {
  chatId: string
  text: string
}

export interface TelegramClient {
  sendPhoto(input: SendPhotoInput): Promise<TelegramSendResult>
  sendMessage(input: SendMessageInput): Promise<TelegramSendResult>
}
