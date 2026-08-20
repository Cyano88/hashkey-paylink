import { createHash, createHmac, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { Request, Response } from 'express'
import { verifiedPrivyUser, type VerifiedLinkUser } from '../privy-circle-link.js'
import { deleteDurableJson, hasRenderDurableStore, mutateDurableJson, readDurableJson, writeDurableJson } from '../render-durable-store.js'

const scrypt = promisify(nodeScrypt)
const PIN_PATTERN = /^\d{6}$/
const APPROVAL_TTL_MS = 2 * 60_000
const RESET_TTL_MS = 15 * 60_000
const localStore = new Map<string, unknown>()

type PinRecord = { version: 1; salt: string; hash: string; failedAttempts: number; lockedUntil: number; createdAt: number; updatedAt: number }
type ApprovalRecord = { version: 1; ownerId: string; expiresAt: number; uses: number }
type ResetRecord = { version: 1; ownerId: string; previousAuthorizationHash: string; expiresAt: number; used: boolean }
type Dependencies = { verifyUser(req: Request): Promise<VerifiedLinkUser>; now(): number; random(size: number): Buffer }

function pepper() {
  const value = String(process.env.POCKET_PIN_PEPPER ?? process.env.PRIVY_APP_SECRET ?? '').trim()
  if (value) return value
  if (process.env.RENDER || process.env.NODE_ENV === 'production') throw Object.assign(new Error('Pocket payment security is not configured.'), { status: 503 })
  return 'local-pocket-pin-pepper'
}

function ownerKey(ownerId: string) { return `pocket-pin:v1:${createHash('sha256').update(ownerId).digest('hex')}` }
function approvalKey(token: string) { return `pocket-approval:v1:${createHash('sha256').update(token).digest('hex')}` }
function resetKey(token: string) { return `pocket-pin-reset:v1:${createHash('sha256').update(token).digest('hex')}` }
function authorizationHash(req: Request) {
  const match = String(req.headers.authorization ?? '').match(/^Bearer\s+(.+)$/i)
  return match?.[1] ? createHash('sha256').update(match[1]).digest('hex') : ''
}

async function readStore<T>(key: string): Promise<T | undefined> {
  if (hasRenderDurableStore()) return readDurableJson<T>(key)
  return localStore.get(key) as T | undefined
}
async function writeStore(key: string, value: unknown) {
  if (hasRenderDurableStore()) return writeDurableJson(key, value)
  localStore.set(key, value)
}
async function mutateStore<T>(key: string, mutate: (current: T | undefined) => T | Promise<T>) {
  if (hasRenderDurableStore()) return mutateDurableJson<T>(key, mutate)
  const next = await mutate(localStore.get(key) as T | undefined)
  localStore.set(key, next)
  return next
}

export async function deletePocketPaymentSecurity(ownerId: string) {
  const key = ownerKey(String(ownerId ?? '').trim())
  if (hasRenderDurableStore()) return deleteDurableJson(key)
  localStore.delete(key)
}

async function pinHash(pin: string, salt: Buffer) {
  const hardened = createHmac('sha256', pepper()).update(pin).digest()
  return Buffer.from(await scrypt(hardened, salt, 32)).toString('base64')
}
async function newPinRecord(pin: string, now: number, random: Dependencies['random']): Promise<PinRecord> {
  const salt = random(16)
  return { version: 1, salt: salt.toString('base64'), hash: await pinHash(pin, salt), failedAttempts: 0, lockedUntil: 0, createdAt: now, updatedAt: now }
}
async function verifyPin(record: PinRecord, pin: string) {
  const actual = Buffer.from(await pinHash(pin, Buffer.from(record.salt, 'base64')), 'base64')
  const expected = Buffer.from(record.hash, 'base64')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
function cooldownMs(attempts: number) { return attempts < 5 ? 0 : Math.min(30 * 60_000, 30_000 * 2 ** Math.min(6, attempts - 5)) }
function cleanPin(value: unknown) {
  const pin = String(value ?? '').trim()
  if (!PIN_PATTERN.test(pin)) throw Object.assign(new Error('Enter your six-digit Pocket PIN.'), { status: 400 })
  return pin
}

export async function consumePocketPaymentApproval(token: string, ownerId: string, now = Date.now()) {
  const cleanToken = String(token ?? '').trim()
  const cleanOwnerId = String(ownerId ?? '').trim()
  if (!/^[A-Za-z0-9_-]{32,160}$/.test(cleanToken) || !cleanOwnerId) return false
  let accepted = false
  await mutateStore<ApprovalRecord>(approvalKey(cleanToken), current => {
    if (!current || current.uses >= 1 || current.expiresAt <= now || current.ownerId !== cleanOwnerId) return current ?? { version: 1, ownerId: '', expiresAt: 0, uses: 1 }
    accepted = true
    return { ...current, uses: current.uses + 1 }
  })
  return accepted
}

export function createPocketPaymentSecurityHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies: Dependencies = { verifyUser: verifiedPrivyUser, now: Date.now, random: randomBytes, ...overrides }
  return async function pocketPaymentSecurityHandler(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store, max-age=0')
    res.setHeader('Pragma', 'no-cache')
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    try {
      const identity = await dependencies.verifyUser(req)
      const key = ownerKey(identity.userId)
      const current = await readStore<PinRecord>(key)
      if (req.method === 'GET') return res.json({ ok: true, configured: Boolean(current), lockedUntil: current?.lockedUntil ?? 0 })
      const action = String(req.body?.action ?? '')
      const now = dependencies.now()
      if (action === 'setup') {
        if (current) return res.status(409).json({ ok: false, error: 'Your Pocket PIN is already set.' })
        await writeStore(key, await newPinRecord(cleanPin(req.body?.pin), now, dependencies.random))
        return res.json({ ok: true, configured: true })
      }
      if (!current) return res.status(428).json({ ok: false, error: 'Create your Pocket PIN first.' })
      if (action === 'begin-reset') {
        const previousAuthorizationHash = authorizationHash(req)
        if (!previousAuthorizationHash) return res.status(401).json({ ok: false, error: 'Sign in again to reset your Pocket PIN.' })
        const resetToken = dependencies.random(32).toString('base64url')
        const expiresAt = now + RESET_TTL_MS
        await writeStore(resetKey(resetToken), { version: 1, ownerId: identity.userId, previousAuthorizationHash, expiresAt, used: false } satisfies ResetRecord)
        return res.json({ ok: true, resetToken, expiresAt })
      }
      if (current.lockedUntil > now) return res.status(429).json({ ok: false, error: 'Too many incorrect attempts. Try again shortly.', lockedUntil: current.lockedUntil })
      if (action === 'reset') {
        const token = String(req.body?.resetToken ?? '').trim()
        const nextAuthorizationHash = authorizationHash(req)
        let resetAccepted = false
        if (/^[A-Za-z0-9_-]{32,160}$/.test(token) && nextAuthorizationHash) {
          await mutateStore<ResetRecord>(resetKey(token), record => {
            if (!record || record.used || record.expiresAt <= now || record.ownerId !== identity.userId || record.previousAuthorizationHash === nextAuthorizationHash) {
              return record ?? { version: 1, ownerId: '', previousAuthorizationHash: '', expiresAt: 0, used: true }
            }
            resetAccepted = true
            return { ...record, used: true }
          })
        }
        if (!resetAccepted) return res.status(401).json({ ok: false, error: 'Sign out and verify your email again before resetting your PIN.' })
        await writeStore(key, await newPinRecord(cleanPin(req.body?.pin), now, dependencies.random))
        return res.json({ ok: true, configured: true, reset: true })
      }
      const enteredPin = cleanPin(req.body?.pin ?? req.body?.currentPin)
      if (!await verifyPin(current, enteredPin)) {
        const failedAttempts = current.failedAttempts + 1
        const lockedUntil = now + cooldownMs(failedAttempts)
        await writeStore(key, { ...current, failedAttempts, lockedUntil, updatedAt: now })
        return res.status(401).json({ ok: false, error: failedAttempts >= 5 ? 'Too many incorrect attempts. Try again shortly.' : 'That Pocket PIN is incorrect.', lockedUntil })
      }
      await writeStore(key, { ...current, failedAttempts: 0, lockedUntil: 0, updatedAt: now })
      if (action === 'change') {
        const record = await newPinRecord(cleanPin(req.body?.newPin), now, dependencies.random)
        await writeStore(key, { ...record, createdAt: current.createdAt })
        return res.json({ ok: true, configured: true, changed: true })
      }
      if (action === 'verify') {
        const token = dependencies.random(32).toString('base64url')
        const expiresAt = now + APPROVAL_TTL_MS
        await writeStore(approvalKey(token), { version: 1, ownerId: identity.userId, expiresAt, uses: 0 } satisfies ApprovalRecord)
        return res.json({ ok: true, approvalToken: token, expiresAt })
      }
      return res.status(400).json({ ok: false, error: 'Unsupported payment security action.' })
    } catch (reason) {
      const error = reason as Error & { status?: number }
      return res.status(error.status ?? 500).json({ ok: false, error: error.message || 'Payment security request failed.' })
    }
  }
}

export default createPocketPaymentSecurityHandler()
