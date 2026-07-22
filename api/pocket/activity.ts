import type { Request, Response } from 'express'
import { listNgPosHistoryForOwner } from '../ng-pos.js'
import { listCirclePocketActions, type CirclePocketActionRecord } from '../circle-pocket-action-journal.js'
import {
  verifiedPrivyUser,
  type VerifiedLinkUser,
} from '../privy-circle-link.js'
import {
  isPocketActivityRow,
  type PocketActivityRow,
  type PocketErrorCode,
} from '../../src/pocket/lib/pocketSchemas.js'
import { readPocketWalletChainActivity } from './wallet-chain-activity.js'
import { createPocketBillsStore, PocketBillsStoreError, type PocketBillsIntent } from './bills-store.js'
import { readVtpassPhase0Config } from '../vtpass-config.js'

type PocketActivityHandlerDependencies = {
  verifyUser(req: Request): Promise<VerifiedLinkUser>
  readHistory(ownerId: string): Promise<{ payments: unknown[] }>
  readActions(ownerId: string, limit?: number): ReturnType<typeof listCirclePocketActions>
  readWalletHistory?(ownerId: string): Promise<unknown[]>
  readBills?(ownerId: string): Promise<PocketBillsIntent[]>
  readBillsRefundPolicy?(): { enabled: boolean; treasuryAddress: string }
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

function appPayActivityRow(item: CirclePocketActionRecord): PocketActivityRow | undefined {
  if (item.action === 'wallet.bridge') {
    const source = item.metadata?.source || 'wallet'
    const destination = item.metadata?.destination || 'wallet'
    return {
      eventId: item.id,
      txHash: item.metadata?.txHash || item.resourceId || `pocket-action:${item.id}`,
      chain: source,
      payer: 'Circle Pocket',
      memo: 'USDC bridge',
      amount: item.metadata?.amount || '0',
      ts: item.createdAt,
      source: 'wallet-bridge',
      contextLabel: `${source} to ${destination}`,
      settlementType: 'wallet_bridge',
      paycrestStatus: item.status === 'completed' ? 'confirmed' : 'bridging',
    }
  }
  if (item.action !== 'marketplace.service.purchase') return undefined
  const paymentSettled = ['confirmed', 'completed'].includes(item.metadata?.paymentState ?? '')
  const paymentAccepted = ['received', 'batched'].includes(item.metadata?.paymentState ?? '')
  const paymentNeedsReview = item.metadata?.paymentState === 'needs_review'
  const status = item.status === 'completed'
    ? 'completed'
    : paymentSettled
      ? 'paid'
      : paymentAccepted
        ? 'settling'
        : paymentNeedsReview
          ? 'needs review'
          : item.status === 'submitted'
            ? 'reconciling'
            : item.status === 'started'
              ? 'processing'
              : 'needs review'
  return {
    eventId: item.id,
    txHash: item.metadata?.paymentTransferId || item.resourceId || `pocket-action:${item.id}`,
    chain: item.metadata?.paymentNetwork || item.metadata?.network || 'circle-gateway-mainnet',
    payer: 'Pocket App Pay',
    memo: item.metadata?.provider || 'Marketplace service',
    amount: item.metadata?.amount || '0',
    ts: item.createdAt,
    source: 'app-pay',
    contextLabel: status === 'needs review'
      ? 'Payment outcome needs review before retrying'
      : status === 'paid'
        ? 'Payment confirmed · service result unavailable'
        : status === 'settling'
          ? 'Payment accepted · settlement pending'
          : status === 'reconciling'
            ? 'Payment outcome is being reconciled'
            : 'Circle Marketplace service purchase',
    settlementType: 'app_pay',
    paycrestStatus: status,
    direction: 'out',
    recipient: item.metadata?.provider || 'Marketplace service',
    destination: item.metadata?.provider || 'Circle Marketplace',
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
  }
}

export function createPocketActivityHandler(dependencies: PocketActivityHandlerDependencies) {
  return async function pocketActivityHandler(req: Request, res: Response) {
    function fail(status: number, code: PocketErrorCode, message: string, retryable: boolean) {
      return res.status(status).json({ ok: false, error: { code, message, retryable } })
    }

    if (req.method !== 'GET') return fail(405, 'VALIDATION_FAILED', 'Method not allowed.', false)

    try {
      const identity = await dependencies.verifyUser(req)
      const history = await dependencies.readHistory(identity.userId)
      const walletHistory = await dependencies.readWalletHistory?.(identity.userId) ?? []
      const refundPolicy = dependencies.readBillsRefundPolicy?.() ?? { enabled: false, treasuryAddress: '' }
      const bills = (await dependencies.readBills?.(identity.userId) ?? []).flatMap(intent => {
        const row = billActivityRow(intent, refundPolicy)
        return row ? [row] : []
      })
      const appPay = (await dependencies.readActions(identity.userId, 100)).flatMap(item => {
        const row = appPayActivityRow(item)
        return row ? [row] : []
      })
      const payments = [...appPay, ...bills, ...history.payments.map(sanitizedActivityRow), ...walletHistory.map(sanitizedActivityRow)]
        .filter((row, index, rows) => rows.findIndex(candidate => candidate.txHash === row.txHash && (
          candidate.source === row.source || candidate.source === 'wallet-bridge' || row.source === 'wallet-bridge'
        )) === index)
        .sort((a, b) => b.ts - a.ts)
      return res.json({ ok: true, payments })
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
  readActions: listCirclePocketActions,
  readWalletHistory: readPocketWalletChainActivity,
  readBills: async ownerId => {
    const config = readVtpassPhase0Config()
    try {
      return await createPocketBillsStore({ config }).listOwnedIntents(ownerId, 100)
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
