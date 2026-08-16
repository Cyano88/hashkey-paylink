import type { Request, Response } from 'express'
import { parseUnits } from 'viem'
import ngPosHandler, { createNgPosBankReceive, listNgPosHistoryForOwner } from '../ng-pos.js'
import { verifiedPrivyUser, type VerifiedLinkUser } from '../privy-circle-link.js'
import { isPocketIdempotencyKey } from '../../src/pocket/lib/pocketSchemas.js'
import { claimCirclePocketAction, listCirclePocketActions, recordCirclePocketAction, type CirclePocketActionRecord } from '../circle-pocket-action-journal.js'
import { paymentExecutionRepository, type PaymentExecutionIntent, type PaymentExecutionRepository } from './payment-execution-intents.js'
import { verifyBankPayoutBeneficiary } from './verified-bank-name.js'
import { isCircleBridgeComplete, readCircleBridgeStatus } from './circle-bridge-status.js'
import { paymentApprovalTimeoutMs, unsignedApprovalExpired } from './payment-timeouts.js'

type LegacyResult = { status: number; body: any }
type BankWithdrawDependencies = {
  verifyUser: typeof verifiedPrivyUser
  createBankReceive: typeof createNgPosBankReceive
  listHistory: typeof listNgPosHistoryForOwner
  invokeLegacy: typeof invokeNgPos
  claimAction: typeof claimCirclePocketAction
  listActions: typeof listCirclePocketActions
  recordAction: typeof recordCirclePocketAction
  executions: PaymentExecutionRepository
  authorizeBankAccount: typeof verifyBankPayoutBeneficiary
  readBridgeStatus: typeof readCircleBridgeStatus
  now: () => number
}

async function invokeNgPos(req: Request, body: Record<string, unknown>): Promise<LegacyResult> {
  let status = 200
  let responseBody: unknown
  const response = {
    status(code: number) { status = code; return this },
    json(value: unknown) { responseBody = value; return this },
  } as unknown as Response
  await ngPosHandler({ ...req, body } as Request, response)
  if (responseBody === undefined) throw Object.assign(new Error('Bank payout provider returned no response.'), { status: 502 })
  return { status, body: responseBody }
}

function text(value: unknown, max = 180) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function usdcUnits(value: unknown) {
  const amount = text(value, 30)
  if (!/^\d+(?:\.\d{1,6})?$/.test(amount)) return null
  try {
    return parseUnits(amount, 6)
  } catch {
    return null
  }
}

export function payoutState(status: unknown) {
  const normalized = text(status, 40).toLowerCase()
  if (normalized === 'settled' || normalized === 'validated') return 'sent'
  if (normalized === 'refunded') return 'refunded'
  if (['failed', 'expired', 'cancelled', 'canceled'].includes(normalized)) return 'failed'
  return 'processing'
}

type BankPayoutRoute = ReturnType<typeof routeRecord>
type BankPayoutNextAction = 'ensure_liquidity' | 'wait_bridge' | 'authorize_transfer' | 'provider_processing' | 'done'

function hasSubmittedPayout(order: any, execution?: PaymentExecutionIntent) {
  return Boolean(text(order?.tx_hash) || execution?.transactionHash)
}

function payoutWindowExpired(order: any, execution: PaymentExecutionIntent | undefined, now: number) {
  if (!execution || (execution.state !== 'prepared' && execution.state !== 'authorized')) return false
  if (hasSubmittedPayout(order, execution)) return false
  const validUntil = Date.parse(text(order?.valid_until, 80))
  return Number.isFinite(validUntil) && validUntil <= now
}

function resolvedPayoutState(order: any, execution?: PaymentExecutionIntent) {
  return execution?.state === 'expired' ? 'expired' : payoutState(order?.status)
}

function payoutNextAction(order: any, execution?: PaymentExecutionIntent, route?: BankPayoutRoute): BankPayoutNextAction {
  const state = resolvedPayoutState(order, execution)
  if (state !== 'processing') return 'done'
  const providerStatus = text(order?.status, 40).toLowerCase()
  if (text(order?.tx_hash) || execution?.transactionHash || ['deposited', 'fulfilling', 'fulfilled', 'settling', 'refunding'].includes(providerStatus)) {
    return 'provider_processing'
  }
  if (route?.phase === 'submitted') return 'wait_bridge'
  if (route?.phase === 'completed') return 'authorize_transfer'
  return 'ensure_liquidity'
}

export function publicOrder(order: any, execution?: PaymentExecutionIntent, route?: BankPayoutRoute) {
  return {
    intentId: text(order?.intent_id),
    orderId: text(order?.paycrest_order_id),
    merchantId: text(order?.merchant_id),
    amountNgn: text(order?.amount_ngn),
    amountUsdc: text(order?.amount_usdc),
    receiveAddress: text(order?.receive_address),
    txHash: text(order?.tx_hash) || execution?.transactionHash || '',
    providerStatus: text(order?.status),
    state: resolvedPayoutState(order, execution),
    bankName: text(order?.bank_name),
    bankLast4: text(order?.bank_last4),
    accountName: text(order?.bank_account_name),
    validUntil: text(order?.valid_until),
    executionId: execution?.id || '',
    executionState: execution?.state || '',
    nextAction: payoutNextAction(order, execution, route),
    route: route ?? null,
  }
}

async function executionForOrder(ownerId: string, order: any, dependencies: BankWithdrawDependencies) {
  return dependencies.executions.findByResource(ownerId, text(order?.intent_id), 'bank_payout')
}

async function syncExecution(ownerId: string, order: any, dependencies: BankWithdrawDependencies) {
  let execution = await executionForOrder(ownerId, order, dependencies)
  if (!execution) return undefined
  if (payoutWindowExpired(order, execution, dependencies.now())) {
    return dependencies.executions.update({
      ownerId,
      intentId: execution.id,
      state: 'expired',
      failureCode: 'PAYOUT_WINDOW_EXPIRED',
      providerReference: text(order?.paycrest_order_id),
      metadata: { providerStatus: text(order?.status), closureReason: 'authorization_window_expired' },
    })
  }
  const state = payoutState(order?.status)
  if (state === 'sent') {
    if (execution.state === 'authorized') execution = await dependencies.executions.update({ ownerId, intentId: execution.id, state: 'submitted', transactionHash: text(order?.tx_hash) })
    if (execution.state === 'submitted' || execution.state === 'processing') execution = await dependencies.executions.update({ ownerId, intentId: execution.id, state: 'completed', providerReference: text(order?.paycrest_order_id), transactionHash: text(order?.tx_hash) })
  } else if (state === 'refunded' && !['failed', 'completed', 'expired', 'needs_review'].includes(execution.state)) {
    execution = await dependencies.executions.update({ ownerId, intentId: execution.id, state: 'failed', failureCode: 'PROVIDER_REFUNDED', providerReference: text(order?.paycrest_order_id) })
  } else if (state === 'processing') {
    if (execution.state === 'authorized' && text(order?.tx_hash)) execution = await dependencies.executions.update({ ownerId, intentId: execution.id, state: 'submitted', transactionHash: text(order?.tx_hash) })
    if (execution.state === 'submitted') execution = await dependencies.executions.update({ ownerId, intentId: execution.id, state: 'processing', providerReference: text(order?.paycrest_order_id) })
  }
  return execution
}

function routeRecord(record: CirclePocketActionRecord | undefined, claimed?: boolean) {
  if (!record || record.action !== 'bank-withdraw.route') return null
  const source = record.metadata?.source
  if (source !== 'arbitrum' && source !== 'solana') return null
  const phase = record.status
  if (phase !== 'started' && phase !== 'submitted' && phase !== 'completed' && phase !== 'failed') return null
  return {
    intentId: record.metadata?.intentId || '',
    phase,
    source,
    destination: 'base',
    amount: record.metadata?.amount || '',
    txHash: record.metadata?.txHash || '',
    ...(claimed !== undefined ? { claimed } : {}),
    updatedAt: record.updatedAt,
  }
}

function routeKey(intentId: string) {
  return `pocket:bank-withdraw-route:${intentId}`
}

async function ownedRoute(identity: VerifiedLinkUser, intentId: string, dependencies: BankWithdrawDependencies) {
  return (await dependencies.listActions(identity.userId, 100)).find(record => (
    record.action === 'bank-withdraw.route'
    && record.idempotencyKey === routeKey(intentId)
  ))
}

async function syncOwnedRoute(identity: VerifiedLinkUser, intentId: string, dependencies: BankWithdrawDependencies) {
  const existing = await ownedRoute(identity, intentId, dependencies)
  if (!existing) return existing
  if (existing.status === 'started' && unsignedApprovalExpired({
    updatedAt: existing.updatedAt,
    transactionHash: existing.metadata?.txHash,
    now: dependencies.now(),
    timeoutMs: paymentApprovalTimeoutMs(),
  })) {
    return dependencies.recordAction({
      ownerId: identity.userId,
      idempotencyKey: existing.idempotencyKey,
      action: existing.action,
      status: 'failed',
      resourceId: existing.resourceId,
      metadata: { ...(existing.metadata ?? {}), paymentState: 'expired', failureCode: 'BRIDGE_APPROVAL_EXPIRED' },
    })
  }
  if (existing.status !== 'submitted') return existing
  const source = existing.metadata?.source
  const txHash = existing.metadata?.txHash || ''
  if ((source !== 'arbitrum' && source !== 'solana') || !txHash) return existing
  const provider = await dependencies.readBridgeStatus(source, txHash).catch(() => null)
  if (!provider) return existing
  if (!isCircleBridgeComplete(provider.status)) return existing
  return dependencies.recordAction({
    ownerId: identity.userId,
    idempotencyKey: existing.idempotencyKey,
    action: existing.action,
    status: 'completed',
    resourceId: txHash,
    metadata: {
      ...(existing.metadata ?? {}),
      txHash,
      paymentState: 'completed',
      destinationTxHash: provider.destinationTxHash || '',
    },
  })
}

async function assertOwnedOrder(req: Request, identity: VerifiedLinkUser, id: string, dependencies: BankWithdrawDependencies) {
  const current = await dependencies.invokeLegacy(req, { action: 'offrampStatus', intent_id: id, refresh: false })
  if (current.status !== 200 || !current.body?.order) throw Object.assign(new Error(current.body?.error || 'Bank payout was not found.'), { status: current.status })
  const history = await dependencies.listHistory(identity.userId)
  const merchantIds = new Set(history.merchants.map(item => item.merchant_id))
  if (!merchantIds.has(String(current.body.order.merchant_id))) throw Object.assign(new Error('Bank payout does not belong to this Pocket account.'), { status: 403 })
  return current.body.order
}

export function createPocketBankWithdrawHandler(overrides: Partial<BankWithdrawDependencies> = {}) {
  const dependencies: BankWithdrawDependencies = {
    verifyUser: verifiedPrivyUser,
    createBankReceive: createNgPosBankReceive,
    listHistory: listNgPosHistoryForOwner,
    invokeLegacy: invokeNgPos,
    claimAction: claimCirclePocketAction,
    listActions: listCirclePocketActions,
    recordAction: recordCirclePocketAction,
    executions: paymentExecutionRepository,
    authorizeBankAccount: verifyBankPayoutBeneficiary,
    readBridgeStatus: readCircleBridgeStatus,
    now: Date.now,
    ...overrides,
  }
  return async function pocketBankWithdrawHandler(req: Request, res: Response) {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    try {
      const identity = await dependencies.verifyUser(req)
      const action = text(req.body?.action, 30)
      if (action === 'recover') {
        const unresolved = await dependencies.executions.listOwned(
          identity.userId,
          ['bank_payout'],
          ['prepared', 'authorized', 'submitted', 'processing', 'needs_review'],
        )
        const recovered = []
        for (const intent of unresolved.filter(item => item.resourceId).slice(0, 10)) {
          const current = await dependencies.invokeLegacy(req, { action: 'offrampStatus', intent_id: intent.resourceId, refresh: true })
          if (current.status !== 200 || !current.body?.order) continue
          const execution = await syncExecution(identity.userId, current.body.order, dependencies)
          const route = routeRecord(await syncOwnedRoute(identity, text(current.body.order.intent_id), dependencies))
          recovered.push(publicOrder(current.body.order, execution, route))
        }
        return res.json({ ok: true, data: recovered })
      }
      if (action === 'prepare') {
        const idempotencyKey = text(req.headers['idempotency-key'], 128)
        if (!isPocketIdempotencyKey(idempotencyKey)) return res.status(400).json({ ok: false, error: 'A valid idempotency key is required.' })
        const amount = text(req.body?.amount_ngn, 30)
        const walletAddress = text(req.body?.wallet_address, 80)
        const accountNumber = text(req.body?.account_number, 20).replace(/\D/g, '').slice(0, 10)
        if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) return res.status(400).json({ ok: false, error: 'Enter a valid Naira payout amount.' })
        if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) return res.status(400).json({ ok: false, error: 'Open your Base Circle wallet before withdrawing.' })
        if (accountNumber.length !== 10 || !text(req.body?.account_name) || !text(req.body?.bank_code)) return res.status(400).json({ ok: false, error: 'Enter a valid destination bank account.' })
        await dependencies.authorizeBankAccount(req, req.body)

        const forwardedRequest = {
          ...req,
          headers: req.headers,
          body: {
            ...req.body,
            amount,
            flexible_amount: false,
            direct_payout: true,
            display_name: text(req.body?.memo) || 'Direct bank payout',
            client_origin: text(req.body?.client_origin),
          },
        } as Request
        const created = await dependencies.createBankReceive(forwardedRequest)
        const link = (created as any)?.link
        if (!link?.intent_id || !link?.merchant_id) throw Object.assign(new Error('Could not prepare the bank payout intent.'), { status: 502 })
        const prepared = await dependencies.invokeLegacy(req, {
          action: 'createOfframpOrder',
          intent_id: link.intent_id,
          refund_address: walletAddress,
          payer_wallet: walletAddress,
          payer_email: identity.email || text(req.body?.owner_email),
          payer_name: `${text(req.body?.owner_first_name)} ${text(req.body?.owner_last_name)}`.trim(),
          ensure_payable: true,
        })
        if (prepared.status !== 200 || !prepared.body?.order) throw Object.assign(new Error(prepared.body?.error || 'Could not prepare bank payout.'), { status: prepared.status })
        const execution = await dependencies.executions.create({
          ownerId: identity.userId, idempotencyKey, kind: 'bank_payout', amount: text(prepared.body.order.amount_usdc),
          sourceNetwork: 'base', settlementNetwork: 'base', destinationType: 'verified_bank_account',
          metadata: {
            bankCode: text(req.body?.bank_code, 20),
            bankName: text(req.body?.bank_name, 160),
            bankLast4: accountNumber.slice(-4),
            accountName: text(req.body?.account_name, 200),
            amountNgn: amount,
            memo: text(req.body?.memo, 180) || 'Direct bank payout',
          },
        })
        const authorized = execution.intent.state === 'prepared'
          ? await dependencies.executions.update({ ownerId: identity.userId, intentId: execution.intent.id, state: 'authorized', resourceId: text(prepared.body.order.intent_id), providerReference: text(prepared.body.order.paycrest_order_id) })
          : execution.intent
        return res.json({ ok: true, data: publicOrder(prepared.body.order, authorized) })
      }

      const id = text(req.body?.intent_id || req.body?.order_id)
      if (!id) return res.status(400).json({ ok: false, error: 'Missing bank payout id.' })
      const ownedOrder = await assertOwnedOrder(req, identity, id, dependencies)

      if (action === 'routeStatus') {
        return res.json({ ok: true, data: routeRecord(await syncOwnedRoute(identity, ownedOrder.intent_id, dependencies)) })
      }

      if (action === 'authorize') {
        const payable = await dependencies.invokeLegacy(req, {
          action: 'createOfframpOrder',
          intent_id: id,
          refund_address: text(req.body?.wallet_address),
          payer_wallet: text(req.body?.wallet_address),
          payer_email: identity.email,
          payer_name: text(req.body?.payer_name),
          ensure_payable: true,
        })
        if (payable.status !== 200 || !payable.body?.order) throw Object.assign(new Error(payable.body?.error || 'Could not open a current payout window.'), { status: payable.status })
        const validUntil = Date.parse(payable.body.order.valid_until || '')
        if (!Number.isFinite(validUntil) || validUntil <= dependencies.now() + 60_000) {
          throw Object.assign(new Error('The payout window is too close to expiry. Start the payment again.'), { status: 409 })
        }
        const execution = await syncExecution(identity.userId, payable.body.order, dependencies)
        if (execution?.state === 'expired') {
          return res.status(409).json({ ok: false, error: 'This payout window expired. Start a new payout.' })
        }
        const route = routeRecord(await syncOwnedRoute(identity, text(payable.body.order.intent_id), dependencies))
        return res.json({ ok: true, data: publicOrder(payable.body.order, execution, route) })
      }

      if (action === 'routeStart') {
        const source = text(req.body?.source, 20)
        const destination = text(req.body?.destination, 20)
        const amount = text(req.body?.amount, 30)
        if ((source !== 'arbitrum' && source !== 'solana') || destination !== 'base') {
          return res.status(400).json({ ok: false, error: 'Bank payout routing supports Arbitrum or Solana to Base.' })
        }
        const routeAmountUnits = usdcUnits(amount)
        const orderAmountUnits = usdcUnits(ownedOrder.amount_usdc)
        if (routeAmountUnits === null || routeAmountUnits <= 0n) {
          return res.status(400).json({ ok: false, error: 'Enter a valid bank payout routing amount.' })
        }
        if (orderAmountUnits === null || routeAmountUnits > orderAmountUnits) {
          return res.status(409).json({ ok: false, error: 'Bank payout routing amount exceeds the provider order.' })
        }
        const existing = await syncOwnedRoute(identity, ownedOrder.intent_id, dependencies)
        if (existing && existing.status !== 'failed' && existing.status !== 'completed') {
          return res.json({ ok: true, data: routeRecord(existing, false) })
        }
        if (existing?.status === 'failed' || existing?.status === 'completed') {
          const restarted = await dependencies.recordAction({
            ownerId: identity.userId,
            idempotencyKey: routeKey(ownedOrder.intent_id),
            action: 'bank-withdraw.route',
            status: 'started',
            resourceId: ownedOrder.intent_id,
            metadata: {
              intentId: ownedOrder.intent_id,
              source,
              destination: 'base',
              amount,
              txHash: '',
              paymentState: 'started',
              previousTxHash: existing.metadata?.txHash || '',
            },
          })
          return res.json({ ok: true, data: routeRecord(restarted, true) })
        }
        const claimed = await dependencies.claimAction({
          ownerId: identity.userId,
          idempotencyKey: routeKey(ownedOrder.intent_id),
          action: 'bank-withdraw.route',
          metadata: { intentId: ownedOrder.intent_id, source, destination: 'base', amount, txHash: '', paymentState: 'started' },
        })
        return res.json({ ok: true, data: routeRecord(claimed.record, claimed.claimed) })
      }

      if (action === 'routeUpdate') {
        const existing = await ownedRoute(identity, ownedOrder.intent_id, dependencies)
        if (!existing) return res.status(409).json({ ok: false, error: 'Bank payout routing has not started.' })
        const phase = text(req.body?.phase, 20)
        if (phase !== 'submitted' && phase !== 'completed' && phase !== 'failed') {
          return res.status(400).json({ ok: false, error: 'Invalid bank payout routing phase.' })
        }
        if (phase === existing.status) return res.json({ ok: true, data: routeRecord(existing) })
        const transitionAllowed = (existing.status === 'started' && (phase === 'submitted' || phase === 'failed'))
          || (existing.status === 'submitted' && phase === 'completed')
        if (!transitionAllowed) {
          return res.status(409).json({ ok: false, error: 'Bank payout routing cannot move backward or skip a confirmed phase.' })
        }
        const txHash = text(req.body?.tx_hash, 128) || existing.metadata?.txHash || ''
        if (phase !== 'failed' && !txHash) return res.status(400).json({ ok: false, error: 'Bank payout routing transaction is required.' })
        if (phase === 'completed') {
          const provider = await dependencies.readBridgeStatus(existing.metadata?.source as 'arbitrum' | 'solana', txHash)
          if (!isCircleBridgeComplete(provider.status)) {
            return res.status(409).json({ ok: false, error: 'Circle has not confirmed this bank payout route yet.' })
          }
        }
        const updated = await dependencies.recordAction({
          ownerId: identity.userId,
          idempotencyKey: routeKey(ownedOrder.intent_id),
          action: 'bank-withdraw.route',
          status: phase,
          resourceId: txHash || ownedOrder.intent_id,
          metadata: { ...(existing.metadata ?? {}), txHash, paymentState: phase },
        })
        return res.json({ ok: true, data: routeRecord(updated) })
      }

      if (action === 'submit') {
        const txHash = text(req.body?.tx_hash, 128)
        if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
          return res.status(400).json({ ok: false, error: 'A valid payout transaction is required.' })
        }
        let execution = await executionForOrder(identity.userId, ownedOrder, dependencies)
        if (!execution) throw Object.assign(new Error('Bank payout execution was not found.'), { status: 404 })
        if (execution.transactionHash && execution.transactionHash.toLowerCase() !== txHash.toLowerCase()) {
          return res.status(409).json({ ok: false, error: 'This payout already has another submitted transaction.' })
        }
        if (execution.state === 'authorized') {
          execution = await dependencies.executions.update({
            ownerId: identity.userId,
            intentId: execution.id,
            state: 'submitted',
            expectedState: 'authorized',
            transactionHash: txHash,
          })
        } else if (!execution.transactionHash && (execution.state === 'submitted' || execution.state === 'processing' || execution.state === 'needs_review')) {
          execution = await dependencies.executions.update({
            ownerId: identity.userId,
            intentId: execution.id,
            transactionHash: txHash,
          })
        }
        const route = routeRecord(await ownedRoute(identity, text(ownedOrder.intent_id), dependencies))
        return res.json({ ok: true, data: publicOrder(ownedOrder, execution, route) })
      }

      if (action === 'confirm') {
        const existingExecution = await executionForOrder(identity.userId, ownedOrder, dependencies)
        if (existingExecution?.state === 'authorized') await dependencies.executions.update({ ownerId: identity.userId, intentId: existingExecution.id, state: 'submitted', transactionHash: text(req.body?.tx_hash) })
        const confirmed = await dependencies.invokeLegacy(req, {
          action: 'markOfframpPaid',
          intent_id: id,
          order_id: text(req.body?.order_id),
          tx_hash: text(req.body?.tx_hash),
          payer_wallet: text(req.body?.wallet_address),
          payer_email: identity.email,
        })
        if (confirmed.status !== 200 || !confirmed.body?.order) throw Object.assign(new Error(confirmed.body?.error || 'Could not verify bank payout transfer.'), { status: confirmed.status })
        const execution = await syncExecution(identity.userId, confirmed.body.order, dependencies)
        const route = routeRecord(await ownedRoute(identity, text(confirmed.body.order.intent_id), dependencies))
        return res.json({ ok: true, data: publicOrder(confirmed.body.order, execution, route) })
      }

      if (action === 'status') {
        const status = await dependencies.invokeLegacy(req, { action: 'offrampStatus', intent_id: id, refresh: true })
        if (status.status !== 200 || !status.body?.order) throw Object.assign(new Error(status.body?.error || 'Could not refresh bank payout.'), { status: status.status })
        const execution = await syncExecution(identity.userId, status.body.order, dependencies)
        const route = routeRecord(await syncOwnedRoute(identity, text(status.body.order.intent_id), dependencies))
        return res.json({ ok: true, data: publicOrder(status.body.order, execution, route) })
      }

      return res.status(400).json({ ok: false, error: 'Unknown bank payout action.' })
    } catch (reason) {
      const error = reason as Error & { status?: number }
      const message = /no provider available|provider.*amount|conversion with amount/i.test(error.message || '')
        ? 'This Naira amount is unavailable right now. Try another amount.'
        : error.message || 'Bank payout failed.'
      return res.status(error.status ?? 500).json({ ok: false, error: message })
    }
  }
}

const pocketBankWithdrawHandler = createPocketBankWithdrawHandler()
export default pocketBankWithdrawHandler
