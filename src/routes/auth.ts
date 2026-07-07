import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { Router, type Request } from 'express'
import { adminEnv, type AdminEnv } from '../config/env.js'

// Сессии админки в памяти процесса: token -> момент истечения (мс).
// Рестарт бэкенда разлогинивает всех — для одной админки это приемлемо.
const sessions = new Map<string, number>()
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const COOKIE_NAME = 'admin_session'

// Конфиг берём через adminEnv() на каждый запрос (а не кэшируем на старте):
// тесты auth мутируют process.env в рантайме — роуты видят актуальные значения.

// secure-флаг куки нельзя вешать безусловно: стек ходит по голому HTTP (nginx :8081 без TLS),
// и браузер отбросил бы куку при заходе не с localhost. Включать, когда админка будет за HTTPS.
function cookieOptions(admin: AdminEnv) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: admin.ADMIN_COOKIE_SECURE,
  }
}

function authEnabled(admin: AdminEnv): boolean {
  return Boolean(admin.ADMIN_LOGIN && admin.ADMIN_PASSWORD)
}

// Сравнение через sha256 выравнивает длину входов для timingSafeEqual.
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

function tokenFromCookie(req: Request): string | null {
  const header = req.headers.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === COOKIE_NAME) return rest.join('=')
  }
  return null
}

function hasValidSession(req: Request): boolean {
  const token = tokenFromCookie(req)
  if (!token) return false
  const expiresAt = sessions.get(token)
  if (expiresAt === undefined) return false
  if (expiresAt < Date.now()) {
    sessions.delete(token)
    return false
  }
  return true
}

function sweepExpired() {
  const now = Date.now()
  for (const [token, expiresAt] of sessions) {
    if (expiresAt < now) sessions.delete(token)
  }
}

export const authRouter = Router()

authRouter.post('/login', (req, res) => {
  const admin = adminEnv()
  if (!authEnabled(admin)) {
    res.json({ login: null, authRequired: false })
    return
  }
  const { login, password } = (req.body ?? {}) as { login?: unknown; password?: unknown }
  if (
    typeof login !== 'string' ||
    typeof password !== 'string' ||
    !safeEqual(login, admin.ADMIN_LOGIN!) ||
    !safeEqual(password, admin.ADMIN_PASSWORD!)
  ) {
    res.status(401).json({ error: 'invalid_credentials', code: 'invalid_credentials' })
    return
  }
  sweepExpired()
  const token = randomBytes(32).toString('hex')
  sessions.set(token, Date.now() + SESSION_TTL_MS)
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(admin), maxAge: SESSION_TTL_MS })
  res.json({ login, authRequired: true })
})

authRouter.post('/logout', (req, res) => {
  const token = tokenFromCookie(req)
  if (token) sessions.delete(token)
  res.clearCookie(COOKIE_NAME, cookieOptions(adminEnv()))
  res.status(204).end()
})

// Для nginx auth_request: 200 — пропустить запрос к API, 401 — нет.
authRouter.get('/check', (req, res) => {
  if (!authEnabled(adminEnv()) || hasValidSession(req)) {
    res.status(200).end()
    return
  }
  res.status(401).end()
})

// Для фронтового гарда роутера.
authRouter.get('/me', (req, res) => {
  const admin = adminEnv()
  if (!authEnabled(admin)) {
    res.json({ login: null, authRequired: false })
    return
  }
  if (hasValidSession(req)) {
    res.json({ login: admin.ADMIN_LOGIN, authRequired: true })
    return
  }
  res.status(401).json({ error: 'unauthorized', code: 'unauthorized' })
})
