import {assertNoCrossBridgeReservation,walletReservationActions as walletActions} from './pocket/cross-bridge-reservation-guard.js'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import crypto from 'node:crypto'
import type { CircleKitOperationStore } from './pocket/circle-bridge-operations.js'
import {
  hasRenderDurableStore,
  mutateDurableJson,
  readDurableJson,
  writeDurableJson,
} from './render-durable-store.js'

const JOURNAL_PATH = process.env.CIRCLE_POCKET_ACTION_STORE
  ?? (process.env.DATA_PATH ? `${process.env.DATA_PATH}/circle-pocket-actions.json` : './data/circle-pocket-actions.json')
const JOURNAL_STORE_KEY = (process.env.CIRCLE_POCKET_ACTION_STORE_KEY ?? 'hashpaylink:circle-pocket-actions').trim()
const IS_RENDER = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL)

export type CirclePocketActionStatus = 'started' | 'submitted' | 'completed' | 'failed' | 'cancelled' | 'not_submitted'
export type CirclePocketActionRecord = {
  id: string
  ownerId: string
  idempotencyKey: string
  action: string
  status: CirclePocketActionStatus
  resourceId?: string
  metadata?: Record<string, string>
  createdAt: number
  updatedAt: number
}

type ActionStore = { actions: Record<string, CirclePocketActionRecord>; circleKit?: Record<string, CircleKitOperationStore> }
type WalletScope = { ownerId: string; network?: string; address?: string }
const actionScope = (record: Pick<CirclePocketActionRecord,'ownerId'|'metadata'>): WalletScope => ({ownerId:record.ownerId,network:record.metadata?.network || record.metadata?.source,address:record.metadata?.walletAddress})
const normalizeAddress = (address: string) => /^0x[0-9a-f]{40}$/i.test(address) ? address.toLowerCase() : address
const sameWallet = (a: WalletScope,b: WalletScope) => a.ownerId===b.ownerId && (!a.network || !b.network || a.network===b.network) && (!a.address || !b.address || normalizeAddress(a.address)===normalizeAddress(b.address))
const pending = (record: CirclePocketActionRecord) => walletActions.has(record.action) && ['started','submitted'].includes(record.status)
const busy = (): never => {throw Object.assign(new Error('Another action from this wallet is still being confirmed. Check Activity before trying again.'),{status:409,code:'wallet_action_pending'})}
function assertNoKitReservation(store: ActionStore, scope: WalletScope) {
  assertNoCrossBridgeReservation(store,scope)
  for (const bucket of Object.values(store.circleKit || {})) for (const op of Object.values(bucket.operations)) {
    if (['cancelled','not_submitted'].includes(op.state) || (op.state==='prepared' && op.quote.expiresAt<=Date.now())) continue
    if (sameWallet(scope,{ownerId:op.ownerId,network:op.quote.wallets.source.network,address:op.quote.wallets.source.address})) busy()
  }
}
let mutationQueue: Promise<void> = Promise.resolve()

async function readStore(): Promise<ActionStore> {
  if (hasRenderDurableStore()) {
    try {
      const durable = await readDurableJson<Partial<ActionStore>>(JOURNAL_STORE_KEY)
      return { ...durable, actions: durable?.actions ?? {} }
    } catch {
      if (IS_RENDER) throw new Error('Durable Pocket action storage failed.')
    }
  }
  if (IS_RENDER) throw new Error('Durable Pocket action storage is not configured.')
  try {
    return JSON.parse(await readFile(JOURNAL_PATH, 'utf8')) as ActionStore
  } catch {
    return { actions: {} }
  }
}

async function writeStore(store: ActionStore) {
  await mkdir(dirname(JOURNAL_PATH), { recursive: true })
  await writeFile(JOURNAL_PATH, JSON.stringify(store, null, 2), 'utf8')
  try {
    await writeDurableJson(JOURNAL_STORE_KEY, store)
  } catch {
    // Local file is the fallback; production should configure DATABASE_URL.
  }
}

async function mutate<T>(fn: (store: ActionStore) => T | Promise<T>) {
  let release!: () => void
  const previous = mutationQueue
  mutationQueue = new Promise<void>(resolve => { release = resolve })
  await previous
  try {
    const store = await readStore()
    const result = await fn(store)
    await writeStore(store)
    return result
  } finally {
    release()
  }
}

async function mutateActionStore<T>(fn: (store: ActionStore) => T | Promise<T>) {
  if (hasRenderDurableStore()) {
    let result!: T
    await mutateDurableJson<Partial<ActionStore>>(JOURNAL_STORE_KEY, async current => {
      const store: ActionStore = { ...current, actions: current?.actions ?? {} }
      result = await fn(store)
      return store
    })
    return result
  }
  return mutate(fn)
}

export async function claimCirclePocketAction(input: {
  ownerId: string
  idempotencyKey: string
  action: string
  metadata?: Record<string, string>
  dedupeAlso?: Array<{metadataKey:string;metadataValue:string;statuses:CirclePocketActionStatus[]}>
  dedupe?: {
    metadataKey: string
    metadataValue: string
    statuses: CirclePocketActionStatus[]
    startedAfter?: number
  }
}) {
  return mutateActionStore(store => {
    const existing = Object.values(store.actions).find(record => (
      record.ownerId === input.ownerId
      && record.idempotencyKey === input.idempotencyKey
      && record.action === input.action
    ))
    if (existing) return { record: existing, claimed: false }
    if (walletActions.has(input.action)) {
      const scope=actionScope(input)
      assertNoKitReservation(store,scope)
      // Same-action deduplication retains its existing route-specific rules.
      // Cross-action claims share this transaction, not a preflight read.
      if (Object.values(store.actions).some(record=>record.action!==input.action && pending(record) && sameWallet(scope,actionScope(record)))) busy()
    }
    const rules = [...(input.dedupe ? [input.dedupe] : []), ...(input.dedupeAlso || [])]
    const conflict = Object.values(store.actions).find(record => (
      record.ownerId === input.ownerId
      && record.action === input.action
      && rules.some(rule => record.metadata?.[rule.metadataKey] === rule.metadataValue
        && rule.statuses.includes(record.status)
        && (record.status !== 'started' || !('startedAfter' in rule) || typeof rule.startedAfter !== 'number' || !rule.startedAfter || record.updatedAt >= rule.startedAfter))
    ))
    if (conflict) return { record: conflict, claimed: false }
    const now = Date.now()
    const record: CirclePocketActionRecord = {
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      idempotencyKey: input.idempotencyKey,
      action: input.action,
      status: 'started',
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    }
    store.actions[record.id] = record
    return { record, claimed: true }
  })
}

/** Kit reservations and existing action claims use the SAME durable row lock.
 * No provider calls belong in this synchronous mutation callback. */
export async function mutateCircleKitActionStore(key: string, fn: (current: CircleKitOperationStore | undefined) => CircleKitOperationStore) {
  if (!hasRenderDurableStore()) throw Object.assign(new Error('Bridge recovery storage is unavailable.'),{status:503})
  return mutateActionStore(store=>{
    const previous=store.circleKit?.[key]
    const next=fn(structuredClone(previous))
    for (const op of Object.values(next.operations)) {
      const expected='pocket:circle-kit-operations:v1:'+crypto.createHash('sha256').update(op.ownerId).digest('hex')
      if (key!==expected || op.quote.ownerId!==op.ownerId || op.quote.wallets.ownerId!==op.ownerId) throw new Error('Bridge owner mismatch.')
      const old=previous?.operations[op.id]
      if ((!old && op.state==='prepared') || (old?.state==='prepared' && op.state==='submitting')) {
        const scope={ownerId:op.ownerId,network:op.quote.wallets.source.network,address:op.quote.wallets.source.address}
        assertNoCrossBridgeReservation(store,scope)
        if (Object.values(store.actions).some(record=>pending(record) && sameWallet(scope,actionScope(record)))) busy()
      }
    }
    store.circleKit={...store.circleKit,[key]:next}
    return structuredClone(next)
  })
}

export async function readCircleKitActionStore(key: string): Promise<CircleKitOperationStore | undefined> {
  if (!hasRenderDurableStore()) throw Object.assign(new Error('Bridge recovery storage is unavailable.'),{status:503})
  // Earlier Kit code was unmounted. Never silently lose an old draft reservation.
  const legacy=await readDurableJson<CircleKitOperationStore>(key)
  if (legacy && Object.values(legacy.operations).some(op=>!['cancelled','not_submitted'].includes(op.state))) throw Object.assign(new Error('An earlier bridge reservation needs reconciliation.'),{status:409})
  return structuredClone((await readStore()).circleKit?.[key])
}

/** One durable claim owns broadcast. Replays only read the saved transaction. */
export async function claimSolanaCctpBroadcast(input:{ownerId:string;idempotencyKey:string;fingerprint:string;signedTransaction:string;txHash:string}){
 return mutateActionStore(store=>{
  const row=Object.values(store.actions).find(r=>r.ownerId===input.ownerId&&r.idempotencyKey===input.idempotencyKey&&r.action==='reservation.solana-cctp')
  if(!row||row.metadata?.fingerprint!==input.fingerprint)throw Error('Saved Solana bridge approval changed.')
  if(row.metadata.signedTransaction&&(row.metadata.signedTransaction!==input.signedTransaction||row.metadata.txHash!==input.txHash))throw Error('Solana bridge signature changed.')
  if(row.metadata.signedTransaction||!['started','submitted'].includes(row.status))return {claimed:false,record:row}
  row.metadata={...row.metadata,signedTransaction:input.signedTransaction,txHash:input.txHash}
  row.status='submitted';row.updatedAt=Date.now()
  return {claimed:true,record:row}
 })
}

export async function recordCirclePocketAction(input: {
  ownerId: string
  idempotencyKey: string
  action: string
  status: CirclePocketActionStatus
  resourceId?: string
  metadata?: Record<string, string>
}) {
  return mutateActionStore(store => {
    const existing = Object.values(store.actions).find(record => (
      record.ownerId === input.ownerId
      && record.idempotencyKey === input.idempotencyKey
      && record.action === input.action
    ))
    if(['reservation.direct-cctp','reservation.solana-cctp'].includes(input.action)&&existing){
      for(const field of ['approved','fingerprint','source','walletAddress','walletId','intentFingerprint','challengeId','txHash','signedTransaction']) {
        if(existing.metadata?.[field]!==undefined && input.metadata?.[field]!==undefined && existing.metadata[field]!==input.metadata[field]) throw new Error('Bridge reservation evidence cannot change.')
      }
      if(['completed','failed'].includes(existing.status)){
        if(existing.status==='completed'&&input.status==='completed'&&input.metadata?.deliveryRecorded==='true')existing.metadata={...existing.metadata,deliveryRecorded:'true'}
        return existing
      }
      if(['cancelled','not_submitted'].includes(input.status)&&existing.metadata?.txHash)return existing
      if(['cancelled','not_submitted'].includes(existing.status)&&['started','submitted'].includes(input.status)&&!input.metadata?.txHash)return existing
      input.metadata={...existing.metadata,...input.metadata}
    }
    if(input.action==='wallet.swap'&&existing){
      // Cancellation and status reads can race. Persisted transaction evidence wins.
      if(existing.status==='completed'||(existing.status==='failed'&&existing.metadata?.txHash))return existing
      if(['cancelled','not_submitted'].includes(input.status)&&existing.metadata?.txHash)return existing
      if(['cancelled','not_submitted'].includes(existing.status)&&['started','submitted'].includes(input.status)&&!input.metadata?.txHash)return existing
      input.metadata={...existing.metadata,...input.metadata}
    }
    if (input.action.startsWith('gift.') && existing) {
      for (const field of ['txHash','network','amount','giftId']) if (existing.metadata?.[field] !== input.metadata?.[field]) throw new Error('Gift receipt does not match its saved transfer.')
      const oldState = existing.metadata?.state, nextState = input.metadata?.state
      if (['claimed','refunded'].includes(oldState || '') && nextState === 'funded') return existing
      if (['claimed','refunded'].includes(oldState || '') && nextState !== oldState) throw new Error('Gift receipt needs reconciliation.')
    }
    // Background gift reconciliation must not move unchanged receipts to the top.
    if (input.action.startsWith('gift.') && existing && existing.status === input.status && existing.resourceId === input.resourceId) {
      const previous = existing.metadata || {}, next = input.metadata || {}
      if (Object.keys(previous).length === Object.keys(next).length && Object.keys(previous).every(key => previous[key] === next[key])) return existing
    }
    // Bridge recovery can retry after a worker has already finalized the action.
    // Keep terminal state and the event timestamp stable for ledger deduplication.
    if (['wallet.usdt-bridge','wallet.xlayer-bridge','wallet.bsc-bridge','wallet.native-send','wallet.native-swap','wallet.bsc-swap','wallet.bsc-send','wallet.cash-conversion'].includes(input.action) && existing) {
      for (const key of ['quoteToken', 'source', 'destination', 'amount']) {
        if (existing.metadata?.[key] !== input.metadata?.[key]) throw new Error('Bridge details do not match the saved transfer.')
      }
      if (existing.status === 'completed' || existing.status === 'failed') return existing
      // Close/status/submit may race. Only transaction evidence may revive a
      // cancelled approval; a new local submission must lose to cancellation.
      if (['cancelled','not_submitted'].includes(input.status) && (existing.metadata?.txHash || existing.metadata?.signedTransaction)) return existing
      if (['cancelled','not_submitted'].includes(existing.status) && ['started','submitted'].includes(input.status)
        && (!input.metadata?.txHash || input.metadata?.submissionClaim === 'true')) return existing
      if(['wallet.native-send','wallet.native-swap','wallet.bsc-swap','wallet.bsc-send','wallet.cash-conversion'].includes(input.action)){
        for(const key of ['network','walletAddress','recipient','recipientAddress','assetSymbol','toAsset','challengeId','txHash','signedTransaction']){
          if(existing.metadata?.[key] && input.metadata?.[key] !== undefined && existing.metadata[key] !== input.metadata[key])throw new Error('Native transfer evidence cannot change.')
        }
      }
      input.metadata = { ...existing.metadata, ...input.metadata }
      if (existing.status === input.status && Object.keys(input.metadata).every(key => input.metadata?.[key] === existing.metadata?.[key])) return existing
    }
    if (input.action === 'wallet.bridge' && existing) {
      if (existing.metadata?.source !== input.metadata?.source || existing.metadata?.destination !== input.metadata?.destination || existing.metadata?.amount !== input.metadata?.amount) {
        throw new Error('Bridge details do not match the saved transfer.')
      }
      if (existing.metadata?.fundingParent && input.metadata?.fundingParent && existing.metadata.fundingParent !== input.metadata.fundingParent) throw new Error('Bridge is already linked to another payment.')
      if (input.metadata?.fundingParent && !existing.metadata?.fundingParent) {
        existing.metadata = { ...existing.metadata, fundingParent: input.metadata.fundingParent, fundingPayment: input.metadata.fundingPayment }
      }
      if (existing.status === 'completed' || existing.status === 'failed' || existing.status === input.status) return existing
      input.metadata = { ...existing.metadata, ...input.metadata }

    }
    const now = Date.now()
    const record: CirclePocketActionRecord = {
      id: existing?.id ?? crypto.randomUUID(),
      ownerId: input.ownerId,
      idempotencyKey: input.idempotencyKey,
      action: input.action,
      status: input.status,
      resourceId: input.resourceId ?? existing?.resourceId,
      metadata: input.metadata ?? existing?.metadata,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    store.actions[record.id] = record
    return record
  })
}

export async function listCirclePocketActions(ownerId: string, limit = 50, action?: string, unresolvedOnly = false) {
  const store = await readStore()
  return Object.values(store.actions)
    .filter(record => record.ownerId === ownerId && (!action || record.action === action) && (!unresolvedOnly || record.status === 'started' || record.status === 'submitted'))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, Math.max(1, Math.min(limit, 500)))
}

export async function listUnresolvedCirclePocketActions(action: string, limit = 250) {
  const store = await readStore()
  return Object.values(store.actions)
    .filter(record => record.action === action && (record.status === 'started' || record.status === 'submitted'))
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(0, Math.max(1, Math.min(limit, 1000)))
}

export async function findCirclePocketAction(ownerId: string, idempotencyKey: string, action: string) {
  const store = await readStore()
  return Object.values(store.actions).find(record => record.ownerId === ownerId && record.idempotencyKey === idempotencyKey && record.action === action) ?? null
}
