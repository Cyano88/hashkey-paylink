import type { Request, Response } from 'express'
import crypto from 'crypto'
import { PublicKey } from '@solana/web3.js'

const CIRCLE_BASE_URL = (process.env.CIRCLE_BASE_URL ?? 'https://api.circle.com').replace(/\/+$/, '')
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY
const SOLANA_BLOCKCHAIN = process.env.CIRCLE_SOLANA_BLOCKCHAIN ?? 'SOL'

type CircleResponse<T = unknown> = {
  data?: T
  code?: number
  message?: string
  error?: string
}

function circleHeaders(userToken?: string) {
  if (!CIRCLE_API_KEY) throw new Error('CIRCLE_API_KEY not configured')
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${CIRCLE_API_KEY}`,
    'X-Request-Id': crypto.randomUUID(),
    ...(userToken ? { 'X-User-Token': userToken } : {}),
  }
}

type CircleInit = {
  method?: string
  body?: string
  userToken?: string
  headers?: Record<string, string>
}

async function circleJson<T extends Record<string, unknown> = Record<string, unknown>>(path: string, init: CircleInit = {}) {
  const res = await fetch(`${CIRCLE_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...circleHeaders(init.userToken),
      ...(init.headers ?? {}),
    },
  })
  const body = await res.json().catch(() => ({})) as CircleResponse<T>
  if (!res.ok) {
    const err = new Error(body.message ?? body.error ?? `Circle request failed: ${res.status}`)
    ;(err as Error & { status?: number; code?: number; body?: CircleResponse }).status = res.status
    ;(err as Error & { status?: number; code?: number; body?: CircleResponse }).code = body.code
    ;(err as Error & { status?: number; code?: number; body?: CircleResponse }).body = body
    throw err
  }
  return body.data as T
}

function circleError(res: Response, err: unknown) {
  const e = err as Error & { status?: number; code?: number; body?: CircleResponse }
  if (e.message === 'CIRCLE_API_KEY not configured') {
    return res.status(503).json({ ok: false, error: e.message })
  }
  return res.status(e.status ?? 500).json({
    ok: false,
    code: e.code ?? e.body?.code,
    error: e.body?.message ?? e.body?.error ?? e.message ?? 'Circle request failed',
  })
}

function isSolanaAddress(address: string) {
  try {
    const key = new PublicKey(address)
    return key.toBase58() === address
  } catch {
    return false
  }
}

function solanaWallet(wallets: Array<{ id: string; address: string; blockchain: string }>) {
  return wallets.find((wallet) =>
    (wallet.blockchain === SOLANA_BLOCKCHAIN || wallet.blockchain === 'SOL') &&
    isSolanaAddress(wallet.address),
  )
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const { action, ...params } = (req.body ?? {}) as Record<string, string>
  if (!action) return res.status(400).json({ ok: false, error: 'Missing action' })

  try {
    if (action === 'requestEmailOtp') {
      const { deviceId, email } = params
      if (!deviceId || !email) return res.status(400).json({ ok: false, error: 'Missing deviceId or email' })
      const data = await circleJson('/v1/w3s/users/email/token', {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), deviceId, email }),
      })
      return res.json({ ok: true, ...data })
    }

    if (action === 'initializeUser') {
      const { userToken } = params
      if (!userToken) return res.status(400).json({ ok: false, error: 'Missing userToken' })
      const data = await circleJson('/v1/w3s/user/initialize', {
        method: 'POST',
        userToken,
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          accountType: 'EOA',
          blockchains: [SOLANA_BLOCKCHAIN],
        }),
      })
      return res.json({ ok: true, ...data })
    }

    if (action === 'createWallet') {
      const { userToken } = params
      if (!userToken) return res.status(400).json({ ok: false, error: 'Missing userToken' })
      const data = await circleJson('/v1/w3s/user/wallets', {
        method: 'POST',
        userToken,
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          accountType: 'EOA',
          blockchains: [SOLANA_BLOCKCHAIN],
          metadata: [{ name: 'Hash PayLink Solana' }],
        }),
      })
      return res.json({ ok: true, ...data })
    }

    if (action === 'listWallets') {
      const { userToken } = params
      if (!userToken) return res.status(400).json({ ok: false, error: 'Missing userToken' })
      const data = await circleJson<{ wallets: Array<{ id: string; address: string; blockchain: string }> }>('/v1/w3s/wallets', {
        method: 'GET',
        userToken,
        headers: { accept: 'application/json' },
      })
      const wallet = solanaWallet(data.wallets ?? [])
      return res.json({ ok: true, wallets: data.wallets ?? [], wallet })
    }

    if (action === 'signPayment') {
      const { userToken, walletId, rawTransaction, memo } = params
      if (!userToken || !walletId || !rawTransaction) {
        return res.status(400).json({ ok: false, error: 'Missing userToken, walletId, or rawTransaction' })
      }
      const walletData = await circleJson<{ wallets: Array<{ id: string; address: string; blockchain: string }> }>('/v1/w3s/wallets', {
        method: 'GET',
        userToken,
        headers: { accept: 'application/json' },
      })
      const wallet = walletData.wallets?.find((item) => item.id === walletId)
      if (!wallet || !isSolanaAddress(wallet.address)) {
        return res.status(400).json({ ok: false, error: 'Circle did not return a valid Solana wallet address. Reconnect with email and try again.' })
      }
      const data = await circleJson('/v1/w3s/user/sign/transaction', {
        method: 'POST',
        userToken,
        body: JSON.stringify({
          walletId,
          rawTransaction,
          memo: memo || 'Hash PayLink USDC payment on Solana',
        }),
      })
      return res.json({ ok: true, ...data })
    }

    return res.status(400).json({ ok: false, error: `Unknown action: ${action}` })
  } catch (err) {
    return circleError(res, err)
  }
}
