import type { Request, Response } from 'express'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, resolve } from 'path'
import { PrivyClient, type User } from '@privy-io/server-auth'
import { hasRenderDurableStore, readDurableJson, writeDurableJson } from './render-durable-store.js'

const STORE_PATH = process.env.LOCAL_CURRENCY_PROFILE_STORE ?? './data/local-currency-profiles.json'
const STORE_KEY = (process.env.LOCAL_CURRENCY_PROFILE_STORE_KEY ?? 'hashpaylink:local-currency-profiles').trim()
const IS_RENDER = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL)
const HAS_DURABLE_STORE = hasRenderDurableStore()

type LocalCurrencyProfile = {
  privyUserId: string
  firstName: string
  lastName: string
  email: string
  updatedAt: string
}

type Store = {
  profiles: Record<string, LocalCurrencyProfile>
}

function getBearerToken(req: Request) {
  const auth = req.headers.authorization ?? ''
  return auth.match(/^Bearer\s+(.+)$/i)?.[1]
}

function linkedEmail(user: User) {
  for (const account of user.linkedAccounts ?? []) {
    if (account.type === 'email' && 'address' in account && typeof account.address === 'string') {
      return account.address.toLowerCase()
    }
  }
  return ''
}

function cleanName(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 64)
}

async function verifiedPrivyUser(req: Request) {
  const privyAppId = process.env.PRIVY_APP_ID ?? process.env.VITE_PRIVY_APP_ID
  const privyAppSecret = process.env.PRIVY_APP_SECRET
  if (!privyAppId || !privyAppSecret) {
    const err = new Error('Local currency profiles are not configured. Set PRIVY_APP_ID and PRIVY_APP_SECRET server-side.')
    ;(err as Error & { status?: number }).status = 503
    throw err
  }
  const token = getBearerToken(req)
  if (!token) {
    const err = new Error('Missing Privy access token.')
    ;(err as Error & { status?: number }).status = 401
    throw err
  }
  const client = new PrivyClient(privyAppId, privyAppSecret)
  const claims = await client.verifyAuthToken(token)
  const user = await client.getUserById(claims.userId)
  return { claims, email: linkedEmail(user) }
}

async function readStore(): Promise<Store> {
  try {
    const remote = await readDurableJson<Partial<Store>>(STORE_KEY)
    if (remote) return { profiles: remote.profiles ?? {} }
  } catch {
    // Fall through to local file for development.
  }

  try {
    const raw = await readFile(resolve(STORE_PATH), 'utf8')
    const parsed = JSON.parse(raw) as Partial<Store>
    return { profiles: parsed.profiles ?? {} }
  } catch {
    return { profiles: {} }
  }
}

async function writeStore(store: Store) {
  const normalized = { profiles: store.profiles ?? {} }
  const path = resolve(STORE_PATH)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')

  if (IS_RENDER && !HAS_DURABLE_STORE) {
    throw new Error('Durable profile storage is not configured. Add DATABASE_URL on Render before saving payout profiles.')
  }

  try {
    await writeDurableJson(STORE_KEY, normalized)
  } catch (error) {
    if (IS_RENDER) {
      throw new Error('Durable profile storage failed. Check DATABASE_URL on Render before saving payout profiles.')
    }
    console.warn('[local-currency-profile] durable save failed; file fallback was saved.', error instanceof Error ? error.message : String(error))
  }
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  try {
    const { claims, email: verifiedEmail } = await verifiedPrivyUser(req)
    const action = String(req.body?.action ?? '').trim()
    if (!action) return res.status(400).json({ ok: false, error: 'Missing action.' })

    const store = await readStore()
    const existing = store.profiles[claims.userId]

    if (action === 'get') {
      return res.json({ ok: true, email: verifiedEmail, profile: existing ?? null })
    }

    if (action === 'save') {
      const firstName = cleanName(req.body?.first_name)
      const lastName = cleanName(req.body?.last_name)
      const requestEmail = String(req.body?.email ?? '').trim().toLowerCase()
      const email = verifiedEmail || requestEmail
      if (!firstName || !lastName) return res.status(400).json({ ok: false, error: 'Enter your first and last name.' })
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, error: 'Sign in with a valid email.' })
      if (verifiedEmail && requestEmail && verifiedEmail !== requestEmail) {
        return res.status(403).json({ ok: false, error: 'Profile email must match the signed-in email.' })
      }

      const profile: LocalCurrencyProfile = {
        privyUserId: claims.userId,
        firstName,
        lastName,
        email,
        updatedAt: new Date().toISOString(),
      }
      store.profiles[claims.userId] = profile
      await writeStore(store)
      return res.json({ ok: true, profile })
    }

    return res.status(400).json({ ok: false, error: `Unknown action: ${action}` })
  } catch (err) {
    const error = err as Error & { status?: number }
    return res.status(error.status ?? 500).json({ ok: false, error: error.message || 'Local currency profile request failed.' })
  }
}
