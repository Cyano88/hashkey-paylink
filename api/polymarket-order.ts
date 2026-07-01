import type { Request, Response } from 'express'

function cleanText(value: unknown, max = 280) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function envValue(key: string) {
  return process.env[key]?.trim()
}

function isValidBuilderCode(value: string | undefined) {
  return Boolean(value && /^0x[a-fA-F0-9]{64}$/.test(value))
}

function builderCodePreview(value: string) {
  return `${value.slice(0, 8)}...${value.slice(-6)}`
}

function builderCredentialMode() {
  const signerUrl = envValue('POLYMARKET_BUILDER_SIGNER_URL')
  if (envValue('POLYMARKET_BUILDER_API_KEY') && envValue('POLYMARKET_BUILDER_SECRET') && envValue('POLYMARKET_BUILDER_PASSPHRASE')) return 'local'
  if (signerUrl?.startsWith('https://') || signerUrl?.startsWith('http://')) return 'remote'
  return 'unconfigured'
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const builderCode = envValue('POLYMARKET_BUILDER_CODE')
  if (!isValidBuilderCode(builderCode)) {
    return res.status(503).json({
      ok: false,
      ready: false,
      error: 'Polymarket builder code is not configured.',
    })
  }

  const marketUrl = cleanText(req.body?.marketUrl, 320)
  const marketTitle = cleanText(req.body?.marketTitle, 180)
  const outcome = cleanText(req.body?.outcome, 32)
  const tokenId = cleanText(req.body?.tokenId, 96)
  const side = cleanText(req.body?.side || 'buy', 12).toLowerCase()
  const amount = cleanText(req.body?.amount, 32)
  const signer = cleanText(req.body?.signer, 80)
  const action = cleanText(req.body?.action || 'prepare', 16).toLowerCase()
  const tickSize = cleanText(req.body?.tickSize, 16)
  const minSize = cleanText(req.body?.minSize, 16)
  const negRisk = req.body?.negRisk === true || cleanText(req.body?.negRisk, 8).toLowerCase() === 'true'
  const worldCup = req.body?.worldCup === true || cleanText(req.body?.worldCup, 8).toLowerCase() === 'true'

  if (!marketUrl.startsWith('https://polymarket.com/')) {
    return res.status(400).json({ ok: false, ready: false, error: 'A verified Polymarket market URL is required.' })
  }
  if (!marketTitle || !outcome || (side !== 'buy' && side !== 'sell') || !/^\d+(?:\.\d{1,6})?$/.test(amount) || Number(amount) <= 0 || !/^0x[a-fA-F0-9]{40}$/.test(signer)) {
    return res.status(400).json({ ok: false, ready: false, error: 'Trade ticket is incomplete.' })
  }
  if (!/^\d+$/.test(tokenId)) {
    return res.status(400).json({ ok: false, ready: false, error: 'A Polymarket CLOB token ID is required before order signing can be prepared.' })
  }
  if (action !== 'prepare' && action !== 'sign') {
    return res.status(400).json({ ok: false, ready: false, error: 'Unsupported Polymarket order action.' })
  }

  const credentialMode = builderCredentialMode()
  const intent = {
    marketTitle,
    marketUrl,
    outcome,
    tokenId,
    side,
    amount,
    signer,
    attribution: 'builder-code-configured',
    source: worldCup ? 'world-cup-moneyline' : 'generic',
    signingMetadata: {
      tickSize: /^\d+(?:\.\d+)?$/.test(tickSize) ? Number(tickSize) : undefined,
      minSize: /^\d+(?:\.\d+)?$/.test(minSize) ? Number(minSize) : undefined,
      negRisk,
    },
  }

  if (action === 'sign') {
    if (process.env.POLYMARKET_ORDER_SIGNING_ENABLED !== '1') {
      return res.status(503).json({
        ok: false,
        ready: false,
        mode: 'sign-disabled',
        builderCodeConfigured: true,
        builderCode,
        builderCodePreview: builderCodePreview(builderCode as string),
        builderCredentialMode: credentialMode,
        intent,
        error: 'Polymarket order signing is disabled. Set POLYMARKET_ORDER_SIGNING_ENABLED=1 only after World Cup token metadata, allowance, balance, and signature handling are audited.',
      })
    }
    if (credentialMode === 'unconfigured') {
      return res.status(503).json({
        ok: false,
        ready: false,
        mode: 'sign-not-configured',
        builderCodeConfigured: true,
        builderCode,
        builderCodePreview: builderCodePreview(builderCode as string),
        builderCredentialMode: credentialMode,
        intent,
        error: 'Polymarket builder API credentials or a remote builder signer are required before creating attributed order signatures.',
      })
    }
    return res.status(501).json({
      ok: false,
      ready: false,
      mode: 'sign-not-implemented',
      builderCodeConfigured: true,
      builderCode,
      builderCodePreview: builderCodePreview(builderCode as string),
      builderCredentialMode: credentialMode,
      intent,
      error: 'Official Polymarket CLOB client is installed, but sign-only order creation is not wired yet. PolyDesk must fetch tickSize and negRisk metadata before creating a signed order.',
    })
  }

  return res.status(200).json({
    ok: true,
    ready: true,
    mode: 'prepare',
    builderCodeConfigured: true,
    builderCode,
    builderCodePreview: builderCodePreview(builderCode as string),
    builderCredentialMode: credentialMode,
    intent,
    nextRequirements: [
      'Fetch tickSize and negRisk for the selected CLOB token before signing.',
      'Create the signed order in the user browser with @polymarket/clob-client.',
      'Submit only the exact signed World Cup order body with a one-time builder-header signer.',
      'PolyDesk must not custody user funds, private keys, or reusable user CLOB secrets.',
    ],
  })
}
