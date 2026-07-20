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
import { createVtpassClient } from '../vtpass-client.js'
import { verifiedPrivyUser, type VerifiedLinkUser } from '../privy-circle-link.js'
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
  provider: Pick<ReturnType<typeof createVtpassClient>, 'requeryTransaction'>
  verifyTransfer: typeof verifyEvmUsdcTransfer
}

type UserRefundDependencies = RefundDependencies & {
  verifyUser(req: Request): Promise<VerifiedLinkUser>
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

async function processPocketBillsRefund(dependencies: RefundDependencies, intentId: string, ownerId = '') {
  if (!dependencies.billsConfig.refundsReady) {
    throw new PocketBillsStoreError('BILLS_REFUNDS_DISABLED', 'Bills refunds are not available yet.', 503)
  }
  if (!dependencies.circleConfig.verificationReady) {
    throw new PocketBillsStoreError('BILLS_REFUND_TREASURY_NOT_READY', 'Circle Bills treasury is not ready.', 503)
  }
  let intent = await dependencies.store.getIntentById(intentId)
  if (ownerId && intent.ownerId !== ownerId) {
    throw new PocketBillsStoreError('BILLS_FORBIDDEN', 'Bill payment does not belong to this Pocket account.', 403)
  }
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
    return { status: 200, state: 'refunded', intent: publicPocketBillsIntent(intent) }
  }
  if (!claim.claimed && !intent.refundCircleTransactionId) {
    return { status: 202, state: 'refunding', intent: publicPocketBillsIntent(intent), message: 'Refund submission is already in progress.' }
  }

  if (claim.claimed) {
    try {
      const providerResult = await dependencies.provider.requeryTransaction(intent.requestId)
      intent = await dependencies.store.recordProviderResult(intent.ownerId, intent.id, providerResult, { requery: true })
      const failureConfirmed = (providerResult.status === 'failed' || providerResult.status === 'reversed')
        && intent.state === 'refunding'
      if (!failureConfirmed) {
        const delivered = providerResult.status === 'delivered' || intent.state === 'delivered'
        throw new PocketBillsStoreError(
          delivered ? 'BILLS_REFUND_PROVIDER_DELIVERED' : 'BILLS_REFUND_PROVIDER_PENDING',
          delivered
            ? 'VTpass confirms this bill was delivered. Refund is not available.'
            : 'VTpass has not confirmed a final failed transaction. Refund remains unavailable.',
          409,
        )
      }
    } catch (error) {
      const latest = await dependencies.store.getIntentById(intent.id)
      if (latest.state === 'refunding' && !latest.refundCircleTransactionId) {
        if (error instanceof PocketBillsStoreError && error.code === 'BILLS_PROVIDER_MISMATCH') {
          await dependencies.store.markNeedsReview(latest.ownerId, latest.id, error.message)
        } else {
          await dependencies.store.releaseRefundClaim({
            ownerId: latest.ownerId,
            intentId: latest.id,
            reason: error instanceof Error ? error.message : 'VTpass refund eligibility could not be refreshed.',
          })
        }
      }
      if (error instanceof PocketBillsStoreError) throw error
      throw new PocketBillsStoreError('BILLS_REFUND_PROVIDER_REQUERY_FAILED', 'VTpass refund eligibility could not be verified. Try again later.', 503)
    }
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
    throw new PocketBillsStoreError('BILLS_REFUND_NEEDS_REVIEW', 'Refund needs manual review.', 409)
  }

  if (intent.refundTxHash) {
    try {
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
      return { status: 200, state: 'refunded', intent: publicPocketBillsIntent(intent) }
    } catch (error) {
      if (transaction.state === 'COMPLETE' || error instanceof PocketBillsStoreError) throw error
    }
  }

  if (transaction.state === 'COMPLETE') {
    throw new PocketBillsStoreError('BILLS_REFUND_TX_HASH_MISSING', 'Circle completed the refund without a transaction hash.', 502)
  }
  if (!PROCESSING_STATES.has(transaction.state)) {
    throw new PocketBillsStoreError('BILLS_REFUND_CIRCLE_STATE_INVALID', 'Circle returned an unknown refund state.', 502)
  }
  return { status: 202, state: 'refund_submitted', intent: publicPocketBillsIntent(intent) }
}

function refundFailure(res: Response, error: unknown, intentId: string) {
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
    const intentId = clean(req.body?.intentId, 100)
    if (!intentId) return res.status(400).json({ ok: false, code: 'BILLS_REFUND_INTENT_REQUIRED', error: 'Bill payment ID is required.' })
    try {
      const result = await processPocketBillsRefund(dependencies, intentId)
      return res.status(result.status).json({ ok: true, state: result.state, intent: result.intent, ...(result.message ? { message: result.message } : {}) })
    } catch (error) {
      return refundFailure(res, error, intentId)
    }
  }
}

export function createPocketBillsUserRefundHandler(dependencies: UserRefundDependencies) {
  return async function pocketBillsUserRefundHandler(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.', retryable: false } })
    }
    const intentId = clean(req.body?.intent_id, 100)
    try {
      const identity = await dependencies.verifyUser(req)
      if (!intentId) return res.status(400).json({ ok: false, error: { code: 'BILLS_REFUND_INTENT_REQUIRED', message: 'Bill payment ID is required.', retryable: false } })
      await dependencies.store.consumeMutationLimit({ ownerId: identity.userId, action: 'refund', windowMs: 10 * 60_000, max: 4 })
      const result = await processPocketBillsRefund(dependencies, intentId, identity.userId)
      return res.status(result.status).json({
        ok: true,
        data: { state: result.state, intent: result.intent, ...(result.message ? { message: result.message } : {}) },
      })
    } catch (error) {
      if (error instanceof PocketBillsStoreError || error instanceof CircleTreasuryError) {
        return res.status(error.status).json({ ok: false, error: { code: error.code, message: error.message, retryable: error.status >= 500 } })
      }
      const status = Number((error as { status?: unknown })?.status)
      if (status === 401 || status === 403) {
        return res.status(status).json({ ok: false, error: { code: status === 401 ? 'AUTH_REQUIRED' : 'FORBIDDEN', message: error instanceof Error ? error.message : 'Authentication failed.', retryable: false } })
      }
      console.error('[pocket-bills-refund] user reconciliation failed', {
        intentId,
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? clean(error.message, 240) : 'Unknown failure',
      })
      return res.status(502).json({ ok: false, error: { code: 'BILLS_REFUND_RECONCILIATION_FAILED', message: 'Refund status could not be reconciled. Do not submit a second refund.', retryable: true } })
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
    provider: createVtpassClient({ config: billsConfig }),
    verifyTransfer: verifyEvmUsdcTransfer,
  }
}

export async function pocketBillsRefundHandler(req: Request, res: Response) {
  return createPocketBillsRefundHandler(defaultDependencies())(req, res)
}

export async function pocketBillsUserRefundHandler(req: Request, res: Response) {
  return createPocketBillsUserRefundHandler({ ...defaultDependencies(), verifyUser: verifiedPrivyUser })(req, res)
}
