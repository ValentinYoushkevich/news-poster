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
  schedule: string
  active: boolean
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
