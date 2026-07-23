import type { Request, Response } from 'express'
import {
  hostedCheckoutAgentPaymentUrl,
  hostedCheckoutMode,
  hostedCheckoutPaymentAttempt,
  readVerifiedHostedCheckoutRecord,
  type CheckoutRecord,
} from './hosted-checkouts.js'
import {
  payAgentX402Service,
  readAgentWalletSnapshot,
} from './agent-wallet.js'
import {
  claimCirclePocketAction,
  recordCirclePocketAction,
  type CirclePocketActionRecord,
} from './circle-pocket-action-journal.js'
import {
  verifiedPrivyUser,
  type VerifiedLinkUser,
} from './privy-circle-link.js'
import { pocketX402WalletSlug } from '../src/pocket/lib/pocketX402Identity.js'
import { isPocketIdempotencyKey } from '../src/pocket/lib/pocketSchemas.js'

const ACTION = 'agentic-checkout.pay'

type Dependencies = {
  verifyUser(req: Request): Promise<VerifiedLinkUser>
  read(id: string): Promise<CheckoutRecord | null>
  readSnapshot(input: { agentSlug: string; network: 'base' | 'arc' }): ReturnType<typeof readAgentWalletSnapshot>
  pay(input: Parameters<typeof payAgentX402Service>[0]): ReturnType<typeof payAgentX402Service>
  claim(input: Parameters<typeof claimCirclePocketAction>[0]): ReturnType<typeof claimCirclePocketAction>
  record(input: Parameters<typeof recordCirclePocketAction>[0]): Promise<CirclePocketActionRecord>
  baseUrl(): string
  now(): Date
}

function clean(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max)
}

function validCheckoutId(value: unknown) {
  const id = clean(value, 80)
  return /^chk_[a-zA-Z0-9]{8,40}$/.test(id) ? id : ''
}

function validAttemptId(value: unknown) {
  const id = clean(value, 80)
  return /^pat_[a-zA-Z0-9]{8,60}$/.test(id) ? id : ''
}

function enoughBalance(balance: string | undefined, amount: string) {
  const available = Number(balance)
  const required = Number(amount)
  return Number.isFinite(available) && Number.isFinite(required) && available + 0.0000005 >= required
}

function checkoutResponse(record: CheckoutRecord, replayed: boolean) {
  const attempt = hostedCheckoutPaymentAttempt(record)
  return {
    ok: true,
    status: record.payment?.status === 'paid' ? 'paid' : 'processing',
    replayed,
    checkoutId: record.id,
    paymentAttemptId: attempt.id,
    network: record.payment?.network ?? attempt.network ?? record.network,
    ...(record.payment?.txHash ? { transaction: record.payment.txHash } : {}),
  }
}

export function createAgenticCheckoutWalletPayHandler(dependencies: Dependencies) {
  return async function agenticCheckoutWalletPayHandler(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    const idempotencyKey = clean(req.headers['idempotency-key'], 128)
    let ownerId = ''
    let checkoutAttempt = ''

    function fail(status: number, code: string, message: string, retryable = false) {
      return res.status(status).json({ ok: false, status: 'failed', error: { code, message, retryable } })
    }

    if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.')
    if (!isPocketIdempotencyKey(idempotencyKey)) {
      return fail(400, 'VALIDATION_FAILED', 'A valid Idempotency-Key header is required.')
    }
    const id = validCheckoutId(req.body?.checkoutId)
    const attemptId = validAttemptId(req.body?.paymentAttemptId)
    if (!id || !attemptId) return fail(400, 'VALIDATION_FAILED', 'A valid checkout and payment attempt are required.')

    try {
      const identity = await dependencies.verifyUser(req)
      ownerId = identity.userId
      const agentSlug = pocketX402WalletSlug(identity.email ?? '')
      if (!agentSlug) return fail(403, 'FORBIDDEN', 'A verified email is required for agent checkout.')

      let record = await dependencies.read(id)
      if (!record) return fail(404, 'RESOURCE_NOT_FOUND', 'Checkout not found.')
      const attempt = hostedCheckoutPaymentAttempt(record)
      if (attempt.id !== attemptId) return fail(409, 'VERSION_CONFLICT', 'Payment attempt does not match this checkout.')
      if (hostedCheckoutMode(record) !== 'agentic' || record.kind !== 'service' || record.flexible || record.settlement) {
        return fail(409, 'VERSION_CONFLICT', 'This checkout is not eligible for Circle Agent Wallet payment.')
      }
      if (record.payment?.status === 'paid') return res.json(checkoutResponse(record, true))
      if (dependencies.now().getTime() >= Date.parse(record.expiresAt)) {
        return fail(410, 'CHECKOUT_EXPIRED', 'Checkout expired.')
      }
      if (record.network !== 'base' && record.network !== 'arc') {
        return fail(409, 'NETWORK_UNAVAILABLE', 'Inline Circle Agent Wallet payment currently supports Base and Arc checkouts.')
      }

      const snapshot = await dependencies.readSnapshot({ agentSlug, network: record.network })
      if (!snapshot.connected || !snapshot.walletAddress) {
        return fail(409, 'WALLET_NOT_READY', 'Continue with email and verify the Circle wallet before paying.')
      }
      if (!snapshot.gatewayBalanceChecked || snapshot.gatewayBalance === undefined) {
        return fail(503, 'BALANCE_UNAVAILABLE', 'App Pay balance is temporarily unavailable.', true)
      }
      if (!enoughBalance(snapshot.gatewayBalance, record.amount)) {
        return fail(409, 'INSUFFICIENT_GATEWAY_BALANCE', `Add at least ${record.amount} USDC to App Pay before paying.`)
      }

      checkoutAttempt = `${record.id}:${attempt.id}`
      const claim = await dependencies.claim({
        ownerId,
        idempotencyKey,
        action: ACTION,
        metadata: {
          checkoutId: record.id,
          paymentAttemptId: attempt.id,
          checkoutAttempt,
          amount: record.amount,
          network: record.network,
        },
        dedupe: {
          metadataKey: 'checkoutAttempt',
          metadataValue: checkoutAttempt,
          statuses: ['started', 'submitted', 'completed'],
          // A crashed request must not leave this checkout permanently locked.
          // Keep recent in-flight work protected while allowing a safe retry.
          startedAfter: Math.max(
            Date.parse(record.createdAt),
            dependencies.now().getTime() - 10 * 60_000,
          ),
        },
      })
      if (!claim.claimed) {
        record = await dependencies.read(id)
        if (record?.payment?.status === 'paid') return res.json(checkoutResponse(record, true))
        return res.status(202).json({
          ok: true,
          status: 'processing',
          replayed: true,
          checkoutId: id,
          paymentAttemptId: attemptId,
        })
      }

      const relativePaymentUrl = hostedCheckoutAgentPaymentUrl(record)
      if (!relativePaymentUrl) throw Object.assign(new Error('Agent payment endpoint is unavailable.'), { status: 409 })
      const serviceUrl = new URL(relativePaymentUrl, dependencies.baseUrl()).toString()
      await dependencies.pay({
        agentSlug,
        sellerAgentSlug: agentSlug,
        serviceUrl,
        maxAmount: Number(record.amount),
        paymentChain: record.network === 'arc' ? 'ARC-TESTNET' : 'BASE',
        spendTitle: `Paid ${record.merchantName}`,
        spendDetail: `Paid ${record.amount} USDC for ${record.title}.`,
        appendResultActivity: false,
      })

      record = await dependencies.read(id)
      if (!record?.payment || record.payment.status !== 'paid') {
        await dependencies.record({
          ownerId,
          idempotencyKey,
          action: ACTION,
          status: 'submitted',
          metadata: {
            checkoutId: id,
            paymentAttemptId: attemptId,
            checkoutAttempt,
            amount: record?.amount ?? '',
            network: record?.network ?? '',
          },
        })
        return res.status(202).json({
          ok: true,
          status: 'processing',
          replayed: false,
          checkoutId: id,
          paymentAttemptId: attemptId,
        })
      }

      await dependencies.record({
        ownerId,
        idempotencyKey,
        action: ACTION,
        status: 'completed',
        resourceId: record.payment.txHash,
        metadata: {
          checkoutId: id,
          paymentAttemptId: attemptId,
          checkoutAttempt,
          amount: record.amount,
          network: record.payment.network ?? record.network,
        },
      })
      return res.json(checkoutResponse(record, false))
    } catch (error) {
      const normalized = error as Error & { status?: number; code?: string }
      if (ownerId && checkoutAttempt) {
        const uncertain = normalized.code === 'circle_payment_submitted_response_failed'
          || normalized.code === 'circle_payment_outcome_unknown'
        await dependencies.record({
          ownerId,
          idempotencyKey,
          action: ACTION,
          status: uncertain ? 'submitted' : 'failed',
          metadata: { checkoutAttempt },
        }).catch(() => undefined)
        if (uncertain) {
          return res.status(202).json({
            ok: true,
            status: 'processing',
            replayed: false,
            checkoutId: id,
            paymentAttemptId: attemptId,
          })
        }
      }
      if (normalized.status === 401) return fail(401, 'AUTH_REQUIRED', normalized.message)
      if (normalized.status === 403) return fail(403, 'FORBIDDEN', normalized.message)
      if (normalized.code === 'circle_session_expired') return fail(409, 'SESSION_EXPIRED', normalized.message)
      if (normalized.status === 409) return fail(409, 'VERSION_CONFLICT', normalized.message)
      if (normalized.status === 429) return fail(429, 'RATE_LIMITED', normalized.message, true)
      console.error('[agentic-checkout-wallet-pay] payment failed:', normalized.message)
      return fail(503, 'PROVIDER_UNAVAILABLE', 'Circle Agent Wallet payment is temporarily unavailable.', true)
    }
  }
}

export default createAgenticCheckoutWalletPayHandler({
  verifyUser: verifiedPrivyUser,
  read: id => readVerifiedHostedCheckoutRecord(id, { allowExpiredForReconciliation: true }),
  readSnapshot: readAgentWalletSnapshot,
  pay: payAgentX402Service,
  claim: claimCirclePocketAction,
  record: recordCirclePocketAction,
  baseUrl: () => process.env.HASH_PAYLINK_BASE_URL ?? 'https://hashpaylink.com',
  now: () => new Date(),
})
