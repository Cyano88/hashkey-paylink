import type { Request, Response } from 'express'
import { createPublicClient, formatUnits, http, isAddress } from 'viem'
import { polygon } from 'viem/chains'
import { PublicKey } from '@solana/web3.js'

const POLYMARKET_BRIDGE_ORIGIN = 'https://bridge.polymarket.com'
const REQUEST_TIMEOUT_MS = 12_000
const POLYMARKET_BUILDER_CODE = process.env.POLYMARKET_BUILDER_CODE?.trim()
const POLYMARKET_RELAYER_URL = (process.env.POLYMARKET_RELAYER_URL ?? process.env.RELAYER_URL ?? '').trim()
const POLYMARKET_RPC_URL = (process.env.POLYMARKET_RPC_URL ?? process.env.POLYGON_RPC_URL ?? '').trim()
const POLYMARKET_PUSD = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB' as const
const PUSD_DECIMALS = 6

type BridgeNetwork = 'base' | 'arbitrum' | 'solana'
type BridgeAddressType = 'evm' | 'svm'

const WITHDRAW_DESTINATIONS: Record<BridgeNetwork, { chainId: string; tokenAddress: string; addressType: BridgeAddressType }> = {
  base: {
    chainId: '8453',
    tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    addressType: 'evm',
  },
  arbitrum: {
    chainId: '42161',
    tokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    addressType: 'evm',
  },
  solana: {
    chainId: '1151111081099710',
    tokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    addressType: 'svm',
  },
}

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
  // Polymarket's live deposit UI currently shows a $3 minimum for USDC deposits.
  return network === 'base' || network === 'arbitrum' || network === 'solana' ? 3 : 3
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

async function createWithdrawalAddress(polymarketWallet: string, network: BridgeNetwork, recipientAddr: string) {
  const destination = WITHDRAW_DESTINATIONS[network]
  if (!isValidDepositAddress(recipientAddr, destination.addressType)) {
    throw new Error(`Enter a valid ${network === 'solana' ? 'Solana' : 'EVM'} recipient address.`)
  }
  const data = await bridgeFetch<DepositResponse>('/withdraw', {
    method: 'POST',
    body: JSON.stringify({
      address: polymarketWallet,
      toChainId: destination.chainId,
      toTokenAddress: destination.tokenAddress,
      recipientAddr,
    }),
  })
  const bridgeAddress = cleanText(data.address?.evm, 96)
  if (!isValidDepositAddress(bridgeAddress, 'evm')) {
    throw new Error('Polymarket bridge did not return a valid Polygon withdrawal bridge address.')
  }
  return {
    addressType: 'evm' as const,
    bridgeAddress,
    destinationAddressType: destination.addressType,
    toChainId: destination.chainId,
    toTokenAddress: destination.tokenAddress,
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

const erc20BalanceAbi = [{
  type: 'function',
  name: 'balanceOf',
  stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }],
}] as const

const erc20AllowanceAbi = [{
  type: 'function',
  name: 'allowance',
  stateMutability: 'view',
  inputs: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
  ],
  outputs: [{ name: '', type: 'uint256' }],
}] as const

function polygonClient() {
  return createPublicClient({
    chain: polygon,
    transport: http(POLYMARKET_RPC_URL || undefined),
  })
}

async function getPusdBalance(polymarketWallet: string) {
  const client = polygonClient()
  const raw = await client.readContract({
    address: POLYMARKET_PUSD,
    abi: erc20BalanceAbi,
    functionName: 'balanceOf',
    args: [polymarketWallet as `0x${string}`],
  })
  return {
    tokenAddress: POLYMARKET_PUSD,
    decimals: PUSD_DECIMALS,
    raw: raw.toString(),
    formatted: formatUnits(raw, PUSD_DECIMALS),
  }
}

async function getPusdAllowance(polymarketWallet: string, spender: string) {
  const client = polygonClient()
  const [balanceRaw, allowanceRaw] = await Promise.all([
    client.readContract({
      address: POLYMARKET_PUSD,
      abi: erc20BalanceAbi,
      functionName: 'balanceOf',
      args: [polymarketWallet as `0x${string}`],
    }),
    client.readContract({
      address: POLYMARKET_PUSD,
      abi: erc20AllowanceAbi,
      functionName: 'allowance',
      args: [polymarketWallet as `0x${string}`, spender as `0x${string}`],
    }),
  ])
  return {
    tokenAddress: POLYMARKET_PUSD,
    decimals: PUSD_DECIMALS,
    balance: {
      raw: balanceRaw.toString(),
      formatted: formatUnits(balanceRaw, PUSD_DECIMALS),
    },
    allowance: {
      spender,
      raw: allowanceRaw.toString(),
      formatted: formatUnits(allowanceRaw, PUSD_DECIMALS),
    },
  }
}

export default async function handler(req: Request, res: Response) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' })
    }

    const action = cleanText(req.body?.action || 'create', 24)
    if (action === 'config') {
      return res.json({
        ok: true,
        chainId: 137,
        relayerReady: Boolean(POLYMARKET_RELAYER_URL),
        relayerUrl: POLYMARKET_RELAYER_URL || null,
        pusdTokenAddress: POLYMARKET_PUSD,
        pusdDecimals: PUSD_DECIMALS,
      })
    }
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

    if (action === 'balance') {
      const balance = await getPusdBalance(polymarketWallet)
      return res.json({ ok: true, polymarketWallet, balance })
    }

    if (action === 'allowance') {
      const spender = cleanText(req.body?.spender, 64)
      if (!isAddress(spender)) {
        return res.status(400).json({ ok: false, error: 'Enter a valid spender address.' })
      }
      const allowance = await getPusdAllowance(polymarketWallet, spender)
      return res.json({ ok: true, polymarketWallet, ...allowance })
    }

    if (action === 'withdraw') {
      const recipientAddr = cleanText(req.body?.recipientAddr ?? req.body?.recipient, 96)
      const withdrawal = await createWithdrawalAddress(polymarketWallet, network, recipientAddr)
      const balance = await getPusdBalance(polymarketWallet).catch(() => null)
      return res.json({
        ok: true,
        network,
        polymarketWallet,
        recipientAddr,
        sourceTokenAddress: POLYMARKET_PUSD,
        sourceTokenSymbol: 'pUSD',
        sourceTokenDecimals: PUSD_DECIMALS,
        balance,
        relayerReady: Boolean(POLYMARKET_RELAYER_URL),
        relayerUrl: POLYMARKET_RELAYER_URL || null,
        ...withdrawal,
      })
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
