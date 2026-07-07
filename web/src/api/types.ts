export type ImageOrigin = 'enclosure' | 'content' | 'uploaded'

export interface ImageCandidate {
  url: string
  type: string | null
  origin: ImageOrigin
  fileId: string | null
  chosen: boolean
}

export type PostStatus =
  | 'ingested'
  | 'processing'
  | 'pending'
  | 'ready_to_publish'
  | 'published'
  | 'rejected'
  | 'failed'

export interface Post {
  id: string
  channelId: string
  source: string
  sourceLang: string
  link: string
  guid: string | null
  origTitle: string
  origText: string
  author: string | null
  categories: string[]
  pubDate: string
  images: ImageCandidate[]
  bucket: string | null
  rewrittenTitle: string | null
  rewrittenText: string | null
  finalTitle: string | null
  finalText: string | null
  status: PostStatus
  previewMessageId: string | null
  publishedMessageId: string | null
  aiError: string | null
  rejectReason: string | null
  createdAt: string
  updatedAt: string
  approvedAt: string | null
  publishedAt: string | null
}

export interface Channel {
  id: string
  name: string
  mainChatId: string
  buckets: string[]
  rewritePrompts: Record<string, string>
  schedule: string
  previewTtl: number | null
  active: boolean
  createdAt?: string
  updatedAt?: string
}

export interface ChannelCreate {
  name: string
  mainChatId: string
  buckets: string[]
  rewritePrompts: Record<string, string>
  schedule: string
  previewTtl?: number | null
}

// PATCH /channels/:id — все поля опциональны (updateSchema = createSchema.partial()).
export interface ChannelUpdate {
  name?: string
  mainChatId?: string
  buckets?: string[]
  rewritePrompts?: Record<string, string>
  schedule?: string
  previewTtl?: number | null
  active?: boolean
}

export interface PostList {
  items: Post[]
  total: number
  page: number
  pageSize: number
}

export interface ListFilters {
  channelId?: string
  status?: string
  bucket?: string
  source?: string
  date?: string
  page?: number
}
