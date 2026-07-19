import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import { circleLinkKey, readCircleLink, verifiedPrivyUser, type VerifiedLinkUser } from '../privy-circle-link.js'
import { createPocketFxQuoteReader, type PocketFxQuote } from './fx-quote.js'
import { verifyEvmUsdcTransfer } from '../usdc-transfer-verify.js'
import {
  VtpassClientError,
  createVtpassClient,
  type VtpassTransactionResult,
} from '../vtpass-client.js'
import { readVtpassPhase0Config, type VtpassPhase0Config } from '../vtpass-config.js'
import {
  PocketBillsStoreError,
  createPocketBillsStore,
  publicPocketBillsIntent,
  type PocketBillsIntent,
} from './bills-store.js'
import { isPocketIdempotencyKey, type PocketErrorCode } from '../../src/pocket/lib/pocketSchemas.js'

type VtpassClient = ReturnType<typeof createVtpassClient>
type BillsStore = ReturnType<typeof createPocketBillsStore>

type BillsDependencies = {
  config: VtpassPhase0Config
  verifyUser(req: Request): Promise<VerifiedLinkUser>
  readPayerWallet(ownerId: string): Promise<string>
  store: BillsStore
  provider: VtpassClient
  readFxQuote(amount?: string): Promise<PocketFxQuote>
  verifyTransfer(input: Parameters<typeof verifyEvmUsdcTransfer>[0]): ReturnType<typeof verifyEvmUsdcTransfer>
  now(): number
  requestId(): string
}

function cleanText(value: unknown, max = 180) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizeNigerianPhone(value: unknown) {
  let phone = cleanText(value, 30).replace(/[\s()-]/g, '')
  if (phone.startsWith('+234')) phone = `0${phone.slice(4)}`
  else if (phone.startsWith('234') && phone.length === 13) phone = `0${phone.slice(3)}`
  return /^0\d{10}$/.test(phone) ? phone : ''
}

function canonicalNgn(value: unknown) {
  const raw = cleanText(value, 30)
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw) || Number(raw) <= 0) return ''
  const [whole, fraction = ''] = raw
    .split('.')
  const cleanWhole = whole.replace(/^0+(?=\d)/, '') || '0'
  const cleanFraction = fraction.padEnd(2, '0').slice(0, 2)
  return `${cleanWhole}.${cleanFraction}`
}

function usdcForNgn(amountNgn: string, rate: number) {
  const amount = Number(amountNgn)
  if (!Number.isFinite(amount) || !Number.isFinite(rate) || amount <= 0 || rate <= 0) {
    throw new PocketBillsStoreError('BILLS_INVALID_QUOTE', 'Could not calculate a valid USDC quote.', 503)
  }
  const units = Math.ceil((amount / rate) * 1_000_000)
  if (!Number.isSafeInteger(units) || units <= 0) throw new PocketBillsStoreError('BILLS_INVALID_QUOTE', 'Could not calculate a valid USDC quote.', 503)
  const whole = Math.floor(units / 1_000_000)
  const fraction = String(units % 1_000_000).padStart(6, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : String(whole)
}

async function assertProviderReserve(dependencies: BillsDependencies, amountNgn: string) {
  const reserve = dependencies.config.minimumProviderBalanceNgn
  if (reserve === null) throw new PocketBillsStoreError('BILLS_POLICY_NOT_READY', 'Bill-payment reserve policy is not configured.', 503)
  const balance = await dependencies.provider.getWalletBalance()
  if (balance < Number(amountNgn) + reserve) {
    throw new PocketBillsStoreError('BILLS_PROVIDER_RESERVE_LOW', 'Bill payments are temporarily unavailable.', 503)
  }
  return balance
}

function paymentVerificationError(error: unknown) {
  const message = error instanceof Error ? error.message : 'On-chain payment could not be verified.'
  if (/not found yet|confirmation block|confirmation time|RPC HTTP 429|RPC HTTP 5\d\d/i.test(message)) {
    return new PocketBillsStoreError('BILLS_PAYMENT_PENDING', 'Payment confirmation is still pending. Try again shortly.', 409)
  }
  if (/PRIVATE_RPC_URL|RPC /i.test(message)) {
    return new PocketBillsStoreError('BILLS_PAYMENT_VERIFIER_UNAVAILABLE', 'Payment verification is temporarily unavailable.', 503)
  }
  return new PocketBillsStoreError('BILLS_PAYMENT_INVALID', message, 409)
}

function syntheticPending(intent: PocketBillsIntent, description: string): VtpassTransactionResult {
  return {
    status: 'pending',
    providerCode: '',
    providerStatus: 'pending',
    responseDescription: description,
    requestId: intent.requestId,
    transactionId: '',
    productName: intent.serviceName,
    recipient: intent.phone,
    amountNgn: Number(intent.amountNgn),
    purchasedCode: '',
    retryable: true,
    requeryRequired: true,
  }
}

function syntheticFailed(intent: PocketBillsIntent, error: VtpassClientError): VtpassTransactionResult {
  return {
    status: 'failed',
    providerCode: error.providerCode,
    providerStatus: 'failed',
    responseDescription: error.message,
    requestId: intent.requestId,
    transactionId: '',
    productName: intent.serviceName,
    recipient: intent.phone,
    amountNgn: Number(intent.amountNgn),
    purchasedCode: '',
    retryable: error.retryable,
    requeryRequired: false,
  }
}

function mapError(error: unknown): { status: number; code: PocketErrorCode; message: string; retryable: boolean } {
  if (error instanceof PocketBillsStoreError) {
    const code: PocketErrorCode = error.code === 'BILLS_PAYMENT_PENDING' || error.code === 'BILLS_WALLET_NOT_LINKED'
      ? 'CONFIRMATION_REQUIRED'
      : error.status === 401
      ? 'AUTH_REQUIRED'
      : error.status === 403
        ? 'FORBIDDEN'
        : error.code.includes('IDEMPOTENCY') || error.code.includes('REUSED')
          ? 'DUPLICATE_REQUEST'
          : error.status === 404
            ? 'RESOURCE_NOT_FOUND'
            : error.status === 409
              ? 'VERSION_CONFLICT'
              : error.status >= 500
                ? 'PROVIDER_UNAVAILABLE'
                : 'VALIDATION_FAILED'
    return { status: error.status, code, message: error.message, retryable: error.code === 'BILLS_PAYMENT_PENDING' || error.status >= 500 }
  }
  if (error instanceof VtpassClientError) {
    return {
      status: error.status,
      code: error.code === 'VTPASS_ACCESS_DENIED' ? 'FORBIDDEN' : 'PROVIDER_UNAVAILABLE',
      message: error.message,
      retryable: error.retryable,
    }
  }
  const normalized = error as Error & { status?: number }
  if (normalized?.status === 401) return { status: 401, code: 'AUTH_REQUIRED', message: normalized.message, retryable: false }
  if (normalized?.status === 403) return { status: 403, code: 'FORBIDDEN', message: normalized.message, retryable: false }
  const status = normalized?.status ?? 500
  return {
    status,
    code: 'ACTION_FAILED',
    message: status >= 500 ? 'Bills are temporarily unavailable. Please try again shortly.' : normalized?.message || 'Bill payment failed.',
    retryable: status >= 500,
  }
}

function createResponder(req: Request, res: Response, requestId: string) {
  const rawIdempotencyKey = cleanText(req.headers['idempotency-key'], 128)
  return {
    success(data: unknown, status: 'processing' | 'completed' = 'completed') {
      return res.json({
        ok: true,
        requestId,
        idempotencyKey: isPocketIdempotencyKey(rawIdempotencyKey) ? rawIdempotencyKey : 'pocket:bills:read-request',
        status,
        data,
      })
    },
    fail(error: unknown, field?: string) {
      const mapped = mapError(error)
      return res.status(mapped.status).json({
        ok: false,
        requestId,
        idempotencyKey: isPocketIdempotencyKey(rawIdempotencyKey) ? rawIdempotencyKey : 'pocket:bills:invalid-request',
        status: 'failed',
        error: { code: mapped.code, message: mapped.message.slice(0, 220), retryable: mapped.retryable, ...(field ? { field } : {}) },
      })
    },
  }
}

export function createPocketBillsQuoteHandler(dependencies: BillsDependencies) {
  return async function pocketBillsQuoteHandler(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    const requestId = dependencies.requestId()
    const respond = createResponder(req, res, requestId)
    if (req.method !== 'POST') return respond.fail(new PocketBillsStoreError('BILLS_METHOD_NOT_ALLOWED', 'Method not allowed.', 405))
    const idempotencyKey = cleanText(req.headers['idempotency-key'], 128)
    if (!isPocketIdempotencyKey(idempotencyKey)) return respond.fail(new PocketBillsStoreError('BILLS_INVALID_IDEMPOTENCY_KEY', 'A valid Idempotency-Key header is required.'), 'idempotencyKey')
    if (!dependencies.config.canVend) return respond.fail(new PocketBillsStoreError('BILLS_DISABLED', 'Bill payments are not enabled on this server.', 503))

    try {
      const identity = await dependencies.verifyUser(req)
      const serviceId = cleanText(req.body?.service_id, 40).toLowerCase()
      const phone = normalizeNigerianPhone(req.body?.phone)
      const amountNgn = canonicalNgn(req.body?.amount_ngn)
      const payerWallet = cleanText(req.body?.payer_wallet, 80)
      if (!phone) return respond.fail(new PocketBillsStoreError('BILLS_INVALID_PHONE', 'Enter a valid Nigerian phone number.'), 'phone')
      if (dependencies.config.environment === 'sandbox' && phone !== '08011111111') {
        return respond.fail(new PocketBillsStoreError(
          'BILLS_SANDBOX_PHONE_REQUIRED',
          'VTpass sandbox Airtime uses the test number 08011111111. No real Airtime is delivered.',
        ), 'phone')
      }
      if (!amountNgn) return respond.fail(new PocketBillsStoreError('BILLS_INVALID_AMOUNT', 'Enter a valid Naira amount.'), 'amountNgn')
      const linkedPayerWallet = await dependencies.readPayerWallet(identity.userId)
      if (!linkedPayerWallet || linkedPayerWallet.toLowerCase() !== payerWallet.toLowerCase()) {
        return respond.fail(new PocketBillsStoreError('BILLS_WALLET_NOT_LINKED', 'Open your linked Base Circle wallet first.', 409), 'payerWallet')
      }

      const services = await dependencies.provider.listAirtimeServices()
      const service = services.find(item => item.serviceId === serviceId)
      if (!service) return respond.fail(new PocketBillsStoreError('BILLS_INVALID_SERVICE', 'Select a supported Airtime network.'), 'serviceId')
      const amount = Number(amountNgn)
      if (service.minimumAmount !== null && amount < service.minimumAmount) return respond.fail(new PocketBillsStoreError('BILLS_AMOUNT_BELOW_PROVIDER_LIMIT', `Minimum ${service.name} Airtime amount is NGN ${service.minimumAmount}.`), 'amountNgn')
      if (service.maximumAmount !== null && amount > service.maximumAmount) return respond.fail(new PocketBillsStoreError('BILLS_AMOUNT_ABOVE_PROVIDER_LIMIT', `Maximum ${service.name} Airtime amount is NGN ${service.maximumAmount}.`), 'amountNgn')
      await assertProviderReserve(dependencies, amountNgn)

      const fx = await dependencies.readFxQuote('1')
      const created = await dependencies.store.createQuote({
        ownerId: identity.userId,
        idempotencyKey,
        serviceId: service.serviceId,
        serviceName: service.name,
        phone,
        amountNgn,
        amountUsdc: usdcForNgn(amountNgn, fx.rate),
        fxRateNgnPerUsdc: String(fx.rate),
        payerWallet,
        quoteExpiresAt: Math.min(fx.expiresAt, dependencies.now() + 60_000),
      })
      return respond.success({ intent: publicPocketBillsIntent(created.intent), replayed: !created.created })
    } catch (error) {
      return respond.fail(error)
    }
  }
}

export function createPocketBillsPayHandler(dependencies: BillsDependencies) {
  return async function pocketBillsPayHandler(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    const requestId = dependencies.requestId()
    const respond = createResponder(req, res, requestId)
    if (req.method !== 'POST') return respond.fail(new PocketBillsStoreError('BILLS_METHOD_NOT_ALLOWED', 'Method not allowed.', 405))
    try {
      const identity = await dependencies.verifyUser(req)
      const action = cleanText(req.body?.action, 30)
      if (action === 'list') {
        const intents = await dependencies.store.listOwnedIntents(identity.userId, Number(req.body?.limit ?? 50))
        return respond.success({ intents: intents.map(publicPocketBillsIntent) })
      }

      const intentId = cleanText(req.body?.intent_id, 100)
      if (!intentId) return respond.fail(new PocketBillsStoreError('BILLS_MISSING_INTENT', 'Bill payment ID is required.'), 'intentId')

      if (action === 'prepare') {
        if (!dependencies.config.canVend) return respond.fail(new PocketBillsStoreError('BILLS_DISABLED', 'Bill payments are not enabled on this server.', 503))
        const current = await dependencies.store.getOwnedIntent(identity.userId, intentId)
        await assertProviderReserve(dependencies, current.amountNgn)
        const intent = await dependencies.store.markAwaitingPayment(identity.userId, intentId)
        return respond.success({ intent: publicPocketBillsIntent(intent) }, 'processing')
      }

      if (action === 'confirm') {
        const current = await dependencies.store.getOwnedIntent(identity.userId, intentId)
        const txHash = cleanText(req.body?.tx_hash, 80).toLowerCase()
        let confirmedAt: string | undefined
        if (!current.txHash) {
          try {
            const verification = await dependencies.verifyTransfer({
              chain: 'base',
              txHash,
              payer: current.payerWallet,
              recipient: current.treasuryAddress,
              minAmount: current.amountUsdc,
              notBefore: new Date(current.createdAt).toISOString(),
              notAfter: new Date(current.quoteExpiresAt).toISOString(),
            })
            confirmedAt = verification.confirmedAt
          } catch (error) {
            throw paymentVerificationError(error)
          }
        }
        const paid = await dependencies.store.recordVerifiedPayment({ ownerId: identity.userId, intentId, txHash, confirmedAt })
        if (paid.state !== 'payment_confirmed') return respond.success({ intent: publicPocketBillsIntent(paid) }, paid.state === 'delivered' ? 'completed' : 'processing')
        if (!dependencies.config.canVend) {
          const review = await dependencies.store.markNeedsReview(identity.userId, intentId, 'Provider vending was disabled after on-chain payment confirmation.')
          return respond.success({ intent: publicPocketBillsIntent(review) }, 'processing')
        }

        try {
          await assertProviderReserve(dependencies, paid.amountNgn)
        } catch (error) {
          const review = await dependencies.store.markNeedsReview(identity.userId, intentId, error instanceof Error ? error.message : 'Provider reserve could not be verified.')
          return respond.success({ intent: publicPocketBillsIntent(review) }, 'processing')
        }

        const claim = await dependencies.store.claimVending(identity.userId, intentId)
        if (!claim.claimed) return respond.success({ intent: publicPocketBillsIntent(claim.intent) }, claim.intent.state === 'delivered' ? 'completed' : 'processing')
        try {
          const result = await dependencies.provider.purchaseAirtime({
            serviceId: claim.intent.serviceId,
            phone: claim.intent.phone,
            amountNgn: claim.intent.amountNgn,
            requestId: claim.intent.requestId,
          })
          const settled = await dependencies.store.recordProviderResult(identity.userId, intentId, result)
          return respond.success({ intent: publicPocketBillsIntent(settled) }, settled.state === 'delivered' ? 'completed' : 'processing')
        } catch (error) {
          if (error instanceof VtpassClientError && error.outcomeUnknown) {
            const pending = await dependencies.store.recordProviderResult(identity.userId, intentId, syntheticPending(claim.intent, error.message))
            return respond.success({ intent: publicPocketBillsIntent(pending) }, 'processing')
          }
          if (error instanceof VtpassClientError && error.code === 'VTPASS_ACCESS_DENIED') {
            const failed = await dependencies.store.recordProviderResult(identity.userId, intentId, syntheticFailed(claim.intent, error))
            return respond.success({ intent: publicPocketBillsIntent(failed) }, 'processing')
          }
          const review = await dependencies.store.markNeedsReview(identity.userId, intentId, error instanceof Error ? error.message : 'Provider purchase needs reconciliation.')
          return respond.success({ intent: publicPocketBillsIntent(review) }, 'processing')
        }
      }

      if (action === 'status') {
        let intent = await dependencies.store.getOwnedIntent(identity.userId, intentId)
        let refreshed = false
        let refreshError = ''
        const refresh = req.body?.refresh !== false
        const canRequery = Boolean(intent.providerAttemptedAt) && ['vending', 'pending', 'delivered', 'needs_review'].includes(intent.state)
        if (refresh && canRequery) {
          try {
            const result = await dependencies.provider.requeryTransaction(intent.requestId)
            intent = await dependencies.store.recordProviderResult(identity.userId, intentId, result, { requery: true })
            refreshed = true
          } catch (error) {
            refreshError = error instanceof Error ? error.message.slice(0, 180) : 'Provider status is temporarily unavailable.'
            intent = await dependencies.store.recordRequeryFailure(identity.userId, intentId, refreshError)
          }
        }
        return respond.success({ intent: publicPocketBillsIntent(intent), refreshed, ...(refreshError ? { refreshError } : {}) }, intent.state === 'delivered' || intent.state === 'refunded' ? 'completed' : 'processing')
      }

      return respond.fail(new PocketBillsStoreError('BILLS_UNKNOWN_ACTION', 'Unknown bill-payment action.'))
    } catch (error) {
      return respond.fail(error)
    }
  }
}

let defaultHandlers: {
  quote: ReturnType<typeof createPocketBillsQuoteHandler>
  pay: ReturnType<typeof createPocketBillsPayHandler>
} | null = null

function getDefaultHandlers() {
  if (defaultHandlers) return defaultHandlers
  // Initialize request adapters lazily so tests and runtime startup always use
  // the environment established by the server bootstrap.
  const config = readVtpassPhase0Config()
  const dependencies: BillsDependencies = {
    config,
    verifyUser: verifiedPrivyUser,
    readPayerWallet: async ownerId => (await readCircleLink(circleLinkKey(ownerId, 'base', 'payment')))?.circleWalletAddress ?? '',
    store: createPocketBillsStore({ config }),
    provider: createVtpassClient({ config }),
    readFxQuote: createPocketFxQuoteReader(),
    verifyTransfer: verifyEvmUsdcTransfer,
    now: Date.now,
    requestId: randomUUID,
  }
  defaultHandlers = {
    quote: createPocketBillsQuoteHandler(dependencies),
    pay: createPocketBillsPayHandler(dependencies),
  }
  return defaultHandlers
}

export async function pocketBillsQuoteHandler(req: Request, res: Response) {
  return getDefaultHandlers().quote(req, res)
}

export async function pocketBillsPayHandler(req: Request, res: Response) {
  return getDefaultHandlers().pay(req, res)
}
