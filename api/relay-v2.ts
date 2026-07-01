/**
 * /api/relay-v2
 *
 * Master relayer endpoint for the PayLinkFactoryV2 Direct Send flow.
 * Active networks: Base, Arc, and Arbitrum native USDC.
 */

import type { Request, Response } from 'express'
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  isAddress,
  parseAbi,
} from 'viem'
import { arbitrum as arbitrumChainDef, base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'

const arcChain = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { decimals: 18, name: 'USD Coin', symbol: 'USDC' },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } },
})

const RELAY_ABI = parseAbi([
  'function relay(bytes32 linkId, address recipient, uint256 gasReimbUsdc) returns (uint256)',
  'function getVaultAddress(bytes32 linkId, address recipient) view returns (address)',
])

const ERC20_BALANCE_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
])

const BASE_BUILDER_CODE = '0x62635f3871746237746e79' as `0x${string}`
const TOKEN_BY_CHAIN = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  arc: '0x3600000000000000000000000000000000000000',
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
} as const

type RelayChain = keyof typeof TOKEN_BY_CHAIN

const MAX_REIMB_USDC = 500_000n
const ESTIMATED_GAS = 300_000n
const FALLBACK_ETH_USD = 3_000n

async function getEthPriceUsd(): Promise<bigint> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
      { signal: AbortSignal.timeout(3_000) },
    )
    const data = await res.json() as { ethereum?: { usd?: number } }
    const price = data?.ethereum?.usd
    return price && price > 0 ? BigInt(Math.round(price)) : FALLBACK_ETH_USD
  } catch {
    return FALLBACK_ETH_USD
  }
}

async function calcGasReimbUsdc(
  publicClient: ReturnType<typeof createPublicClient>,
  chainKey: RelayChain,
): Promise<bigint> {
  const gasPrice = await publicClient.getGasPrice()
  if (chainKey === 'arc') {
    const raw = (gasPrice * ESTIMATED_GAS) / 10n ** 12n
    return raw > MAX_REIMB_USDC ? MAX_REIMB_USDC : raw
  }
  const ethUsd = await getEthPriceUsd()
  const raw = (gasPrice * ESTIMATED_GAS * ethUsd * 1_000_000n) / 10n ** 18n
  return raw > MAX_REIMB_USDC ? MAX_REIMB_USDC : raw
}

function isBytes32(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v)
}

function normalizeChain(chainParam: string): RelayChain {
  return chainParam === 'arc' || chainParam === 'arbitrum' ? chainParam : 'base'
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const { linkId, recipient, chain: chainParam = 'base' } =
    (req.body ?? {}) as Record<string, string>
  const chainKey = normalizeChain(chainParam)

  if (!isBytes32(linkId)) {
    return res.status(400).json({ ok: false, error: 'linkId must be a 0x-prefixed 32-byte hex string' })
  }
  if (!isAddress(recipient as string)) {
    return res.status(400).json({ ok: false, error: 'recipient must be a valid EVM address' })
  }

  const rawKey = chainKey === 'arc'
    ? (process.env.RELAYER_PRIVATE_KEY_ARC ?? process.env.RELAYER_PRIVATE_KEY)
    : chainKey === 'arbitrum'
    ? (process.env.RELAYER_PRIVATE_KEY_ARB ?? process.env.RELAYER_PRIVATE_KEY)
    : process.env.RELAYER_PRIVATE_KEY

  const rpcUrl = chainKey === 'arc'
    ? (process.env.PRIVATE_RPC_URL_ARC ?? 'https://rpc.testnet.arc.network')
    : chainKey === 'arbitrum'
    ? (process.env.PRIVATE_RPC_URL_ARB ?? 'https://arb1.arbitrum.io/rpc')
    : process.env.PRIVATE_RPC_URL

  const factoryAddr = chainKey === 'arc'
    ? (process.env.PAYLINK_FACTORY_V2_ARC ?? process.env.PAYLINK_FACTORY_V2)
    : chainKey === 'arbitrum'
    ? (process.env.PAYLINK_FACTORY_V2_ARB ?? process.env.PAYLINK_FACTORY_V2)
    : process.env.PAYLINK_FACTORY_V2

  if (!rawKey) return res.status(500).json({ ok: false, error: 'RELAYER_PRIVATE_KEY not configured' })
  if (!rpcUrl) return res.status(500).json({ ok: false, error: 'PRIVATE_RPC_URL not configured' })
  if (!factoryAddr || !isAddress(factoryAddr)) {
    return res.status(500).json({ ok: false, error: `Factory address not configured for ${chainKey}` })
  }

  const account = privateKeyToAccount(rawKey as `0x${string}`)
  const viemChain = chainKey === 'arc' ? arcChain : chainKey === 'arbitrum' ? arbitrumChainDef : base
  const publicClient = createPublicClient({ chain: viemChain, transport: http(rpcUrl) })
  const walletClient = createWalletClient({ account, chain: viemChain, transport: http(rpcUrl) })

  try {
    const vault = await publicClient.readContract({
      address: factoryAddr as `0x${string}`,
      abi: RELAY_ABI,
      functionName: 'getVaultAddress',
      args: [linkId, recipient as `0x${string}`],
    }) as `0x${string}`

    const balance = await publicClient.readContract({
      address: TOKEN_BY_CHAIN[chainKey],
      abi: ERC20_BALANCE_ABI,
      functionName: 'balanceOf',
      args: [vault],
    }) as bigint
    if (balance === 0n) {
      return res.status(200).json({ ok: false, status: 'waiting', error: 'Vault is not funded yet' })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[relay-v2:preflight]', chainKey, msg)
    return res.status(502).json({ ok: false, error: 'Unable to verify vault funding before relay' })
  }

  try {
    let gasReimbUsdc: bigint
    try {
      gasReimbUsdc = await calcGasReimbUsdc(publicClient, chainKey)
    } catch {
      gasReimbUsdc = 100_000n
    }

    const txHash = await walletClient.writeContract({
      address: factoryAddr as `0x${string}`,
      abi: RELAY_ABI,
      functionName: 'relay',
      args: [linkId, recipient as `0x${string}`, gasReimbUsdc],
      gas: 400_000n,
      ...(chainKey === 'base' ? { dataSuffix: BASE_BUILDER_CODE } : {}),
    })

    return res.status(200).json({
      ok: true,
      txHash,
      gasReimbUsdc: gasReimbUsdc.toString(),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[relay-v2]', chainKey, msg)
    return res.status(500).json({ ok: false, error: msg.slice(0, 200) })
  }
}
