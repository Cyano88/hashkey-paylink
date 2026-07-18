import type { Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import {
  estimateAgentX402Service,
  inspectCircleMarketplaceService,
  payAgentX402Service,
  readAgentWalletAddress,
  searchCircleGatewayX402Transfers,
  searchCircleMarketplaceServices,
  type CircleGatewayX402Transfer,
} from '../agent-wallet.js'
import { listAgentActivity } from '../agent-activity.js'
import {
  claimCirclePocketAction,
  listCirclePocketActions,
  recordCirclePocketAction,
  type CirclePocketActionRecord,
} from '../circle-pocket-action-journal.js'
import { verifiedPrivyUser, type VerifiedLinkUser } from '../privy-circle-link.js'
import { pocketX402WalletSlug } from '../../src/pocket/lib/pocketX402Identity.js'
import { isPocketIdempotencyKey, type PocketErrorCode } from '../../src/pocket/lib/pocketSchemas.js'

const ACTION = 'marketplace.service.purchase'
const BASE_CAIP2 = 'eip155:8453'
const configuredMaxPurchaseUsdc = Number(process.env.POCKET_MARKETPLACE_MAX_PURCHASE_USDC ?? '0.05')
const MAX_PURCHASE_USDC = Number.isFinite(configuredMaxPurchaseUsdc) && configuredMaxPurchaseUsdc > 0
  ? Math.max(0.001, configuredMaxPurchaseUsdc)
  : 0.05
const RECONCILIATION_REVIEW_AFTER_MS = 30 * 60_000

type MarketplaceDependencies = {
  verifyUser(req: Request): Promise<VerifiedLinkUser>
  search(input: { query?: string; limit?: number; offset?: number }): Promise<unknown>
  inspect(resource: string): Promise<unknown>
  estimate(input: Parameters<typeof estimateAgentX402Service>[0]): ReturnType<typeof estimateAgentX402Service>
  pay(input: Parameters<typeof payAgentX402Service>[0]): ReturnType<typeof payAgentX402Service>
  listActivity(agentSlug: string, limit?: number): ReturnType<typeof listAgentActivity>
  listActions(ownerId: string, limit?: number): ReturnType<typeof listCirclePocketActions>
  walletAddress(agentSlug: string): Promise<string | undefined>
  searchTransfers(input: Parameters<typeof searchCircleGatewayX402Transfers>[0]): ReturnType<typeof searchCircleGatewayX402Transfers>
  claim(input: {
    ownerId: string
    idempotencyKey: string
    action: string
    metadata: Record<string, string>
    dedupe?: { metadataKey: string; metadataValue: string; statuses: CirclePocketActionRecord['status'][]; startedAfter?: number }
  }): Promise<{ record: CirclePocketActionRecord; claimed: boolean }>
  record(input: { ownerId: string; idempotencyKey: string; action: string; status: 'submitted' | 'completed' | 'failed'; resourceId?: string; metadata: Record<string, string> }): Promise<CirclePocketActionRecord>
}

type PublicService = {
  resource: string
  provider: string
  description: string
  category: string
  method: 'GET'
  amount: string
  amountAtomic: string
  network: 'circle-gateway-mainnet'
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function dataRecord(value: unknown) {
  const root = record(value)
  return record(root?.data) ?? root
}

function inputSchemas(value: unknown) {
  const root = record(value)
  const data = record(root?.data)
  const containers = [root, record(root?.metadata), data, record(data?.metadata)].filter(Boolean) as Record<string, unknown>[]
  const schemas: Record<string, unknown>[] = []
  for (const container of containers) {
    const candidates = [
      container.input,
      container.inputSchema,
      record(container.outputSchema)?.input,
      record(container.schema)?.input,
    ]
    for (const candidate of candidates) {
      const schema = record(candidate)
      if (schema) schemas.push(schema)
    }
  }
  return schemas
}

function schemaRequiresInput(value: unknown, depth = 0): boolean {
  if (depth > 8) return true
  if (Array.isArray(value)) return value.some(item => schemaRequiresInput(item, depth + 1))
  const schema = record(value)
  if (!schema) return false
  if (schema.required === true || strings(schema.required).length > 0) return true
  const pathParams = record(schema.pathParams)
  if (pathParams && Object.keys(record(pathParams.properties) ?? {}).length > 0) return true
  return Object.values(schema).some(item => schemaRequiresInput(item, depth + 1))
}

function hasRequiredInput(value: unknown) {
  return inputSchemas(value).some(schema => schemaRequiresInput(schema))
}

function explicitlySupportsOneTap(value: unknown) {
  const schemas = inputSchemas(value)
  return schemas.length > 0 && !schemas.some(schema => schemaRequiresInput(schema))
}

function gatewayPrice(item: Record<string, unknown>) {
  const accepts = Array.isArray(item.accepts) ? item.accepts.map(record).filter(Boolean) as Record<string, unknown>[] : []
  const option = accepts.find(candidate => (
    candidate.network === BASE_CAIP2
    && record(candidate.extra)?.name === 'GatewayWalletBatched'
  ))
  const atomic = typeof option?.amount === 'string' && /^\d+$/.test(option.amount) ? option.amount : ''
  if (!atomic) return undefined
  const amount = Number(atomic) / 1_000_000
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_PURCHASE_USDC) return undefined
  return { atomic, amount: amount.toFixed(6).replace(/0+$/, '').replace(/\.$/, '') }
}

function publicService(value: unknown): PublicService | undefined {
  const item = record(value)
  const metadata = record(item?.metadata)
  const provider = record(metadata?.provider)
  const resource = typeof item?.resource === 'string' ? item.resource : ''
  const method = String(metadata?.method ?? '').toUpperCase()
  if (!item || !metadata || method !== 'GET' || metadata.supportsCircleGateway !== true) return undefined
  if (!/^https:\/\/[^\s]+$/i.test(resource) || /[{}]/.test(resource) || !explicitlySupportsOneTap(item)) return undefined
  const price = gatewayPrice(item)
  if (!price) return undefined
  return {
    resource,
    provider: String(provider?.name ?? 'Circle Marketplace service').slice(0, 100),
    description: String(metadata.description ?? provider?.description ?? 'Pay-per-use service').slice(0, 240),
    category: String(provider?.category ?? 'OTHER').slice(0, 80),
    method: 'GET',
    amount: price.amount,
    amountAtomic: price.atomic,
    network: 'circle-gateway-mainnet',
  }
}

function searchItems(value: unknown) {
  const data = dataRecord(value)
  return Array.isArray(data?.items) ? data.items : []
}

function exactService(value: unknown, resource: string) {
  return searchItems(value).map(publicService).find(item => item?.resource === resource)
}

function inspectDetail(value: unknown) {
  const data = dataRecord(value)
  if (!data) return undefined
  const price = record(data.price)
  const amountAtomic = typeof price?.amount === 'string' && /^\d+$/.test(price.amount) ? price.amount : ''
  const amount = amountAtomic ? Number(amountAtomic) / 1_000_000 : NaN
  if (
    hasRequiredInput(value)
    || data.status !== 'payable'
    || String(data.method).toUpperCase() !== 'GET'
    || data.scheme !== 'GatewayWalletBatched'
    || !strings(data.chains).includes(BASE_CAIP2)
    || !Number.isFinite(amount)
    || amount <= 0
    || amount > MAX_PURCHASE_USDC
  ) return undefined
  return {
    amount: amount.toFixed(6).replace(/0+$/, '').replace(/\.$/, ''),
    amountAtomic,
    provider: String(record(data.provider)?.name ?? 'Circle Marketplace service').slice(0, 100),
    description: String(data.description ?? 'Pay-per-use service').slice(0, 240),
  }
}

function safeResult(value: unknown) {
  try {
    const serialized = JSON.stringify(value)
    if (serialized.length <= 24_000) return JSON.parse(serialized) as unknown
    return { message: 'Service completed. The response was too large to display in Pocket.', size: serialized.length }
  } catch {
    return { message: 'Service completed.' }
  }
}

function marketplaceActionActivity(item: CirclePocketActionRecord) {
  if (item.action !== ACTION) return undefined
  const paymentSettled = ['confirmed', 'completed'].includes(item.metadata?.paymentState ?? '')
  const paymentAccepted = ['received', 'batched'].includes(item.metadata?.paymentState ?? '')
  const paymentNeedsReview = item.metadata?.paymentState === 'needs_review'
  const status = item.status === 'completed'
    ? 'Completed'
    : paymentSettled
      ? 'Paid · result unavailable'
      : paymentAccepted
        ? 'Payment accepted · settlement pending'
        : paymentNeedsReview
          ? 'Payment outcome needs review'
          : item.status === 'submitted'
            ? 'Reconciliation pending'
            : item.status === 'started'
              ? 'Processing'
              : 'Outcome needs review'
  return {
    id: item.resourceId ?? item.id,
    title: `${item.metadata?.provider || 'App Pay service'} · ${status}`,
    amount: item.metadata?.amount,
    asset: 'USDC',
    createdAt: item.createdAt,
    ...(item.metadata?.paymentTransferId ? { transaction: item.metadata.paymentTransferId } : {}),
  }
}

function latestMarketplacePurchase(actions: CirclePocketActionRecord[]) {
  const item = actions.find(action => action.action === ACTION)
  if (!item || item.status === 'completed' || item.status === 'failed') return undefined
  const paymentState = item.metadata?.paymentState ?? ''
  const status = ['confirmed', 'completed'].includes(paymentState)
    ? 'paid'
    : paymentState === 'needs_review'
      ? 'needs_review'
      : 'processing'
  return {
    status,
    replayed: true,
    ...(item.resourceId ? { receiptActivityId: item.resourceId } : {}),
    message: status === 'paid'
      ? 'Payment was confirmed, but the service did not return a result. Do not pay for this service again.'
      : status === 'needs_review'
        ? 'The payment outcome could not be confirmed automatically. Review Activity before retrying this service.'
        : 'Payment reconciliation is still in progress. Do not retry this service.',
  }
}

function purchaseBody(value: unknown) {
  const body = record(value)
  const resource = typeof body?.resource === 'string' ? body.resource.trim() : ''
  const maxAmount = typeof body?.maxAmount === 'string' ? body.maxAmount.trim() : ''
  if (!/^https:\/\/[^\s]{1,1000}$/i.test(resource) || !/^\d+(?:\.\d{1,6})?$/.test(maxAmount)) return undefined
  const amount = Number(maxAmount)
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_PURCHASE_USDC) return undefined
  return { resource, maxAmount, amount }
}

function diagnosticMessage(error: Error) {
  return String(error.message || 'Unknown Marketplace provider failure')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\b0x[a-f0-9]{40}\b/gi, '[address]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/bearer\s+\S+/gi, 'Bearer [redacted]')
    .slice(0, 500)
}

function usdcMicros(value: unknown) {
  const clean = String(value ?? '').replace(/[$,]/g, '').replace(/\s*USDC\s*/i, '').trim()
  if (!/^\d+(?:\.\d{1,6})?$/.test(clean)) return undefined
  if (!clean.includes('.') && Number(clean) > MAX_PURCHASE_USDC) return BigInt(clean)
  const [whole, fraction = ''] = clean.split('.')
  return (BigInt(whole) * 1_000_000n) + BigInt(fraction.padEnd(6, '0'))
}

function transferTime(item: CircleGatewayX402Transfer) {
  const timestamp = Date.parse(item.createdAt ?? '')
  return Number.isFinite(timestamp) ? timestamp : undefined
}

async function reconcileMarketplaceActions(params: {
  agentSlug: string
  actions: CirclePocketActionRecord[]
  dependencies: MarketplaceDependencies
}) {
  const candidates = params.actions.filter(item => (
    item.action === ACTION
    && (item.status === 'submitted' || item.status === 'failed')
    && !['failed', 'needs_review'].includes(item.metadata?.paymentState ?? '')
  ))
  if (!candidates.length) return params.actions
  const payer = await params.dependencies.walletAddress(params.agentSlug)
  if (!payer) return params.actions
  const oldest = Math.min(...candidates.map(item => item.createdAt)) - 10 * 60_000
  const newest = Math.max(...candidates.map(item => item.createdAt)) + 10 * 60_000
  const transfers = await params.dependencies.searchTransfers({
    from: payer,
    startDate: new Date(oldest).toISOString(),
    endDate: new Date(newest).toISOString(),
    pageSize: 100,
  })
  const unused = new Set(transfers.map(item => item.id))
  const reconciled = new Map<string, CirclePocketActionRecord>()
  for (const action of [...candidates].sort((a, b) => a.createdAt - b.createdAt)) {
    const nonce = action.metadata?.paymentNonce
    let match = nonce ? transfers.find(item => unused.has(item.id) && item.nonce === nonce) : undefined
    if (!match) {
      const amount = usdcMicros(action.metadata?.amount)
      match = transfers
        .filter(item => {
          if (!unused.has(item.id) || amount === undefined || usdcMicros(item.amount) !== amount) return false
          const createdAt = transferTime(item)
          return createdAt !== undefined && Math.abs(createdAt - action.createdAt) <= 10 * 60_000
        })
        .sort((a, b) => Math.abs((transferTime(a) ?? 0) - action.createdAt) - Math.abs((transferTime(b) ?? 0) - action.createdAt))[0]
    }
    if (!match) {
      if (Date.now() - action.createdAt < RECONCILIATION_REVIEW_AFTER_MS) continue
      const updated = await params.dependencies.record({
        ownerId: action.ownerId,
        idempotencyKey: action.idempotencyKey,
        action: action.action,
        status: 'submitted',
        resourceId: action.resourceId,
        metadata: {
          ...(action.metadata ?? {}),
          paymentState: 'needs_review',
          reconciledAt: new Date().toISOString(),
        },
      })
      reconciled.set(action.id, updated)
      continue
    }
    unused.delete(match.id)
    const metadata = {
      ...(action.metadata ?? {}),
      paymentTransferId: match.id,
      paymentState: match.status,
      paymentNetwork: match.sendingNetwork ?? match.recipientNetwork ?? action.metadata?.paymentNetwork ?? 'circle-gateway-mainnet',
      ...(match.nonce ? { paymentNonce: match.nonce } : {}),
      ...(match.txHash ? { paymentTxHash: match.txHash } : {}),
      ...(match.createdAt ? { paymentCreatedAt: match.createdAt } : {}),
      reconciledAt: new Date().toISOString(),
    }
    const updated = await params.dependencies.record({
      ownerId: action.ownerId,
      idempotencyKey: action.idempotencyKey,
      action: action.action,
      status: match.status === 'failed' ? 'failed' : 'submitted',
      resourceId: action.resourceId,
      metadata,
    })
    reconciled.set(action.id, updated)
  }
  return params.actions.map(item => reconciled.get(item.id) ?? item)
}

export function createPocketMarketplaceHandler(dependencies: MarketplaceDependencies) {
  return async function pocketMarketplaceHandler(req: Request, res: Response) {
    const requestId = String(req.headers['x-request-id'] ?? '').trim().slice(0, 100) || randomUUID()
    res.setHeader('x-request-id', requestId)
    const rawKey = String(req.headers['idempotency-key'] ?? '').trim()
    function fail(status: number, code: PocketErrorCode, message: string, retryable: boolean) {
      return res.status(status).json({ ok: false, error: { code, message, retryable } })
    }

    try {
      const identity = await dependencies.verifyUser(req)
      const agentSlug = pocketX402WalletSlug(identity.email ?? '')
      if (!agentSlug) return fail(403, 'FORBIDDEN', 'A verified email is required for Marketplace access.', false)

      if (req.method === 'GET') {
        const query = String(req.query.query ?? '').trim().slice(0, 120)
        let actions = await dependencies.listActions(identity.userId, 100)
        try {
          actions = await reconcileMarketplaceActions({ agentSlug, actions, dependencies })
        } catch (error) {
          console.warn('[pocket-marketplace] payment reconciliation refresh failed', {
            requestId,
            message: diagnosticMessage(error as Error),
          })
        }
        const actionActivity = actions.flatMap(item => {
          const activity = marketplaceActionActivity(item)
          return activity ? [activity] : []
        })
        const agentActivity = (await dependencies.listActivity(agentSlug, 20))
          .filter(item => item.type === 'x402_spent')
          .map(item => ({
            id: item.id,
            title: item.title,
            amount: item.amount,
            asset: item.asset,
            serviceUrl: item.serviceUrl,
            createdAt: item.createdAt,
            transaction: item.proof?.transaction,
          }))
        const actionIds = new Set(actionActivity.map(item => item.id))
        const activity = [...actionActivity, ...agentActivity.filter(item => !actionIds.has(item.id))]
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 10)
        let services: PublicService[] = []
        let catalogAvailable = true
        try {
          const discovered = await dependencies.search({ query, limit: 100, offset: 0 })
          const quarantined = new Set(actions
            .filter(item => item.action === ACTION && item.metadata?.failureKind === 'service_response_failed')
            .map(item => item.metadata?.resource)
            .filter(Boolean))
          services = searchItems(discovered)
            .map(publicService)
            .filter((item): item is PublicService => Boolean(item) && !quarantined.has(item?.resource))
            .slice(0, 30)
        } catch (error) {
          catalogAvailable = false
          console.warn('[pocket-marketplace] catalog refresh failed', {
            requestId,
            message: diagnosticMessage(error as Error),
          })
        }
        return res.json({
          ok: true,
          services,
          activity,
          latestPurchase: latestMarketplacePurchase(actions),
          catalogAvailable,
          ...(!catalogAvailable ? { catalogMessage: 'Circle Marketplace catalog is temporarily unavailable. App Pay history is still available.' } : {}),
          paymentNetwork: 'circle-gateway-mainnet',
          arcMarketplaceSupported: false,
          maxPurchaseUsdc: String(MAX_PURCHASE_USDC),
        })
      }

      if (req.method !== 'POST') return fail(405, 'VALIDATION_FAILED', 'Method not allowed.', false)
      if (!isPocketIdempotencyKey(rawKey)) return fail(400, 'VALIDATION_FAILED', 'A valid Idempotency-Key header is required.', false)
      const body = purchaseBody(req.body)
      if (!body) return fail(400, 'VALIDATION_FAILED', `Marketplace purchases must be valid HTTPS services costing no more than ${MAX_PURCHASE_USDC} USDC.`, false)

      const previousActions = await dependencies.listActions(identity.userId, 100)
      const unresolved = previousActions.find(item => (
        item.action === ACTION
        && (
          (item.status === 'started' && Date.now() - item.updatedAt < 10 * 60_000)
          || (
            item.status === 'submitted'
            && !['confirmed', 'completed', 'failed', 'needs_review'].includes(item.metadata?.paymentState ?? '')
          )
        )
      ))
      if (unresolved) {
        return res.status(202).json({
          ok: true,
          status: 'processing',
          replayed: true,
          receiptActivityId: unresolved.resourceId,
          message: 'A previous App Pay payment is still being reconciled. Pull down to refresh before approving another purchase.',
        })
      }
      const pending = previousActions.find(item => (
        item.action === ACTION
        && item.metadata?.resource === body.resource
        && (item.status === 'submitted' || (item.status === 'started' && Date.now() - item.updatedAt < 10 * 60_000))
      ))
      if (pending) {
        return res.status(202).json({
          ok: true,
          status: 'processing',
          replayed: true,
          receiptActivityId: pending.resourceId,
          message: pending.status === 'submitted'
            ? pending.metadata?.paymentState === 'needs_review'
              ? 'This service payment needs review. Open Activity before retrying.'
              : 'Payment was already submitted and is being reconciled. Do not retry.'
            : 'This purchase is already being processed.',
        })
      }

      const discovered = await dependencies.search({ query: body.resource, limit: 20, offset: 0 })
      const service = exactService(discovered, body.resource)
      if (!service) return fail(403, 'FORBIDDEN', 'This endpoint is not currently a one-tap Circle Gateway Marketplace service.', false)
      const inspected = inspectDetail(await dependencies.inspect(body.resource))
      if (!inspected || inspected.amountAtomic !== service.amountAtomic) {
        return fail(409, 'VERSION_CONFLICT', 'The service price or payment requirements changed. Refresh Marketplace before paying.', false)
      }
      if (body.amount < Number(inspected.amount)) {
        return fail(409, 'VERSION_CONFLICT', 'The service price is higher than the approved maximum. Refresh before paying.', false)
      }

      try {
        await dependencies.estimate({
          agentSlug,
          serviceUrl: body.resource,
          maxAmount: Number(inspected.amount),
          paymentChain: 'BASE',
        })
      } catch (error) {
        const normalized = error as Error & { code?: string }
        if (normalized.code === 'circle_session_expired') throw error
        console.warn('[pocket-marketplace] one-tap estimate rejected', {
          requestId,
          message: diagnosticMessage(normalized),
        })
        return fail(409, 'VERSION_CONFLICT', 'This service could not be safely verified for a one-tap purchase. No payment was submitted.', false)
      }

      const claim = await dependencies.claim({
        ownerId: identity.userId,
        idempotencyKey: rawKey,
        action: ACTION,
        metadata: { resource: body.resource, amount: inspected.amount, provider: inspected.provider, network: 'circle-gateway-mainnet' },
        dedupe: {
          metadataKey: 'resource',
          metadataValue: body.resource,
          statuses: ['started', 'submitted'],
          startedAfter: Date.now() - 10 * 60_000,
        },
      })
      if (!claim.claimed) {
        if (claim.record.metadata?.resource !== body.resource) return fail(409, 'DUPLICATE_REQUEST', 'This approval key was already used for another service.', false)
        if (claim.record.status === 'completed') {
          return res.json({ ok: true, status: 'completed', replayed: true, receiptActivityId: claim.record.resourceId })
        }
        if (claim.record.status === 'started' || claim.record.status === 'submitted') {
          return res.status(202).json({
            ok: true,
            status: 'processing',
            replayed: true,
            receiptActivityId: claim.record.resourceId,
            message: claim.record.status === 'submitted'
              ? 'Payment was already submitted and is being reconciled. Do not retry.'
              : 'This purchase is already being processed.',
          })
        }
        return fail(409, 'DUPLICATE_REQUEST', 'This purchase attempt already failed. Refresh before trying again.', false)
      }

      try {
        const paid = await dependencies.pay({
          agentSlug,
          sellerAgentSlug: agentSlug,
          serviceUrl: body.resource,
          maxAmount: Number(inspected.amount),
          paymentChain: 'BASE',
          spendTitle: `Bought ${inspected.description}`.slice(0, 140),
          spendDetail: `Paid ${inspected.amount} USDC to ${inspected.provider} through Circle Marketplace.`,
          resultTitle: `${inspected.provider} result`,
          resultDetail: 'Circle Marketplace service completed.',
          appendResultActivity: false,
        })
        await dependencies.record({
          ownerId: identity.userId,
          idempotencyKey: rawKey,
          action: ACTION,
          status: 'completed',
          resourceId: paid.receiptActivityId,
          metadata: { resource: body.resource, amount: inspected.amount, provider: inspected.provider, network: 'circle-gateway-mainnet' },
        })
        return res.json({
          ok: true,
          status: 'completed',
          replayed: false,
          service: { ...service, provider: inspected.provider, description: inspected.description, amount: inspected.amount },
          receiptActivityId: paid.receiptActivityId,
          transaction: paid.proof.transaction,
          result: safeResult(paid.response),
        })
      } catch (error) {
        const normalized = error as Error & {
          code?: string
          receiptActivityId?: string
          reconciliation?: { nonce?: string; network?: string; amountAtomic?: string; scheme?: string }
        }
        if (normalized.code === 'circle_payment_submitted_response_failed' || normalized.code === 'circle_payment_outcome_unknown') {
          const reconciliation = normalized.reconciliation
          await dependencies.record({
            ownerId: identity.userId,
            idempotencyKey: rawKey,
            action: ACTION,
            status: 'submitted',
            resourceId: normalized.receiptActivityId,
            metadata: {
              resource: body.resource,
              amount: inspected.amount,
              provider: inspected.provider,
              network: 'circle-gateway-mainnet',
              ...(reconciliation?.nonce ? { paymentNonce: reconciliation.nonce } : {}),
              ...(reconciliation?.network ? { paymentNetwork: reconciliation.network } : {}),
              ...(reconciliation?.amountAtomic ? { paymentAmountAtomic: reconciliation.amountAtomic } : {}),
              ...(reconciliation?.scheme ? { paymentScheme: reconciliation.scheme } : {}),
              ...(normalized.code === 'circle_payment_submitted_response_failed' ? { failureKind: 'service_response_failed' } : {}),
            },
          })
          return res.status(202).json({
            ok: true,
            status: 'processing',
            replayed: false,
            receiptActivityId: normalized.receiptActivityId,
            message: normalized.code === 'circle_payment_submitted_response_failed'
              ? 'Payment was submitted, but the service did not complete. It is being reconciled; do not retry.'
              : 'The payment command ended without a final result. It is being reconciled; do not retry.',
          })
        }
        await dependencies.record({
          ownerId: identity.userId,
          idempotencyKey: rawKey,
          action: ACTION,
          status: 'failed',
          metadata: { resource: body.resource, amount: inspected.amount, provider: inspected.provider, network: 'circle-gateway-mainnet' },
        }).catch(() => undefined)
        throw error
      }
    } catch (error) {
      const normalized = error as Error & { status?: number; code?: string }
      if (normalized.status === 401) return fail(401, 'AUTH_REQUIRED', normalized.message, false)
      if (normalized.status === 403) return fail(403, 'FORBIDDEN', normalized.message, false)
      if (normalized.status === 404) return fail(404, 'RESOURCE_NOT_FOUND', normalized.message, false)
      if (normalized.code === 'circle_session_expired') return fail(409, 'SESSION_EXPIRED', normalized.message, false)
      if (normalized.status === 409) return fail(409, 'VERSION_CONFLICT', normalized.message, false)
      if (normalized.status === 429) return fail(429, 'RATE_LIMITED', normalized.message, true)
      console.error('[pocket-marketplace] provider request failed', {
        requestId,
        method: req.method,
        status: normalized.status,
        code: normalized.code,
        name: normalized.name,
        message: diagnosticMessage(normalized),
      })
      return fail(503, 'PROVIDER_UNAVAILABLE', 'Circle Marketplace is temporarily unavailable.', true)
    }
  }
}

export default createPocketMarketplaceHandler({
  verifyUser: verifiedPrivyUser,
  search: searchCircleMarketplaceServices,
  inspect: inspectCircleMarketplaceService,
  estimate: estimateAgentX402Service,
  pay: payAgentX402Service,
  listActivity: listAgentActivity,
  listActions: listCirclePocketActions,
  walletAddress: readAgentWalletAddress,
  searchTransfers: searchCircleGatewayX402Transfers,
  claim: claimCirclePocketAction,
  record: recordCirclePocketAction,
})
