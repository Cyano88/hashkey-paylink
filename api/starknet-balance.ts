/**
 * /api/starknet-balance
 *
 * Server-side proxy for Starknet balanceOf calls.
 * The browser cannot call Starknet RPCs directly (CORS), so the frontend
 * calls this endpoint instead. The server has no CORS restrictions.
 *
 * Body: { tokenAddress: string, accountAddress: string }
 * Response: { ok: true, balance: string (hex) }
 */

import type { Request, Response } from 'express'
import { RpcProvider } from 'starknet'

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const { tokenAddress, accountAddress } = (req.body ?? {}) as Record<string, string>
  if (!tokenAddress || !accountAddress) {
    return res.status(400).json({ ok: false, error: 'tokenAddress and accountAddress required' })
  }

  const rpcUrl   = process.env.STARKNET_RPC_URL ?? 'https://rpc.starknet.lava.build'
  const provider = new RpcProvider({ nodeUrl: rpcUrl })

  console.log(`[starknet-balance] checking token=${tokenAddress} account=${accountAddress}`)

  for (const entrypoint of ['balanceOf', 'balance_of']) {
    try {
      const result = await provider.callContract({
        contractAddress: tokenAddress,
        entrypoint,
        calldata: [accountAddress],
      }, 'latest')
      // balanceOf returns Uint256 [low, high]; USDC amounts always fit in low
      const balance = result[0] ?? '0x0'
      console.log(`[starknet-balance] balance=${balance} (entrypoint=${entrypoint}) for ${accountAddress}`)
      return res.json({ ok: true, balance })
    } catch (err) {
      console.log(`[starknet-balance] ${entrypoint} failed:`, err instanceof Error ? err.message : String(err))
    }
  }

  console.error(`[starknet-balance] both entrypoints failed for ${accountAddress}`)
  return res.status(500).json({ ok: false, error: 'balanceOf call failed for both entrypoints' })
}
