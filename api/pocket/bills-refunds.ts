import { timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'
import { isAddress } from 'viem'
import {
  CircleTreasuryError,
  createCircleDeveloperTreasuryClient,
  readCircleTreasuryConfig,
  type CircleDeveloperTransaction,
} from '../circle-developer-treasury.js'
import { usdcAmountUnits, verifyEvmUsdcTransfer } from '../usdc-transfer-verify.js'
import { readVtpassPhase0Config } from '../vtpass-config.js'
import {
  PocketBillsStoreError,
  createPocketBillsStore,
  publicPocketBillsIntent,
} from './bills-store.js'

const BASE_USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
const TERMINAL_FAILURES = new Set(['FAILED', 'CANCELLED', 'DENIED'])
const PROCESSING_STATES = new Set(['INITIATED', 'QUEUED', 'CLEARED', 'SENT', 'STUCK', 'CONFIRMED'])

type BillsStore = ReturnType<typeof createPocketBillsStore>
type CircleClient = ReturnType<typeof createCircleDeveloperTreasuryClient>

type RefundDependencies = {
  billsConfig: ReturnType<typeof readVtpassPhase0Config>
  circleConfig: ReturnType<typeof readCircleTreasuryConfig>
  store: BillsStore
  circle: CircleClient
  verifyTransfer: typeof verifyEvmUsdcTransfer
}

function clean(value: unknown, max = 180) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function bearerAuthorized(req: Request) {
  const expected = process.env.ADMIN_SECRET?.trim() || process.env.CRON_SECRET?.trim() || ''
  const authorization = req.headers.authorization || ''
  const provided = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (expected.length < 24 || provided.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

function assertCircleTransactionMatches(transaction: CircleDeveloperTransaction, expected: {
  walletId: string
  treasuryAddress: string
  destinationAddress: string
  amount: string
  refId: string
}) {
  const mismatch = (
    (transaction.blockchain && transaction.blockchain !== 'BASE')
    || (transaction.transactionType && transaction.transactionType !== 'OUTBOUND')
    || (transaction.walletId && transaction.walletId !== expected.walletId)
    || (transaction.sourceAddress && transaction.sourceAddress.toLowerCase() !== expected.treasuryAddress.toLowerCase())
    || (transaction.destinationAddress && transaction.destinationAddress.toLowerCase() !== expected.destinationAddress.toLowerCase())
    || (transaction.amounts.length > 0 && transaction.amounts.some(amount => usdcAmountUnits(amount) !== usdcAmountUnits(expected.amount)))
    || (transaction.refId && transaction.refId !== expected.refId)
  )
  if (mismatch) {
    throw new PocketBillsStoreError('BILLS_REFUND_CIRCLE_MISMATCH', 'Circle refund transaction does not match this bill payment.', 409)
  }
}

function safeFailureReason(transaction: CircleDeveloperTransaction) {
  return clean([transaction.state, transaction.errorReason, transaction.errorDetails].filter(Boolean).join(': '), 240)
    || 'Circle refund transaction requires manual review.'
}

export function createPocketBillsRefundHandler(dependencies: RefundDependencies) {
  return async function pocketBillsRefundHandler(req: Request, res: Response) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed.' })
    }
    if (!bearerAuthorized(req)) {
      return res.status(process.env.ADMIN_SECRET || process.env.CRON_SECRET ? 401 : 503).json({
        ok: false,
        code: 'BILLS_REFUND_AUTH_REQUIRED',
        error: process.env.ADMIN_SECRET || process.env.CRON_SECRET ? 'Unauthorized.' : 'Admin authorization is not configured.',
      })
    }
    if (!dependencies.billsConfig.refundsReady) {
      return res.status(503).json({ ok: false, code: 'BILLS_REFUNDS_DISABLED', error: 'Automated Bills refunds are disabled.' })
    }
    if (!dependencies.circleConfig.verificationReady) {
      return res.status(503).json({ ok: false, code: 'BILLS_REFUND_TREASURY_NOT_READY', error: 'Circle Bills treasury is not ready.' })
    }

    const intentId = clean(req.body?.intentId, 100)
    if (!intentId) return res.status(400).json({ ok: false, code: 'BILLS_REFUND_INTENT_REQUIRED', error: 'Bill payment ID is required.' })

    try {
      let intent = await dependencies.store.getIntentById(intentId)
      if (!isAddress(intent.payerWallet) || intent.network !== 'base') {
        throw new PocketBillsStoreError('BILLS_REFUND_DESTINATION_INVALID', 'Bill refund destination is invalid.', 409)
      }
      if (intent.treasuryAddress.toLowerCase() !== dependencies.circleConfig.treasuryAddress.toLowerCase()) {
        throw new PocketBillsStoreError('BILLS_REFUND_TREASURY_MISMATCH', 'Legacy or unrelated treasury payments cannot be automated.', 409)
      }

      await dependencies.circle.verifyConfiguredWallet()
      const claim = await dependencies.store.claimRefund({
        intentId,
        treasuryAddress: dependencies.circleConfig.treasuryAddress,
      })
      intent = claim.intent

      if (intent.state === 'refunded') {
        return res.status(200).json({ ok: true, state: 'refunded', intent: publicPocketBillsIntent(intent) })
      }
      if (!claim.claimed && !intent.refundCircleTransactionId) {
        return res.status(202).json({ ok: true, state: 'refunding', message: 'Refund submission is already in progress.' })
      }

      const refId = `pocket-bills-refund:${intent.id}`
      const refundAmount = intent.paymentAmountUsdc || intent.amountUsdc
      if (!intent.refundCircleTransactionId) {
        const created = await dependencies.circle.createUsdcTransfer({
          idempotencyKey: intent.refundIdempotencyKey,
          destinationAddress: intent.payerWallet,
          amount: refundAmount,
          refId,
          tokenAddress: BASE_USDC_ADDRESS,
        })
        intent = await dependencies.store.recordCircleRefundSubmission({
          intentId,
          circleTransactionId: created.id,
        })
      }

      const transaction = await dependencies.circle.getTransaction(intent.refundCircleTransactionId)
      assertCircleTransactionMatches(transaction, {
        walletId: dependencies.circleConfig.walletId,
        treasuryAddress: dependencies.circleConfig.treasuryAddress,
        destinationAddress: intent.payerWallet,
        amount: refundAmount,
        refId,
      })
      intent = await dependencies.store.recordCircleRefundStatus({
        intentId,
        circleState: transaction.state,
        refundTxHash: transaction.txHash || undefined,
      })

      if (TERMINAL_FAILURES.has(transaction.state)) {
        intent = await dependencies.store.markNeedsReview(intent.ownerId, intent.id, safeFailureReason(transaction))
        return res.status(409).json({ ok: false, code: 'BILLS_REFUND_NEEDS_REVIEW', error: 'Refund needs manual review.', intent: publicPocketBillsIntent(intent) })
      }
      if (transaction.state !== 'COMPLETE') {
        if (!PROCESSING_STATES.has(transaction.state)) {
          throw new PocketBillsStoreError('BILLS_REFUND_CIRCLE_STATE_INVALID', 'Circle returned an unknown refund state.', 502)
        }
        return res.status(202).json({ ok: true, state: 'refund_submitted', intent: publicPocketBillsIntent(intent) })
      }
      if (!intent.refundTxHash) {
        throw new PocketBillsStoreError('BILLS_REFUND_TX_HASH_MISSING', 'Circle completed the refund without a transaction hash.', 502)
      }

      const verified = await dependencies.verifyTransfer({
        chain: 'base',
        txHash: intent.refundTxHash,
        payer: dependencies.circleConfig.treasuryAddress,
        recipient: intent.payerWallet,
        minAmount: refundAmount,
      })
      if (BigInt(verified.amountUnits) !== usdcAmountUnits(refundAmount)) {
        throw new PocketBillsStoreError('BILLS_REFUND_AMOUNT_MISMATCH', 'On-chain refund amount does not exactly match the bill payment.', 409)
      }
      intent = await dependencies.store.markRefunded(intent.ownerId, intent.id)
      return res.status(200).json({ ok: true, state: 'refunded', intent: publicPocketBillsIntent(intent) })
    } catch (error) {
      if (error instanceof PocketBillsStoreError || error instanceof CircleTreasuryError) {
        return res.status(error.status).json({ ok: false, code: error.code, error: error.message })
      }
      console.error('[pocket-bills-refund] reconciliation failed', {
        intentId,
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? clean(error.message, 240) : 'Unknown failure',
      })
      return res.status(502).json({
        ok: false,
        code: 'BILLS_REFUND_RECONCILIATION_FAILED',
        error: 'Refund status could not be reconciled. Do not submit a second refund.',
      })
    }
  }
}

function defaultDependencies(): RefundDependencies {
  const billsConfig = readVtpassPhase0Config()
  const circleConfig = readCircleTreasuryConfig()
  return {
    billsConfig,
    circleConfig,
    store: createPocketBillsStore({ config: billsConfig }),
    circle: createCircleDeveloperTreasuryClient({ config: circleConfig }),
    verifyTransfer: verifyEvmUsdcTransfer,
  }
}

export async function pocketBillsRefundHandler(req: Request, res: Response) {
  return createPocketBillsRefundHandler(defaultDependencies())(req, res)
}
