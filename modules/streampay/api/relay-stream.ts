/**
 * /api/relay-stream
 *
 * Gasless relay for StreamVault claim() and cancel() on Arc Network.
 *
 * Called by the Streampay frontend after the user signs an EIP-712 message
 * in their wallet. The relayer verifies inputs, then submits the transaction
 * and pays all Arc native USDC gas on the user's behalf.
 *
 * Request body
 * ────────────
 *  action       'claim' | 'cancel'
 *  vaultAddress Deployed StreamVault address
 *  sig          Full 65-byte EIP-712 signature (0x-prefixed hex).
 *               OR pass v (number) + r (bytes32 hex) + s (bytes32 hex) and
 *               the handler will reconstruct the signature.
 *  nonce        Must match vault.nonces(signer) at execution time
 *  deadline     Unix timestamp — tx reverts if submitted after this
 *  amount       (claim only) Amount the user signed for (bigint-as-string)
 *
 * Required env vars
 * ─────────────────
 *  RELAYER_PRIVATE_KEY_ARC   Arc deployer wallet (registered as relayer in factory)
 *  PRIVATE_RPC_URL_ARC       Arc RPC — defaults to public endpoint if unset
 *  STREAM_FACTORY_ADDRESS    Deployed StreamVaultFactory on Arc (informational;
 *                            vault address comes from the caller)
 */

import type { Request, Response } from 'express'
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  isHex,
  concat,
  toHex,
  defineChain,
  parseAbi,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

// ── Arc chain (mirrors src/lib/chains.ts — no import to keep module isolated) ─
const arcChain = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { decimals: 18, name: 'USD Coin', symbol: 'USDC' },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } },
})

// ── Minimal ABI — only what the relayer needs ─────────────────────────────────
const ABI = parseAbi([
  'function claim(uint256 amount, uint256 nonce, uint256 deadline, bytes sig)',
  'function cancel(uint256 nonce, uint256 deadline, bytes sig)',
  'function claimable()  view returns (uint256)',
  'function cancelled()  view returns (bool)',
  'function nonces(address) view returns (uint256)',
])

// ── Validation helpers ────────────────────────────────────────────────────────
const isBytes32 = (v: unknown): v is `0x${string}` =>
  typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v)

const is65ByteHex = (v: unknown): v is `0x${string}` =>
  typeof v === 'string' && /^0x[0-9a-fA-F]{130}$/.test(v)

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const { action, vaultAddress, nonce, deadline, amount } = body
  const { sig, v, r, s } = body

  // ── Input validation ────────────────────────────────────────────────────────
  if (action !== 'claim' && action !== 'cancel') {
    return res.status(400).json({ ok: false, error: 'action must be "claim" or "cancel"' })
  }
  if (!isAddress(vaultAddress as string)) {
    return res.status(400).json({ ok: false, error: 'vaultAddress must be a valid EVM address' })
  }
  if (nonce === undefined || nonce === null) {
    return res.status(400).json({ ok: false, error: 'nonce is required' })
  }
  if (!deadline) {
    return res.status(400).json({ ok: false, error: 'deadline is required' })
  }
  if (action === 'claim' && (amount === undefined || amount === null)) {
    return res.status(400).json({ ok: false, error: 'amount is required for claim' })
  }

  // ── Reconstruct 65-byte signature ───────────────────────────────────────────
  // Accept either a pre-assembled `sig` OR separate `v`, `r`, `s` components.
  // wallets (wagmi signTypedData) return the full hex sig; some custom flows send v/r/s.
  let signature: `0x${string}`
  if (is65ByteHex(sig)) {
    signature = sig
  } else if (typeof v === 'number' && isBytes32(r) && isBytes32(s)) {
    // EIP-2098 compact or legacy: r (32) + s (32) + v (1) = 65 bytes
    signature = concat([r, s, toHex(v, { size: 1 })])
  } else {
    return res.status(400).json({
      ok: false,
      error: 'Provide either a full 65-byte "sig" or separate "v" (number), "r", "s" (bytes32 hex)',
    })
  }

  // ── Env checks ──────────────────────────────────────────────────────────────
  const rawKey = process.env.RELAYER_PRIVATE_KEY_ARC ?? process.env.RELAYER_PRIVATE_KEY
  const rpcUrl = process.env.PRIVATE_RPC_URL_ARC    ?? 'https://rpc.testnet.arc.network'

  if (!rawKey) {
    return res.status(500).json({ ok: false, error: 'RELAYER_PRIVATE_KEY_ARC not configured' })
  }

  // ── Clients ─────────────────────────────────────────────────────────────────
  const account = privateKeyToAccount(rawKey as `0x${string}`)
  const vault   = vaultAddress as `0x${string}`

  const publicClient = createPublicClient({ chain: arcChain, transport: http(rpcUrl) })
  const walletClient = createWalletClient({ account, chain: arcChain, transport: http(rpcUrl) })

  // ── Pre-flight checks (save gas on obvious reverts) ──────────────────────────
  try {
    if (action === 'cancel') {
      const isCancelled = await publicClient.readContract({
        address: vault, abi: ABI, functionName: 'cancelled',
      })
      if (isCancelled) {
        return res.status(400).json({ ok: false, error: 'Stream is already cancelled' })
      }
    }

    if (action === 'claim') {
      const available = await publicClient.readContract({
        address: vault, abi: ABI, functionName: 'claimable',
      })
      if (available === 0n) {
        return res.status(400).json({ ok: false, error: 'Nothing available to claim yet' })
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(400).json({ ok: false, error: `Pre-flight failed: ${msg.slice(0, 200)}` })
  }

  // ── Broadcast ────────────────────────────────────────────────────────────────
  try {
    let txHash: `0x${string}`
    const deadlineBn = BigInt(deadline as string | number)
    const nonceBn    = BigInt(nonce    as string | number)

    if (action === 'claim') {
      txHash = await walletClient.writeContract({
        address:      vault,
        abi:          ABI,
        functionName: 'claim',
        args:         [BigInt(amount as string | number), nonceBn, deadlineBn, signature],
        gas:          200_000n,   // generous ceiling; unused gas refunded
      })
    } else {
      txHash = await walletClient.writeContract({
        address:      vault,
        abi:          ABI,
        functionName: 'cancel',
        args:         [nonceBn, deadlineBn, signature],
        gas:          150_000n,
      })
    }

    return res.status(200).json({ ok: true, txHash })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[relay-stream] ${action} failed on ${vaultAddress}:`, message)
    return res.status(500).json({ ok: false, error: message.slice(0, 300) })
  }
}
