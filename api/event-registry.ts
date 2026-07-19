import type { Request, Response } from 'express'
import { archivePayment }          from './og-storage.js'
import { appendAgentActivity, normalizeActivitySlug } from './agent-activity.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, resolve }        from 'path'
import crypto from 'crypto'
import { hasRenderDurableStore, mutateDurableJson, readDurableJson, writeDurableJson } from './render-durable-store.js'
import { getPaycrestPosOrder } from './paycrest-pos.js'
import { normalizeEvmUsdcChain, verifyEvmUsdcTransfer } from './usdc-transfer-verify.js'
import { hostedCheckoutPaymentOption, markHostedCheckoutPaid, readVerifiedHostedCheckoutRecord } from './hosted-checkouts.js'

type PaymentEntry = {
  eventId:     string
  txHash:      string
  chain:       string
  payer:       string
  memo:        string
  amount:      string
  requestedAmount?: string
  ts:          number
  source?:     string
  merchantId?: string
  contextLabel?: string
  settlementType?: string
  amountNgn?:  string
  ogRootHash?: string
  ogTxHash?:   string
}

export type RegisteredPaymentReceipt = PaymentEntry & {
  receiptId: string
  receiptHash: string
}

export type RegisterPaymentInput = {
  eventId?: unknown
  txHash?: unknown
  payer?: unknown
  memo?: unknown
  chain?: unknown
  amount?: unknown
  requestedAmount?: unknown
  agentSlug?: unknown
  source?: unknown
  merchantId?: unknown
  contextLabel?: unknown
  settlementType?: unknown
  amountNgn?: unknown
  intentId?: unknown
  intent_id?: unknown
}

const MAX_EVENT_ID_LENGTH = 128
const MAX_TEXT_LENGTH = 256
const MAX_AMOUNT_LENGTH = 64

function cleanString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`)
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required`)
  if (normalized.length > maxLength) throw new Error(`${field} is too long`)
  return normalized
}

function cleanOptionalString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

// ── Persistent storage ────────────────────────────────────────────────────────
// Set DATA_PATH env var to a Render Persistent Disk mount point (e.g. /data).
// Without it the registry is in-memory only and resets on each deploy.
const DATA_FILE = process.env.DATA_PATH
  ? `${process.env.DATA_PATH}/event-registry.json`
  : null
const EVENT_REGISTRY_STORE_KEY = (process.env.EVENT_REGISTRY_STORE_KEY ?? 'hashpaylink:event-registry').trim()
const NG_POS_STORE_PATH = process.env.NG_POS_STORE ?? './data/ng-pos-merchants.json'
const NG_POS_STORE_KEY = (process.env.NG_POS_STORE_KEY ?? 'hashpaylink:ng-pos-merchants').trim()
const IS_RENDER = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL)
const HAS_DURABLE_STORE = hasRenderDurableStore()

type NgPosMerchantRecord = {
  merchant_id: string
  circle_smart_wallet_address?: string
}

type NgPosStore = {
  merchants?: Record<string, NgPosMerchantRecord>
}

function loadRegistry(): Map<string, PaymentEntry[]> {
  if (!DATA_FILE || !existsSync(DATA_FILE)) return new Map()
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, 'utf8')) as Record<string, PaymentEntry[]>
    console.log(`[registry] loaded ${Object.keys(raw).length} event(s) from disk`)
    return new Map(Object.entries(raw))
  } catch (e) {
    console.warn('[registry] failed to load from disk — starting fresh:', e)
    return new Map()
  }
}

async function hydrateRegistry(): Promise<void> {
  try {
    const remote = await readDurableJson<Record<string, PaymentEntry[]>>(EVENT_REGISTRY_STORE_KEY)
    if (!remote) return
    registry.clear()
    for (const [eventId, entries] of Object.entries(remote)) registry.set(eventId, entries)
  } catch (e) {
    console.warn('[registry] durable load failed; using local registry.', e instanceof Error ? e.message : String(e))
  }
}

async function persistRegistry(): Promise<void> {
  const serialized = JSON.stringify(Object.fromEntries(registry))
  if (DATA_FILE) {
    const dir = dirname(DATA_FILE)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(DATA_FILE, serialized, 'utf8')
  }

  if (IS_RENDER && !HAS_DURABLE_STORE) {
    throw new Error('Durable event registry storage is not configured. Add DATABASE_URL on Render before recording receipts.')
  }

  try {
    const local = Object.fromEntries(registry)
    const merged = HAS_DURABLE_STORE
      ? await mutateDurableJson<Record<string, PaymentEntry[]>>(EVENT_REGISTRY_STORE_KEY, current => mergeRegistryRecords(current ?? {}, local))
      : (await writeDurableJson(EVENT_REGISTRY_STORE_KEY, local), local)
    registry.clear()
    for (const [eventId, entries] of Object.entries(merged)) registry.set(eventId, entries)
  } catch (e) {
    if (IS_RENDER) {
      throw new Error('Durable event registry storage failed. Check DATABASE_URL on Render before recording receipts.')
    }
    console.warn('[registry] failed to persist:', e)
  }
}

function mergeRegistryRecords(...records: Record<string, PaymentEntry[]>[]) {
  const merged: Record<string, PaymentEntry[]> = {}
  for (const record of records) {
    for (const [eventId, entries] of Object.entries(record ?? {})) {
      const existing = merged[eventId] ?? []
      const byTx = new Map(existing.map(entry => [entry.txHash.toLowerCase(), entry]))
      for (const entry of entries ?? []) {
        byTx.set(entry.txHash.toLowerCase(), {
          ...(byTx.get(entry.txHash.toLowerCase()) ?? {}),
          ...entry,
        })
      }
      merged[eventId] = Array.from(byTx.values()).sort((a, b) => b.ts - a.ts)
    }
  }
  return merged
}

const registry = loadRegistry()
const archiveInFlight = new Set<string>()
const ARCHIVE_RETRY_DELAYS_MS = [0, 10_000, 30_000]

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function encodeReceiptId(eventId: string, txHash: string) {
  return Buffer.from(JSON.stringify({ eventId, txHash }), 'utf8')
    .toString('base64url')
}

function decodeReceiptId(receiptId: string) {
  try {
    const parsed = JSON.parse(Buffer.from(receiptId, 'base64url').toString('utf8')) as {
      eventId?: unknown
      txHash?: unknown
    }
    const eventId = typeof parsed.eventId === 'string' ? parsed.eventId.trim() : ''
    const txHash = typeof parsed.txHash === 'string' ? parsed.txHash.trim() : ''
    return eventId && txHash ? { eventId, txHash } : null
  } catch {
    return null
  }
}

function receiptHash(entry: PaymentEntry) {
  return crypto.createHash('sha256').update(JSON.stringify({
    type: 'hashpaylink_payment_receipt',
    eventId: entry.eventId,
    txHash: entry.txHash,
    chain: entry.chain,
    payer: entry.payer,
    memo: entry.memo,
    amount: entry.amount,
    ts: entry.ts,
    source: entry.source,
    merchantId: entry.merchantId,
    contextLabel: entry.contextLabel,
    settlementType: entry.settlementType,
  })).digest('hex')
}

async function readNgPosStore(): Promise<NgPosStore> {
  try {
    const remote = await readDurableJson<NgPosStore>(NG_POS_STORE_KEY)
    if (remote) return remote
  } catch {
    // Fall through to local file for development.
  }

  try {
    const raw = readFileSync(resolve(NG_POS_STORE_PATH), 'utf8')
    return JSON.parse(raw) as NgPosStore
  } catch {
    return { merchants: {} }
  }
}

function preferredAmount(amount: string, requestedAmount: string) {
  const requestedNum = Number.parseFloat(requestedAmount)
  if (Number.isFinite(requestedNum) && requestedNum > 0) return requestedAmount
  return amount
}

async function expectedNgPosRecipient(input: {
  source: string
  merchantId: string
  settlementType: string
  intentId: string
}) {
  if (input.source !== 'ngpos' && input.source !== 'bank-receive') throw new Error('Unsupported receipt source.')
  if (input.settlementType === 'INSTANT_FIAT') {
    if (!input.intentId) throw new Error('Naira payout receipt requires an offramp intent.')
    const order = await getPaycrestPosOrder(input.intentId)
    if (!order?.receive_address) throw new Error('Paycrest order is not ready for receipt verification.')
    return { recipient: order.receive_address, minAmount: order.amount_usdc }
  }

  if (!input.merchantId) throw new Error('Merchant id is required for receipt verification.')
  const store = await readNgPosStore()
  const merchant = store.merchants?.[input.merchantId]
  if (!merchant?.circle_smart_wallet_address) throw new Error('Merchant USDC wallet is not available for receipt verification.')
  return { recipient: merchant.circle_smart_wallet_address, minAmount: '' }
}

export function paymentReceiptId(eventId: string, txHash: string) {
  return encodeReceiptId(eventId, txHash)
}

function archiveKey(entry: PaymentEntry) {
  return `${entry.eventId}:${entry.txHash}`.toLowerCase()
}

function archiveMetadata(entry: PaymentEntry, customerWallet: string) {
  if (entry.source !== 'ngpos' && entry.source !== 'bank-receive' && entry.source !== 'bank-send') return undefined
  return {
    type: entry.source === 'bank-send' ? 'nigerian_bank_send_onramp' : entry.source === 'bank-receive' ? 'nigerian_bank_receive_payment' : 'nigerian_retail_pos_payment',
    merchantId: entry.merchantId,
    amountNgn: entry.amountNgn,
    amountUsdc: entry.amount,
    settlementType: entry.settlementType,
    customerWallet,
  }
}

function archiveRecordFor(entry: PaymentEntry, payerWallet: string): PaymentEntry {
  if (entry.source !== 'ngpos' && entry.source !== 'bank-receive' && entry.source !== 'bank-send') return entry
  return {
    eventId: entry.eventId,
    txHash: entry.txHash,
    chain: entry.chain,
    payer: payerWallet || entry.payer,
    memo: entry.source === 'bank-send' ? 'Bank send funding' : entry.source === 'bank-receive' ? 'Bank receive payment' : 'Retail POS payment',
    amount: entry.amount,
    requestedAmount: entry.requestedAmount,
    ts: entry.ts,
    source: entry.source,
    merchantId: entry.merchantId,
    settlementType: entry.settlementType,
    amountNgn: entry.amountNgn,
    ogRootHash: entry.ogRootHash,
    ogTxHash: entry.ogTxHash,
  }
}

function scheduleArchivePayment(entry: PaymentEntry, payerWallet = entry.payer) {
  if (entry.ogTxHash) return
  const key = archiveKey(entry)
  if (archiveInFlight.has(key)) return
  archiveInFlight.add(key)

  void (async () => {
    for (const delay of ARCHIVE_RETRY_DELAYS_MS) {
      if (delay > 0) await sleep(delay)
      const list = registry.get(entry.eventId)
      const current = list?.find(item => item.txHash === entry.txHash) ?? entry
      if (current.ogTxHash) return
      const archiveEntry = archiveRecordFor(current, payerWallet)

      const result = await archivePayment({
        eventId: archiveEntry.eventId,
        txHash: archiveEntry.txHash,
        chain: archiveEntry.chain,
        payer: archiveEntry.payer,
        amount: archiveEntry.amount,
        ts: archiveEntry.ts,
        source: archiveEntry.source,
        merchantId: archiveEntry.merchantId,
        contextLabel: archiveEntry.contextLabel,
        settlementType: archiveEntry.settlementType,
        amountNgn: archiveEntry.amountNgn,
        metadata: archiveMetadata(current, payerWallet),
      })

      if (!result) continue
      const latest = registry.get(current.eventId)
      if (!latest) return
      const idx = latest.findIndex(item => item.txHash === current.txHash)
      if (idx === -1) return
      latest[idx].ogRootHash = result.rootHash
      latest[idx].ogTxHash = result.ogTxHash
      await persistRegistry()
      return
    }
    console.warn('[registry] 0G archive still pending after retries:', entry.eventId, entry.txHash)
  })().catch(err => {
    console.warn('[registry] 0G archive scheduler failed:', err instanceof Error ? err.message : String(err))
  }).finally(() => {
    archiveInFlight.delete(key)
  })
}

export async function findRegisteredPaymentReceipt(receiptId: string): Promise<RegisteredPaymentReceipt | undefined> {
  const decoded = decodeReceiptId(String(receiptId ?? '').trim())
  if (!decoded) return undefined
  await hydrateRegistry()
  const entry = (registry.get(decoded.eventId) ?? []).find(item => item.txHash === decoded.txHash)
  if (!entry) return undefined
  return {
    ...entry,
    receiptId,
    receiptHash: receiptHash(entry),
  }
}

export async function listRegisteredPaymentsForEventIds(eventIds: string[]): Promise<PaymentEntry[]> {
  const ids = Array.from(new Set(eventIds.map(id => String(id ?? '').trim()).filter(Boolean)))
    .filter(id => id.length <= MAX_EVENT_ID_LENGTH)
  if (!ids.length) return []
  await hydrateRegistry()
  return ids
    .flatMap(id => registry.get(id) ?? [])
    .sort((a, b) => b.ts - a.ts)
}

function paymentError(message: string, status = 400) {
  const error = new Error(message) as Error & { status?: number }
  error.status = status
  return error
}

function usdcMicroUnits(value: string) {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  try {
    return BigInt(`${whole}${fraction.padEnd(6, '0')}`)
  } catch {
    return null
  }
}

export async function registerVerifiedPayment(input: RegisterPaymentInput) {
  let eventId: string
  let txHash: string
  let payer: string
  let memo: string
  let chain: string
  let amount: string
  let requestedAmount = ''
  let agentSlug = ''
  let source = ''
  let merchantId = ''
  let contextLabel = ''
  let settlementType = ''
  let amountNgn = ''
  let intentId = ''

  try {
    eventId = cleanString(input?.eventId, 'eventId', MAX_EVENT_ID_LENGTH)
    txHash = cleanString(input?.txHash, 'txHash', MAX_TEXT_LENGTH)
    payer = cleanString(input?.payer, 'payer', MAX_TEXT_LENGTH)
    memo = cleanString(input?.memo, 'memo', MAX_TEXT_LENGTH)
    chain = cleanOptionalString(input?.chain, MAX_TEXT_LENGTH)
    amount = cleanOptionalString(input?.amount, MAX_AMOUNT_LENGTH)
    requestedAmount = cleanOptionalString(input?.requestedAmount, MAX_AMOUNT_LENGTH)
    agentSlug = normalizeActivitySlug(input?.agentSlug)
    source = cleanOptionalString(input?.source, MAX_TEXT_LENGTH)
    merchantId = cleanOptionalString(input?.merchantId, MAX_TEXT_LENGTH)
    contextLabel = cleanOptionalString(input?.contextLabel, MAX_TEXT_LENGTH)
    settlementType = cleanOptionalString(input?.settlementType, MAX_TEXT_LENGTH)
    amountNgn = cleanOptionalString(input?.amountNgn, MAX_AMOUNT_LENGTH)
    intentId = cleanOptionalString(input?.intentId ?? input?.intent_id, MAX_TEXT_LENGTH).replace(/[^a-zA-Z0-9_-]/g, '')
  } catch (err) {
    throw paymentError(err instanceof Error ? err.message : 'Invalid request', 400)
  }

  if (source === 'hosted-checkout') {
    if (txHash.startsWith('manual_')) {
      throw paymentError('A confirmed on-chain transaction is required for this checkout.', 400)
    }
    const checkout = await readVerifiedHostedCheckoutRecord(merchantId, { allowExpiredForReconciliation: true })
    if (!checkout) {
      throw paymentError('Hosted checkout is invalid or has expired.', 409)
    }
    if (eventId !== `hosted-${checkout.id}`) {
      throw paymentError('Hosted checkout reference does not match.', 400)
    }
    const evmChain = normalizeEvmUsdcChain(chain)
    const paymentOption = evmChain ? hostedCheckoutPaymentOption(checkout, evmChain) : null
    if (!evmChain || !paymentOption) throw paymentError('Hosted checkout network is not available.', 409)
    const actualUnits = usdcMicroUnits(amount)
    const requestedUnits = usdcMicroUnits(requestedAmount)
    const signedUnits = checkout.flexible ? null : usdcMicroUnits(checkout.amount)
    if (!actualUnits || actualUnits <= 0n || !requestedUnits || requestedUnits <= 0n) {
      throw paymentError('Invalid hosted checkout amount.', 400)
    }
    if (signedUnits && requestedUnits !== signedUnits) {
      throw paymentError('Hosted checkout amount does not match.', 409)
    }
    const minimumAmount = checkout.flexible ? amount : checkout.amount
    try {
      const verifiedTransfer = await verifyEvmUsdcTransfer({
        chain: evmChain,
        txHash,
        payer,
        recipient: paymentOption.recipient,
        minAmount: minimumAmount,
        notBefore: checkout.createdAt,
        notAfter: checkout.expiresAt,
      })
      if (!verifiedTransfer.confirmedAt) throw new Error('Hosted checkout confirmation time was not verified.')
      amount = verifiedTransfer.amount
      await markHostedCheckoutPaid({
        id: checkout.id,
        txHash,
        payer,
        amount: verifiedTransfer.amount,
        confirmedAt: verifiedTransfer.confirmedAt,
        network: evmChain,
      })
    } catch (error) {
      throw paymentError(error instanceof Error ? error.message : 'Hosted checkout could not be verified on-chain.', 409)
    }
    memo = checkout.title
    contextLabel = checkout.merchantName
    settlementType = checkout.kind === 'service' ? 'hosted_service' : 'hosted_payment'
  }

  if (source === 'ngpos' || source === 'bank-receive') {
    if (txHash.startsWith('manual_')) {
      throw paymentError('Verified on-chain transaction is required for this receipt.', 400)
    }
    const evmChain = normalizeEvmUsdcChain(chain)
    if (!evmChain) {
      throw paymentError('Verified EVM USDC transaction is required for this receipt.', 400)
    }
    const amountNum = Number.parseFloat(amount)
    const requestedNum = Number.parseFloat(requestedAmount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      throw paymentError('Invalid payment amount.', 400)
    }
    if (Number.isFinite(requestedNum) && requestedNum > 0 && amountNum + 0.0000005 < requestedNum) {
      throw paymentError('Payment is below requested amount.', 409)
    }
    try {
      const expected = await expectedNgPosRecipient({ source, merchantId, settlementType, intentId })
      await verifyEvmUsdcTransfer({
        chain: evmChain,
        txHash,
        recipient: expected.recipient,
        minAmount: expected.minAmount || preferredAmount(amount, requestedAmount),
      })
    } catch (error) {
      throw paymentError(error instanceof Error ? error.message : 'Payment could not be verified on-chain.', 409)
    }
  }

  await hydrateRegistry()
  const entries = registry.get(eventId) ?? []
  if (!txHash.startsWith('manual_')) {
    const manualIndex = entries.findIndex(e =>
      e.txHash.startsWith('manual_') &&
      e.payer.toLowerCase() === payer.toLowerCase() &&
      (!source || e.source === source)
    )
    if (manualIndex >= 0) {
      entries[manualIndex] = {
        ...entries[manualIndex],
        txHash,
        chain,
        payer,
        memo,
        amount,
        ts: Date.now(),
        requestedAmount: requestedAmount || entries[manualIndex].requestedAmount,
        source: source || entries[manualIndex].source,
        merchantId: merchantId || entries[manualIndex].merchantId,
        contextLabel: contextLabel || entries[manualIndex].contextLabel,
        settlementType: settlementType || entries[manualIndex].settlementType,
        amountNgn: amountNgn || entries[manualIndex].amountNgn,
      }
      registry.set(eventId, entries)
      await persistRegistry()
      const result = {
        ok: true,
        upgraded: true,
        receiptId: paymentReceiptId(eventId, txHash),
        receiptUrl: `/r/${paymentReceiptId(eventId, txHash)}`,
      }
      scheduleArchivePayment(entries[manualIndex], payer)
      return result
    }
  }
  // Deduplicate by txHash (for real on-chain txs) OR by payer+eventId for manual detections
  const isDupe = txHash.startsWith('manual_')
    ? entries.some(e => e.payer.toLowerCase() === payer.toLowerCase())
    : entries.some(e => e.txHash.toLowerCase() === txHash.toLowerCase())
  if (isDupe) {
    const duplicate = txHash.startsWith('manual_')
      ? entries.find(e => e.payer.toLowerCase() === payer.toLowerCase())
      : entries.find(e => e.txHash.toLowerCase() === txHash.toLowerCase())
    const result = {
      ok: true,
      duplicate: true,
      receiptId: paymentReceiptId(eventId, txHash),
      receiptUrl: `/r/${paymentReceiptId(eventId, txHash)}`,
    }
    if (duplicate) scheduleArchivePayment(duplicate, payer)
    return result
  }
  const entry: PaymentEntry = { eventId, txHash, chain, payer, memo, amount, ts: Date.now() }
  if (requestedAmount) entry.requestedAmount = requestedAmount
  if (source) entry.source = source
  if (merchantId) entry.merchantId = merchantId
  if (contextLabel) entry.contextLabel = contextLabel
  if (settlementType) entry.settlementType = settlementType
  if (amountNgn) entry.amountNgn = amountNgn
  entries.push(entry)
  registry.set(eventId, entries)
  await persistRegistry()
  const result = {
    ok: true,
    receiptId: paymentReceiptId(eventId, txHash),
    receiptUrl: `/r/${paymentReceiptId(eventId, txHash)}`,
  }
  if (agentSlug) {
    void appendAgentActivity({
      agentSlug,
      type: 'funded',
      title: 'Human funded agent wallet',
      amount,
      asset: 'USDC',
      direction: 'in',
      network: chain,
      wallet: payer,
      txHash,
      detail: memo,
      createdAt: entry.ts,
    }).catch(() => {})
  }

  // Fire-and-forget archive to 0G decentralized storage — non-blocking.
  // When complete, patch the entry in-place so the dashboard can show the badge.
  // Use the human-readable name (memo) as payer in the 0G archive so
  // agent-verify can match by name, not wallet address.
  scheduleArchivePayment(entry, payer)
  return result
}

export async function registerEventPayment(req: Request, res: Response): Promise<void> {
  try {
    res.json(await registerVerifiedPayment(req.body ?? {}))
  } catch (err) {
    const error = err as Error & { status?: number }
    res.status(error.status ?? 500).json({ ok: false, error: error.message || 'Invalid request' })
  }
}

export async function listEventPayments(req: Request, res: Response): Promise<void> {
  let id: string
  try {
    id = cleanString(req.query.id, 'id', MAX_EVENT_ID_LENGTH)
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'Invalid request' })
    return
  }
  await hydrateRegistry()
  const entries = registry.get(id) ?? []
  res.json({ ok: true, payments: [...entries].sort((a, b) => b.ts - a.ts) })
}
