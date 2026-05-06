/**
 * /api/relay-v2
 *
 * Master Relayer endpoint for the PayLinkFactoryV2 "Direct Send" (ghost vault) flow.
 *
 * Supports four chains:
 *  • Base     — ERC-20 USDC relay.  Calls relay(linkId, recipient, gasReimbUsdc)
 *  • Arc      — ERC-20 USDC relay (Arc native USDC precompile, gas IS USDC)
 *  • HashKey  — Native HSK relay.  Calls relayNative(linkId, recipient, gasReimbNative)
 *  • Arbitrum — ERC-20 GHO relay (18-dec). gasReimb passed as 0 — Arbitrum gas is
 *               negligible (~$0.02) and capped to near-zero by contract MAX_GAS_REIMB.
 *
 * Required env vars (Render → Environment)
 * ─────────────────────────────────────────
 *  RELAYER_PRIVATE_KEY          Master relayer private key (Base)
 *  RELAYER_PRIVATE_KEY_ARC      Arc relayer key  (falls back to master)
 *  RELAYER_PRIVATE_KEY_HASHKEY  HashKey relayer key (falls back to master)
 *  RELAYER_PRIVATE_KEY_ARB      Arbitrum relayer key (falls back to master)
 *  PRIVATE_RPC_URL              Base RPC (Alchemy / QuickNode)
 *  PRIVATE_RPC_URL_ARC          Arc RPC  (falls back to default Arc RPC)
 *  PRIVATE_RPC_URL_HASHKEY      HashKey RPC (falls back to https://mainnet.hsk.xyz)
 *  PRIVATE_RPC_URL_ARB          Arbitrum RPC (falls back to public Arbitrum RPC)
 *  PAYLINK_FACTORY_V2           Deployed factory address (Base / shared universal)
 *  PAYLINK_FACTORY_V2_ARC       Factory on Arc  (falls back to PAYLINK_FACTORY_V2)
 *  PAYLINK_FACTORY_V2_HASHKEY   Factory on HashKey (falls back to PAYLINK_FACTORY_V2)
 *  PAYLINK_FACTORY_V2_ARB       Factory on Arbitrum (falls back to PAYLINK_FACTORY_V2)
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
import { base, arbitrum as arbitrumChainDef } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'

// ─── Chain definitions ────────────────────────────────────────────────────────

const arcChain = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { decimals: 18, name: 'USD Coin', symbol: 'USDC' },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } },
})

const hashkeyChain = defineChain({
  id: 177,
  name: 'HashKey Chain',
  nativeCurrency: { decimals: 18, name: 'HashKey', symbol: 'HSK' },
  rpcUrls: { default: { http: ['https://mainnet.hsk.xyz'] } },
})

// ─── Contract ABIs ────────────────────────────────────────────────────────────

const RELAY_ABI = parseAbi([
  'function relay(bytes32 linkId, address recipient, uint256 gasReimbUsdc) returns (uint256)',
])

const RELAY_NATIVE_ABI = parseAbi([
  'function relayNative(bytes32 linkId, address recipient, uint256 gasReimbNative) returns (uint256)',
])

// ─── Base Builder Code (ERC-8021) ─────────────────────────────────────────────
const BASE_BUILDER_CODE = '0x62635f3871746237746e79' as `0x${string}`

// ─── Gas reimbursement ────────────────────────────────────────────────────────

const MAX_REIMB_USDC         = 500_000n                   // 0.50 USDC  (6 dec)
const MAX_REIMB_NATIVE       = 5_000_000_000_000_000n     // 0.005 HSK/ETH (18 dec)
const ESTIMATED_GAS          = 300_000n
const FALLBACK_ETH_USD       = 3_000n

async function getEthPriceUsd(): Promise<bigint> {
  try {
    const res  = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
      { signal: AbortSignal.timeout(3_000) },
    )
    const data = await res.json() as { ethereum?: { usd?: number } }
    const p    = data?.ethereum?.usd
    return p && p > 0 ? BigInt(Math.round(p)) : FALLBACK_ETH_USD
  } catch {
    return FALLBACK_ETH_USD
  }
}

// Returns USDC (6-dec) reimbursement for ERC-20 chains
async function calcGasReimbUsdc(
  publicClient: ReturnType<typeof createPublicClient>,
  chainKey: 'base' | 'arc',
): Promise<bigint> {
  const gasPrice = await publicClient.getGasPrice()
  if (chainKey === 'arc') {
    // Arc native gas IS USDC (18-dec wei) → convert to 6-dec USDC
    const raw = (gasPrice * ESTIMATED_GAS) / 10n ** 12n
    return raw > MAX_REIMB_USDC ? MAX_REIMB_USDC : raw
  }
  const ethUsd = await getEthPriceUsd()
  const raw    = (gasPrice * ESTIMATED_GAS * ethUsd * 1_000_000n) / (10n ** 18n)
  return raw > MAX_REIMB_USDC ? MAX_REIMB_USDC : raw
}

// Returns native wei reimbursement for HashKey
async function calcGasReimbNative(
  publicClient: ReturnType<typeof createPublicClient>,
): Promise<bigint> {
  try {
    const gasPrice = await publicClient.getGasPrice()
    const raw = gasPrice * ESTIMATED_GAS
    return raw > MAX_REIMB_NATIVE ? MAX_REIMB_NATIVE : raw
  } catch {
    return 1_000_000_000_000_000n  // 0.001 HSK fallback
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

function isBytes32(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v)
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const { linkId, recipient, chain: chainParam = 'base' } =
    (req.body ?? {}) as Record<string, string>

  const chainKey = (['arc', 'hashkey', 'arbitrum'] as const).includes(chainParam as 'arc' | 'hashkey' | 'arbitrum')
    ? (chainParam as 'arc' | 'hashkey' | 'arbitrum')
    : 'base'

  if (!isBytes32(linkId))
    return res.status(400).json({ ok: false, error: 'linkId must be a 0x-prefixed 32-byte hex string' })
  if (!isAddress(recipient as string))
    return res.status(400).json({ ok: false, error: 'recipient must be a valid EVM address' })

  // ── Per-chain env resolution ─────────────────────────────────────────────
  const rawKey = chainKey === 'arc'
    ? (process.env.RELAYER_PRIVATE_KEY_ARC     ?? process.env.RELAYER_PRIVATE_KEY)
    : chainKey === 'hashkey'
    ? (process.env.RELAYER_PRIVATE_KEY_HASHKEY ?? process.env.RELAYER_PRIVATE_KEY)
    : chainKey === 'arbitrum'
    ? (process.env.RELAYER_PRIVATE_KEY_ARB     ?? process.env.RELAYER_PRIVATE_KEY)
    : process.env.RELAYER_PRIVATE_KEY

  const rpcUrl = chainKey === 'arc'
    ? (process.env.PRIVATE_RPC_URL_ARC     ?? 'https://rpc.testnet.arc.network')
    : chainKey === 'hashkey'
    ? (process.env.PRIVATE_RPC_URL_HASHKEY ?? 'https://mainnet.hsk.xyz')
    : chainKey === 'arbitrum'
    ? (process.env.PRIVATE_RPC_URL_ARB     ?? 'https://arb1.arbitrum.io/rpc')
    : process.env.PRIVATE_RPC_URL

  const factoryAddr = chainKey === 'arc'
    ? (process.env.PAYLINK_FACTORY_V2_ARC     ?? process.env.PAYLINK_FACTORY_V2)
    : chainKey === 'hashkey'
    ? (process.env.PAYLINK_FACTORY_V2_HASHKEY ?? process.env.PAYLINK_FACTORY_V2)
    : chainKey === 'arbitrum'
    ? (process.env.PAYLINK_FACTORY_V2_ARB     ?? process.env.PAYLINK_FACTORY_V2)
    : process.env.PAYLINK_FACTORY_V2

  if (!rawKey)      return res.status(500).json({ ok: false, error: 'RELAYER_PRIVATE_KEY not configured' })
  if (!rpcUrl)      return res.status(500).json({ ok: false, error: 'PRIVATE_RPC_URL not configured' })
  if (!factoryAddr || !isAddress(factoryAddr))
    return res.status(500).json({ ok: false, error: `Factory address not configured for ${chainKey}` })

  // ── Clients ───────────────────────────────────────────────────────────────
  const account    = privateKeyToAccount(rawKey as `0x${string}`)
  const viemChain  = chainKey === 'arc' ? arcChain : chainKey === 'hashkey' ? hashkeyChain : chainKey === 'arbitrum' ? arbitrumChainDef : base

  const publicClient = createPublicClient({ chain: viemChain, transport: http(rpcUrl) })
  const walletClient = createWalletClient({ account, chain: viemChain, transport: http(rpcUrl) })

  // ── Broadcast ─────────────────────────────────────────────────────────────
  try {
    let txHash: `0x${string}`

    if (chainKey === 'hashkey') {
      // ── Native HSK relay ─────────────────────────────────────────────────
      const gasReimbNative = await calcGasReimbNative(publicClient)

      txHash = await walletClient.writeContract({
        address:      factoryAddr as `0x${string}`,
        abi:          RELAY_NATIVE_ABI,
        functionName: 'relayNative',
        args:         [linkId as `0x${string}`, recipient as `0x${string}`, gasReimbNative],
        gas:          400_000n,
      })

      return res.status(200).json({
        ok:               true,
        txHash,
        gasReimbNative:   gasReimbNative.toString(),
      })
    } else if (chainKey === 'arbitrum') {
      // ── ERC-20 GHO relay (Arbitrum One) ──────────────────────────────────
      // GHO has 18 decimals. Contract MAX_GAS_REIMB = 1_000_000 (≈ 0 GHO) so
      // gas reimb is passed as 0 — Arbitrum relay costs ~$0.02 which is negligible.
      txHash = await walletClient.writeContract({
        address:      factoryAddr as `0x${string}`,
        abi:          RELAY_ABI,
        functionName: 'relay',
        args:         [linkId as `0x${string}`, recipient as `0x${string}`, 0n],
        gas:          400_000n,
      })

      return res.status(200).json({
        ok:           true,
        txHash,
        gasReimbUsdc: '0',
      })
    } else {
      // ── ERC-20 USDC relay (Base / Arc) ────────────────────────────────────
      let gasReimbUsdc: bigint
      try {
        gasReimbUsdc = await calcGasReimbUsdc(publicClient, chainKey)
      } catch {
        gasReimbUsdc = 100_000n  // 0.10 USDC fallback
      }

      txHash = await walletClient.writeContract({
        address:      factoryAddr as `0x${string}`,
        abi:          RELAY_ABI,
        functionName: 'relay',
        args:         [linkId as `0x${string}`, recipient as `0x${string}`, gasReimbUsdc],
        gas:          400_000n,
        ...(chainKey === 'base' ? { dataSuffix: BASE_BUILDER_CODE } : {}),
      })

      return res.status(200).json({
        ok:           true,
        txHash,
        gasReimbUsdc: gasReimbUsdc.toString(),
      })
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[relay-v2]', chainKey, msg)
    return res.status(500).json({ ok: false, error: msg.slice(0, 200) })
  }
}
