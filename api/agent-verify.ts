/** Legacy archive-event lookup. Never use a payer label as authentication. */
import type { Request, Response } from 'express'
import { lookupLegacyArchive } from './legacy-archive-lookup.js'
const MAX_EVENT_ID_LENGTH = 128
const MAX_PAYER_LENGTH = 128
function normalizeBoundedString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`)
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required`)
  if (normalized.length > maxLength) throw new Error(`${field} is too long`)
  return normalized
}

export default async function handler(req: Request, res: Response) {
  let eventId: string
  let payer: string

  try {
    eventId = normalizeBoundedString(req.query.eventId ?? req.body?.eventId, 'eventId', MAX_EVENT_ID_LENGTH)
    payer = normalizeBoundedString(req.query.payer ?? req.body?.payer, 'payer', MAX_PAYER_LENGTH)
  } catch (err) {
    return res.status(400).json({
      verified: false,
      error: err instanceof Error ? err.message : 'Invalid request',
    })
  }

  try {
    const result = await lookupLegacyArchive(eventId, payer)

    if (!result) {
      return res.status(402).json({
        verified: false,
        error:    'No verified payment found for this payer on 0G Storage',
        hint:     'Payment may still be archiving (~30–60s after confirmation)',
      })
    }

    return res.json({ verified: true, ...result, verificationScope: 'archive_event_only', settlementVerified: false, payloadVerified: false })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[agent-verify] archive lookup failed')
    const timedOut = /timed out/i.test(msg)
    return res.status(msg === 'Archive lookup busy' ? 503 : timedOut ? 504 : 500).json({
      verified: false,
      error: timedOut ? 'Verification is still syncing. Try again shortly.' : 'Verification service unavailable',
    })
  }
}
