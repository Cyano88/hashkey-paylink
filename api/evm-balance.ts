import type { Request, Response } from 'express'
import { readEvmRpc } from './evm-read.js'
import { createPublicClient, defineChain, http, encodeFunctionData } from 'viem'
import { base, baseSepolia, arbitrum, mainnet, polygon } from 'viem/chains'

const ERC20_BALANCE_OF_ABI = [{
  name: 'balanceOf',
  type: 'function' as const,
  stateMutability: 'view' as const,
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }],
}] as const

const arc = defineChain({
  id: 5042,
  name: 'Arc Mainnet',
  nativeCurrency: { decimals: 18, name: 'USD Coin', symbol: 'USDC' },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.arc.io'] },
    public: { http: ['https://rpc.mainnet.arc.io'] },
  },
  testnet: false,
})

const CHAIN_CONFIG = {
  ethereum: { chain: mainnet, label: 'Ethereum', tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, rpcEnv: 'PRIVATE_RPC_URL_ETHEREUM', fallbackRpc: 'https://ethereum-rpc.publicnode.com' },
  polygon: { chain: polygon, label: 'Polygon', tokenAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6, rpcEnv: 'PRIVATE_RPC_URL_POLYGON', fallbackRpc: 'https://polygon-bor-rpc.publicnode.com' },
  base: {
    chain: base,
    label: 'Base',
    tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    decimals: 6,
    rpcEnv: 'PRIVATE_RPC_URL',
    fallbackRpc: 'https://mainnet.base.org',
  },
  'base-sepolia': {
    chain: baseSepolia,
    label: 'Base Sepolia',
    tokenAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    decimals: 6,
    rpcEnv: 'PRIVATE_RPC_URL_BASE_SEPOLIA',
    fallbackRpc: 'https://sepolia.base.org',
  },
  arc: {
    chain: arc,
    label: 'Arc Mainnet',
    tokenAddress: '0x3600000000000000000000000000000000000000',
    decimals: 6,
    rpcEnv: 'PRIVATE_RPC_URL_ARC_MAINNET',
    fallbackRpc: 'https://rpc.mainnet.arc.io',
  },
  arbitrum: {
    chain: arbitrum,
    label: 'Arbitrum',
    tokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    decimals: 6,
    rpcEnv: 'PRIVATE_RPC_URL_ARB',
    fallbackRpc: 'https://arb1.arbitrum.io/rpc',
  },
} as const

type EvmBalanceChain = keyof typeof CHAIN_CONFIG

function isEvmBalanceChain(value: unknown): value is EvmBalanceChain {
  return value === 'ethereum' || value === 'polygon' || value === 'base' || value === 'base-sepolia' || value === 'arc' || value === 'arbitrum'
}

function isAddress(value: unknown): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value ?? '').trim())
}

function safeBalanceError(chainLabel: string) {
  return `${chainLabel} balance is temporarily unavailable. Try again in a moment.`
}

async function fetchEvmUsdcBalanceUnits(chainKey: EvmBalanceChain, address: `0x${string}`) {
  const config = CHAIN_CONFIG[chainKey]
  if (chainKey !== 'base-sepolia') {
    const result = await readEvmRpc(chainKey, 'eth_call', [{ to: config.tokenAddress, data: encodeFunctionData({ abi: ERC20_BALANCE_OF_ABI, functionName: 'balanceOf', args: [address] }) }, 'latest'])
    if (typeof result !== 'string' || !/^0x[\da-f]{64}$/i.test(result)) throw new Error('Invalid balance result.')
    return BigInt(result)
  }
  const rpcUrl = process.env[config.rpcEnv]?.trim() || config.fallbackRpc
  const client = createPublicClient({ chain: config.chain, transport: http(rpcUrl, { retryCount: 0, timeout: 10_000 }) })
  const raw = await client.readContract({
    address: config.tokenAddress as `0x${string}`,
    abi: ERC20_BALANCE_OF_ABI,
    functionName: 'balanceOf',
    args: [address],
  } as never)
  return raw as bigint
}

// Short-lived shared reads retain exact token units and never cache failures.
export function createEvmBalanceReader(read = fetchEvmUsdcBalanceUnits, now = Date.now) {
  const cache = new Map<string, { value: bigint; expires: number; observedAt: number }>()
  const pending = new Map<string, Promise<bigint>>()
  return async (chain: EvmBalanceChain, address: `0x${string}`, fresh = false) => {
    const key = chain + ':' + address.toLowerCase()
    const hit = cache.get(key)
    if (hit && hit.expires > now() && (!fresh || now() - hit.observedAt < 1_500)) return hit.value
    const flight = pending.get(key)
    if (flight) return flight
    if (pending.size >= 64) throw new Error('Balance reader is busy.')
    const work = Promise.resolve().then(() => read(chain, address)).then(value => {
      if (cache.size >= 512) cache.delete(cache.keys().next().value as string)
      cache.set(key, { value, expires: now() + 5_000, observedAt: now() })
      return value
    }).finally(() => pending.delete(key))
    pending.set(key, work)
    return work
  }
}
export const readEvmUsdcBalanceUnits = createEvmBalanceReader()
// Execution planning requires an exact fresh read, without the display cache/fallback.
export async function readFreshMigrationUsdcUnits(chain: EvmBalanceChain, address: `0x${string}`) {
  if (!isEvmBalanceChain(chain) || !isAddress(address)) throw new Error('Invalid migration balance request.')
  return fetchEvmUsdcBalanceUnits(chain, address)
}

export async function readFreshEvmUsdcBalance(chain: EvmBalanceChain, address: `0x${string}`) {
  return Number(await readEvmUsdcBalanceUnits(chain, address, true)) / 10 ** CHAIN_CONFIG[chain].decimals
}

export async function readEvmUsdcBalance(chain: EvmBalanceChain, address: `0x${string}`) {
  return Number(await readEvmUsdcBalanceUnits(chain, address)) / 10 ** CHAIN_CONFIG[chain].decimals
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const chainKey = String(req.body?.chain ?? '').trim().toLowerCase()
  const address = String(req.body?.address ?? '').trim()
  if (!isEvmBalanceChain(chainKey)) return res.status(400).json({ ok: false, error: 'Unsupported EVM balance chain' })
  if (!isAddress(address)) return res.status(400).json({ ok: false, error: 'Invalid wallet address' })

  const config = CHAIN_CONFIG[chainKey]

  try {
    const balance = await readEvmUsdcBalance(chainKey, address as `0x${string}`)
    return res.json({
      ok: true,
      chain: chainKey,
      label: config.label,
      balance: balance.toString(),
    })
  } catch (error) {
    console.error('[evm-balance] balance lookup failed', {
      chain: chainKey,
    })
    return res.status(502).json({ ok: false, error: safeBalanceError(config.label) })
  }
}
