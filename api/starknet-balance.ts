/**
 * /api/starknet-balance
 *
 * Server-side proxy for Starknet balanceOf calls.
 * Only checks Circle USDC (0x053c91…) — the sole supported token for
 * AVNU gasless payments. Legacy StarkGate USDC is excluded from the
 * primary flow; the relay handles it with a helpful error message.
 *
 * Body: { tokenAddress: string, accountAddress: string }
 * Response: { ok: true, balance: string (hex) }
 */

import type { Request, Response } from 'express'
import { RpcProvider } from 'starknet'

/** Circle native USDC — the ONLY token used in the Direct Send flow */
const USDC_CIRCLE = '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8'

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const { accountAddress } = (req.body ?? {}) as Record<string, string>
  if (!accountAddress) {
    return res.status(400).json({ ok: false, error: 'accountAddress required' })
  }

  const rpcUrl   = process.env.STARKNET_RPC_URL ?? 'https://rpc.starknet.lava.build'
  const provider = new RpcProvider({ nodeUrl: rpcUrl })

  console.log(`[starknet-balance] checking Circle USDC for ${accountAddress}`)

  try {
    const result = await provider.callContract({
      contractAddress: USDC_CIRCLE,
      entrypoint:      'balanceOf',
      calldata:        [accountAddress],
    }, 'latest')
    const balance = result[0] ?? '0x0'
    console.log(`[starknet-balance] balance=${balance} for ${accountAddress}`)
    return res.json({ ok: true, balance, tokenAddress: USDC_CIRCLE })
  } catch (err) {
    console.error(`[starknet-balance] balanceOf failed:`, err instanceof Error ? err.message : String(err))
    return res.status(500).json({ ok: false, error: 'balanceOf call failed' })
  }
}
