/**
 * /api/solana-balance
 *
 * Server-side proxy for Solana USDC balance reads. The dashboard uses this
 * read-only endpoint so balance indexing goes through the configured private
 * backend RPC instead of browser-origin RPC calls.
 *
 * Body: { accountAddress: string }
 * Response: { ok: true, balance: string, ata: string | null }
 */

import type { Request, Response } from 'express'
import { Connection, PublicKey } from '@solana/web3.js'
import { solanaReadFetch } from './solana-read.js'
import {
  getAssociatedTokenAddress,
  readTokenAccountAmount,
} from './solana-token.js'

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
const PUBLIC_SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com'

export async function readSolanaUsdcBalance(accountAddress: string, fetcher: typeof fetch = solanaReadFetch) {
  const owner = new PublicKey(accountAddress)
  const ata = await getAssociatedTokenAddress(USDC_MINT, owner, true)
  const connection = new Connection(PUBLIC_SOLANA_RPC_URL, {
    commitment: 'confirmed', disableRetryOnRateLimit: true, fetch: fetcher,
  })
  const amount = await readTokenAccountAmount(connection, ata)
  return amount === null ? { balance: 0n, ata: null } : { balance: amount, ata: ata.toBase58() }
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const { accountAddress } = (req.body ?? {}) as Record<string, string>
  if (typeof accountAddress !== 'string' || !accountAddress.trim()) {
    return res.status(400).json({ ok: false, error: 'accountAddress required' })
  }

  try {
    const result = await readSolanaUsdcBalance(accountAddress)
    return res.json({ ok: true, balance: result.balance.toString(), ata: result.ata })
  } catch (error) {
    const invalidAddress = (() => {
      try { new PublicKey(accountAddress); return false } catch { return true }
    })()
    if (!invalidAddress) console.error('[solana-balance] balance query failed', { errorType: error instanceof Error ? error.name : 'UnknownError' })
    return res.status(invalidAddress ? 400 : 500).json({ ok: false, error: invalidAddress ? 'Invalid Solana wallet address' : 'Solana balance query failed' })
  }
}
