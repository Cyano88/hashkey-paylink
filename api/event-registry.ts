import type { Request, Response } from 'express'
import { archivePayment }          from './og-storage.js'

type PaymentEntry = {
  eventId:     string
  txHash:      string
  chain:       string
  payer:       string
  memo:        string
  amount:      string
  ts:          number
  ogRootHash?: string  // 0G Storage content address (populated after archive)
  ogTxHash?:   string  // PayLinkArchive on-chain tx hash on 0G mainnet
}

const registry = new Map<string, PaymentEntry[]>()

export function registerEventPayment(req: Request, res: Response): void {
  const { eventId, txHash, chain, payer, memo, amount } = req.body as Partial<PaymentEntry>
  if (!eventId || !txHash || !memo) {
    res.status(400).json({ ok: false, error: 'Missing required fields' })
    return
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
  const entry: PaymentEntry = { eventId, txHash, chain: chain ?? '', payer, memo, amount: amount ?? '', ts: Date.now() }
  entries.push(entry)
  registry.set(eventId, entries)
  res.json({ ok: true })

  // Fire-and-forget archive to 0G decentralized storage — non-blocking.
  // When complete, patch the entry in-place so the dashboard can show the badge.
  // Use the human-readable name (memo) as payer in the 0G archive so
  // agent-verify can match by name, not wallet address.
  archivePayment({ eventId, txHash, chain: entry.chain, payer: entry.memo || payer, amount: entry.amount, ts: entry.ts })
    .then(result => {
      if (!result) return
      const list = registry.get(eventId)
      if (!list) return
      const idx = list.findIndex(e => e.txHash === txHash)
      if (idx !== -1) {
        list[idx].ogRootHash = result.rootHash
        list[idx].ogTxHash   = result.ogTxHash
      }
    })
    .catch(() => {})
}

export function listEventPayments(req: Request, res: Response): void {
  const id = req.query.id as string
  if (!id) { res.status(400).json({ ok: false, error: 'Missing id' }); return }
  const entries = registry.get(id) ?? []
  res.json({ ok: true, payments: [...entries].sort((a, b) => b.ts - a.ts) })
}
