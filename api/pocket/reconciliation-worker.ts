import type { Request, Response } from 'express'
import { sendTransactionalEmail } from '../email-provider.js'
import { reconcilePaycrestOrderPayment } from '../paycrest-reconcile.js'
import { listUnresolvedCirclePocketActions, recordCirclePocketAction } from '../circle-pocket-action-journal.js'
import { mutateDurableJson } from '../render-durable-store.js'
import { readVerifiedHostedCheckoutRecord } from '../hosted-checkouts.js'
import { getDepositStatus } from '../polymarket-bridge.js'
import { requireAdminSecret } from '../security.js'
import { reconcilePocketBillExecutionByResource } from './bills.js'
import { isCircleBridgeComplete, readCircleBridgeStatus } from './circle-bridge-status.js'
import { expireHostedCheckoutExecution, syncHostedCheckoutExecution } from './hosted-checkout-payment-executions.js'
import { appendPocketMoneyLedgerEvent } from './money-ledger.js'
import { paymentExecutionRepository, type PaymentExecutionIntent, type PaymentExecutionRepository, type PaymentExecutionState } from './payment-execution-intents.js'

type ItemResult = { id: string; kind: string; result: 'reconciled' | 'unchanged' | 'review' | 'error'; message?: string }
type AlertState = { lastSentAt: number; signature: string }
type Dependencies = {
  executions: PaymentExecutionRepository
  reconcilePaycrest: typeof reconcilePaycrestOrderPayment
  reconcileBill: typeof reconcilePocketBillExecutionByResource
  readCheckout: typeof readVerifiedHostedCheckoutRecord
  syncCheckout: typeof syncHostedCheckoutExecution
  expireCheckout: typeof expireHostedCheckoutExecution
  readPolymarketFunding: typeof getDepositStatus
  listBridges: typeof listUnresolvedCirclePocketActions
  readBridge: typeof readCircleBridgeStatus
  recordAction: typeof recordCirclePocketAction
  appendLedger: typeof appendPocketMoneyLedgerEvent
  sendEmail: typeof sendTransactionalEmail
  mutateDurable: typeof mutateDurableJson
  now: () => number
}

const ALERT_STORE_KEY = (process.env.POCKET_RECONCILIATION_ALERT_STORE_KEY ?? 'hashpaylink:pocket-reconciliation-alerts:v1').trim()
let inFlight: Promise<Awaited<ReturnType<typeof runPocketReconciliation>>> | null = null

function errorText(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').trim().slice(0, 240)
}

const allowed: Record<PaymentExecutionState, PaymentExecutionState[]> = {
  prepared: ['authorized', 'failed', 'expired', 'needs_review'], authorized: ['submitted', 'failed', 'expired', 'needs_review'],
  submitted: ['processing', 'completed', 'failed', 'needs_review'], processing: ['completed', 'failed', 'needs_review'],
  completed: [], failed: [], expired: [], needs_review: ['submitted', 'processing', 'completed', 'failed'],
}

async function advance(repository: PaymentExecutionRepository, intent: PaymentExecutionIntent, target: PaymentExecutionState, reference: Partial<PaymentExecutionIntent>) {
  let current = intent
  const path: PaymentExecutionState[] = target === 'completed' ? ['authorized', 'submitted', 'processing', 'completed']
    : target === 'processing' ? ['authorized', 'submitted', 'processing'] : [target]
  for (const state of path) {
    if (current.state === state || !allowed[current.state].includes(state)) continue
    current = await repository.update({
      ownerId: current.ownerId, intentId: current.id, state, expectedState: current.state,
      providerReference: reference.providerReference, transactionHash: reference.transactionHash,
      failureCode: reference.failureCode, metadata: reference.metadata,
    })
  }
  return current
}

function paycrestTarget(value: unknown): PaymentExecutionState | null {
  const status = String(value ?? '').trim().toLowerCase()
  if (status === 'settled' || status === 'validated') return 'completed'
  if (status === 'refunded' || status === 'failed' || status === 'cancelled' || status === 'canceled') return 'failed'
  if (status === 'expired') return 'expired'
  if (['deposited', 'pending', 'fulfilling', 'fulfilled', 'settling', 'refunding'].includes(status)) return 'processing'
  return null
}

async function reconcileExecution(intent: PaymentExecutionIntent, dependencies: Dependencies): Promise<ItemResult> {
  if (intent.kind === 'bank_payout' || intent.kind === 'pos_settlement') {
    if (!intent.resourceId) return { id: intent.id, kind: intent.kind, result: 'review', message: 'Missing Paycrest order reference.' }
    const result = await dependencies.reconcilePaycrest(intent.resourceId, { allowTerminalScan: true })
    if (!result.order) return { id: intent.id, kind: intent.kind, result: 'unchanged', message: 'Paycrest order is not available yet.' }
    const target = paycrestTarget(result.order.status)
    if (!target) return { id: intent.id, kind: intent.kind, result: 'unchanged' }
    if (String(result.order.status ?? '').trim().toLowerCase() === 'pending' && !result.order.tx_hash && !intent.transactionHash) {
      return { id: intent.id, kind: intent.kind, result: 'unchanged', message: 'Waiting for user payment authorization.' }
    }
    await advance(dependencies.executions, intent, target, {
      providerReference: result.order.paycrest_order_id, transactionHash: result.order.tx_hash,
      failureCode: target === 'failed' ? `PROVIDER_${String(result.order.status).toUpperCase()}` : undefined,
      metadata: { providerStatus: String(result.order.status ?? '') },
    })
    return { id: intent.id, kind: intent.kind, result: 'reconciled' }
  }
  if (intent.kind === 'bill_payment') {
    if (!intent.resourceId) return { id: intent.id, kind: intent.kind, result: 'review', message: 'Missing VTpass intent reference.' }
    const result = await dependencies.reconcileBill(intent.resourceId)
    if (['quoted', 'awaiting_payment'].includes(result.intent.state) && result.intent.quoteExpiresAt <= dependencies.now()) {
      await advance(dependencies.executions, intent, 'expired', { failureCode: 'BILL_QUOTE_EXPIRED' })
    }
    return { id: intent.id, kind: intent.kind, result: 'reconciled' }
  }
  if (intent.kind === 'hosted_checkout' || intent.kind === 'service_funding') {
    if (!intent.resourceId?.startsWith('chk_')) return { id: intent.id, kind: intent.kind, result: 'unchanged', message: 'No hosted checkout reference.' }
    const checkout = await dependencies.readCheckout(intent.resourceId, { allowExpiredForReconciliation: true })
    if (!checkout) return { id: intent.id, kind: intent.kind, result: 'review', message: 'Signed checkout record is unavailable.' }
    if (!checkout.payment && dependencies.now() >= Date.parse(checkout.expiresAt)) {
      await dependencies.expireCheckout(checkout, dependencies.executions)
      return { id: intent.id, kind: intent.kind, result: 'reconciled' }
    }
    let providerCompleted = false
    if (intent.kind === 'service_funding' && checkout.providerFunding?.provider === 'polymarket') {
      const bridge = await dependencies.readPolymarketFunding(checkout.providerFunding.depositAddress)
      const createdAt = Date.parse(checkout.createdAt)
      providerCompleted = bridge.transactions.some(item => (
        ['COMPLETE', 'COMPLETED'].includes(String(item.status ?? '').trim().toUpperCase())
        && (!item.createdTimeMs || item.createdTimeMs >= createdAt)
      ))
    }
    await dependencies.syncCheckout(checkout, undefined, { providerCompleted })
    return { id: intent.id, kind: intent.kind, result: 'reconciled' }
  }
  return { id: intent.id, kind: intent.kind, result: 'unchanged', message: 'No authoritative provider adapter is registered.' }
}

async function reconcileBridges(dependencies: Dependencies, limit: number): Promise<ItemResult[]> {
  const records = await dependencies.listBridges('wallet.bridge', limit)
  return Promise.all(records.map(async record => {
    const source = record.metadata?.source
    const destination = record.metadata?.destination
    const txHash = record.metadata?.txHash || record.resourceId || ''
    if ((source !== 'base' && source !== 'arbitrum' && source !== 'solana') || !destination || !txHash) {
      return { id: record.id, kind: 'wallet_bridge', result: 'review' as const, message: 'Bridge record is incomplete.' }
    }
    try {
      const provider = await dependencies.readBridge(source, txHash)
      if (!isCircleBridgeComplete(provider.status)) return { id: record.id, kind: 'wallet_bridge', result: 'unchanged' as const }
      const updated = await dependencies.recordAction({
        ownerId: record.ownerId, idempotencyKey: record.idempotencyKey, action: record.action, status: 'completed', resourceId: record.resourceId,
        metadata: { ...record.metadata, paymentState: 'confirmed', destinationTxHash: provider.destinationTxHash || '' },
      })
      await dependencies.appendLedger({
        eventKey: `wallet-bridge:${updated.id}:completed:${updated.updatedAt}`, ownerId: updated.ownerId, executionId: updated.id,
        rail: 'wallet_bridge', state: 'completed', asset: 'USDC', amount: updated.metadata?.amount || '0', sourceNetwork: source,
        settlementNetwork: destination, resourceId: updated.id, transactionHash: txHash,
        metadata: { source, destination, paymentState: 'confirmed', destinationTxHash: provider.destinationTxHash || '' }, recordedAt: updated.updatedAt,
      })
      return { id: record.id, kind: 'wallet_bridge', result: 'reconciled' as const }
    } catch (error) {
      return { id: record.id, kind: 'wallet_bridge', result: 'error' as const, message: errorText(error) }
    }
  }))
}

async function reconcileBankPayoutRoutes(dependencies: Dependencies, limit: number): Promise<ItemResult[]> {
  const records = await dependencies.listBridges('bank-withdraw.route', limit)
  return Promise.all(records.map(async record => {
    if (record.status === 'started') {
      return { id: record.id, kind: 'bank_payout_route', result: 'unchanged' as const, message: 'Waiting for user bridge approval.' }
    }
    const source = record.metadata?.source
    const txHash = record.metadata?.txHash || record.resourceId || ''
    if ((source !== 'arbitrum' && source !== 'solana') || !txHash) {
      return { id: record.id, kind: 'bank_payout_route', result: 'review' as const, message: 'Bank payout route is incomplete.' }
    }
    try {
      const provider = await dependencies.readBridge(source, txHash)
      if (!isCircleBridgeComplete(provider.status)) {
        return { id: record.id, kind: 'bank_payout_route', result: 'unchanged' as const }
      }
      await dependencies.recordAction({
        ownerId: record.ownerId,
        idempotencyKey: record.idempotencyKey,
        action: record.action,
        status: 'completed',
        resourceId: txHash,
        metadata: {
          ...(record.metadata ?? {}),
          txHash,
          paymentState: 'completed',
          destinationTxHash: provider.destinationTxHash || '',
        },
      })
      return { id: record.id, kind: 'bank_payout_route', result: 'reconciled' as const }
    } catch (error) {
      return { id: record.id, kind: 'bank_payout_route', result: 'error' as const, message: errorText(error) }
    }
  }))
}

async function maybeAlert(results: ItemResult[], stale: PaymentExecutionIntent[], dependencies: Dependencies) {
  const to = String(process.env.POCKET_OPERATIONS_ALERT_EMAIL ?? '').trim()
  if (!to || !stale.length) return false
  const signature = stale.map(item => item.id).sort().join('|')
  const cooldown = Math.max(60_000, Number(process.env.POCKET_RECONCILIATION_ALERT_COOLDOWN_MS ?? 15 * 60_000))
  let send = false
  await dependencies.mutateDurable<AlertState>(ALERT_STORE_KEY, current => {
    if (!current || current.signature !== signature || dependencies.now() - current.lastSentAt >= cooldown) send = true
    return send ? { signature, lastSentAt: dependencies.now() } : current
  })
  if (!send) return false
  const counts = new Map<string, number>()
  stale.forEach(item => counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1))
  const byRail = [...counts].map(([rail, count]) => `${rail}: ${count}`).join(', ')
  const errors = results.filter(item => item.result === 'error').length
  try {
    await dependencies.sendEmail({
      to, fromEmail: process.env.ALERT_FROM_EMAIL, fromName: 'Hash PayLink Operations',
      subject: `Pocket reconciliation alert: ${stale.length} stale execution${stale.length === 1 ? '' : 's'}`,
      text: `Pocket has ${stale.length} unresolved executions older than the configured threshold. ${byRail}. Worker errors: ${errors}.`,
      html: `<p>Pocket has <strong>${stale.length}</strong> unresolved executions older than the configured threshold.</p><p>${byRail}</p><p>Worker errors: ${errors}.</p>`,
      context: 'Pocket reconciliation alert',
    })
  } catch (error) {
    await dependencies.mutateDurable<AlertState>(ALERT_STORE_KEY, current => current?.signature === signature
      ? { signature: '', lastSentAt: 0 }
      : current ?? { signature: '', lastSentAt: 0 })
    throw error
  }
  return true
}

export async function runPocketReconciliation(overrides: Partial<Dependencies> = {}) {
  const dependencies: Dependencies = {
    executions: paymentExecutionRepository, reconcilePaycrest: reconcilePaycrestOrderPayment,
    reconcileBill: reconcilePocketBillExecutionByResource, readCheckout: readVerifiedHostedCheckoutRecord,
    syncCheckout: syncHostedCheckoutExecution, expireCheckout: expireHostedCheckoutExecution,
    readPolymarketFunding: getDepositStatus, listBridges: listUnresolvedCirclePocketActions,
    readBridge: readCircleBridgeStatus, recordAction: recordCirclePocketAction, appendLedger: appendPocketMoneyLedgerEvent,
    sendEmail: sendTransactionalEmail, mutateDurable: mutateDurableJson, now: Date.now, ...overrides,
  }
  const limit = Math.max(1, Math.min(Number(process.env.POCKET_RECONCILIATION_BATCH_SIZE ?? 100), 500))
  const intents = await dependencies.executions.listUnresolved(limit)
  const results: ItemResult[] = []
  for (const intent of intents) {
    try { results.push(await reconcileExecution(intent, dependencies)) }
    catch (error) { results.push({ id: intent.id, kind: intent.kind, result: 'error', message: errorText(error) }) }
  }
  results.push(...await reconcileBridges(dependencies, limit))
  results.push(...await reconcileBankPayoutRoutes(dependencies, limit))
  const threshold = Math.max(60_000, Number(process.env.POCKET_MAX_UNRESOLVED_AGE_MS ?? 15 * 60_000))
  const remaining = await dependencies.executions.listUnresolved(1000)
  const stale = remaining.filter(intent => dependencies.now() - intent.updatedAt > threshold)
  let alerted = false
  try { alerted = await maybeAlert(results, stale, dependencies) }
  catch (error) { results.push({ id: 'operations-alert', kind: 'operations', result: 'error', message: errorText(error) }) }
  return {
    ok: results.every(item => item.result !== 'error'), processed: results.length,
    reconciled: results.filter(item => item.result === 'reconciled').length,
    unchanged: results.filter(item => item.result === 'unchanged').length,
    review: results.filter(item => item.result === 'review').length,
    errors: results.filter(item => item.result === 'error').length, stale: stale.length, alerted, results,
  }
}

export function drainPocketReconciliation() {
  if (!inFlight) inFlight = runPocketReconciliation().finally(() => { inFlight = null })
  return inFlight
}

export async function pocketReconciliationHandler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
  if (!requireAdminSecret(req, res)) return
  try {
    const result = await drainPocketReconciliation()
    return res.status(result.ok ? 200 : 207).json(result)
  } catch (error) {
    return res.status(503).json({ ok: false, error: errorText(error) })
  }
}
