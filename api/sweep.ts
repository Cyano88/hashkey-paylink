/**
 * Immediate single-router sweep — called by the frontend the moment a USDC Transfer
 * is detected at a PaymentRouter address.
 *
 * Guards (in order):
 *   1. Router must be a deployed contract (has bytecode).
 *   2. Router must hold a USDC balance > 0.
 *   3. Profitability: platform fee (0.2% of balance) must exceed estimated gas cost.
 *      If not profitable, returns { status: 'pending_profitability' } — funds are safe
 *      in the router and will be swept by the next keeper run or a larger payment.
 *
 * Env vars (shared with sweep-keeper):
 *   KEEPER_PRIVATE_KEY  — 0x-prefixed private key; needs ETH for gas (Base mainnet)
 */

import type { Request, Response } from 'express'
import {
  createPublicClient, createWalletClient, http,
  isAddress, parseAbi, defineChain,
} from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'

// ─── Chain / token config ────────────────────────────────────────────────────

const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const
const USDC_ARC  = '0x3600000000000000000000000000000000000000' as const

const arcChain = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { decimals: 18, name: 'USD Coin', symbol: 'USDC' },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } },
})

// ─── ABIs ────────────────────────────────────────────────────────────────────

const ERC20_ABI  = parseAbi(['function balanceOf(address) view returns (uint256)'])
const ROUTER_ABI = parseAbi(['function sweep(address token) external'])
const ROUTER_VERIFY_ABI = parseAbi([
  'function recipient() view returns (address)',
  'function treasury() view returns (address)',
])
const FACTORY_ABI = parseAbi(['function getRouterAddress(address recipient) view returns (address)'])
const BASE_ROUTER_FACTORY = '0x70Dd5226eB973268263A9AcD8BC48b4E59E7beCA' as const
const ARC_ROUTER_FACTORY  = '0x70Dd5226eB973268263A9AcD8BC48b4E59E7beCA' as const
const EVM_TREASURY = '0xcE5dF9e1115F81a2Fc2F65941B20B820d508e753'

// ─── ETH price helper ────────────────────────────────────────────────────────

async function getEthPriceUsd(): Promise<number> {
  try {
    const res  = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
      { signal: AbortSignal.timeout(3_000) },
    )
    const data = await res.json() as { ethereum?: { usd?: number } }
    return data?.ethereum?.usd ?? 2_500
  } catch {
    return 2_500 // safe fallback
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  const router = (req.body?.router ?? req.query.router) as string | undefined
  const chain  = (req.body?.chain  ?? req.query.chain  ?? 'base') as string

  if (!router || !isAddress(router)) {
    return res.status(400).json({ ok: false, error: 'invalid or missing router address' })
  }
  if (chain !== 'base' && chain !== 'arc') {
    return res.status(400).json({ ok: false, error: 'unsupported chain — use base or arc' })
  }

  const rawKey = process.env.KEEPER_PRIVATE_KEY
  if (!rawKey) return res.status(500).json({ ok: false, error: 'KEEPER_PRIVATE_KEY not set' })

  const tokenAddress = chain === 'base' ? USDC_BASE : USDC_ARC
  const viemChain    = chain === 'base' ? base : arcChain
  const rpcUrl       = chain === 'base' ? 'https://mainnet.base.org' : 'https://rpc.testnet.arc.network'
  const expectedTreasury = (process.env.TREASURY_ADDRESS ?? EVM_TREASURY).toLowerCase()
  const factoryAddress = chain === 'base'
    ? BASE_ROUTER_FACTORY
    : process.env.PAYMENT_ROUTER_FACTORY_ARC ?? ARC_ROUTER_FACTORY

  const account      = privateKeyToAccount(rawKey as `0x${string}`)
  const publicClient = createPublicClient({ chain: viemChain, transport: http(rpcUrl) })
  const walletClient = createWalletClient({ chain: viemChain, transport: http(rpcUrl), account })

  // ── Guard 1: confirmed deployed PaymentRouter ────────────────────────────
  const code = await publicClient.getBytecode({ address: router as `0x${string}` })
  if (!code || code === '0x') {
    return res.status(400).json({ ok: false, error: 'not a deployed router' })
  }

  // ── Guard 2: balance check ───────────────────────────────────────────────
  if (!factoryAddress || !isAddress(factoryAddress)) {
    return res.status(503).json({ ok: false, error: `router factory not configured for ${chain}` })
  }

  let routerRecipient: `0x${string}`
  let routerTreasury: `0x${string}`
  try {
    ;[routerRecipient, routerTreasury] = await Promise.all([
      publicClient.readContract({
        address: router as `0x${string}`,
        abi: ROUTER_VERIFY_ABI,
        functionName: 'recipient',
      }) as Promise<`0x${string}`>,
      publicClient.readContract({
        address: router as `0x${string}`,
        abi: ROUTER_VERIFY_ABI,
        functionName: 'treasury',
      }) as Promise<`0x${string}`>,
    ])
  } catch {
    return res.status(400).json({ ok: false, error: 'not a Hash PayLink router' })
  }

  if (routerTreasury.toLowerCase() !== expectedTreasury) {
    return res.status(400).json({ ok: false, error: 'router treasury mismatch' })
  }

  const expectedRouter = await publicClient.readContract({
    address: factoryAddress as `0x${string}`,
    abi: FACTORY_ABI,
    functionName: 'getRouterAddress',
    args: [routerRecipient],
  }) as `0x${string}`
  if (expectedRouter.toLowerCase() !== router.toLowerCase()) {
    return res.status(400).json({ ok: false, error: 'router factory mismatch' })
  }

  const balance = await publicClient.readContract({
    address: tokenAddress, abi: ERC20_ABI,
    functionName: 'balanceOf', args: [router as `0x${string}`],
  })
  if (balance === 0n) {
    return res.status(200).json({
      ok: true, status: 'empty', balanceUsdc: 0,
      message: 'already swept or nothing received',
    })
  }

  const balanceUsdc = Number(balance) / 1e6
  const feeUsdc     = balanceUsdc * 0.002      // 0.2% platform fee

  // ── Guard 3: profitability check ─────────────────────────────────────────
  // Only sweep if fee covers estimated gas cost. Otherwise, hold in router — safe.
  const [gasEstimate, gasPrice, ethPriceUsd] = await Promise.all([
    publicClient.estimateContractGas({
      address:      router as `0x${string}`,
      abi:          ROUTER_ABI,
      functionName: 'sweep',
      args:         [tokenAddress],
      account:      account.address,
    }).catch(() => 80_000n),           // fallback if estimation fails
    publicClient.getGasPrice(),
    getEthPriceUsd(),
  ])

  const gasCostWei = gasEstimate * gasPrice
  const gasCostUsd = Number(gasCostWei) / 1e18 * ethPriceUsd

  if (feeUsdc < gasCostUsd) {
    return res.status(200).json({
      ok:          true,
      status:      'pending_profitability',
      balanceUsdc,
      feeUsdc:     +feeUsdc.toFixed(6),
      gasCostUsd:  +gasCostUsd.toFixed(6),
      message:     `Fee (${feeUsdc.toFixed(4)} USDC) < gas ($${gasCostUsd.toFixed(4)}) — holding for batch`,
    })
  }

  // ── Sweep ────────────────────────────────────────────────────────────────
  try {
    const tx = await walletClient.writeContract({
      address: router as `0x${string}`, abi: ROUTER_ABI,
      functionName: 'sweep', args: [tokenAddress],
    })
    return res.status(200).json({
      ok:          true,
      status:      'swept',
      tx,
      balanceUsdc,
      feeUsdc:     +feeUsdc.toFixed(6),
      gasCostUsd:  +gasCostUsd.toFixed(6),
      amount:      balanceUsdc.toFixed(6) + ' USDC',
    })
  } catch (err) {
    return res.status(500).json({
      ok:     false,
      status: 'sweep_failed',
      reason: err instanceof Error ? err.message.slice(0, 160) : String(err),
    })
  }
}
