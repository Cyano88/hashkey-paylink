import type { Request, Response } from 'express'
import { createPublicClient, defineChain, http } from 'viem'
import { base, baseSepolia, arbitrum } from 'viem/chains'

const ERC20_BALANCE_OF_ABI = [{
  name: 'balanceOf',
  type: 'function' as const,
  stateMutability: 'view' as const,
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }],
}] as const

const arc = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { decimals: 18, name: 'USD Coin', symbol: 'USDC' },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network'] },
    public: { http: ['https://rpc.testnet.arc.network'] },
  },
  testnet: true,
})

const CHAIN_CONFIG = {
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
    label: 'Arc Testnet',
    tokenAddress: '0x3600000000000000000000000000000000000000',
    decimals: 6,
    rpcEnv: 'PRIVATE_RPC_URL_ARC',
    fallbackRpc: 'https://rpc.testnet.arc.network',
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
  return value === 'base' || value === 'base-sepolia' || value === 'arc' || value === 'arbitrum'
}

function isAddress(value: unknown): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value ?? '').trim())
}

function safeBalanceError(chainLabel: string) {
  return `${chainLabel} balance is temporarily unavailable. Try again in a moment.`
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const chainKey = String(req.body?.chain ?? '').trim().toLowerCase()
  const address = String(req.body?.address ?? '').trim()
  if (!isEvmBalanceChain(chainKey)) return res.status(400).json({ ok: false, error: 'Unsupported EVM balance chain' })
  if (!isAddress(address)) return res.status(400).json({ ok: false, error: 'Invalid wallet address' })

  const config = CHAIN_CONFIG[chainKey]
  const rpcUrl = process.env[config.rpcEnv]?.trim() || config.fallbackRpc

  try {
    const client = createPublicClient({ chain: config.chain, transport: http(rpcUrl) })
    const raw = await client.readContract({
      address: config.tokenAddress as `0x${string}`,
      abi: ERC20_BALANCE_OF_ABI,
      functionName: 'balanceOf',
      args: [address],
    })
    return res.json({
      ok: true,
      chain: chainKey,
      label: config.label,
      balance: (Number(raw) / 10 ** config.decimals).toString(),
    })
  } catch (error) {
    console.error('[evm-balance] balance lookup failed', {
      chain: chainKey,
      message: error instanceof Error ? error.message.slice(0, 220) : 'Unknown balance error',
    })
    return res.status(502).json({ ok: false, error: safeBalanceError(config.label) })
  }
}
