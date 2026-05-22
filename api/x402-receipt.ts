import type { Request, Response } from 'express'
import { findAgentActivity } from './agent-activity.js'

const CIRCLE_GATEWAY_API_BASE = (process.env.CIRCLE_GATEWAY_API_BASE ?? 'https://api.circle.com').replace(/\/+$/, '')
const CIRCLE_API_KEY = String(
  process.env.CIRCLE_X402_RECEIPT_API_KEY
  ?? process.env.CIRCLE_GATEWAY_API_KEY
  ?? process.env.CIRCLE_API_KEY
  ?? '',
).trim()

async function verifyCircleTransfer(transaction: string) {
  if (!transaction) return { ok: false, status: 'missing_transaction', error: 'No Circle transaction reference is stored on this receipt.' }
  const response = await fetch(`${CIRCLE_GATEWAY_API_BASE}/gateway/v1/x402/transfers/${encodeURIComponent(transaction)}`, {
    headers: {
      Accept: 'application/json',
      ...(CIRCLE_API_KEY ? { Authorization: `Bearer ${CIRCLE_API_KEY}` } : {}),
    },
    signal: AbortSignal.timeout(12_000),
  })
  const body = await response.json().catch(() => undefined)
  if (!response.ok) {
    return {
      ok: false,
      status: 'circle_lookup_failed',
      httpStatus: response.status,
      error: body?.message ?? body?.error ?? 'Circle x402 transfer lookup failed.',
      body,
    }
  }
  return { ok: true, status: 'verified', transfer: body }
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  const id = String(req.query.id ?? req.query.activityId ?? '').trim()
  if (!id) return res.status(400).json({ ok: false, error: 'Missing receipt id.' })

  try {
    const activity = await findAgentActivity(id)
    if (!activity?.proof) return res.status(404).json({ ok: false, error: 'x402 receipt not found.' })
    const shouldVerify = String(req.query.verify ?? '') === '1'
    const circle = shouldVerify
      ? await verifyCircleTransfer(activity.proof.transaction ?? '')
      : undefined
    return res.json({
      ok: true,
      receipt: {
        type: 'circle_gateway_x402_receipt',
        activityId: activity.id,
        agentSlug: activity.agentSlug,
        title: activity.title,
        amount: activity.amount ? `${activity.direction === 'out' ? '-' : activity.direction === 'in' ? '+' : ''}${activity.amount} ${activity.asset ?? 'USDC'}` : undefined,
        detail: activity.detail,
        createdAt: activity.createdAt,
        proof: activity.proof,
      },
      circle,
    })
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Receipt lookup failed.',
    })
  }
}
