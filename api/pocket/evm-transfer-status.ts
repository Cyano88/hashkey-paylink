import type { Request, Response } from 'express'
import { circleLinkKey, readCircleLink, verifiedPrivyUser } from '../privy-circle-link.js'
import { findEvmUsdcTransfer, normalizeEvmUsdcChain, verifyEvmUsdcTransfer } from '../usdc-transfer-verify.js'

type Dependencies = {
  verifyUser: typeof verifiedPrivyUser
  verifyTransfer: typeof verifyEvmUsdcTransfer
  findTransfer: typeof findEvmUsdcTransfer
  readLink: typeof readCircleLink
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
    findTransfer: findEvmUsdcTransfer,
    readLink: readCircleLink,
    ...overrides,
  }
  return async function pocketEvmTransferStatusHandler(req: Request, res: Response) {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    try {
      const identity = await dependencies.verifyUser(req)
      const chain = normalizeEvmUsdcChain(req.body?.chain)
      const txHash = text(req.body?.tx_hash, 80)
      const payer = text(req.body?.payer, 80)
      const recipient = text(req.body?.recipient, 80)
      const amount = text(req.body?.amount, 30)
      const notBefore = text(req.body?.not_before, 40)
      const notAfter = text(req.body?.not_after, 40)
      if (!chain) return res.status(400).json({ ok: false, error: 'Unsupported withdrawal network.' })

      if (!txHash) {
        const earliest = Date.parse(notBefore)
        const deadline = Date.parse(notAfter)
        if (!Number.isFinite(earliest) || !Number.isFinite(deadline) || deadline < earliest || deadline - earliest > 45 * 60_000) {
          return res.status(400).json({ ok: false, error: 'Transfer recovery window is invalid.' })
        }
        const link = await dependencies.readLink(circleLinkKey(identity.userId, chain, 'payment'))
        if (!link || link.circleWalletAddress.toLowerCase() !== payer.toLowerCase()) {
          return res.status(403).json({ ok: false, error: 'Transfer sender does not match your linked Pocket wallet.' })
        }
        const found = await dependencies.findTransfer({
          chain,
          payer,
          recipient,
          minAmount: amount,
          exactAmount: true,
          notBefore,
          notAfter,
          lookbackBlocks: 50_000n,
          chunkSize: 2_000n,
        })
        if (!found) return res.status(202).json({ ok: true, status: 'pending' })
        return res.json({ ok: true, status: 'confirmed', txHash: found.txHash, amount: found.amount })
      }

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
