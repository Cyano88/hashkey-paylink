import type { Request, Response } from 'express'

type PaymentEntry = {
  eventId: string
  txHash:  string
  chain:   string
  payer:   string
  memo:    string
  amount:  string
  ts:      number
}

const registry = new Map<string, PaymentEntry[]>()

export function registerEventPayment(req: Request, res: Response): void {
  const { eventId, txHash, chain, payer, memo, amount } = req.body as Partial<PaymentEntry>
  if (!eventId || !txHash || !payer || !memo) {
    res.status(400).json({ ok: false, error: 'Missing required fields' })
    return
  }
  const entries = registry.get(eventId) ?? []
  if (entries.some(e => e.txHash.toLowerCase() === txHash.toLowerCase())) {
    res.json({ ok: true, duplicate: true })
    return
  }
  entries.push({ eventId, txHash, chain: chain ?? '', payer, memo, amount: amount ?? '', ts: Date.now() })
  registry.set(eventId, entries)
  res.json({ ok: true })
}

export function listEventPayments(req: Request, res: Response): void {
  const id = req.query.id as string
  if (!id) { res.status(400).json({ ok: false, error: 'Missing id' }); return }
  const entries = registry.get(id) ?? []
  res.json({ ok: true, payments: [...entries].sort((a, b) => b.ts - a.ts) })
}
