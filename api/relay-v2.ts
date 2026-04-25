/**
 * /api/relay-v2
 *
 * Master Relayer endpoint for the PayLinkFactoryV2 "Direct Send" flow.
 *
 * Called by the frontend the instant a USDC balance is detected at a ghost
 * vault address. The relayer:
 *   1. Validates the request.
 *   2. Estimates gas and converts to a USDC reimbursement figure.
 *   3. Signs and broadcasts `PayLinkFactoryV2.relay(linkId, recipient, gasReimbUsdc)`.
 *   4. Returns the transaction hash to the UI.
 *
 * Security notes
 * ──────────────
 *  • RELAYER_PRIVATE_KEY is used only inside this function, via `privateKeyToAccount`.
 *    It is never prefixed NEXT_PUBLIC_ / VITE_ and never reaches the browser.
 *  • PRIVATE_RPC_URL is the backend-only, high-rate-limit RPC (Alchemy / QuickNode).
 *    The frontend uses VITE_RPC_URL (public, rate-limited) for read-only polling.
 *  • The contract itself enforces: onlyRelayer, MAX_GAS_REIMB cap, and
 *    CREATE2 collision guard (double-relay reverts).
 *
 * Required env vars (Vercel → Settings → Environment Variables)
 * ──────────────────────────────────────────────────────────────
 *  RELAYER_PRIVATE_KEY        0x-prefixed private key of the master relayer wallet.
 *  PRIVATE_RPC_URL            Private RPC endpoint (Alchemy / QuickNode).
 *  PAYLINK_FACTORY_V2         Deployed PayLinkFactoryV2 contract address.
 *  TREASURY_ADDRESS           Cold wallet that receives the 0.5% fee + gas reimb.
 *                             (Informational here — enforced on-chain in the contract.)
 */

import type { Request, Response } from 'express'
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  parseAbi,
  defineChain,
} from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'

// ─── Arc Testnet chain definition (mirrors src/lib/chains.ts) ────────────────
const arcChain = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { decimals: 18, name: 'USD Coin', symbol: 'USDC' },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } },
})

// ─── ABI (relay function only) ────────────────────────────────────────────────

const FACTORY_V2_ABI = parseAbi([
  'function relay(bytes32 linkId, address recipient, uint256 gasReimbUsdc) returns (uint256)',
])

// ─── Gas reimbursement helpers ────────────────────────────────────────────────

const MAX_REIMB_USDC   = 500_000n   // 0.50 USDC hard ceiling (frontend-side cap; contract caps at 1.00)
const ESTIMATED_GAS    = 300_000n   // conservative gas estimate for relay()
const FALLBACK_ETH_USD = 3_000n     // USD/ETH fallback when price fetch fails

async function getEthPriceUsd(): Promise<bigint> {
  try {
    const res  = await fetch(
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

/**
 * Converts a gas cost to USDC (6 decimals).
 *
 * Base/EVM:  gasReimbUsdc = (gasPrice_wei × estimatedGas × ethUsd) / 1e18
 * Arc:       native gas IS USDC (18-decimal Wei), so no ETH→USD conversion needed.
 *            gasReimbUsdc = (gasPrice_wei × estimatedGas) / 1e12
 *            (divide by 1e12 to go from 18-decimal USDC-wei → 6-decimal USDC units)
 */
async function calcGasReimbUsdc(
  publicClient: ReturnType<typeof createPublicClient>,
  chainKey: 'base' | 'arc' = 'base',
): Promise<bigint> {
  const gasPrice = await publicClient.getGasPrice()

  if (chainKey === 'arc') {
    const reimbRaw = (gasPrice * ESTIMATED_GAS) / 10n ** 12n
    return reimbRaw > MAX_REIMB_USDC ? MAX_REIMB_USDC : reimbRaw
  }

  const ethUsd     = await getEthPriceUsd()
  const ethCostWei = gasPrice * ESTIMATED_GAS
  const reimbRaw   = (ethCostWei * ethUsd * 1_000_000n) / (10n ** 18n)
  return reimbRaw > MAX_REIMB_USDC ? MAX_REIMB_USDC : reimbRaw
}

// ─── Validation helpers ───────────────────────────────────────────────────────

function isBytes32(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v)
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  // Only accept POST.
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  // ── Input validation ────────────────────────────────────────────────────────
  const { linkId, recipient, chain: chainParam = 'base' } = (req.body ?? {}) as Record<string, string>
  const chainKey = chainParam === 'arc' ? 'arc' : 'base'

  if (!isBytes32(linkId)) {
    return res.status(400).json({ ok: false, error: 'linkId must be a 0x-prefixed 32-byte hex string' })
  }
  if (!isAddress(recipient as string)) {
    return res.status(400).json({ ok: false, error: 'recipient must be a valid EVM address' })
  }

  // ── Env checks ──────────────────────────────────────────────────────────────
  const rawKey = process.env.RELAYER_PRIVATE_KEY
  // Arc uses its own RPC and factory vars if set, otherwise falls back to Base vars
  const rpcUrl     = chainKey === 'arc'
    ? (process.env.PRIVATE_RPC_URL_ARC ?? process.env.PRIVATE_RPC_URL)
    : process.env.PRIVATE_RPC_URL
  const factoryAddr = chainKey === 'arc'
    ? (process.env.PAYLINK_FACTORY_V2_ARC ?? process.env.PAYLINK_FACTORY_V2)
    : process.env.PAYLINK_FACTORY_V2

  if (!rawKey)      return res.status(500).json({ ok: false, error: 'RELAYER_PRIVATE_KEY not configured' })
  if (!rpcUrl)      return res.status(500).json({ ok: false, error: 'PRIVATE_RPC_URL not configured' })
  if (!factoryAddr) return res.status(500).json({ ok: false, error: `PAYLINK_FACTORY_V2${chainKey === 'arc' ? '_ARC' : ''} not configured` })
  if (!isAddress(factoryAddr)) return res.status(500).json({ ok: false, error: 'Factory address is not a valid EVM address' })

  // ── Clients — key is only held in memory for the duration of this call ───────
  const account = privateKeyToAccount(rawKey as `0x${string}`)
  const viemChain = chainKey === 'arc' ? arcChain : base

  const publicClient = createPublicClient({
    chain:     viemChain,
    transport: http(rpcUrl),
  })
  const walletClient = createWalletClient({
    account,
    chain:     viemChain,
    transport: http(rpcUrl),
  })

  // ── Gas reimbursement calculation ────────────────────────────────────────────
  let gasReimbUsdc: bigint
  try {
    gasReimbUsdc = await calcGasReimbUsdc(publicClient, chainKey)
  } catch {
    // If price fetch or gas estimate fails, use a safe fixed fallback (0.10 USDC).
    gasReimbUsdc = 100_000n
  }

  // ── Broadcast relay transaction ──────────────────────────────────────────────
  try {
    const txHash = await walletClient.writeContract({
      address:      factoryAddr as `0x${string}`,
      abi:          FACTORY_V2_ABI,
      functionName: 'relay',
      args:         [linkId as `0x${string}`, recipient as `0x${string}`, gasReimbUsdc],
      gas:          400_000n,  // generous ceiling; unused gas is refunded
    })

    return res.status(200).json({
      ok:           true,
      txHash,
      gasReimbUsdc: gasReimbUsdc.toString(),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[relay-v2] writeContract failed:', message)
    return res.status(500).json({ ok: false, error: message.slice(0, 200) })
  }
}
