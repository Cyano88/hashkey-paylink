/**
 * Same-origin proxy for Coinbase/CDP Base Paymaster.
 *
 * The browser passes /api/base-paymaster to wallet_sendCalls as the
 * paymasterService.url. This keeps the real CDP paymaster URL server-side.
 */

import type { Request, Response } from 'express'

const PAYMASTER_URL =
  process.env.CDP_PAYMASTER_URL ??
  process.env.COINBASE_PAYMASTER_URL ??
  process.env.BASE_PAYMASTER_URL

export default async function handler(req: Request, res: Response) {
  if (req.method === 'GET') {
    return res.json({ ok: true, configured: !!PAYMASTER_URL })
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ ok: false, error: 'method not allowed' })
  }

  if (!PAYMASTER_URL) {
    return res.status(503).json({ ok: false, error: 'Base paymaster is not configured' })
  }

  try {
    const upstream = await fetch(PAYMASTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(20_000),
    })

    const text = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers.get('Content-Type') ?? 'application/json')
    return res.send(text)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(502).json({ ok: false, error: msg.slice(0, 160) })
  }
}
