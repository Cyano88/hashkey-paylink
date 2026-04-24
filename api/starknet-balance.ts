/**
 * /api/starknet-balance
 *
 * Server-side proxy for Starknet balanceOf calls.
 * The browser cannot call Starknet RPCs directly (CORS), so the frontend
 * calls this endpoint instead. The server has no CORS restrictions.
 *
 * Body: { tokenAddress: string, accountAddress: string }
 * Response: { ok: true, balance: string (hex), tokenAddress: string }
 *
 * When tokenAddress is either known USDC contract, both are checked so the
 * caller doesn't need to know which USDC variant the user holds.
 */

import type { Request, Response } from 'express'
import { RpcProvider } from 'starknet'

/** Circle native USDC on Starknet Mainnet */
const USDC_NEW = '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8'
/** Legacy StarkGate bridged USDC — older wallets may still hold this */
const USDC_OLD = '0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb'

const KNOWN_USDC = new Set([USDC_NEW.toLowerCase(), USDC_OLD.toLowerCase()])

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

  // If either USDC contract is requested, check both — wallets may hold either variant.
  const candidates = KNOWN_USDC.has(tokenAddress.toLowerCase())
    ? [tokenAddress, tokenAddress.toLowerCase() === USDC_NEW.toLowerCase() ? USDC_OLD : USDC_NEW]
    : [tokenAddress]

  console.log(`[starknet-balance] checking account=${accountAddress} across ${candidates.length} token(s)`)

  for (const token of candidates) {
    for (const entrypoint of ['balanceOf', 'balance_of']) {
      try {
        const result = await provider.callContract({
          contractAddress: token,
          entrypoint,
          calldata: [accountAddress],
        }, 'latest')
        const balance = result[0] ?? '0x0'
        console.log(`[starknet-balance] token=${token} balance=${balance} (${entrypoint}) for ${accountAddress}`)
        if (balance !== '0x0') {
          return res.json({ ok: true, balance, tokenAddress: token })
        }
        // Zero balance on this token — try the next candidate
        break  // entrypoint worked, no need to try balance_of too
      } catch (err) {
        console.log(`[starknet-balance] ${entrypoint} on ${token} failed:`, err instanceof Error ? err.message : String(err))
      }
    }
  }

  // All candidates returned 0 — still a valid (zero) result
  console.log(`[starknet-balance] balance=0x0 for ${accountAddress} across all candidates`)
  return res.json({ ok: true, balance: '0x0', tokenAddress })
}
