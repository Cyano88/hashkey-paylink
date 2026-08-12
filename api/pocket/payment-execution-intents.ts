import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { hasRenderDurableStore, mutateDurableJson, readDurableJson } from '../render-durable-store.js'

export type PaymentExecutionKind = 'bank_payout' | 'bill_payment' | 'pos_settlement' | 'hosted_checkout' | 'wallet_transfer' | 'service_funding'
export type PaymentExecutionState = 'prepared' | 'authorized' | 'submitted' | 'processing' | 'completed' | 'failed' | 'expired' | 'needs_review'
export type PaymentExecutionIntent = {
  id: string; ownerId: string; idempotencyKey: string; requestHash: string
  kind: PaymentExecutionKind; state: PaymentExecutionState; asset: 'USDC'; amount: string
  sourceNetwork: string; settlementNetwork: string; destinationType: string
  resourceId?: string; providerReference?: string; transactionHash?: string; failureCode?: string
  metadata: Record<string, string>; createdAt: number; updatedAt: number
}
type Store = { intents: Record<string, PaymentExecutionIntent>; idempotency: Record<string, string> }
type CreateInput = Pick<PaymentExecutionIntent, 'ownerId' | 'idempotencyKey' | 'kind' | 'amount' | 'sourceNetwork' | 'settlementNetwork' | 'destinationType'> & { metadata?: Record<string, string> }
type UpdateInput = { ownerId: string; intentId: string; state?: PaymentExecutionState; resourceId?: string; providerReference?: string; transactionHash?: string; failureCode?: string; metadata?: Record<string, string> }
type Options = { storePath?: string; storeKey?: string; durable?: boolean; isRender?: boolean; now?: () => number; createId?: () => string; mutateDurable?: typeof mutateDurableJson; readDurable?: typeof readDurableJson }

const STORE_PATH = process.env.POCKET_PAYMENT_EXECUTION_STORE ?? './data/pocket-payment-executions.json'
const STORE_KEY = (process.env.POCKET_PAYMENT_EXECUTION_STORE_KEY ?? 'hashpaylink:pocket-payment-executions').trim()
const IS_RENDER = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL)
export class PaymentExecutionConflictError extends Error { status = 409 }
export class PaymentExecutionNotFoundError extends Error { status = 404 }

function clean(value: unknown, max: number) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max) }
function amount(value: unknown) {
  const normalized = clean(value, 40)
  if (!/^\d+(?:\.\d{1,6})?$/.test(normalized) || Number(normalized) <= 0) throw Object.assign(new Error('Payment amount is invalid.'), { status: 400 })
  return normalized
}
function safeMetadata(value?: Record<string, string>) {
  return Object.fromEntries(Object.entries(value ?? {}).map(([key, item]) => [clean(key, 60), clean(item, 240)]).filter(([key]) => key))
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}
function scope(ownerId: string, kind: string, idempotencyKey: string) { return createHash('sha256').update(`${ownerId}\0${kind}\0${idempotencyKey}`).digest('hex') }
function requestHash(input: CreateInput) {
  return createHash('sha256').update(canonical({ amount: amount(input.amount), destinationType: clean(input.destinationType, 60), kind: input.kind, metadata: safeMetadata(input.metadata), settlementNetwork: clean(input.settlementNetwork, 30).toLowerCase(), sourceNetwork: clean(input.sourceNetwork, 30).toLowerCase() })).digest('hex')
}
const transitions: Record<PaymentExecutionState, PaymentExecutionState[]> = {
  prepared: ['authorized', 'failed', 'expired', 'needs_review'], authorized: ['submitted', 'failed', 'expired', 'needs_review'],
  submitted: ['processing', 'completed', 'failed', 'needs_review'], processing: ['completed', 'failed', 'needs_review'],
  completed: [], failed: [], expired: [], needs_review: ['submitted', 'processing', 'completed', 'failed'],
}
function normalizedStore(value?: Partial<Store>): Store { return { intents: value?.intents ?? {}, idempotency: value?.idempotency ?? {} } }

export function createPaymentExecutionRepository(options: Options = {}) {
  const storePath = resolve(options.storePath ?? STORE_PATH), storeKey = options.storeKey ?? STORE_KEY
  const durable = options.durable ?? hasRenderDurableStore(), isRender = options.isRender ?? IS_RENDER
  const now = options.now ?? Date.now, createId = options.createId ?? (() => `pex_${randomUUID()}`)
  const mutateRemote = options.mutateDurable ?? mutateDurableJson, readRemote = options.readDurable ?? readDurableJson
  let queue = Promise.resolve()
  async function readLocal() { try { return normalizedStore(JSON.parse(await readFile(storePath, 'utf8')) as Store) } catch { return normalizedStore() } }
  async function writeLocal(store: Store) { await mkdir(dirname(storePath), { recursive: true }); await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8') }
  async function readStore() { if (durable) return normalizedStore(await readRemote<Store>(storeKey)); if (isRender) throw new Error('Durable payment execution storage is not configured.'); return readLocal() }
  async function mutate<T>(fn: (store: Store) => T) {
    if (durable) {
      let result: T | undefined
      try { await mutateRemote<Store>(storeKey, current => { const store = normalizedStore(current); result = fn(store); return store }) }
      catch (error) { if (error instanceof PaymentExecutionConflictError || error instanceof PaymentExecutionNotFoundError) throw error; throw new Error('Durable payment execution storage failed.') }
      if (result === undefined) throw new Error('Payment execution mutation returned no result.')
      return result
    }
    if (isRender) throw new Error('Durable payment execution storage is not configured.')
    let result: T | undefined
    const run = queue.then(async () => { const store = await readLocal(); result = fn(store); await writeLocal(store) })
    queue = run.catch(() => undefined); await run; return result as T
  }
  return {
    async create(input: CreateInput) {
      const ownerId = clean(input.ownerId, 180), idempotencyKey = clean(input.idempotencyKey, 160)
      if (!ownerId || !idempotencyKey) throw Object.assign(new Error('Payment execution identity and idempotency key are required.'), { status: 400 })
      const hash = requestHash(input)
      return mutate(store => {
        const key = scope(ownerId, input.kind, idempotencyKey), existing = store.intents[store.idempotency[key]]
        if (existing) { if (existing.requestHash !== hash) throw new PaymentExecutionConflictError('Idempotency key is already bound to another payment request.'); return { intent: existing, replayed: true } }
        const timestamp = now()
        const intent: PaymentExecutionIntent = { id: createId(), ownerId, idempotencyKey, requestHash: hash, kind: input.kind, state: 'prepared', asset: 'USDC', amount: amount(input.amount), sourceNetwork: clean(input.sourceNetwork, 30).toLowerCase(), settlementNetwork: clean(input.settlementNetwork, 30).toLowerCase(), destinationType: clean(input.destinationType, 60), metadata: safeMetadata(input.metadata), createdAt: timestamp, updatedAt: timestamp }
        store.intents[intent.id] = intent; store.idempotency[key] = intent.id
        return { intent, replayed: false }
      })
    },
    async get(ownerId: string, intentId: string) { const intent = (await readStore()).intents[intentId]; return intent?.ownerId === ownerId ? intent : undefined },
    async findByResource(ownerId: string, resourceId: string, kind?: PaymentExecutionKind) {
      return Object.values((await readStore()).intents).find(intent => intent.ownerId === ownerId && intent.resourceId === resourceId && (!kind || intent.kind === kind))
    },
    async findByResourceAnyOwner(resourceId: string, kind: PaymentExecutionKind) {
      return Object.values((await readStore()).intents).find(intent => intent.resourceId === resourceId && intent.kind === kind)
    },
    async listByMetadata(key: string, value: string, kinds?: PaymentExecutionKind[]) {
      const normalizedKey = clean(key, 60)
      const normalizedValue = clean(value, 240).toLowerCase()
      if (!normalizedKey || !normalizedValue) return []
      return Object.values((await readStore()).intents)
        .filter(intent => (!kinds?.length || kinds.includes(intent.kind))
          && String(intent.metadata[normalizedKey] ?? '').toLowerCase() === normalizedValue)
        .sort((a, b) => b.updatedAt - a.updatedAt)
    },
    async update(input: UpdateInput) {
      return mutate(store => {
        const current = store.intents[input.intentId]
        if (!current || current.ownerId !== input.ownerId) throw new PaymentExecutionNotFoundError('Payment execution was not found.')
        if (input.state && input.state !== current.state && !transitions[current.state].includes(input.state)) throw new PaymentExecutionConflictError(`Payment execution cannot move from ${current.state} to ${input.state}.`)
        const next: PaymentExecutionIntent = { ...current, ...(input.state ? { state: input.state } : {}), ...(input.resourceId ? { resourceId: clean(input.resourceId, 180) } : {}), ...(input.providerReference ? { providerReference: clean(input.providerReference, 180) } : {}), ...(input.transactionHash ? { transactionHash: clean(input.transactionHash, 180) } : {}), ...(input.failureCode ? { failureCode: clean(input.failureCode, 80) } : {}), metadata: { ...current.metadata, ...safeMetadata(input.metadata) }, updatedAt: now() }
        store.intents[next.id] = next; return next
      })
    },
  }
}
export type PaymentExecutionRepository = ReturnType<typeof createPaymentExecutionRepository>
export const paymentExecutionRepository = createPaymentExecutionRepository()
