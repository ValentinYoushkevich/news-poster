import { createApp } from './app.js'
import { adminEnv, env } from './config/env.js'
import { startPreviewCleanup } from './telegram/previewCleanup.js'

// Auth без кредов молча выключается (fail-open) — предупреждаем явно.
const admin = adminEnv()
if (!admin.ADMIN_LOGIN || !admin.ADMIN_PASSWORD) {
  console.warn('WARN: ADMIN_LOGIN/ADMIN_PASSWORD не заданы — админка и /api открыты без логина')
}

const app = createApp()
app.listen(env.PORT, () => {
  console.log(`news-poster listening on :${env.PORT}`)
})

// Фоновая TTL-очистка превью в служебном чате (раз в 5 минут).
startPreviewCleanup()
