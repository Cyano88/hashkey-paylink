import type { Request, Response } from 'express'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, resolve } from 'path'
import { randomInt } from 'crypto'
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
  resolvedName: string
  nameStatus: 'unverified' | 'bank_resolved'
  email: string
  pocketNumber: string
  pocketId: string
  avatarId: number
  displayCurrency: 'USDC' | 'NGN' | 'GHS' | 'KES'
  updatedAt: string
}

type Store = {
  profiles: Record<string, LocalCurrencyProfile>
  pocketIds: Record<string, string>
}

export type VerifiedProfileUser = {
  userId: string
  email: string
}

export type ProfileSaveResult = {
  profile: LocalCurrencyProfile
  unchanged: boolean
}

export type ProfileRepository = {
  get(userId: string): Promise<LocalCurrencyProfile | undefined>
  getByPocketId(pocketId: string): Promise<LocalCurrencyProfile | undefined>
  ensure(identity: VerifiedProfileUser): Promise<ProfileSaveResult>
  updateProfile(userId: string, pocketId: string, avatarId: number, expectedUpdatedAt?: string, displayCurrency?: LocalCurrencyProfile['displayCurrency']): Promise<ProfileSaveResult>
  bindBankResolvedName(identity: VerifiedProfileUser, resolvedName: string): Promise<ProfileSaveResult>
  deleteProfile(userId: string): Promise<boolean>
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
  generatePocketNumber?: () => string
}

export class ProfileVersionConflictError extends Error {
  status = 409

  constructor() {
    super('Payout profile changed since it was loaded. Refresh and try again.')
  }
}

export class PocketIdUnavailableError extends Error {
  status = 409

  constructor() {
    super('That Pocket ID is unavailable. Choose another one.')
  }
}

export class ProfileNameConflictError extends Error {
  status = 409

  constructor() {
    super('This bank account resolves to a different name. Contact support before changing your payout identity.')
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

function cleanResolvedName(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 160)
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

function normalizedPocketId(value: unknown) {
  const pocketId = String(value ?? '').trim()
  return /^\d{6,12}$/.test(pocketId) ? pocketId : ''
}

function requiredIdentity(identity: VerifiedProfileUser) {
  const userId = String(identity.userId ?? '').trim()
  const email = String(identity.email ?? '').trim().toLowerCase()
  if (!userId) throw Object.assign(new Error('Pocket identity is unavailable. Sign in again.'), { status: 401 })
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error('Pocket requires a verified email address.'), { status: 403 })
  }
  return { userId, email }
}

function normalizedName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function normalizedDisplayCurrency(value: unknown): LocalCurrencyProfile['displayCurrency'] {
  return value === 'NGN' || value === 'GHS' || value === 'KES' ? value : 'USDC'
}

function nameParts(resolvedName: string) {
  const parts = resolvedName.split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  }
}

function normalizedStore(value: Partial<Store> | undefined): Store {
  const profiles = value?.profiles ?? {}
  const pocketIds = { ...(value?.pocketIds ?? {}) }
  for (const [userId, profile] of Object.entries(profiles)) {
    const currentId = normalizedPocketId(profile.pocketId)
    const permanentNumber = normalizedPocketId(profile.pocketNumber)
    if (currentId) pocketIds[currentId] = userId
    if (permanentNumber) pocketIds[permanentNumber] = userId
  }
  return { profiles, pocketIds }
}

export function createLocalCurrencyProfileRepository(options: RepositoryOptions = {}): ProfileRepository {
  const storePath = resolve(options.storePath ?? STORE_PATH)
  const storeKey = options.storeKey ?? STORE_KEY
  const isRender = options.isRender ?? IS_RENDER
  const durable = options.durable ?? HAS_DURABLE_STORE
  const now = options.now ?? (() => new Date().toISOString())
  const readRemote = options.readDurable ?? readDurableJson
  const mutateRemote = options.mutateDurable ?? mutateDurableJson
  const generatePocketNumber = options.generatePocketNumber ?? (() => String(randomInt(10_000_000, 100_000_000)))
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

  function allocatePocketNumber(store: Store) {
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const candidate = normalizedPocketId(generatePocketNumber())
      if (candidate && !store.pocketIds[candidate]) return candidate
    }
    throw new Error('Pocket could not allocate a unique ID. Try again.')
  }

  function normalizeExistingProfile(profile: LocalCurrencyProfile, userId: string, email: string, store: Store) {
    let changed = false
    let pocketNumber = normalizedPocketId(profile.pocketNumber)
    if (!pocketNumber) {
      pocketNumber = allocatePocketNumber(store)
      changed = true
    }
    let pocketId = normalizedPocketId(profile.pocketId)
    if (!pocketId) {
      pocketId = pocketNumber
      changed = true
    }
    const resolvedName = cleanResolvedName(profile.resolvedName)
    const nameStatus = profile.nameStatus === 'bank_resolved' && resolvedName ? 'bank_resolved' : 'unverified'
    if (profile.resolvedName !== resolvedName || profile.nameStatus !== nameStatus) changed = true
    const immutableEmail = profile.email || email.toLowerCase()
    if (profile.email !== immutableEmail) changed = true
    const avatarId = Number.isInteger(profile.avatarId) && profile.avatarId >= 1 && profile.avatarId <= 4 ? profile.avatarId : 1
    if (profile.avatarId !== avatarId) changed = true
    const displayCurrency = normalizedDisplayCurrency(profile.displayCurrency)
    if (profile.displayCurrency !== displayCurrency) changed = true
    const normalized: LocalCurrencyProfile = {
      ...profile,
      privyUserId: userId,
      email: immutableEmail,
      resolvedName,
      nameStatus,
      pocketNumber,
      pocketId,
      avatarId,
      displayCurrency,
      updatedAt: changed ? now() : profile.updatedAt,
    }
    store.pocketIds[pocketNumber] = userId
    store.pocketIds[pocketId] = userId
    return { profile: normalized, changed }
  }

  async function mutateStore<T>(mutation: (store: Store) => T) {
    if (durable) {
      let result: T | undefined
      try {
        await mutateRemote<Store>(storeKey, current => {
          const store = normalizedStore(current)
          result = mutation(store)
          return store
        })
      } catch (error) {
        if (error instanceof ProfileVersionConflictError || error instanceof PocketIdUnavailableError || error instanceof ProfileNameConflictError) throw error
        if (isRender) throw new Error('Durable profile storage failed. Check DATABASE_URL on Render before saving payout profiles.')
        throw error
      }
      if (result === undefined) throw new Error('Durable profile storage did not return a result.')
      return result
    }
    if (isRender) throw new Error('Durable profile storage is not configured. Add DATABASE_URL on Render before saving payout profiles.')
    let result: T | undefined
    const queued = localMutationQueue.then(async () => {
      const store = await readLocalStore()
      result = mutation(store)
      await writeLocalStore(store)
    })
    localMutationQueue = queued.catch(() => undefined)
    await queued
    return result as T
  }

  return {
    async get(userId) {
      return (await readStore()).profiles[userId]
    },
    async getByPocketId(pocketId) {
      const store = await readStore()
      const userId = store.pocketIds[normalizedPocketId(pocketId)]
      return userId ? store.profiles[userId] : undefined
    },
    async ensure(identity) {
      const verified = requiredIdentity(identity)
      return mutateStore(store => {
        const existing = store.profiles[verified.userId]
        if (existing) {
          const normalized = normalizeExistingProfile(existing, verified.userId, verified.email, store)
          store.profiles[verified.userId] = normalized.profile
          return { profile: normalized.profile, unchanged: !normalized.changed }
        }
        const pocketNumber = allocatePocketNumber(store)
        const profile: LocalCurrencyProfile = {
          privyUserId: verified.userId,
          firstName: '',
          lastName: '',
          resolvedName: '',
          nameStatus: 'unverified',
          email: verified.email,
          pocketNumber,
          pocketId: pocketNumber,
          avatarId: 1,
          displayCurrency: 'USDC',
          updatedAt: now(),
        }
        store.profiles[verified.userId] = profile
        store.pocketIds[pocketNumber] = verified.userId
        return { profile, unchanged: false }
      })
    },
    async updateProfile(userId, pocketId, avatarId, expectedUpdatedAt, requestedDisplayCurrency) {
      const cleanPocketId = normalizedPocketId(pocketId)
      if (!cleanPocketId) throw Object.assign(new Error('Pocket ID must contain 6 to 12 digits.'), { status: 400 })
      if (!Number.isInteger(avatarId) || avatarId < 1 || avatarId > 4) throw Object.assign(new Error('Choose a valid Pocket avatar.'), { status: 400 })
      const requestedCurrency = requestedDisplayCurrency === undefined ? undefined : normalizedDisplayCurrency(requestedDisplayCurrency)
      return mutateStore(store => {
        const existing = store.profiles[userId]
        if (!existing) throw Object.assign(new Error('Pocket profile was not found.'), { status: 404 })
        const displayCurrency = requestedCurrency ?? normalizedDisplayCurrency(existing.displayCurrency)
        if (expectedUpdatedAt && existing.updatedAt !== expectedUpdatedAt) throw new ProfileVersionConflictError()
        const owner = store.pocketIds[cleanPocketId]
        if (owner && owner !== userId) throw new PocketIdUnavailableError()
        if (existing.pocketId === cleanPocketId && existing.avatarId === avatarId && existing.displayCurrency === displayCurrency) return { profile: existing, unchanged: true }
        store.pocketIds[existing.pocketId] = userId
        store.pocketIds[cleanPocketId] = userId
        const profile = { ...existing, pocketId: cleanPocketId, avatarId, displayCurrency, updatedAt: now() }
        store.profiles[userId] = profile
        return { profile, unchanged: false }
      })
    },
    async bindBankResolvedName(identity, value) {
      const verified = requiredIdentity(identity)
      const resolvedName = cleanResolvedName(value)
      if (!resolvedName) throw Object.assign(new Error('Bank provider did not return an account name.'), { status: 502 })
      return mutateStore(store => {
        let existing = store.profiles[verified.userId]
        if (!existing) {
          const pocketNumber = allocatePocketNumber(store)
          existing = {
            privyUserId: verified.userId,
            firstName: '', lastName: '', resolvedName: '', nameStatus: 'unverified',
            email: verified.email, pocketNumber, pocketId: pocketNumber, avatarId: 1, displayCurrency: 'USDC', updatedAt: now(),
          }
          store.pocketIds[pocketNumber] = verified.userId
        }
        if (existing.nameStatus === 'bank_resolved') {
          if (normalizedName(existing.resolvedName) !== normalizedName(resolvedName)) throw new ProfileNameConflictError()
          store.profiles[verified.userId] = existing
          return { profile: existing, unchanged: true }
        }
        const parts = nameParts(resolvedName)
        const profile: LocalCurrencyProfile = {
          ...existing,
          firstName: parts.firstName,
          lastName: parts.lastName,
          resolvedName,
          nameStatus: 'bank_resolved',
          updatedAt: now(),
        }
        store.profiles[verified.userId] = profile
        return { profile, unchanged: false }
      })
    },
    async deleteProfile(userId) {
      return mutateStore(store => {
        const existed = Boolean(store.profiles[userId])
        delete store.profiles[userId]
        for (const [pocketId, ownerId] of Object.entries(store.pocketIds)) {
          if (ownerId === userId) delete store.pocketIds[pocketId]
        }
        return existed
      })
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
        const existing = await dependencies.repository.ensure({ userId, email: verifiedEmail })
        return res.json({ ok: true, email: existing.profile.email, profile: existing.profile })
      }

      if (action === 'save') {
        const pocketId = normalizedPocketId(req.body?.pocket_id)
        if (!pocketId) return res.status(400).json({ ok: false, error: 'Pocket ID must contain 6 to 12 digits.' })
        const expectedUpdatedAt = String(req.body?.expected_updated_at ?? '').trim() || undefined
        if (expectedUpdatedAt && !Number.isFinite(Date.parse(expectedUpdatedAt))) {
          return res.status(400).json({ ok: false, error: 'Profile version must be a valid timestamp.' })
        }
        const current = await dependencies.repository.ensure({ userId, email: verifiedEmail })
        const avatarId = Number(req.body?.avatar_id ?? current.profile.avatarId)
        const saved = await dependencies.repository.updateProfile(userId, pocketId, avatarId, expectedUpdatedAt, req.body?.display_currency === undefined ? current.profile.displayCurrency : normalizedDisplayCurrency(req.body.display_currency))
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
