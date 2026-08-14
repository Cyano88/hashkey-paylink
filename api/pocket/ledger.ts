import type { Request, Response } from 'express'
import { verifiedPrivyUser } from '../privy-circle-link.js'
import { listPocketMoneyLedgerEvents } from './money-ledger.js'

export default async function pocketLedgerHandler(req: Request, res: Response) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: { message: 'Method not allowed.' } })
  try {
    const identity = await verifiedPrivyUser(req)
    const limit = Number(req.query.limit ?? 50)
    const page = await listPocketMoneyLedgerEvents({ ownerId: identity.userId, cursor: String(req.query.cursor ?? ''), limit: Number.isFinite(limit) ? limit : 50 })
    return res.json({ ok: true, ...page })
  } catch (reason) {
    const error = reason as Error & { status?: number }
    return res.status(error.status && error.status < 500 ? error.status : 503).json({ ok: false, error: { message: error.message || 'Pocket ledger is temporarily unavailable.' } })
  }
}
