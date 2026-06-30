import { randomBytes, timingSafeEqual } from 'node:crypto'

type BuilderSession = {
  token: string
  body: string
  expiresAt: number
  used: boolean
}

const sessions = new Map<string, BuilderSession>()
const TTL_MS = 5 * 60 * 1000

function cleanup() {
  const now = Date.now()
  for (const [id, session] of sessions.entries()) {
    if (session.expiresAt <= now || session.used) sessions.delete(id)
  }
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function createBuilderSession(body: string) {
  cleanup()
  const id = randomBytes(16).toString('hex')
  const token = randomBytes(32).toString('hex')
  sessions.set(id, {
    token,
    body,
    expiresAt: Date.now() + TTL_MS,
    used: false,
  })
  return { id, token, expiresAt: Date.now() + TTL_MS }
}

export function consumeBuilderSession(id: string, token: string, body: string) {
  cleanup()
  const session = sessions.get(id)
  if (!session || session.used || session.expiresAt <= Date.now()) return false
  if (!safeEqual(session.token, token)) return false
  if (session.body !== body) return false
  session.used = true
  sessions.delete(id)
  return true
}
