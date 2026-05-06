/**
 * /api/relay-gho
 *
 * Gasless GHO relay for Ethereum Mainnet.
 * Payer signs an EIP-2612 permit off-chain (free). This endpoint submits the
 * Multicall3 transaction paying gas on the payer's behalf, reimbursed from GHO.
 *
 * GET  /api/relay-gho          → returns estimated gas reimbursement in GHO (18-dec)
 * POST /api/relay-gho          → submits relay tx, returns txHash
 *
 * Required env vars:
 *   RELAYER_PRIVATE_KEY_ETH    Ethereum relayer private key (needs ETH for gas)
 *   PRIVATE_RPC_URL_ETH        Ethereum RPC (Alchemy/QuickNode recommended)
 *
 * Fee split per transaction:
 *   recipient   = amount - platformFee (0.2%) - gasReimb
 *   treasury    = platformFee (0.2%)
 *   relayer     = gasReimb (covers ETH gas cost, capped at 20 GHO)
 */

import type { Request, Response } from 'express'
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  parseAbi,
  isAddress,
  parseUnits,
} from 'viem'
import { mainnet } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'

// ─── Constants ────────────────────────────────────────────────────────────────

const GHO_ADDRESS  = '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f' as `0x${string}`
const MULTICALL3   = '0xcA11bde05977b3631167028862bE2a173976CA11' as `0x${string}`
const TREASURY     = '0xcE5dF9e1115F81a2Fc2F65941B20B820d508e753' as `0x${string}`

const PLATFORM_FEE_BPS  = 20n          // 0.2%
const ESTIMATED_GAS     = 200_000n     // Multicall3 + permit + 3x transferFrom (~170k actual + buffer)
const MAX_GAS_REIMB_GHO = parseUnits('20', 18)  // 20 GHO cap (~$20)
const MIN_GAS_REIMB_GHO = parseUnits('1', 18)   // 1 GHO floor (prevents dust attacks)
const FALLBACK_ETH_USD  = 3_000n

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const PERMIT_ABI = parseAbi([
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
])

const TRANSFER_FROM_ABI = parseAbi([
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
])

const MULTICALL3_ABI = parseAbi([
  'function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)',
])

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

async function calcGasReimbGho(publicClient: ReturnType<typeof createPublicClient>): Promise<bigint> {
  const [block, ethUsd] = await Promise.all([
    publicClient.getBlock({ blockTag: 'latest' }),
    getEthPriceUsd(),
  ])
  // Use actual baseFeePerGas + small tip (0.2 gwei) — avoids inflated eth_gasPrice suggestions
  const baseFee  = block.baseFeePerGas ?? 500_000_000n  // fallback 0.5 gwei
  const gasPrice = baseFee + 200_000_000n               // + 0.2 gwei tip
  // cost_gho_units(18 dec) = gasPrice(wei) * ESTIMATED_GAS * ethUsd
  const raw = gasPrice * ESTIMATED_GAS * ethUsd
  if (raw < MIN_GAS_REIMB_GHO) return MIN_GAS_REIMB_GHO
  if (raw > MAX_GAS_REIMB_GHO) return MAX_GAS_REIMB_GHO
  return raw
}

function getClients(rpcUrl?: string) {
  const rawKey = process.env.RELAYER_PRIVATE_KEY_ETH ?? process.env.RELAYER_PRIVATE_KEY
  if (!rawKey) throw new Error('RELAYER_PRIVATE_KEY_ETH not configured')
  const account      = privateKeyToAccount(rawKey as `0x${string}`)
  const transport    = http(rpcUrl ?? process.env.PRIVATE_RPC_URL_ETH)
  const publicClient = createPublicClient({ chain: mainnet, transport })
  const walletClient = createWalletClient({ account, chain: mainnet, transport })
  return { account, publicClient, walletClient }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  // ── GET — gas estimate ─────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const { publicClient } = getClients()
      const gasReimbGho = await calcGasReimbGho(publicClient)
      return res.json({ ok: true, gasReimbGho: gasReimbGho.toString() })
    } catch (err) {
      // Return min floor as safe fallback so UI always has a value
      return res.json({ ok: true, gasReimbGho: MIN_GAS_REIMB_GHO.toString() })
    }
  }

  // ── POST — relay ───────────────────────────────────────────────────────────
  if (req.method !== 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const { owner, recipient, amount, deadline, v, r, s } =
    (req.body ?? {}) as Record<string, string>

  // Validate inputs
  if (!isAddress(owner as string))
    return res.status(400).json({ ok: false, error: 'Invalid owner address' })
  if (!isAddress(recipient as string))
    return res.status(400).json({ ok: false, error: 'Invalid recipient address' })
  if (!amount || isNaN(Number(amount)))
    return res.status(400).json({ ok: false, error: 'Invalid amount' })
  if (!deadline || isNaN(Number(deadline)))
    return res.status(400).json({ ok: false, error: 'Invalid deadline' })
  if (Number(deadline) < Math.floor(Date.now() / 1000))
    return res.status(400).json({ ok: false, error: 'Permit has expired' })
  if (typeof v !== 'number' && typeof v !== 'string')
    return res.status(400).json({ ok: false, error: 'Invalid signature v' })
  if (!r || !s)
    return res.status(400).json({ ok: false, error: 'Invalid signature r/s' })

  const { account, publicClient, walletClient } = getClients()

  try {
    // Calculate gas reimbursement fresh server-side — never trust client value
    const gasUnits       = await calcGasReimbGho(publicClient)
    const totalUnits     = BigInt(amount)
    const feeUnits       = totalUnits * PLATFORM_FEE_BPS / 10_000n
    const recipientUnits = totalUnits - feeUnits - gasUnits

    if (recipientUnits <= 0n)
      return res.status(400).json({ ok: false, error: 'Amount too small to cover fees and gas reimbursement' })

    // Build Multicall3 calldata: permit → pay recipient → pay treasury → reimburse relayer
    const callData = encodeFunctionData({
      abi: MULTICALL3_ABI,
      functionName: 'aggregate3',
      args: [[
        {
          target: GHO_ADDRESS, allowFailure: false,
          callData: encodeFunctionData({
            abi: PERMIT_ABI, functionName: 'permit',
            args: [owner as `0x${string}`, MULTICALL3, totalUnits, BigInt(deadline), Number(v), r as `0x${string}`, s as `0x${string}`],
          }),
        },
        {
          target: GHO_ADDRESS, allowFailure: false,
          callData: encodeFunctionData({
            abi: TRANSFER_FROM_ABI, functionName: 'transferFrom',
            args: [owner as `0x${string}`, recipient as `0x${string}`, recipientUnits],
          }),
        },
        {
          target: GHO_ADDRESS, allowFailure: false,
          callData: encodeFunctionData({
            abi: TRANSFER_FROM_ABI, functionName: 'transferFrom',
            args: [owner as `0x${string}`, TREASURY, feeUnits],
          }),
        },
        {
          target: GHO_ADDRESS, allowFailure: false,
          callData: encodeFunctionData({
            abi: TRANSFER_FROM_ABI, functionName: 'transferFrom',
            args: [owner as `0x${string}`, account.address, gasUnits],
          }),
        },
      ]],
    })

    const txHash = await walletClient.sendTransaction({
      to:    MULTICALL3,
      data:  callData,
      value: 0n,
      gas:   400_000n,
    })

    console.log('[relay-gho] submitted', txHash, 'recipient', recipientUnits.toString(), 'gas', gasUnits.toString())

    return res.status(200).json({
      ok:              true,
      txHash,
      recipientAmount: recipientUnits.toString(),
      feeAmount:       feeUnits.toString(),
      gasReimb:        gasUnits.toString(),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[relay-gho]', msg)
    return res.status(500).json({ ok: false, error: msg.slice(0, 200) })
  }
}
