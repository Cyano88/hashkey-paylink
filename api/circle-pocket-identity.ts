import type { Request } from 'express'
import crypto from 'node:crypto'
import { PrivyClient } from '@privy-io/server-auth'

export type CirclePocketIdentity = {
  kind: 'privy' | 'browser'
  storageKey: string
  subject: string
}

function cleanString(value: unknown, max = 256) {
  return String(value ?? '').trim().slice(0, max)
}

function bearerToken(req: Request) {
  const auth = req.headers.authorization ?? ''
  return auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? ''
}

function browserSessionToken(req: Request) {
  const value = cleanString(req.headers['x-helper-session'], 160)
  return /^[a-fA-F0-9]{64}$/.test(value) ? value.toLowerCase() : ''
}

async function verifiedPrivyUserId(token: string) {
  const privyAppId = process.env.PRIVY_APP_ID ?? process.env.VITE_PRIVY_APP_ID
  const privyAppSecret = process.env.PRIVY_APP_SECRET
  if (!privyAppId || !privyAppSecret) {
    throw identityError('Circle Pocket authentication is not configured.', 503)
  }
  const client = new PrivyClient(privyAppId, privyAppSecret)
  const claims = await client.verifyAuthToken(token)
  return claims.userId
}

function identityError(message: string, status: number, cause?: unknown) {
  const error = new Error(message) as Error & { status?: number; cause?: unknown }
  error.status = status
  if (cause !== undefined) error.cause = cause
  return error
}

export async function resolveCirclePocketIdentity(
  req: Request,
  verifyPrivy: (token: string) => Promise<string> = verifiedPrivyUserId,
): Promise<CirclePocketIdentity> {
  const token = bearerToken(req)
  if (token) {
    try {
      const userId = cleanString(await verifyPrivy(token), 180)
      if (!userId) throw new Error('Invalid Privy identity.')
      return { kind: 'privy', storageKey: `privy:${userId}`, subject: userId }
    } catch (cause) {
      const status = Number((cause as Error & { status?: number })?.status)
      if (status === 503) throw cause
      throw identityError('Invalid or expired Circle Pocket session.', 401, cause)
    }
  }

  const browserSession = browserSessionToken(req)
  if (!browserSession) throw identityError('Missing Circle Pocket browser session.', 401)
  const sessionHash = crypto.createHash('sha256').update(browserSession).digest('hex')
  return { kind: 'browser', storageKey: `browser:${sessionHash}`, subject: sessionHash }
}

export function circlePocketIdentityId(identity: CirclePocketIdentity) {
  return crypto.createHash('sha256').update(identity.storageKey.toLowerCase()).digest('hex').slice(0, 32)
}

export function circlePocketIdentityErrorStatus(error: unknown, fallback = 401) {
  return Number((error as Error & { status?: number })?.status) || fallback
}
