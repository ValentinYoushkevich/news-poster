import { Router } from 'express'
import { z } from 'zod'
import { triggerAiProcessing, triggerRewrite } from '../ai/trigger.js'
import { AppError, asyncHandler } from '../errors.js'
import {
  addImage,
  approvePost,
  getPost,
  ingest,
  listPosts,
  listPublishQueue,
  markPublished,
  patchPost,
  selectImage,
  softDeletePost,
  unapprovePost,
} from '../services/postService.js'

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

const queueSchema = z.object({
  channelId: z.coerce.bigint(),
  limit: z.coerce.number().int().min(1).max(100).default(10),
})

// ВАЖНО: '/queue' зарегистрирован ДО '/:id', иначе Express 5 отдаст '/queue'
// в '/:id' и BigInt('queue') бросит.
postsRouter.get(
  '/queue',
  asyncHandler(async (req, res) => {
    const q = queueSchema.parse(req.query)
    res.json(await listPublishQueue(q))
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

const addImageSchema = z.object({
  url: z.string().min(1),
  type: z.string().optional(),
})

postsRouter.post(
  '/:id/images',
  asyncHandler(async (req, res) => {
    const dto = addImageSchema.parse(req.body)
    const post = await addImage(BigInt(String(req.params.id)), dto)
    res.status(201).json(post)
  }),
)

const selectImageSchema = z.object({
  url: z.string().min(1).nullable(),
})

postsRouter.patch(
  '/:id/images/select',
  asyncHandler(async (req, res) => {
    const dto = selectImageSchema.parse(req.body)
    res.json(await selectImage(BigInt(String(req.params.id)), dto.url))
  }),
)

postsRouter.post(
  '/:id/approve',
  asyncHandler(async (req, res) => {
    const post = await approvePost(BigInt(String(req.params.id)))
    res.json(post)
  }),
)

postsRouter.post(
  '/:id/unapprove',
  asyncHandler(async (req, res) => {
    res.json(await unapprovePost(BigInt(String(req.params.id))))
  }),
)

const deleteSchema = z.object({
  rejectReason: z.string().optional(),
})

postsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const dto = deleteSchema.parse(req.body ?? {})
    res.json(await softDeletePost(BigInt(String(req.params.id)), dto.rejectReason))
  }),
)

postsRouter.post(
  '/:id/rewrite',
  asyncHandler(async (req, res) => {
    const id = BigInt(String(req.params.id)) // Express 5: params.id имеет тип string | string[]
    const post = await getPost(id) // 404, если нет
    // Пере-рерайт разрешён только из pending/failed (см. карту src/status.ts):
    // rejected нельзя «воскрешать», published — рассинхрон с уже опубликованным.
    // Проверяем до постановки в очередь; воркер повторит переход атомарно.
    if (post.status !== 'pending' && post.status !== 'failed') {
      throw new AppError(409, 'invalid_transition')
    }
    void triggerRewrite(id)
    res.status(202).json({ accepted: true })
  }),
)

const publishedSchema = z.object({
  publishedMessageId: z.coerce.bigint(),
})

postsRouter.patch(
  '/:id/published',
  asyncHandler(async (req, res) => {
    const id = BigInt(String(req.params.id)) // Express 5: params.id имеет тип string | string[]
    const dto = publishedSchema.parse(req.body)
    res.json(await markPublished(id, dto.publishedMessageId))
  }),
)
