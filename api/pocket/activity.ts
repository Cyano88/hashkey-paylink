import type { Request, Response } from 'express'
import { listNgPosHistoryForOwner } from '../ng-pos.js'
import {
  verifiedPrivyUser,
  type VerifiedLinkUser,
} from '../privy-circle-link.js'
import {
  isPocketActivityRow,
  type PocketActivityRow,
  type PocketErrorCode,
} from '../../src/pocket/lib/pocketSchemas.js'
import { readPocketLinkedWalletAddresses, readPocketWalletChainActivity } from './wallet-chain-activity.js'
import { createPocketBillsStore, PocketBillsStoreError, type PocketBillsIntent } from './bills-store.js'
import { readVtpassPhase0Config } from '../vtpass-config.js'
import { listRegisteredPaymentsForEventIds, paymentReceiptId } from '../event-registry.js'
import { pocketPaylinkRepository, type PocketCollectionLink } from './paylink-store.js'
import { paymentExecutionRepository, type PaymentExecutionIntent } from './payment-execution-intents.js'
import { listCirclePocketActions, type CirclePocketActionRecord } from '../circle-pocket-action-journal.js'

type PocketPosResource = {
  merchant_id: string
  display_name: string
  source?: string
  bank_name?: string
  bank_last4?: string
  created_at?: string
}

type PocketActivityHandlerDependencies = {
  verifyUser(req: Request): Promise<VerifiedLinkUser>
  readHistory(ownerId: string, options?: PocketActivityReadOptions): Promise<{ payments: unknown[]; merchants?: PocketPosResource[] }>
  readWalletHistory?(ownerId: string, options?: PocketActivityReadOptions): Promise<unknown[]>
  readBills?(ownerId: string, options?: PocketActivityReadOptions): Promise<PocketBillsIntent[]>
  readBillsRefundPolicy?(): { enabled: boolean; treasuryAddress: string }
  readCollections?(ownerId: string, options?: PocketActivityReadOptions): Promise<PocketCollectionLink[]>
  readCollectionPayments?(eventIds: string[], options?: PocketActivityReadOptions): Promise<unknown[]>
  readExternalPayments?(walletAddresses: string[], options?: PocketActivityReadOptions): Promise<PaymentExecutionIntent[]>
  readClosedBankPayouts?(ownerId: string, options?: PocketActivityReadOptions): Promise<PaymentExecutionIntent[]>
  readWalletAddresses?(ownerId: string, options?: PocketActivityReadOptions): Promise<string[]>
  readActions?(ownerId: string, options?: PocketActivityReadOptions): Promise<CirclePocketActionRecord[]>
}

type PocketActivityReadOptions = { recent: boolean; limit: number }

function bridgeActivityRow(record: CirclePocketActionRecord): PocketActivityRow | undefined {
  if (record.action !== 'wallet.bridge' || !record.metadata?.txHash) return undefined
  const source = record.metadata.source || 'USDC'
  const destination = record.metadata.destination || 'destination'
  return {
    eventId: `pocket-bridge:${record.id}`,
    txHash: record.metadata.txHash,
    chain: source,
    payer: 'Pocket wallet',
    memo: `${source} to ${destination}`,
    amount: record.metadata.amount || '0',
    ts: record.updatedAt,
    source: 'wallet-bridge',
    merchantId: record.id,
    contextLabel: `${source} to ${destination}`,
    settlementType: 'wallet_bridge',
    paycrestStatus: record.status === 'completed' ? 'completed' : record.status === 'failed' ? 'failed' : 'processing',
    activityLabel: 'USDC moved',
    direction: 'out',
    recipient: destination,
    destination,
    providerReference: record.resourceId || record.metadata.txHash,
  }
}

function externalPaymentActivityRow(intent: PaymentExecutionIntent): PocketActivityRow | undefined {
  if (!intent.transactionHash || !['submitted', 'processing', 'completed', 'needs_review'].includes(intent.state)) return undefined
  const merchant = intent.metadata.merchantName || intent.metadata.partnerId || 'Web checkout'
  const funding = intent.kind === 'service_funding'
  return {
    eventId: intent.metadata.receiptId || intent.resourceId || intent.id,
    txHash: intent.transactionHash,
    chain: intent.sourceNetwork || 'base',
    payer: intent.metadata.payerWallet || 'Pocket wallet',
    memo: intent.metadata.memo || intent.metadata.title || merchant,
    amount: intent.amount,
    ts: intent.updatedAt,
    source: 'purchase',
    merchantId: intent.resourceId || intent.id,
    contextLabel: intent.metadata.title || (funding ? 'Service funding' : 'Web payment'),
    settlementType: funding ? 'service_funding' : 'hosted_checkout',
    paycrestStatus: intent.state === 'completed' ? 'completed' : intent.state === 'needs_review' ? 'needs review' : funding ? 'bridging' : 'processing',
    activityLabel: funding ? `${merchant} funding` : `${merchant} payment`,
    direction: 'out',
    recipient: merchant,
    destination: intent.metadata.provider || merchant,
    providerReference: intent.providerReference || intent.metadata.fundingRequestId || intent.resourceId,
    ...(intent.metadata.receiptId ? { receiptId: intent.metadata.receiptId } : {}),
    ...(intent.metadata.receiptUrl ? { receiptUrl: intent.metadata.receiptUrl } : {}),
  }
}

function closedBankPayoutActivityRow(intent: PaymentExecutionIntent): PocketActivityRow | undefined {
  const reverted = intent.state === 'failed' && intent.failureCode === 'PROVIDER_REFUNDED'
  const expiredAfterDebit = intent.state === 'expired' && Boolean(intent.transactionHash)
  if (intent.kind !== 'bank_payout' || !intent.transactionHash || (!reverted && !expiredAfterDebit)) return undefined
  const bank = intent.metadata.bankName || 'Bank account'
  const last4 = intent.metadata.bankLast4 ? ` ****${intent.metadata.bankLast4}` : ''
  return {
    eventId: `pocket-bank-payout:${intent.id}`,
    txHash: intent.transactionHash,
    chain: 'base',
    payer: 'Pocket wallet',
    memo: intent.metadata.memo || 'Direct bank payout',
    amount: intent.amount,
    ts: intent.updatedAt,
    source: 'bank-withdraw',
    merchantId: intent.resourceId || intent.id,
    contextLabel: `${bank}${last4}`,
    settlementType: 'instant_fiat',
    amountNgn: intent.metadata.amountNgn,
    paycrestStatus: reverted ? 'refunded' : 'review required',
    activityLabel: reverted ? 'Reverted payment' : 'Expired payout',
    direction: 'out',
    recipient: intent.metadata.accountName || bank,
    destination: `${bank}${last4}`,
    bankName: intent.metadata.bankName,
    bankLast4: intent.metadata.bankLast4,
    accountName: intent.metadata.accountName,
    providerReference: intent.providerReference || intent.resourceId || intent.id,
    supportReference: intent.providerReference || intent.resourceId || intent.id,
  }
}

function billActivityRow(intent: PocketBillsIntent, refundPolicy: { enabled: boolean; treasuryAddress: string }): PocketActivityRow | undefined {
  if (!intent.txHash) return undefined
  const sandboxTest = intent.providerEnvironment === 'sandbox'
  const refundEligible = refundPolicy.enabled
    && Boolean(refundPolicy.treasuryAddress)
    && intent.treasuryAddress.toLowerCase() === refundPolicy.treasuryAddress.toLowerCase()
  const refundAction = refundEligible && intent.state === 'refund_eligible'
    ? 'claim' as const
    : refundEligible && (intent.state === 'needs_review' || intent.state === 'refunding' || intent.state === 'refund_submitted')
      ? 'check' as const
      : undefined
  const status = intent.state === 'delivered'
    ? sandboxTest ? 'test complete' : 'delivered'
    : intent.state === 'refunded'
      ? 'refunded'
      : intent.state === 'refund_eligible'
        ? 'refund available'
        : intent.state === 'provider_failed_unverified'
          ? 'verification pending'
          : intent.state === 'refund_pending'
            ? 'refund pending'
        : intent.state === 'refunding' || intent.state === 'refund_submitted'
          ? 'refunding'
        : intent.state === 'needs_review'
          ? 'needs review'
          : intent.state === 'pending' || intent.state === 'vending'
            ? 'processing'
            : 'paid'
  const supportReference = [intent.providerCode ? `VTpass ${intent.providerCode}` : '', intent.requestId]
    .filter(Boolean)
    .join(' · ')
  return {
    eventId: `pocket-bill:${intent.id}`,
    txHash: intent.txHash,
    chain: intent.network,
    payer: 'Circle Pocket',
    memo: intent.serviceName,
    amount: intent.paymentAmountUsdc || intent.amountUsdc,
    ts: intent.updatedAt,
    source: 'bills',
    merchantId: intent.id,
    contextLabel: `${intent.serviceName} · ${intent.phone.slice(0, 4)}***${intent.phone.slice(-4)}`,
    settlementType: 'bill_payment',
    amountNgn: intent.amountNgn,
    paycrestStatus: status,
    activityLabel: sandboxTest ? `${intent.category === 'tv' ? 'TV' : intent.category === 'electricity' ? 'Electricity' : intent.category === 'data' ? 'Data' : 'Airtime'} sandbox test` : 'Bill payment',
    direction: 'out',
    recipient: intent.serviceName,
    destination: intent.phone,
    billCategory: intent.category,
    billProvider: intent.serviceName,
    billTarget: intent.phone,
    billReference: intent.requestId,
    ...(intent.providerTransactionId ? { providerReference: intent.providerTransactionId } : {}),
    ...(supportReference ? { supportReference } : {}),
    ...(intent.category === 'electricity' && intent.variationCode === 'prepaid' && intent.state === 'delivered' && intent.purchasedCode
      ? { billToken: intent.purchasedCode }
      : {}),
    ...(refundAction ? { refundAction } : {}),
    ...(intent.refundTxHash ? { refundTxHash: intent.refundTxHash } : {}),
  }
}


function sanitizedActivityRow(value: unknown): PocketActivityRow {
  if (!isPocketActivityRow(value)) {
    throw Object.assign(new Error('Stored Circle Pocket activity row was invalid.'), { status: 500 })
  }
  return {
    eventId: value.eventId,
    txHash: value.txHash,
    chain: value.chain,
    payer: value.payer,
    memo: value.memo,
    amount: value.amount,
    ts: value.ts,
    ...(value.source !== undefined ? { source: value.source } : {}),
    ...(value.merchantId !== undefined ? { merchantId: value.merchantId } : {}),
    ...(value.contextLabel !== undefined ? { contextLabel: value.contextLabel } : {}),
    ...(value.settlementType !== undefined ? { settlementType: value.settlementType } : {}),
    ...(value.amountNgn !== undefined ? { amountNgn: value.amountNgn } : {}),
    ...(value.paycrestStatus !== undefined ? { paycrestStatus: value.paycrestStatus } : {}),
    ...(value.activityLabel !== undefined ? { activityLabel: value.activityLabel } : {}),
    ...(value.direction !== undefined ? { direction: value.direction } : {}),
    ...(value.recipient !== undefined ? { recipient: value.recipient } : {}),
    ...(value.destination !== undefined ? { destination: value.destination } : {}),
    ...(value.bankName !== undefined ? { bankName: value.bankName } : {}),
    ...(value.bankLast4 !== undefined ? { bankLast4: value.bankLast4 } : {}),
    ...(value.accountName !== undefined ? { accountName: value.accountName } : {}),
    ...(value.providerReference !== undefined ? { providerReference: value.providerReference } : {}),
    ...(value.supportReference !== undefined ? { supportReference: value.supportReference } : {}),
    ...(value.billToken !== undefined ? { billToken: value.billToken } : {}),
    ...(value.billCategory !== undefined ? { billCategory: value.billCategory } : {}),
    ...(value.billProvider !== undefined ? { billProvider: value.billProvider } : {}),
    ...(value.billTarget !== undefined ? { billTarget: value.billTarget } : {}),
    ...(value.billReference !== undefined ? { billReference: value.billReference } : {}),
    ...(value.refundAction !== undefined ? { refundAction: value.refundAction } : {}),
    ...(value.refundTxHash !== undefined ? { refundTxHash: value.refundTxHash } : {}),
    ...(value.receiptId !== undefined ? { receiptId: value.receiptId } : {}),
    ...(value.receiptUrl !== undefined ? { receiptUrl: value.receiptUrl } : {}),
  }
}

export function createPocketActivityHandler(dependencies: PocketActivityHandlerDependencies) {
  return async function pocketActivityHandler(req: Request, res: Response) {
    function fail(status: number, code: PocketErrorCode, message: string, retryable: boolean) {
      return res.status(status).json({ ok: false, error: { code, message, retryable } })
    }

    if (req.method !== 'GET') return fail(405, 'VALIDATION_FAILED', 'Method not allowed.', false)
    const scopeValue = req.query?.scope
    const scope = typeof scopeValue === 'string' ? scopeValue.trim().toLowerCase() : ''
    if (scope && scope !== 'recent') return fail(400, 'VALIDATION_FAILED', 'Activity scope is invalid.', false)
    const options: PocketActivityReadOptions = { recent: scope === 'recent', limit: scope === 'recent' ? 4 : 100 }

    try {
      const identity = await dependencies.verifyUser(req)
      const [history, collections, walletHistory, durableActionRecords, walletAddresses, billsIntents, closedBankPayoutIntents] = await Promise.all([
        dependencies.readHistory(identity.userId, options),
        dependencies.readCollections?.(identity.userId, options) ?? Promise.resolve([]),
        dependencies.readWalletHistory?.(identity.userId, options) ?? Promise.resolve([]),
        dependencies.readActions?.(identity.userId, options) ?? Promise.resolve([]),
        dependencies.readWalletAddresses?.(identity.userId, options) ?? Promise.resolve([]),
        dependencies.readBills?.(identity.userId, options) ?? Promise.resolve([]),
        dependencies.readClosedBankPayouts?.(identity.userId, options) ?? Promise.resolve([]),
      ])
      const collectionTitles = new Map(collections.map(link => [link.eventId, link.title]))
      const [collectionPaymentRecords, externalPaymentIntents] = await Promise.all([
        dependencies.readCollectionPayments?.(collections.map(link => link.eventId), options) ?? Promise.resolve([]),
        dependencies.readExternalPayments?.(walletAddresses, options) ?? Promise.resolve([]),
      ])
      const collectionPayments = collectionPaymentRecords
        .map(sanitizedActivityRow)
        .map(row => ({
          ...row,
          source: 'collection',
          merchantId: row.eventId,
          contextLabel: collectionTitles.get(row.eventId) || row.memo || 'Collection',
          activityLabel: collectionTitles.get(row.eventId) || 'Collection payment',
          direction: 'in' as const,
          paycrestStatus: row.paycrestStatus || 'confirmed',
          receiptId: paymentReceiptId(row.eventId, row.txHash),
          receiptUrl: `/receipt/${paymentReceiptId(row.eventId, row.txHash)}`,
        }))
      const durableBridges = durableActionRecords.flatMap(record => {
        const row = bridgeActivityRow(record)
        return row ? [row] : []
      })
      const externalPayments = externalPaymentIntents
        .flatMap(intent => {
          const row = externalPaymentActivityRow(intent)
          return row ? [row] : []
        })
      const closedBankPayouts = closedBankPayoutIntents.flatMap(intent => {
        const row = closedBankPayoutActivityRow(intent)
        return row ? [row] : []
      })
      const refundPolicy = dependencies.readBillsRefundPolicy?.() ?? { enabled: false, treasuryAddress: '' }
      const bills = billsIntents.flatMap(intent => {
        const row = billActivityRow(intent, refundPolicy)
        return row ? [row] : []
      })
      const contextualTxHashes = new Set(externalPayments.map(row => row.txHash.toLowerCase()))
      const allPayments = [...externalPayments, ...closedBankPayouts, ...bills, ...collectionPayments, ...durableBridges, ...history.payments.map(sanitizedActivityRow), ...walletHistory.map(sanitizedActivityRow)]
        .filter(row => row.source === 'purchase' || !contextualTxHashes.has(row.txHash.toLowerCase()))
        .filter((row, index, rows) => rows.findIndex(candidate => candidate.txHash === row.txHash && (
          candidate.source === row.source || candidate.source === 'wallet-bridge' || row.source === 'wallet-bridge'
        )) === index)
        .sort((a, b) => b.ts - a.ts)
      const payments = options.recent ? allPayments.slice(0, options.limit) : allPayments
      return res.json({
        ok: true,
        payments,
        merchants: options.recent ? [] : history.merchants ?? [],
        collections: options.recent ? [] : collections.map(link => ({
          eventId: link.eventId,
          title: link.title,
          paymentUrl: link.paymentUrl,
          createdAt: link.createdAt,
          updatedAt: link.updatedAt,
        })),
      })
    } catch (error) {
      const normalized = error as Error & { status?: number }
      if (normalized.status === 401) return fail(401, 'AUTH_REQUIRED', normalized.message, false)
      if (normalized.status === 403) return fail(403, 'FORBIDDEN', normalized.message, false)
      if (normalized.status === 429) return fail(429, 'RATE_LIMITED', normalized.message, true)
      if ((normalized.status ?? 0) >= 500) return fail(503, 'PROVIDER_UNAVAILABLE', normalized.message, true)
      return fail(500, 'INTERNAL_ERROR', normalized.message || 'Circle Pocket activity read failed.', true)
    }
  }
}

export default createPocketActivityHandler({
  verifyUser: verifiedPrivyUser,
  readHistory: listNgPosHistoryForOwner,
  readCollections: ownerId => pocketPaylinkRepository.listOwned(ownerId),
  readCollectionPayments: listRegisteredPaymentsForEventIds,
  readWalletHistory: (ownerId, options) => readPocketWalletChainActivity(ownerId, {
    timeoutMs: options?.recent ? 900 : 10_000,
    limit: options?.recent ? 8 : 100,
  }),
  readActions: (ownerId, options) => listCirclePocketActions(ownerId, options?.recent ? 20 : 500),
  readWalletAddresses: async ownerId => (await readPocketLinkedWalletAddresses(ownerId)).map(item => item.walletAddress),
  readExternalPayments: async walletAddresses => {
    const matches = await Promise.all(walletAddresses.map(walletAddress =>
      paymentExecutionRepository.listByMetadata('payerWallet', walletAddress, ['hosted_checkout', 'service_funding'])
    ))
    return matches.flat()
  },
  readClosedBankPayouts: (ownerId, options) => paymentExecutionRepository.listOwned(
    ownerId,
    ['bank_payout'],
    ['expired', 'failed'],
  ).then(items => items.slice(0, options?.recent ? 4 : 100)),
  readBills: async (ownerId, options) => {
    const config = readVtpassPhase0Config()
    try {
      return await createPocketBillsStore({ config }).listOwnedIntents(ownerId, options?.recent ? 12 : 100)
    } catch (error) {
      // Activity remains available during local development or an emergency
      // Bills rollback. Other durable activity sources must not be hidden just
      // because the isolated Bills store is unavailable.
      if (error instanceof PocketBillsStoreError && error.code === 'BILLS_STORAGE_NOT_CONFIGURED') return []
      throw error
    }
  },
  readBillsRefundPolicy: () => {
    const config = readVtpassPhase0Config()
    return {
      enabled: config.refundsReady && config.circleTreasuryReady,
      treasuryAddress: config.treasuryAddress,
    }
  },
})
