import type { Request, Response } from 'express'
import { createBuilderSession } from './polymarket-builder-session.js'

type SignedOrderRecord = Record<string, unknown>

function cleanText(value: unknown, max = 280) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function envValue(key: string) {
  return process.env[key]?.trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
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

function requiredString(order: SignedOrderRecord, key: string) {
  return typeof order[key] === 'string' && (order[key] as string).trim().length > 0
}

function validOrderSignature(value: unknown) {
  const signature = String(value ?? '')
  // EOA/proxy signatures are 65 bytes (130 hex chars after 0x). Direct
  // POLY_1271 contract-wallet signatures are ERC-7739 wrapped and longer.
  return /^0x[a-fA-F0-9]{130,}$/.test(signature) && signature.length % 2 === 0
}

function signedOrderValidationError(order: unknown, tokenId: string, signer: string) {
  if (!isRecord(order)) return 'Signed order is not an object.'
  const isV2Order = 'timestamp' in order && 'metadata' in order && 'builder' in order
  const required = isV2Order
    ? [
        'salt',
        'maker',
        'signer',
        'tokenId',
        'makerAmount',
        'takerAmount',
        'timestamp',
        'expiration',
        'metadata',
        'builder',
        'signature',
      ]
    : [
        'salt',
        'maker',
        'signer',
        'taker',
        'tokenId',
        'makerAmount',
        'takerAmount',
        'expiration',
        'nonce',
        'feeRateBps',
        'signature',
      ]
  const missing = required.filter(key => !requiredString(order, key))
  if (missing.length) return `Signed order is missing ${missing.join(', ')}.`
  if (String(order.tokenId) !== tokenId) return 'Signed order token does not match the selected market token.'
  if (String(order.signer).toLowerCase() !== signer.toLowerCase()) {
    return `Signed order signer ${cleanText(order.signer, 80)} does not match connected owner signer ${signer}.`
  }
  if (!validOrderSignature(order.signature)) {
    return `Signed order signature has unsupported shape: length ${String(order.signature ?? '').length}, signatureType ${cleanText(order.signatureType, 16) || 'unknown'}.`
  }
  return ''
}

function validOrderPayload(value: unknown, signedOrder: unknown, orderType: string) {
  if (!isRecord(value) || !isRecord(signedOrder)) return false
  if (value.orderType !== orderType) return false
  if (value.deferExec !== false) return false
  if (!isRecord(value.order)) return false
  const order = value.order
  return (
    String(order.tokenId) === String(signedOrder.tokenId) &&
    String(order.signer).toLowerCase() === String(signedOrder.signer).toLowerCase() &&
    String(order.signature) === String(signedOrder.signature) &&
    String(order.signatureType) === String(signedOrder.signatureType)
  )
}

function isAllowedSourceMarket(source: string, marketUrl: string) {
  if (source === 'world-cup-moneyline') return marketUrl.startsWith('https://polymarket.com/sports/world-cup/')
  if (source === 'portfolio-position-sell') return marketUrl.startsWith('https://polymarket.com/')
  return false
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const builderCode = envValue('POLYMARKET_BUILDER_CODE')
  if (!isValidBuilderCode(builderCode)) {
    return res.status(503).json({ ok: false, ready: false, error: 'Polymarket builder code is not configured.' })
  }

  const marketUrl = cleanText(req.body?.marketUrl, 320)
  const marketTitle = cleanText(req.body?.marketTitle, 180)
  const outcome = cleanText(req.body?.outcome, 48)
  const tokenId = cleanText(req.body?.tokenId, 96)
  const signer = cleanText(req.body?.signer, 80)
  const orderType = cleanText(req.body?.orderType || 'FOK', 12).toUpperCase()
  const source = cleanText(req.body?.source, 40)
  const signedOrder = req.body?.order
  const orderPayload = req.body?.orderPayload

  if (!isAllowedSourceMarket(source, marketUrl)) {
    return res.status(400).json({ ok: false, ready: false, error: 'This Polymarket order source is not allowed.' })
  }
  if (!marketTitle || !outcome || !/^\d+$/.test(tokenId) || !/^0x[a-fA-F0-9]{40}$/.test(signer)) {
    return res.status(400).json({ ok: false, ready: false, error: 'World Cup signed order metadata is incomplete.' })
  }
  if (orderType !== 'FOK' && orderType !== 'FAK' && orderType !== 'GTC' && orderType !== 'GTD') {
    return res.status(400).json({ ok: false, ready: false, error: 'Unsupported Polymarket order type.' })
  }
  const signedOrderError = signedOrderValidationError(signedOrder, tokenId, signer)
  if (signedOrderError) {
    return res.status(400).json({ ok: false, ready: false, error: signedOrderError })
  }
  if (!validOrderPayload(orderPayload, signedOrder, orderType)) {
    return res.status(400).json({ ok: false, ready: false, error: 'Polymarket order payload is missing or does not match the signed order.' })
  }
  const credentialMode = builderCredentialMode()
  const orderBody = JSON.stringify(orderPayload)
  const session = credentialMode !== 'unconfigured' ? createBuilderSession(orderBody) : null
  return res.status(200).json({
    ok: true,
    ready: true,
    mode: 'builder-handoff',
    clobHost: 'https://clob.polymarket.com',
    clobPath: '/order',
    httpMethod: 'POST',
    orderType,
    deferExec: false,
    postOnly: false,
    builderCodeConfigured: true,
    builderCode,
    builderCodePreview: builderCodePreview(builderCode as string),
    builderCredentialMode: credentialMode,
    submittedByPolyDesk: false,
    submittedByUserBrowser: true,
    remoteBuilderSigner: session ? {
      url: `/api/polymarket-builder-signer?id=${session.id}`,
      token: session.token,
      expiresAt: new Date(session.expiresAt).toISOString(),
    } : null,
    handoff: {
      source,
      marketTitle,
      marketUrl,
      outcome,
      tokenId,
      signer,
      orderType,
      order: signedOrder,
      orderPayload,
    },
    submissionRequirements: [
      'Submit this exact signed order payload to Polymarket CLOB /order from the user browser after wallet signing.',
      'Use the one-time remote builder signer when present so Polymarket can attribute PolyDesk builder volume through builder headers.',
      'Do not alter the signed order fields after user signature.',
      'PolyDesk does not custody user funds, private keys, or reusable user CLOB secrets.',
    ],
  })
}
