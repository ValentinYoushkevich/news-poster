import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { AppError } from '../errors.js'

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message, code: err.code })
    return
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'validation_failed', issues: err.issues })
    return
  }
  console.error(err)
  res.status(500).json({ error: 'internal_error' })
}
