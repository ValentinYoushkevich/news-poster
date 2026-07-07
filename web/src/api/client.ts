import type { Channel, ChannelCreate, ChannelUpdate, ListFilters, Post, PostList } from './types'

const BASE = '/api'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string | undefined,
    message: string,
  ) {
    super(message)
  }
}

// Колбэк на протухшую сессию: 401 на любом пути, кроме /auth/* (там 401 —
// штатный ответ на неверные креды/отсутствие сессии, а не «сессия истекла»).
let onUnauthorized: (() => void) | null = null

export function setOnUnauthorized(cb: (() => void) | null): void {
  onUnauthorized = cb
}

function qs(filters: ListFilters): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  }
  return p.toString()
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    let body: { error?: string; code?: string } = {}
    try {
      body = await res.json()
    } catch {
      /* ignore non-json body */
    }
    if (res.status === 401 && !path.startsWith('/auth')) onUnauthorized?.()
    throw new ApiError(res.status, body.code, body.error ?? `http_${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export interface AuthMe {
  login: string | null
  authRequired: boolean
}

export const api = {
  login: (login: string, password: string) =>
    request<AuthMe>('/auth/login', { method: 'POST', body: JSON.stringify({ login, password }) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  me: () => request<AuthMe>('/auth/me'),
  listChannels: () => request<Channel[]>('/channels'),
  createChannel: (body: ChannelCreate) =>
    request<Channel>('/channels', { method: 'POST', body: JSON.stringify(body) }),
  updateChannel: (id: string, body: ChannelUpdate) =>
    request<Channel>(`/channels/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  listPosts: (f: ListFilters) => request<PostList>(`/posts?${qs(f)}`),
  getPost: (id: string) => request<Post>(`/posts/${id}`),
  patchPost: (id: string, body: { finalTitle?: string; finalText?: string; bucket?: string }) =>
    request<Post>(`/posts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  addImage: (id: string, body: { url: string; type?: string }) =>
    request<Post>(`/posts/${id}/images`, { method: 'POST', body: JSON.stringify(body) }),
  selectImage: (id: string, url: string | null) =>
    request<Post>(`/posts/${id}/images/select`, { method: 'PATCH', body: JSON.stringify({ url }) }),
  approve: (id: string) => request<Post>(`/posts/${id}/approve`, { method: 'POST' }),
  unapprove: (id: string) => request<Post>(`/posts/${id}/unapprove`, { method: 'POST' }),
  remove: (id: string, rejectReason?: string) =>
    request<Post>(`/posts/${id}`, { method: 'DELETE', body: JSON.stringify({ rejectReason }) }),
  hardDelete: (id: string) => request<void>(`/posts/${id}/hard`, { method: 'DELETE' }),
  rewrite: (id: string) =>
    request<{ accepted: boolean }>(`/posts/${id}/rewrite`, { method: 'POST' }),
  classify: (id: string) =>
    request<{ accepted: boolean }>(`/posts/${id}/classify`, { method: 'POST' }),
}
