import type { Request, Response } from 'express'
import { archivePayment }          from './og-storage.js'
import { appendAgentActivity, normalizeActivitySlug } from './agent-activity.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname }                 from 'path'

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
  settlementType?: string
  amountNgn?:  string
  ogRootHash?: string
  ogTxHash?:   string
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

function persistRegistry(): void {
  if (!DATA_FILE) return
  try {
    const dir = dirname(DATA_FILE)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(DATA_FILE, JSON.stringify(Object.fromEntries(registry)), 'utf8')
  } catch (e) {
    console.warn('[registry] failed to persist to disk:', e)
  }
}

const registry = loadRegistry()

export function registerEventPayment(req: Request, res: Response): void {
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

  const entries = registry.get(eventId) ?? []
  // Deduplicate by txHash (for real on-chain txs) OR by payer+eventId for manual detections
  const isDupe = txHash.startsWith('manual_')
    ? entries.some(e => e.payer.toLowerCase() === payer.toLowerCase())
    : entries.some(e => e.txHash.toLowerCase() === txHash.toLowerCase())
  if (isDupe) {
    res.json({ ok: true, duplicate: true })
    return
  }
  const entry: PaymentEntry = { eventId, txHash, chain, payer, memo, amount, ts: Date.now() }
  if (requestedAmount) entry.requestedAmount = requestedAmount
  if (source) entry.source = source
  if (merchantId) entry.merchantId = merchantId
  if (settlementType) entry.settlementType = settlementType
  if (amountNgn) entry.amountNgn = amountNgn
  entries.push(entry)
  registry.set(eventId, entries)
  persistRegistry()
  res.json({ ok: true })
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
  archivePayment({
    eventId,
    txHash,
    chain: entry.chain,
    payer: entry.memo || payer,
    amount: entry.amount,
    ts: entry.ts,
    source: entry.source,
    merchantId: entry.merchantId,
    settlementType: entry.settlementType,
    amountNgn: entry.amountNgn,
    metadata: entry.source === 'ngpos'
      ? {
          type: 'nigerian_retail_pos_payment',
          merchantId: entry.merchantId,
          amountNgn: entry.amountNgn,
          amountUsdc: entry.amount,
          settlementType: entry.settlementType,
          customerWallet: payer,
        }
      : undefined,
  })
    .then(result => {
      if (!result) return
      const list = registry.get(eventId)
      if (!list) return
      const idx = list.findIndex(e => e.txHash === txHash)
      if (idx !== -1) {
        list[idx].ogRootHash = result.rootHash
        list[idx].ogTxHash   = result.ogTxHash
        persistRegistry()
      }
    })
    .catch(() => {})
}

export function listEventPayments(req: Request, res: Response): void {
  let id: string
  try {
    id = cleanString(req.query.id, 'id', MAX_EVENT_ID_LENGTH)
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'Invalid request' })
    return
  }
  const entries = registry.get(id) ?? []
  res.json({ ok: true, payments: [...entries].sort((a, b) => b.ts - a.ts) })
}
