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
import {
  getAccount,
  getAssociatedTokenAddress,
  TokenAccountNotFoundError,
} from '@solana/spl-token'

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
const PUBLIC_SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com'

function solanaRpcUrls() {
  const configured = process.env.SOLANA_RPC_URL?.trim()
  return configured && configured !== PUBLIC_SOLANA_RPC_URL
    ? [configured, PUBLIC_SOLANA_RPC_URL]
    : [PUBLIC_SOLANA_RPC_URL]
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const { accountAddress } = (req.body ?? {}) as Record<string, string>
  if (!accountAddress) {
    return res.status(400).json({ ok: false, error: 'accountAddress required' })
  }

  try {
    const owner = new PublicKey(accountAddress)
    const ata = await getAssociatedTokenAddress(USDC_MINT, owner, true)

    let lastError: unknown
    for (const [index, rpcUrl] of solanaRpcUrls().entries()) {
      try {
        const connection = new Connection(rpcUrl, 'confirmed')
        const account = await getAccount(connection, ata)
        return res.json({
          ok: true,
          balance: account.amount.toString(),
          ata: ata.toBase58(),
        })
      } catch (error) {
        if (error instanceof TokenAccountNotFoundError) {
          return res.json({ ok: true, balance: '0', ata: null })
        }
        lastError = error
        const message = error instanceof Error ? error.message : 'Solana balance query failed'
        console.error('[solana-balance] balance RPC failed', {
          rpc: index === 0 && solanaRpcUrls().length > 1 ? 'configured' : 'public',
          message,
        })
      }
    }

    const message = lastError instanceof Error ? lastError.message : 'Solana balance query failed'
    console.error('[solana-balance] balance query failed', { message })
    return res.status(500).json({ ok: false, error: message || 'Solana balance query failed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid Solana wallet address'
    return res.status(400).json({ ok: false, error: message || 'Invalid Solana wallet address' })
  }
}
