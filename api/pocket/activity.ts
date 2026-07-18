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

type PocketActivityHandlerDependencies = {
  verifyUser(req: Request): Promise<VerifiedLinkUser>
  readHistory(ownerId: string): Promise<{ payments: unknown[] }>
  readActions(ownerId: string, limit?: number): ReturnType<typeof listCirclePocketActions>
}

function appPayActivityRow(item: CirclePocketActionRecord): PocketActivityRow | undefined {
  if (item.action !== 'marketplace.service.purchase') return undefined
  const paymentSettled = ['confirmed', 'completed'].includes(item.metadata?.paymentState ?? '')
  const paymentAccepted = ['received', 'batched'].includes(item.metadata?.paymentState ?? '')
  const status = item.status === 'completed'
    ? 'completed'
    : paymentSettled
      ? 'paid'
      : paymentAccepted
        ? 'settling'
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
      const appPay = (await dependencies.readActions(identity.userId, 100)).flatMap(item => {
        const row = appPayActivityRow(item)
        return row ? [row] : []
      })
      const payments = [...history.payments.map(sanitizedActivityRow), ...appPay]
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
})
