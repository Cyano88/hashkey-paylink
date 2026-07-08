import type { Request, Response } from 'express'
import { BuilderConfig } from '@polymarket/builder-signing-sdk'

function cleanText(value: unknown, max = 280) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function envValue(key: string) {
  return process.env[key]?.trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isAddress(value: unknown) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)
}

function isHex(value: unknown) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]*$/.test(value)
}

function builderConfig() {
  const key = envValue('POLYMARKET_BUILDER_API_KEY')
  const secret = envValue('POLYMARKET_BUILDER_SECRET')
  const passphrase = envValue('POLYMARKET_BUILDER_PASSPHRASE') ?? envValue('POLYMARKET_BUILDER_PASS_PHRASE')
  if (!key || !secret || !passphrase) return null
  return new BuilderConfig({
    localBuilderCreds: { key, secret, passphrase },
  })
}

function isDepositWalletSubmitBody(body: string) {
  if (!body || body.length > 80_000) return false
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return false
  }
  if (!isRecord(parsed)) return false
  if (parsed.type !== 'WALLET') return false
  if (!isAddress(parsed.from) || !isAddress(parsed.to)) return false
  if (typeof parsed.nonce !== 'string' || !/^\d+$/.test(parsed.nonce)) return false
  if (typeof parsed.signature !== 'string' || !/^0x[a-fA-F0-9]{130,}$/.test(parsed.signature)) return false
  const params = parsed.depositWalletParams
  if (!isRecord(params) || !isAddress(params.depositWallet)) return false
  if (typeof params.deadline !== 'string' || !/^\d+$/.test(params.deadline)) return false
  const deadline = Number(params.deadline)
  const now = Math.floor(Date.now() / 1000)
  if (!Number.isFinite(deadline) || deadline < now - 60 || deadline > now + 1800) return false
  if (!Array.isArray(params.calls) || params.calls.length < 1 || params.calls.length > 8) return false
  return params.calls.every((call) => {
    if (!isRecord(call)) return false
    return isAddress(call.target)
      && typeof call.value === 'string'
      && /^\d+$/.test(call.value)
      && isHex(call.data)
      && call.data.length <= 20_000
  })
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const method = cleanText(req.body?.method, 12).toUpperCase()
  const path = cleanText(req.body?.path, 32)
  const body = typeof req.body?.body === 'string' ? req.body.body : ''
  const timestamp = typeof req.body?.timestamp === 'number' ? req.body.timestamp : undefined

  if (method !== 'POST' || path !== '/submit' || !isDepositWalletSubmitBody(body)) {
    return res.status(400).json({ ok: false, error: 'Relayer builder signer only supports deposit-wallet submit payloads.' })
  }

  const config = builderConfig()
  if (!config) return res.status(503).json({ ok: false, error: 'Polymarket builder credentials are not configured.' })

  const headers = await config.generateBuilderHeaders(method, path, body, timestamp)
  if (!headers) return res.status(503).json({ ok: false, error: 'Could not generate Polymarket relayer builder headers.' })
  return res.status(200).json(headers)
}
