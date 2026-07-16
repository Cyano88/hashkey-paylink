import type { Request, Response } from 'express'
import { PublicKey } from '@solana/web3.js'
import { readSolanaUsdcBalance } from '../solana-balance.js'
import type { PocketErrorCode } from '../../src/pocket/lib/pocketSchemas.js'

type PocketRecipientBalanceDependencies = {
  isValidAddress(address: string): boolean
  readBalance(address: string): Promise<{ balance: bigint }>
}

const dependencies: PocketRecipientBalanceDependencies = {
  isValidAddress(address) {
    try {
      new PublicKey(address)
      return true
    } catch {
      return false
    }
  },
  readBalance: readSolanaUsdcBalance,
}

function errorCode(status: number): PocketErrorCode {
  if (status === 400 || status === 405) return 'VALIDATION_FAILED'
  if (status === 429) return 'RATE_LIMITED'
  if (status === 503) return 'PROVIDER_UNAVAILABLE'
  return 'INTERNAL_ERROR'
}

export function createPocketRecipientBalanceHandler(overrides: PocketRecipientBalanceDependencies = dependencies) {
  return async function pocketRecipientBalanceHandler(req: Request, res: Response) {
    const fail = (status: number, message: string, retryable = status >= 500 || status === 429) => res.status(status).json({
      ok: false,
      error: { code: errorCode(status), message, retryable },
    })

    if (req.method !== 'POST') return fail(405, 'Method not allowed.', false)
    const body = (req.body ?? {}) as Record<string, unknown>
    if (body.network !== 'solana') return fail(400, 'Recipient balance network must be solana.', false)
    const address = typeof body.address === 'string' ? body.address.trim() : ''
    if (!address || address.length > 64 || !overrides.isValidAddress(address)) {
      return fail(400, 'Enter a valid Solana wallet address.', false)
    }

    try {
      const result = await overrides.readBalance(address)
      return res.json({ ok: true, network: 'solana', balance: result.balance.toString() })
    } catch (reason) {
      console.error('[pocket-recipient-balance] Solana balance query failed', {
        message: reason instanceof Error ? reason.message : 'Solana balance query failed',
      })
      return fail(503, 'Recipient balance is temporarily unavailable.')
    }
  }
}

export default createPocketRecipientBalanceHandler()
