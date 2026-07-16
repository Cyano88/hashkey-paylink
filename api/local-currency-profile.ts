import type { Request, Response } from 'express'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, resolve } from 'path'
import { PrivyClient, type User } from '@privy-io/server-auth'
import { hasRenderDurableStore, mutateDurableJson, readDurableJson } from './render-durable-store.js'

const STORE_PATH = process.env.LOCAL_CURRENCY_PROFILE_STORE ?? './data/local-currency-profiles.json'
const STORE_KEY = (process.env.LOCAL_CURRENCY_PROFILE_STORE_KEY ?? 'hashpaylink:local-currency-profiles').trim()
const IS_RENDER = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL)
const HAS_DURABLE_STORE = hasRenderDurableStore()

export type LocalCurrencyProfile = {
  privyUserId: string
  firstName: string
  lastName: string
  email: string
  updatedAt: string
}

type Store = {
  profiles: Record<string, LocalCurrencyProfile>
}

export type VerifiedProfileUser = {
  userId: string
  email: string
}

export type ProfileDraft = Omit<LocalCurrencyProfile, 'updatedAt'>

export type ProfileSaveResult = {
  profile: LocalCurrencyProfile
  unchanged: boolean
}

export type ProfileRepository = {
  get(userId: string): Promise<LocalCurrencyProfile | undefined>
  save(draft: ProfileDraft, expectedUpdatedAt?: string): Promise<ProfileSaveResult>
}

export type HandlerDependencies = {
  verifyUser(req: Request): Promise<VerifiedProfileUser>
  repository: ProfileRepository
}

type RepositoryOptions = {
  storePath?: string
  storeKey?: string
  isRender?: boolean
  durable?: boolean
  now?: () => string
  readDurable?: typeof readDurableJson
  mutateDurable?: typeof mutateDurableJson
}

export class ProfileVersionConflictError extends Error {
  status = 409

  constructor() {
    super('Payout profile changed since it was loaded. Refresh and try again.')
  }
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

export async function verifiedPrivyUser(req: Request) {
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
  return { userId: claims.userId, email: linkedEmail(user) }
}

function normalizedStore(value: Partial<Store> | undefined): Store {
  return { profiles: value?.profiles ?? {} }
}

function applyProfileSave(store: Store, draft: ProfileDraft, expectedUpdatedAt: string | undefined, now: () => string): ProfileSaveResult {
  const existing = store.profiles[draft.privyUserId]
  if (expectedUpdatedAt && existing?.updatedAt !== expectedUpdatedAt) throw new ProfileVersionConflictError()
  if (
    existing
    && existing.firstName === draft.firstName
    && existing.lastName === draft.lastName
    && existing.email === draft.email
  ) {
    return { profile: existing, unchanged: true }
  }
  const profile = { ...draft, updatedAt: now() }
  store.profiles[draft.privyUserId] = profile
  return { profile, unchanged: false }
}

export function createLocalCurrencyProfileRepository(options: RepositoryOptions = {}): ProfileRepository {
  const storePath = resolve(options.storePath ?? STORE_PATH)
  const storeKey = options.storeKey ?? STORE_KEY
  const isRender = options.isRender ?? IS_RENDER
  const durable = options.durable ?? HAS_DURABLE_STORE
  const now = options.now ?? (() => new Date().toISOString())
  const readRemote = options.readDurable ?? readDurableJson
  const mutateRemote = options.mutateDurable ?? mutateDurableJson
  let localMutationQueue: Promise<void> = Promise.resolve()

  async function readLocalStore() {
    try {
      const raw = await readFile(storePath, 'utf8')
      return normalizedStore(JSON.parse(raw) as Partial<Store>)
    } catch {
      return normalizedStore(undefined)
    }
  }

  async function writeLocalStore(store: Store) {
    await mkdir(dirname(storePath), { recursive: true })
    await writeFile(storePath, `${JSON.stringify(normalizedStore(store), null, 2)}\n`, 'utf8')
  }

  async function readStore() {
    if (durable) return normalizedStore(await readRemote<Partial<Store>>(storeKey))
    return readLocalStore()
  }

  return {
    async get(userId) {
      return (await readStore()).profiles[userId]
    },
    async save(draft, expectedUpdatedAt) {
      if (durable) {
        let result: ProfileSaveResult | undefined
        try {
          await mutateRemote<Store>(storeKey, current => {
            const store = normalizedStore(current)
            result = applyProfileSave(store, draft, expectedUpdatedAt, now)
            return store
          })
        } catch (error) {
          if (error instanceof ProfileVersionConflictError) throw error
          if (isRender) {
            throw new Error('Durable profile storage failed. Check DATABASE_URL on Render before saving payout profiles.')
          }
          throw error
        }
        if (!result) throw new Error('Durable profile storage did not return a save result.')
        return result
      }
      if (isRender) {
        throw new Error('Durable profile storage is not configured. Add DATABASE_URL on Render before saving payout profiles.')
      }

      let result: ProfileSaveResult | undefined
      const mutation = localMutationQueue.then(async () => {
        const store = await readLocalStore()
        result = applyProfileSave(store, draft, expectedUpdatedAt, now)
        if (!result.unchanged) await writeLocalStore(store)
      })
      localMutationQueue = mutation.catch(() => undefined)
      await mutation
      if (!result) throw new Error('Local profile storage did not return a save result.')
      return result
    },
  }
}

export function createLocalCurrencyProfileHandler(dependencies: HandlerDependencies) {
  return async function handler(req: Request, res: Response) {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' })
    }

    try {
      const { userId, email: verifiedEmail } = await dependencies.verifyUser(req)
      const action = String(req.body?.action ?? '').trim()
      if (!action) return res.status(400).json({ ok: false, error: 'Missing action.' })

      if (action === 'get') {
        const existing = await dependencies.repository.get(userId)
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

        const expectedUpdatedAt = String(req.body?.expected_updated_at ?? '').trim() || undefined
        if (expectedUpdatedAt && !Number.isFinite(Date.parse(expectedUpdatedAt))) {
          return res.status(400).json({ ok: false, error: 'Profile version must be a valid timestamp.' })
        }
        const saved = await dependencies.repository.save({
          privyUserId: userId,
          firstName,
          lastName,
          email,
        }, expectedUpdatedAt)
        return res.json({ ok: true, profile: saved.profile, unchanged: saved.unchanged })
      }

      return res.status(400).json({ ok: false, error: `Unknown action: ${action}` })
    } catch (err) {
      const error = err as Error & { status?: number }
      return res.status(error.status ?? 500).json({ ok: false, error: error.message || 'Local currency profile request failed.' })
    }
  }
}

export const localCurrencyProfileRepository = createLocalCurrencyProfileRepository()
export default createLocalCurrencyProfileHandler({ verifyUser: verifiedPrivyUser, repository: localCurrencyProfileRepository })
