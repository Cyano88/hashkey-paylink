import { timingSafeEqual } from 'node:crypto'
import type { Request } from 'express'

export function adminSecretConfigured(): boolean {
  return (process.env.ADMIN_SECRET?.trim().length ?? 0) >= 24
}

export function adminBearerAuthorized(req: Request): boolean {
  const expected = process.env.ADMIN_SECRET?.trim() ?? ''
  if (expected.length < 24) return false
  const authorization = req.headers.authorization
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false
  const provided = Buffer.from(authorization.slice(7).trim())
  const secret = Buffer.from(expected)
  return provided.length === secret.length && timingSafeEqual(provided, secret)
}
