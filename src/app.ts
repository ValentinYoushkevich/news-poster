import './bigint.js'
import express from 'express'
import { errorHandler } from './middleware/errorHandler.js'
import { channelsRouter } from './routes/channels.js'
import { postsRouter } from './routes/posts.js'

export function createApp() {
  const app = express()
  app.use(express.json({ limit: '2mb' }))

  app.get('/health', (_req, res) => res.json({ ok: true }))
  app.use('/channels', channelsRouter)
  app.use('/posts', postsRouter)

  app.use(errorHandler)
  return app
}
