import { cutReadMoreTail, extractFirstImgSrc, stripHtml } from './html.js'

export interface RawItem {
  channelId: string | number
  source: string
  sourceLang: string
  title?: string
  link: string
  guid?: string
  isoDate?: string
  contentSnippet?: string
  content?: string
  creator?: string
  author?: string
  'dc:creator'?: string
  categories?: unknown
  enclosure?: { url?: string; length?: string; type?: string }
}

export interface ImageCandidate {
  url: string
  type: string | null
  origin: 'enclosure' | 'content' | 'uploaded'
  fileId: string | null
  chosen: boolean
}

export interface NormalizedCard {
  channelId: bigint
  source: string
  sourceLang: string
  link: string
  guid: string | null
  origTitle: string
  origText: string
  author: string | null
  categories: string[]
  pubDate: Date
  images: ImageCandidate[]
}

function normalizeCategories(categories: unknown): string[] {
  if (!Array.isArray(categories)) return []
  return categories
    .map((c) => {
      if (typeof c === 'string') return c
      if (c && typeof c === 'object' && '_' in c && typeof (c as { _: unknown })._ === 'string') {
        return (c as { _: string })._
      }
      return null
    })
    .filter((c): c is string => c !== null)
}

function normalizeImages(item: RawItem): ImageCandidate[] {
  const encUrl = item.enclosure?.url
  if (encUrl) {
    return [
      {
        url: encUrl,
        type: item.enclosure?.type ?? null,
        origin: 'enclosure',
        fileId: null,
        chosen: true,
      },
    ]
  }
  const contentImg = extractFirstImgSrc(item.content)
  if (contentImg) {
    return [{ url: contentImg, type: null, origin: 'content', fileId: null, chosen: true }]
  }
  return []
}

export function normalizeItem(item: RawItem): NormalizedCard {
  return {
    channelId: BigInt(item.channelId),
    source: item.source,
    sourceLang: item.sourceLang,
    link: item.link,
    guid: item.guid ?? null,
    origTitle: item.title ?? '',
    origText: cutReadMoreTail(stripHtml(item.contentSnippet)),
    author: item.creator ?? item.author ?? item['dc:creator'] ?? null,
    categories: normalizeCategories(item.categories),
    pubDate: item.isoDate ? new Date(item.isoDate) : new Date(0),
    images: normalizeImages(item),
  }
}
