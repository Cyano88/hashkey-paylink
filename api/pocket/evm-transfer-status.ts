import type { Request, Response } from 'express'
import { verifiedPrivyUser } from '../privy-circle-link.js'
import { normalizeEvmUsdcChain, verifyEvmUsdcTransfer } from '../usdc-transfer-verify.js'

type Dependencies = {
  verifyUser: typeof verifiedPrivyUser
  verifyTransfer: typeof verifyEvmUsdcTransfer
}

function text(value: unknown, max = 180) {
  return String(value ?? '').trim().slice(0, max)
}

function isReceiptPending(reason: unknown) {
  return reason instanceof Error && /receipt was not found yet|no result for eth_getTransactionReceipt/i.test(reason.message)
}

export function createPocketEvmTransferStatusHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies: Dependencies = {
    verifyUser: verifiedPrivyUser,
    verifyTransfer: verifyEvmUsdcTransfer,
    ...overrides,
  }
  return async function pocketEvmTransferStatusHandler(req: Request, res: Response) {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    try {
      await dependencies.verifyUser(req)
      const chain = normalizeEvmUsdcChain(req.body?.chain)
      const txHash = text(req.body?.tx_hash, 80)
      const recipient = text(req.body?.recipient, 80)
      const amount = text(req.body?.amount, 30)
      if (!chain) return res.status(400).json({ ok: false, error: 'Unsupported withdrawal network.' })
      try {
        const verified = await dependencies.verifyTransfer({ chain, txHash, recipient, minAmount: amount })
        return res.json({ ok: true, status: 'confirmed', txHash, amount: verified.amount })
      } catch (reason) {
        if (isReceiptPending(reason)) return res.status(202).json({ ok: true, status: 'pending', txHash })
        throw reason
      }
    } catch (reason) {
      const error = reason as Error & { status?: number }
      return res.status(error.status ?? 400).json({ ok: false, error: error.message || 'Could not verify withdrawal.' })
    }
  }
}

export default createPocketEvmTransferStatusHandler()
