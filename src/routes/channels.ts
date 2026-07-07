import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../errors.js'
import { createChannel, listChannels, updateChannel } from '../services/channelService.js'

export const channelsRouter = Router()

const createSchema = z.object({
  name: z.string().min(1),
  mainChatId: z.string().min(1),
  buckets: z.array(z.string()),
  rewritePrompts: z.record(z.string(), z.any()),
  schedule: z.string().min(1),
  previewTtl: z.number().int().nullable().optional(),
  active: z.boolean().optional(),
})

const updateSchema = createSchema.partial()

channelsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await listChannels())
  }),
)

channelsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const dto = createSchema.parse(req.body)
    const channel = await createChannel(dto)
    res.status(201).json(channel)
  }),
)

channelsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const dto = updateSchema.parse(req.body)
    const channel = await updateChannel(BigInt(String(req.params.id)), dto)
    res.json(channel)
  }),
)
