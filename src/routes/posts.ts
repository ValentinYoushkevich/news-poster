import { Router } from 'express'
import { z } from 'zod'
import { triggerAiProcessing, triggerRewrite } from '../ai/trigger.js'
import { asyncHandler } from '../errors.js'
import { getPost, ingest, listPosts, patchPost } from '../services/postService.js'

export const postsRouter = Router()

const ingestSchema = z.object({
  channelId: z.union([z.string(), z.number()]),
  source: z.string().min(1),
  sourceLang: z.string().min(1),
  link: z.string().min(1),
  title: z.string().optional(),
  guid: z.string().optional(),
  isoDate: z.string().optional(),
  contentSnippet: z.string().optional(),
  content: z.string().optional(),
  creator: z.string().optional(),
  author: z.string().optional(),
  'dc:creator': z.string().optional(),
  categories: z.unknown().optional(),
  enclosure: z
    .object({ url: z.string().optional(), length: z.string().optional(), type: z.string().optional() })
    .optional(),
})

postsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const dto = ingestSchema.parse(req.body)
    const post = await ingest(dto)
    void triggerAiProcessing(post.id)
    res.status(201).json(post)
  }),
)

const listSchema = z.object({
  channelId: z.coerce.bigint().optional(),
  status: z.string().optional(),
  bucket: z.string().optional(),
  source: z.string().optional(),
  date: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
})

postsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = listSchema.parse(req.query)
    res.json(await listPosts(q))
  }),
)

postsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await getPost(BigInt(String(req.params.id))))
  }),
)

const patchSchema = z.object({
  finalTitle: z.string().optional(),
  finalText: z.string().optional(),
  bucket: z.string().optional(),
})

postsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const dto = patchSchema.parse(req.body)
    res.json(await patchPost(BigInt(String(req.params.id)), dto))
  }),
)

postsRouter.post(
  '/:id/rewrite',
  asyncHandler(async (req, res) => {
    const id = BigInt(String(req.params.id)) // Express 5: params.id имеет тип string | string[]
    await getPost(id) // 404, если нет
    void triggerRewrite(id)
    res.status(202).json({ accepted: true })
  }),
)
