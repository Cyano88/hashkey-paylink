import type { Request, Response } from 'express'
import { isAddress } from 'viem'
import { PublicKey } from '@solana/web3.js'

const POLYMARKET_BRIDGE_ORIGIN = 'https://bridge.polymarket.com'
const REQUEST_TIMEOUT_MS = 12_000
const POLYMARKET_BUILDER_CODE = process.env.POLYMARKET_BUILDER_CODE?.trim()

type BridgeNetwork = 'base' | 'arbitrum' | 'solana'
type BridgeAddressType = 'evm' | 'svm'

type DepositResponse = {
  address?: {
    evm?: string
    svm?: string
    btc?: string
    tron?: string
  }
  note?: string
}

type BridgeTransaction = {
  fromChainId?: string
  fromTokenAddress?: string
  fromAmountBaseUnit?: string
  toChainId?: string
  toTokenAddress?: string
  status?: string
  txHash?: string
  createdTimeMs?: number
}

function cleanText(value: unknown, max = 128) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function cleanNetwork(value: unknown): BridgeNetwork {
  if (value === 'arbitrum' || value === 'solana') return value
  return 'base'
}

function addressTypeFor(network: BridgeNetwork): BridgeAddressType {
  return network === 'solana' ? 'svm' : 'evm'
}

function minimumUsdcFor(network: BridgeNetwork) {
  // Polymarket lists Base, Arbitrum, and Solana bridge minimums at $2.
  return network === 'base' || network === 'arbitrum' || network === 'solana' ? 2 : 2
}

function isSolanaAddress(address: string) {
  try {
    const key = new PublicKey(address)
    return key.toBase58() === address
  } catch {
    return false
  }
}

function isValidDepositAddress(address: string, type: BridgeAddressType) {
  return type === 'evm' ? isAddress(address) : isSolanaAddress(address)
}

async function bridgeFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${POLYMARKET_BRIDGE_ORIGIN}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(POLYMARKET_BUILDER_CODE ? { 'X-Builder-Code': POLYMARKET_BUILDER_CODE } : {}),
        ...(init?.headers ?? {}),
      },
    })
    const text = await response.text()
    let data: unknown = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }
    if (!response.ok) {
      const message = typeof data === 'object' && data && 'error' in data
        ? String((data as { error?: unknown }).error)
        : text.slice(0, 160)
      throw new Error(message || `Polymarket bridge HTTP ${response.status}`)
    }
    return data as T
  } finally {
    clearTimeout(timeout)
  }
}

async function createDepositAddress(polymarketWallet: string, network: BridgeNetwork) {
  const data = await bridgeFetch<DepositResponse>('/deposit', {
    method: 'POST',
    body: JSON.stringify({ address: polymarketWallet }),
  })
  const addressType = addressTypeFor(network)
  const depositAddress = cleanText(data.address?.[addressType], 96)
  if (!isValidDepositAddress(depositAddress, addressType)) {
    throw new Error(`Polymarket bridge did not return a valid ${addressType.toUpperCase()} deposit address.`)
  }
  return {
    addressType,
    depositAddress,
    note: cleanText(data.note, 240),
  }
}

async function getDepositStatus(depositAddress: string) {
  const data = await bridgeFetch<{ transactions?: BridgeTransaction[] }>(`/status/${encodeURIComponent(depositAddress)}`, {
    method: 'GET',
  })
  const transactions = Array.isArray(data.transactions) ? data.transactions : []
  const latest = [...transactions].sort((a, b) => (b.createdTimeMs ?? 0) - (a.createdTimeMs ?? 0))[0] ?? null
  return { transactions, latest }
}

export default async function handler(req: Request, res: Response) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' })
    }

    const action = cleanText(req.body?.action || 'create', 24)
    if (action === 'status') {
      const depositAddress = cleanText(req.body?.depositAddress, 96)
      if (!isAddress(depositAddress) && !isSolanaAddress(depositAddress)) {
        return res.status(400).json({ ok: false, error: 'Invalid bridge deposit address.' })
      }
      const status = await getDepositStatus(depositAddress)
      return res.json({ ok: true, ...status })
    }

    const polymarketWallet = cleanText(req.body?.polymarketWallet ?? req.body?.wallet, 64)
    const network = cleanNetwork(req.body?.network)
    const minimumUsdc = minimumUsdcFor(network)

    if (!isAddress(polymarketWallet)) {
      return res.status(400).json({ ok: false, error: 'Enter a valid Polymarket wallet address.' })
    }

    const deposit = await createDepositAddress(polymarketWallet, network)
    return res.json({
      ok: true,
      network,
      polymarketWallet,
      minimumUsdc,
      ...deposit,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Polymarket bridge request failed'
    console.error('[polymarket-bridge] failed:', message)
    return res.status(502).json({ ok: false, error: message })
  }
}
