import { createHmac } from 'node:crypto'
import type { Request, Response } from 'express'
import { PrivyClient } from '@privy-io/server-auth'
import {
  hasRenderDurableStore,
  mutateDurableJson,
  readDurableJson,
} from '../../../api/render-durable-store.js'

const DEFAULT_STORE_KEY = 'hashpaystream:standalone-agreement-owners:v1'
const DEFAULT_EVENT_STORE_KEY = 'hashpaylink:hashpaystream-arc-webhooks:v1'
const AGREEMENT_ID = /^agr_[a-z0-9]{12,64}$/i

type OwnedAgreement = {
  agreementId: string
  ownerHash: string
  createdAt: string
  updatedAt: string
}

type OwnershipStore = {
  schema: 1
  agreements: Record<string, OwnedAgreement>
  idempotency: Record<string, string>
}

type StoredAgreementEvent = {
  id: string
  event: string
  agreementId: string
  createdAt: string
  receivedAt: string
  data: Record<string, unknown>
}

type AgreementEventStore = {
  schema: 1
  events: Record<string, StoredAgreementEvent>
}

type UpstreamResponse = {
  status: number
  body: Record<string, unknown>
}

type Dependencies = {
  hasStore: () => boolean
  read: (key: string) => Promise<OwnershipStore | undefined>
  readEvents: (key: string) => Promise<AgreementEventStore | undefined>
  mutate: (key: string, update: (current: OwnershipStore | undefined) => OwnershipStore) => Promise<OwnershipStore>
  identity: (req: Request) => Promise<string>
  upstream: (input: {
    method: 'GET' | 'POST'
    path: string
    body?: Record<string, unknown>
    idempotencyKey?: string
  }) => Promise<UpstreamResponse>
  env: () => NodeJS.ProcessEnv
  now: () => Date
}

function clean(value: unknown, maximum: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum)
}

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status })
}

function bearer(req: Pick<Request, 'headers'>) {
  return String(req.headers.authorization ?? '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? ''
}

async function verifiedIdentity(req: Request) {
  const appId = clean(process.env.PRIVY_APP_ID ?? process.env.VITE_PRIVY_APP_ID, 180)
  const appSecret = clean(process.env.PRIVY_APP_SECRET, 300)
  const token = bearer(req)
  if (!appId || !appSecret) throw httpError('HashPayStream authentication is unavailable.', 503)
  if (!token) throw httpError('Sign in to manage agreements.', 401)
  try {
    const claims = await new PrivyClient(appId, appSecret).verifyAuthToken(token)
    const userId = clean(claims.userId, 180)
    if (!userId) throw new Error('Privy identity is empty.')
    return userId
  } catch (cause) {
    throw Object.assign(httpError('Your HashPayStream session is invalid or expired.', 401), { cause })
  }
}

function configuration(env: NodeJS.ProcessEnv) {
  const apiKey = clean(env.HASHPAYSTREAM_ARC_API_KEY, 200)
  const ownershipSecret = clean(env.HASHPAYSTREAM_APP_OWNERSHIP_SECRET, 300)
  const storeKey = clean(env.HASHPAYSTREAM_APP_OWNERSHIP_STORE_KEY ?? DEFAULT_STORE_KEY, 160)
  const eventStoreKey = clean(env.HASHPAYSTREAM_ARC_WEBHOOK_STORE_KEY ?? DEFAULT_EVENT_STORE_KEY, 160)
  const rawBaseUrl = clean(env.HASHPAYSTREAM_HASH_PAYLINK_BASE_URL ?? 'https://app.hashpaylink.com', 240)
  let baseUrl: URL
  try {
    baseUrl = new URL(rawBaseUrl)
  } catch {
    throw httpError('HashPayStream upstream URL is invalid.', 503)
  }
  if (!apiKey.startsWith('hpl_test_') || apiKey.length < 32) {
    throw httpError('HashPayStream Arc API key is unavailable.', 503)
  }
  if (ownershipSecret.length < 32) throw httpError('HashPayStream ownership signing is unavailable.', 503)
  if (!storeKey || !eventStoreKey || baseUrl.protocol !== 'https:' || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw httpError('HashPayStream standalone gateway is misconfigured.', 503)
  }
  return { apiKey, ownershipSecret, storeKey, eventStoreKey, baseUrl: baseUrl.origin }
}

async function upstreamRequest(input: {
  method: 'GET' | 'POST'
  path: string
  body?: Record<string, unknown>
  idempotencyKey?: string
}) {
  const config = configuration(process.env)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(`${config.baseUrl}${input.path}`, {
      method: input.method,
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'x-api-key': config.apiKey,
        accept: 'application/json',
        ...(input.idempotencyKey ? { 'idempotency-key': input.idempotencyKey } : {}),
        ...(input.body ? { 'content-type': 'application/json' } : {}),
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
    })
    const body = await response.json().catch(() => ({})) as Record<string, unknown>
    return { status: response.status, body }
  } catch (cause) {
    throw Object.assign(httpError('Hash PayLink Agreements is temporarily unavailable.', 503), { cause })
  } finally {
    clearTimeout(timer)
  }
}

const defaults: Dependencies = {
  hasStore: hasRenderDurableStore,
  read: readDurableJson,
  readEvents: readDurableJson,
  mutate: (key, update) => mutateDurableJson<OwnershipStore>(key, update),
  identity: verifiedIdentity,
  upstream: upstreamRequest,
  env: () => process.env,
  now: () => new Date(),
}

function safeStore(current?: OwnershipStore): OwnershipStore {
  return {
    schema: 1,
    agreements: current?.schema === 1 && current.agreements ? { ...current.agreements } : {},
    idempotency: current?.schema === 1 && current.idempotency ? { ...current.idempotency } : {},
  }
}

function ownerHash(secret: string, userId: string) {
  return createHmac('sha256', secret).update(`hashpaystream.owner\0${userId}`).digest('hex')
}

function scopedIdempotency(owner: string, key: string) {
  return createHmac('sha256', owner).update(`hashpaystream.agreement\0${key}`).digest('hex')
}

function ownedAgreement(store: OwnershipStore | undefined, agreementId: string, owner: string) {
  const record = store?.agreements?.[agreementId]
  if (!record || record.ownerHash !== owner) throw httpError('Agreement not found.', 404)
  return record
}

function upstreamError(response: UpstreamResponse) {
  const message = clean(response.body.error, 300) || 'Hash PayLink rejected the agreement request.'
  return httpError(message, response.status >= 400 && response.status < 600 ? response.status : 502)
}

function publicTimeline(eventStore: AgreementEventStore | undefined, agreementId: string) {
  return Object.values(eventStore?.events ?? {})
    .filter(event => event.agreementId === agreementId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map(event => ({
      id: event.id,
      event: event.event,
      createdAt: event.createdAt,
      receivedAt: event.receivedAt,
      observedBlockNumber: clean(event.data?.observedBlockNumber, 40),
    }))
}

function standaloneAgreementView(value: unknown, eventStore: AgreementEventStore | undefined) {
  const agreement = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const agreementId = clean(agreement.id, 80)
  return {
    ...agreement,
    timeline: Array.isArray(agreement.timeline) ? agreement.timeline : publicTimeline(eventStore, agreementId),
    deliveryTimeline: Array.isArray(agreement.deliveryTimeline) ? agreement.deliveryTimeline : [],
  }
}

export function createHashPayStreamAgreementGateway(overrides: Partial<Dependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }
  return async function hashPayStreamAgreementGateway(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST')
      return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    }
    try {
      if (!dependencies.hasStore()) throw httpError('HashPayStream ownership storage is unavailable.', 503)
      const config = configuration(dependencies.env())
      const userId = await dependencies.identity(req)
      const owner = ownerHash(config.ownershipSecret, userId)
      const store = await dependencies.read(config.storeKey)
      const eventStore = req.method === 'GET' ? await dependencies.readEvents(config.eventStoreKey) : undefined

      if (req.method === 'GET') {
        const requestedId = clean(req.query?.id, 80)
        if (requestedId) {
          if (!AGREEMENT_ID.test(requestedId)) throw httpError('Agreement id is invalid.', 400)
          ownedAgreement(store, requestedId, owner)
          const upstream = await dependencies.upstream({ method: 'GET', path: `/api/v2/agreements?id=${encodeURIComponent(requestedId)}` })
          if (upstream.status !== 200 || upstream.body.ok !== true) throw upstreamError(upstream)
          return res.json({ ...upstream.body, agreement: standaloneAgreementView(upstream.body.agreement, eventStore) })
        }
        const owned = Object.values(store?.agreements ?? {})
          .filter(record => record.ownerHash === owner)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
          .slice(0, 100)
        if (!owned.length) return res.json({ ok: true, agreements: [] })
        const requestedIds = owned.map(record => record.agreementId).join(',')
        const result = await dependencies.upstream({
          method: 'GET',
          path: `/api/v2/agreements?ids=${encodeURIComponent(requestedIds)}`,
        })
        if (result.status !== 200 || result.body.ok !== true || !Array.isArray(result.body.agreements)) {
          throw upstreamError(result)
        }
        const agreements = result.body.agreements.map(agreement => standaloneAgreementView(agreement, eventStore))
        return res.json({ ok: true, agreements })
      }

      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? req.body as Record<string, unknown>
        : {}
      const action = clean(body.action, 40)
      if (action) {
        if (!['rotate_payer_link', 'request_release'].includes(action)) {
          throw httpError('Agreement action is not supported.', 400)
        }
        const agreementId = clean(body.agreementId, 80)
        if (!AGREEMENT_ID.test(agreementId)) throw httpError('Agreement id is invalid.', 400)
        ownedAgreement(store, agreementId, owner)
        const upstream = await dependencies.upstream({
          method: 'POST',
          path: '/api/v2/agreements',
          body: {
            action,
            agreementId,
            ...(action === 'request_release' ? {
              deliveryNote: body.deliveryNote,
              evidenceReference: body.evidenceReference,
            } : {}),
          },
        })
        if (upstream.status < 200 || upstream.status >= 300 || upstream.body.ok !== true) throw upstreamError(upstream)
        return res.status(upstream.status).json(upstream.body)
      }

      const idempotencyKey = clean(req.headers['idempotency-key'], 160)
      if (idempotencyKey.length < 8) throw httpError('Idempotency-Key must contain at least 8 characters.', 400)
      const scopedKey = scopedIdempotency(owner, idempotencyKey)
      const existingId = store?.idempotency?.[scopedKey]
      if (existingId) {
        ownedAgreement(store, existingId, owner)
        const existing = await dependencies.upstream({ method: 'GET', path: `/api/v2/agreements?id=${encodeURIComponent(existingId)}` })
        if (existing.status !== 200 || existing.body.ok !== true) throw upstreamError(existing)
        return res.json({ ...existing.body, replayed: true })
      }
      const upstreamIdempotencyKey = `hps:${scopedKey.slice(0, 48)}`
      const upstream = await dependencies.upstream({
        method: 'POST',
        path: '/api/v2/agreements',
        idempotencyKey: upstreamIdempotencyKey,
        body: {
          ...body,
          externalId: `hps-${scopedKey.slice(0, 24)}`,
          resourceId: `agreement:${scopedKey.slice(0, 24)}`,
        },
      })
      if (upstream.status < 200 || upstream.status >= 300 || upstream.body.ok !== true) throw upstreamError(upstream)
      const agreement = upstream.body.agreement && typeof upstream.body.agreement === 'object'
        ? upstream.body.agreement as Record<string, unknown>
        : {}
      const agreementId = clean(agreement.id, 80)
      if (!AGREEMENT_ID.test(agreementId)) throw httpError('Hash PayLink returned an invalid agreement.', 502)
      const timestamp = dependencies.now().toISOString()
      await dependencies.mutate(config.storeKey, current => {
        const next = safeStore(current)
        const existing = next.agreements[agreementId]
        if (existing && existing.ownerHash !== owner) throw httpError('Agreement ownership conflict.', 409)
        next.agreements[agreementId] = {
          agreementId,
          ownerHash: owner,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        }
        next.idempotency[scopedKey] = agreementId
        return next
      })
      return res.status(upstream.status).json(upstream.body)
    } catch (error) {
      const status = Number((error as Error & { status?: number })?.status) || 500
      if (status >= 500) console.error('[hashpaystream-agreement-gateway] request failed:', error instanceof Error ? error.message : String(error))
      return res.status(status).json({
        ok: false,
        error: status >= 500 ? 'HashPayStream Agreements is temporarily unavailable.' : (error as Error).message,
      })
    }
  }
}

export default createHashPayStreamAgreementGateway()
