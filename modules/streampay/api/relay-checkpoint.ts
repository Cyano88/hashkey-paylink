/**
 * /api/relay-checkpoint
 *
 * Releases cumulative progress checkpoints from CheckpointVault. The frontend
 * only calls this when a reader crosses 25%, 50%, 75%, or 100% scroll depth.
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
import { privateKeyToAccount } from 'viem/accounts'

const arcChain = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { decimals: 18, name: 'USD Coin', symbol: 'USDC' },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } },
})

const CHECKPOINT_VAULT_ABI = parseAbi([
  'function release(uint256 cumulativeAmount)',
  'function vaultInfo() view returns (address _sender,address _recipient,address _token,address _relayer,bytes32 _contentId,uint256 _totalAmount,uint256 _releasedAmount,uint256 _refundableAmount,bool _refunded,bool _funded)',
])

const VALID_CHECKPOINTS = new Set([25, 50, 75, 100])

function checkpointAmount(total: bigint, checkpointPct: number) {
  return (total * BigInt(checkpointPct)) / 100n
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const { vaultAddress, checkpointPct } = (req.body ?? {}) as {
    vaultAddress?: string
    checkpointPct?: number
  }

  if (!vaultAddress || !isAddress(vaultAddress)) {
    return res.status(400).json({ ok: false, error: 'A valid checkpoint vault is required.' })
  }
  const pct = Number(checkpointPct)
  if (!Number.isInteger(pct) || !VALID_CHECKPOINTS.has(pct)) {
    return res.status(400).json({ ok: false, error: 'checkpointPct must be one of 25, 50, 75, or 100.' })
  }

  const rawKey = process.env.RELAYER_PRIVATE_KEY_ARC ?? process.env.RELAYER_PRIVATE_KEY
  const rpcUrl = process.env.PRIVATE_RPC_URL_ARC ?? 'https://rpc.testnet.arc.network'
  if (!rawKey) return res.status(500).json({ ok: false, error: 'RELAYER_PRIVATE_KEY_ARC not configured' })

  const account = privateKeyToAccount(rawKey as `0x${string}`)
  const publicClient = createPublicClient({ chain: arcChain, transport: http(rpcUrl) })
  const walletClient = createWalletClient({ account, chain: arcChain, transport: http(rpcUrl) })
  const vault = vaultAddress as `0x${string}`

  try {
    const info = await publicClient.readContract({
      address: vault,
      abi: CHECKPOINT_VAULT_ABI,
      functionName: 'vaultInfo',
    }) as readonly [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, bigint, bigint, bigint, boolean, boolean]

    const [, , , relayer, , totalAmount, releasedAmount, , refunded, funded] = info
    if (relayer.toLowerCase() !== account.address.toLowerCase()) {
      return res.status(400).json({ ok: false, error: `Relayer mismatch: vault expects ${relayer}, server is ${account.address}` })
    }
    if (refunded) return res.status(400).json({ ok: false, error: 'Checkpoint vault has already been refunded.' })
    if (!funded) return res.status(400).json({ ok: false, error: 'Checkpoint vault is not funded yet.' })

    const cumulativeAmount = checkpointAmount(totalAmount, pct)
    if (cumulativeAmount <= releasedAmount) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        releasedAmount: releasedAmount.toString(),
        checkpointPct: pct,
      })
    }

    const args = [cumulativeAmount] as const
    await publicClient.simulateContract({
      account,
      address: vault,
      abi: CHECKPOINT_VAULT_ABI,
      functionName: 'release',
      args,
    })
    const txHash = await walletClient.writeContract({
      address: vault,
      abi: CHECKPOINT_VAULT_ABI,
      functionName: 'release',
      args,
      gas: 160_000n,
    })

    return res.status(200).json({
      ok: true,
      txHash,
      checkpointPct: pct,
      releasedAmount: cumulativeAmount.toString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[relay-checkpoint] release failed on ${vaultAddress}:`, message)
    return res.status(500).json({ ok: false, error: message.slice(0, 300) })
  }
}
