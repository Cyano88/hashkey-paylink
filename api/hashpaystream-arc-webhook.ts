import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'
import {
  hasRenderDurableStore,
  mutateDurableJson,
} from './render-durable-store.js'

const DEFAULT_STORE_KEY = 'hashpaylink:hashpaystream-arc-webhooks:v1'
const SIGNATURE_TOLERANCE_SECONDS = 300
const PROJECT_ID = /^dev_[a-z0-9]{8,64}$/i
const EVENT_ID = /^evt_[a-z0-9]{12,64}$/i
const AGREEMENT_ID = /^agr_[a-z0-9]{12,64}$/i
const WEBHOOK_SECRET = /^whsec_[A-Za-z0-9_-]{24,100}$/
const SIGNATURE = /^[0-9a-f]{64}$/i
const ALLOWED_EVENTS = new Set([
  'agreement.activated',
  'agreement.step_released',
  'agreement.expired',
  'agreement.completed',
  'agreement.cancelled',
  'agreement.refunded',
])

type StoredHashPayStreamArcEvent = {
  id: string
  event: string
  projectId: string
  agreementId: string
  createdAt: string
  receivedAt: string
  lastReceivedAt: string
  payloadHash: string
  duplicateCount: number
  data: Record<string, unknown>
}

type HashPayStreamArcWebhookStore = {
  schema: 1
  events: Record<string, StoredHashPayStreamArcEvent>
}

type Dependencies = {
  hasStore: () => boolean
  mutate: (
    key: string,
    update: (current: HashPayStreamArcWebhookStore | undefined) => HashPayStreamArcWebhookStore,
  ) => Promise<HashPayStreamArcWebhookStore>
  env: () => NodeJS.ProcessEnv
  now: () => Date
}

const defaults: Dependencies = {
  hasStore: hasRenderDurableStore,
  mutate: (key, update) => mutateDurableJson<HashPayStreamArcWebhookStore>(key, update),
  env: () => process.env,
  now: () => new Date(),
}

class WebhookError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message)
  }
}

function firstHeader(req: Pick<Request, 'headers'>, name: string) {
  const value = req.headers[name.toLowerCase()]
  return Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '')
}

function safeEqualHex(left: string, right: string) {
  if (!SIGNATURE.test(left) || !SIGNATURE.test(right)) return false
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
}

function configuration(env: NodeJS.ProcessEnv) {
  const projectId = String(env.HASHPAYSTREAM_ARC_PROJECT_ID ?? '').trim()
  const signingSecret = String(env.HASHPAYSTREAM_ARC_WEBHOOK_SECRET ?? '').trim()
  const storeKey = String(env.HASHPAYSTREAM_ARC_WEBHOOK_STORE_KEY ?? DEFAULT_STORE_KEY).trim()
  if (!PROJECT_ID.test(projectId)) {
    throw new WebhookError('Hash PayStream Arc webhook project is unavailable.', 503, 'WEBHOOK_NOT_CONFIGURED')
  }
  if (!WEBHOOK_SECRET.test(signingSecret)) {
    throw new WebhookError('Hash PayStream Arc webhook signing is unavailable.', 503, 'WEBHOOK_NOT_CONFIGURED')
  }
  if (!storeKey || storeKey.length > 160) {
    throw new WebhookError('Hash PayStream Arc webhook storage is unavailable.', 503, 'WEBHOOK_NOT_CONFIGURED')
  }
  return { projectId, signingSecret, storeKey }
}

function verifiedPayload(
  req: Pick<Request, 'headers' | 'body'>,
  config: ReturnType<typeof configuration>,
  now: Date,
) {
  if (!Buffer.isBuffer(req.body)) {
    throw new WebhookError('Webhook body must be raw JSON.', 400, 'INVALID_BODY')
  }
  const rawBody = req.body.toString('utf8')
  if (!rawBody || rawBody.length > 65_536) {
    throw new WebhookError('Webhook body is invalid.', 400, 'INVALID_BODY')
  }
  const eventHeader = firstHeader(req, 'x-hashpaylink-event').trim()
  const signatureHeader = firstHeader(req, 'x-hashpaylink-signature').trim()
  const timestamp = signatureHeader.match(/(?:^|,)\s*t=(\d{10})(?:,|$)/)?.[1] ?? ''
  const signature = signatureHeader.match(/(?:^|,)\s*v1=([0-9a-f]{64})(?:,|$)/i)?.[1] ?? ''
  if (!EVENT_ID.test(eventHeader) || !timestamp || !signature) {
    throw new WebhookError('Webhook signature headers are invalid.', 401, 'INVALID_SIGNATURE')
  }
  const timestampSeconds = Number(timestamp)
  const nowSeconds = Math.floor(now.getTime() / 1000)
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > SIGNATURE_TOLERANCE_SECONDS) {
    throw new WebhookError('Webhook signature timestamp is outside the accepted window.', 401, 'STALE_SIGNATURE')
  }
  const expected = createHmac('sha256', config.signingSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')
  if (!safeEqualHex(signature, expected)) {
    throw new WebhookError('Webhook signature is invalid.', 401, 'INVALID_SIGNATURE')
  }

  let parsedPayload: unknown
  try {
    parsedPayload = JSON.parse(rawBody)
  } catch {
    throw new WebhookError('Webhook payload is not valid JSON.', 400, 'INVALID_PAYLOAD')
  }
  if (!parsedPayload || typeof parsedPayload !== 'object' || Array.isArray(parsedPayload)) {
    throw new WebhookError('Webhook payload is invalid.', 400, 'INVALID_PAYLOAD')
  }
  const payload = parsedPayload as Record<string, unknown>
  const data = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data as Record<string, unknown>
    : undefined
  const id = String(payload.id ?? '').trim()
  const event = String(payload.event ?? '').trim()
  const createdAt = String(payload.createdAt ?? '').trim()
  const projectId = String(data?.partnerId ?? '').trim()
  const agreementId = String(data?.agreementId ?? '').trim()
  if (id !== eventHeader || !EVENT_ID.test(id)) {
    throw new WebhookError('Webhook event identity does not match its header.', 400, 'INVALID_PAYLOAD')
  }
  if (!ALLOWED_EVENTS.has(event)) {
    throw new WebhookError('Webhook event is not supported.', 400, 'UNSUPPORTED_EVENT')
  }
  if (!Number.isFinite(Date.parse(createdAt)) || !data || !AGREEMENT_ID.test(agreementId)) {
    throw new WebhookError('Webhook agreement payload is invalid.', 400, 'INVALID_PAYLOAD')
  }
  if (projectId !== config.projectId) {
    throw new WebhookError('Webhook project does not match this receiver.', 403, 'PROJECT_MISMATCH')
  }
  if (data.network !== 'arc' || data.chainId !== 5_042_002) {
    throw new WebhookError('Webhook is not an Arc Testnet agreement event.', 400, 'NETWORK_MISMATCH')
  }
  return {
    id,
    event,
    createdAt,
    projectId,
    agreementId,
    data,
    payloadHash: createHash('sha256').update(rawBody).digest('hex'),
  }
}

export function createHashPayStreamArcWebhookHandler(dependencies: Dependencies = defaults) {
  return async function hashPayStreamArcWebhookHandler(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED' } })
    }
    try {
      if (!dependencies.hasStore()) {
        throw new WebhookError('Hash PayStream Arc webhook storage is unavailable.', 503, 'STORE_UNAVAILABLE')
      }
      const config = configuration(dependencies.env())
      const now = dependencies.now()
      if (!Number.isFinite(now.getTime())) {
        throw new WebhookError('Webhook receiver time is unavailable.', 503, 'CLOCK_UNAVAILABLE')
      }
      const verified = verifiedPayload(req, config, now)
      let replayed = false
      await dependencies.mutate(config.storeKey, current => {
        const store = current?.schema === 1 && current.events
          ? current
          : { schema: 1 as const, events: {} }
        const existing = store.events[verified.id]
        if (existing) {
          if (existing.payloadHash !== verified.payloadHash) {
            throw new WebhookError('Webhook event id conflicts with a different payload.', 409, 'EVENT_CONFLICT')
          }
          replayed = true
          return {
            ...store,
            events: {
              ...store.events,
              [verified.id]: {
                ...existing,
                duplicateCount: existing.duplicateCount + 1,
                lastReceivedAt: now.toISOString(),
              },
            },
          }
        }
        const stored: StoredHashPayStreamArcEvent = {
          ...verified,
          receivedAt: now.toISOString(),
          lastReceivedAt: now.toISOString(),
          duplicateCount: 0,
        }
        return { ...store, events: { ...store.events, [verified.id]: stored } }
      })
      return res.status(200).json({ ok: true, eventId: verified.id, replayed })
    } catch (error) {
      const status = error instanceof WebhookError ? error.status : 503
      const code = error instanceof WebhookError ? error.code : 'WEBHOOK_UNAVAILABLE'
      if (status >= 500) {
        console.error('[hashpaystream-arc-webhook] request failed:', error instanceof Error ? error.message : String(error))
      }
      return res.status(status).json({ ok: false, error: { code } })
    }
  }
}

export default createHashPayStreamArcWebhookHandler()
