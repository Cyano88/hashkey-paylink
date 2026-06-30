import type { Request, Response } from 'express'

const POLYMARKET_BUILDER_CODE = process.env.POLYMARKET_BUILDER_CODE?.trim()

function cleanText(value: unknown, max = 280) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function isValidBuilderCode(value: string | undefined) {
  return Boolean(value && /^0x[a-fA-F0-9]{64}$/.test(value))
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  if (!isValidBuilderCode(POLYMARKET_BUILDER_CODE)) {
    return res.status(503).json({
      ok: false,
      ready: false,
      error: 'Polymarket builder code is not configured.',
    })
  }

  const marketUrl = cleanText(req.body?.marketUrl, 320)
  const marketTitle = cleanText(req.body?.marketTitle, 180)
  const outcome = cleanText(req.body?.outcome, 32)
  const side = cleanText(req.body?.side || 'buy', 12).toLowerCase()
  const amount = cleanText(req.body?.amount, 32)
  const signer = cleanText(req.body?.signer, 80)

  if (!marketUrl.startsWith('https://polymarket.com/')) {
    return res.status(400).json({ ok: false, ready: false, error: 'A verified Polymarket market URL is required.' })
  }
  if (!marketTitle || !outcome || side !== 'buy' || !/^\d+(?:\.\d{1,6})?$/.test(amount) || Number(amount) <= 0 || !/^0x[a-fA-F0-9]{40}$/.test(signer)) {
    return res.status(400).json({ ok: false, ready: false, error: 'Trade ticket is incomplete.' })
  }

  return res.status(501).json({
    ok: false,
    ready: false,
    builderCodeConfigured: true,
    error: 'Polymarket CLOB order signing is not enabled yet.',
  })
}
