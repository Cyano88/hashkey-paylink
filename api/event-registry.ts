import type { Request, Response } from 'express'
import { archivePayment }          from './og-storage.js'
import { appendAgentActivity, normalizeActivitySlug } from './agent-activity.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname }                 from 'path'
import crypto from 'crypto'

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
const UPSTASH_REST_URL = (process.env.UPSTASH_REDIS_REST_URL ?? '').trim().replace(/\/+$/, '')
const UPSTASH_REST_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN ?? '').trim()
const UPSTASH_STORE_KEY = (process.env.EVENT_REGISTRY_STORE_KEY ?? 'hashpaylink:event-registry').trim()

async function upstashCommand<T>(command: unknown[]): Promise<T | undefined> {
  if (!UPSTASH_REST_URL || !UPSTASH_REST_TOKEN) return undefined
  const response = await fetch(UPSTASH_REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  })
  if (!response.ok) throw new Error(`Upstash request failed: ${response.status}`)
  const data = await response.json() as { result?: T }
  return data.result
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
    const remote = await upstashCommand<string>(['GET', UPSTASH_STORE_KEY])
    if (!remote) return
    const raw = JSON.parse(remote) as Record<string, PaymentEntry[]>
    registry.clear()
    for (const [eventId, entries] of Object.entries(raw)) registry.set(eventId, entries)
  } catch (e) {
    console.warn('[registry] Upstash load failed; using local registry.', e instanceof Error ? e.message : String(e))
  }
}

async function persistRegistry(): Promise<void> {
  try {
    const serialized = JSON.stringify(Object.fromEntries(registry))
    if (DATA_FILE) {
      const dir = dirname(DATA_FILE)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(DATA_FILE, serialized, 'utf8')
    }
    await upstashCommand(['SET', UPSTASH_STORE_KEY, serialized])
  } catch (e) {
    console.warn('[registry] failed to persist:', e)
  }
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

export function paymentReceiptId(eventId: string, txHash: string) {
  return encodeReceiptId(eventId, txHash)
}

function archiveKey(entry: PaymentEntry) {
  return `${entry.eventId}:${entry.txHash}`.toLowerCase()
}

function archiveMetadata(entry: PaymentEntry, customerWallet: string) {
  if (entry.source !== 'ngpos') return undefined
  return {
    type: 'nigerian_retail_pos_payment',
    merchantId: entry.merchantId,
    contextLabel: entry.contextLabel,
    amountNgn: entry.amountNgn,
    amountUsdc: entry.amount,
    settlementType: entry.settlementType,
    customerWallet,
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

      const result = await archivePayment({
        eventId: current.eventId,
        txHash: current.txHash,
        chain: current.chain,
        payer: current.memo || payerWallet || current.payer,
        amount: current.amount,
        ts: current.ts,
        source: current.source,
        merchantId: current.merchantId,
        contextLabel: current.contextLabel,
        settlementType: current.settlementType,
        amountNgn: current.amountNgn,
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

export async function registerEventPayment(req: Request, res: Response): Promise<void> {
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

  try {
    eventId = cleanString(req.body?.eventId, 'eventId', MAX_EVENT_ID_LENGTH)
    txHash = cleanString(req.body?.txHash, 'txHash', MAX_TEXT_LENGTH)
    payer = cleanString(req.body?.payer, 'payer', MAX_TEXT_LENGTH)
    memo = cleanString(req.body?.memo, 'memo', MAX_TEXT_LENGTH)
    chain = cleanOptionalString(req.body?.chain, MAX_TEXT_LENGTH)
    amount = cleanOptionalString(req.body?.amount, MAX_AMOUNT_LENGTH)
    requestedAmount = cleanOptionalString(req.body?.requestedAmount, MAX_AMOUNT_LENGTH)
    agentSlug = normalizeActivitySlug(req.body?.agentSlug)
    source = cleanOptionalString(req.body?.source, MAX_TEXT_LENGTH)
    merchantId = cleanOptionalString(req.body?.merchantId, MAX_TEXT_LENGTH)
    contextLabel = cleanOptionalString(req.body?.contextLabel, MAX_TEXT_LENGTH)
    settlementType = cleanOptionalString(req.body?.settlementType, MAX_TEXT_LENGTH)
    amountNgn = cleanOptionalString(req.body?.amountNgn, MAX_AMOUNT_LENGTH)
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'Invalid request' })
    return
  }

  if (source === 'ngpos') {
    const amountNum = Number.parseFloat(amount)
    const requestedNum = Number.parseFloat(requestedAmount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      res.status(400).json({ ok: false, error: 'Invalid POS amount.' })
      return
    }
    if (Number.isFinite(requestedNum) && requestedNum > 0 && amountNum + 0.0000005 < requestedNum) {
      res.status(409).json({ ok: false, error: 'POS payment is below requested amount.' })
      return
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
      res.json({
        ok: true,
        upgraded: true,
        receiptId: paymentReceiptId(eventId, txHash),
        receiptUrl: `/r/${paymentReceiptId(eventId, txHash)}`,
      })
      scheduleArchivePayment(entries[manualIndex], payer)
      return
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
    res.json({
      ok: true,
      duplicate: true,
      receiptId: paymentReceiptId(eventId, txHash),
      receiptUrl: `/r/${paymentReceiptId(eventId, txHash)}`,
    })
    if (duplicate) scheduleArchivePayment(duplicate, payer)
    return
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
  res.json({
    ok: true,
    receiptId: paymentReceiptId(eventId, txHash),
    receiptUrl: `/r/${paymentReceiptId(eventId, txHash)}`,
  })
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
