/**
 * /api/settle-poa
 *
 * Gasless settlement relay for Proof-of-Attention (PoA) viewer signatures.
 *
 * The creator submits the viewer's highest ghost-vault entry; this handler
 * verifies it is not yet settled, then calls settle() on the PoA contract
 * which pulls USDC from the viewer's Arc wallet to the creator.
 *
 * Request body (GhostVaultEntry from usePoAStream)
 * ────────────────────────────────────────────────
 *  sig        65-byte EIP-712 signature (0x-prefixed hex)
 *  amountRaw  USDC amount (6-decimal, bigint-as-string)
 *  nonce      Replay-protection nonce (bigint-as-string)
 *  deadline   Unix timestamp the sig expires (bigint-as-string)
 *  viewer     Viewer's Arc wallet address
 *  creator    Creator's Arc wallet address
 *  contentId  UTF-8 content slug (bytes32-encoded on-chain)
 *
 * Required env vars
 * ─────────────────
 *  RELAYER_PRIVATE_KEY_ARC   Arc relayer wallet
 *  PRIVATE_RPC_URL_ARC       Arc RPC (defaults to public endpoint if unset)
 *  ARC_POA_CONTRACT          Deployed PoASettlement contract address on Arc
 *                            ⚠️  Scaffold — deploy PoASettlement.sol on Arc
 *                            before this endpoint is functional.
 */

import type { Request, Response } from 'express'
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  defineChain,
  parseAbi,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const arcChain = defineChain({
  id:             5042002,
  name:           'Arc Testnet',
  nativeCurrency: { decimals: 18, name: 'USD Coin', symbol: 'USDC' },
  rpcUrls:        { default: { http: ['https://rpc.testnet.arc.network'] } },
})

// Minimal ABI for the PoA settlement contract (deploy PoASettlement.sol)
const POA_ABI = parseAbi([
  'function settle(address viewer, address creator, bytes32 contentId, uint256 amount, uint256 nonce, uint256 deadline, bytes sig)',
  'function settled(address viewer, bytes32 contentId) view returns (uint256)',
])

type GhostVaultBody = {
  sig:       string
  amountRaw: string
  nonce:     string
  deadline:  string
  viewer:    string
  creator:   string
  contentId: string
}

function toBytes32(s: string): `0x${string}` {
  if (/^0x[0-9a-fA-F]{64}$/.test(s)) return s as `0x${string}`
  const bytes = Array.from(new TextEncoder().encode(s))
  const hex   = bytes.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 64).padEnd(64, '0')
  return `0x${hex}` as `0x${string}`
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const body = (req.body ?? {}) as Partial<GhostVaultBody>
  const { sig, amountRaw, nonce, deadline, viewer, creator, contentId } = body

  if (!sig || !amountRaw || !nonce || !deadline || !viewer || !creator || !contentId) {
    return res.status(400).json({ ok: false, error: 'Missing required ghost vault fields' })
  }
  if (!isAddress(viewer) || !isAddress(creator)) {
    return res.status(400).json({ ok: false, error: 'viewer and creator must be valid EVM addresses' })
  }
  if (!/^0x[0-9a-fA-F]{130}$/.test(sig)) {
    return res.status(400).json({ ok: false, error: 'sig must be a 65-byte 0x-prefixed hex string' })
  }

  const contractAddr = process.env.ARC_POA_CONTRACT
  if (!contractAddr || !isAddress(contractAddr)) {
    return res.status(503).json({
      ok:    false,
      error: 'ARC_POA_CONTRACT not configured — deploy PoASettlement.sol on Arc first',
    })
  }

  const rawKey = process.env.RELAYER_PRIVATE_KEY_ARC ?? process.env.RELAYER_PRIVATE_KEY
  const rpcUrl = process.env.PRIVATE_RPC_URL_ARC    ?? 'https://rpc.testnet.arc.network'

  if (!rawKey) {
    return res.status(500).json({ ok: false, error: 'RELAYER_PRIVATE_KEY_ARC not configured' })
  }

  const account      = privateKeyToAccount(rawKey as `0x${string}`)
  const publicClient = createPublicClient({ chain: arcChain, transport: http(rpcUrl) })
  const walletClient = createWalletClient({ account, chain: arcChain, transport: http(rpcUrl) })
  const contentId32  = toBytes32(contentId)

  try {
    // Pre-flight: skip if this sig amount has already been settled
    const alreadySettled = await publicClient.readContract({
      address:      contractAddr as `0x${string}`,
      abi:          POA_ABI,
      functionName: 'settled',
      args:         [viewer as `0x${string}`, contentId32],
    }) as bigint

    if (alreadySettled >= BigInt(amountRaw)) {
      return res.status(400).json({
        ok:    false,
        error: 'This intent has already been settled for an equal or higher amount',
      })
    }

    const txHash = await walletClient.writeContract({
      address:      contractAddr as `0x${string}`,
      abi:          POA_ABI,
      functionName: 'settle',
      args: [
        viewer   as `0x${string}`,
        creator  as `0x${string}`,
        contentId32,
        BigInt(amountRaw),
        BigInt(nonce),
        BigInt(deadline),
        sig as `0x${string}`,
      ],
      gas: 250_000n,
    })

    return res.status(200).json({ ok: true, txHash })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[settle-poa] Settlement failed:', msg)
    return res.status(500).json({ ok: false, error: msg.slice(0, 300) })
  }
}
