import {
  getPaycrestPosOrder,
  markPaycrestPosPayment,
  refreshPaycrestOrderStatus,
  type PaycrestOrderRecord,
} from './paycrest-pos.js'
import { registerVerifiedPayment } from './event-registry.js'
import { findEvmUsdcTransfer } from './usdc-transfer-verify.js'

const reconcileInFlight = new Set<string>()

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function maxAttempts() {
  const parsed = Number.parseInt(process.env.PAYCREST_RECONCILE_ATTEMPTS ?? '24', 10)
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 80) : 24
}

function delayMs(attempt: number) {
  if (attempt <= 12) return 2_000
  if (attempt <= 30) return 5_000
  return 30_000
}

function validTxHash(value: string | undefined) {
  return !!value && /^0x[a-fA-F0-9]{64}$/.test(value)
}

function receiptSource(order: PaycrestOrderRecord) {
  return order.source === 'ngpos' ? 'ngpos' : 'bank-receive'
}

function isSettledPaycrestStatus(value: string | undefined) {
  const status = String(value || '').trim().toLowerCase()
  return status === 'settled' || status === 'validated'
}

async function registerOrderReceipt(order: PaycrestOrderRecord, txHash: string) {
  const source = receiptSource(order)
  return registerVerifiedPayment({
    eventId: `ngpos-${order.merchant_id}`,
    txHash,
    payer: order.payer_name || order.payer_wallet || order.payer_email || 'Circle wallet payer',
    memo: order.payer_name || (source === 'ngpos' ? 'Retail POS payment' : 'Bank receive payment'),
    chain: 'base',
    amount: order.amount_usdc,
    requestedAmount: order.amount_usdc,
    source,
    merchantId: order.merchant_id,
    contextLabel: order.bank_name ? `${order.bank_name} ****${order.bank_last4 || ''}`.trim() : 'Naira payout',
    settlementType: 'INSTANT_FIAT',
    amountNgn: order.amount_ngn,
    intentId: order.intent_id,
  })
}

export async function registerPaycrestBankSendReceipt(order: PaycrestOrderRecord) {
  if (order.source !== 'bank-send') return null
  if (!isSettledPaycrestStatus(order.status)) return null
  const reference = `paycrest_${order.intent_id || order.paycrest_order_id}`
  return registerVerifiedPayment({
    eventId: `bank-send-${order.merchant_id || order.intent_id}`,
    txHash: reference,
    payer: order.payer_name || order.payer_email || 'Bank transfer payer',
    memo: order.payer_name || 'Bank transfer funding',
    chain: order.destination_network || 'polygon',
    amount: order.amount_usdc,
    requestedAmount: order.amount_usdc,
    source: 'bank-send',
    merchantId: order.merchant_id,
    contextLabel: order.destination_address ? `${order.destination_network || 'polygon'} ${order.destination_address}` : 'USDC destination',
    settlementType: 'PAYCREST_ONRAMP',
    amountNgn: order.provider_amount_to_transfer || order.amount_ngn,
    intentId: order.intent_id,
  })
}

export async function reconcilePaycrestOrderPayment(id: string) {
  let order = await refreshPaycrestOrderStatus(id).catch(() => null)
  order ??= await getPaycrestPosOrder(id)
  if (!order) return { ok: false, found: false, error: 'Paycrest order not found.' }

  if (validTxHash(order.tx_hash)) {
    const receipt = await registerOrderReceipt(order, order.tx_hash)
    return { ok: true, found: true, order, receipt }
  }

  const match = await findEvmUsdcTransfer({
    chain: 'base',
    recipient: order.receive_address,
    minAmount: order.amount_usdc,
  })
  if (!match?.txHash) return { ok: true, found: false, order }

  const updated = await markPaycrestPosPayment({
    id: order.intent_id,
    txHash: match.txHash,
    payerEmail: order.payer_email,
    payerWallet: order.payer_wallet,
  })
  const receipt = await registerOrderReceipt(updated ?? order, match.txHash)
  return { ok: true, found: true, order: updated ?? order, receipt }
}

export function schedulePaycrestOrderReconciliation(id: string) {
  const key = String(id ?? '').trim()
  if (!key || reconcileInFlight.has(key)) return
  reconcileInFlight.add(key)

  void (async () => {
    for (let attempt = 1; attempt <= maxAttempts(); attempt += 1) {
      if (attempt > 1) await sleep(delayMs(attempt))
      try {
        const result = await reconcilePaycrestOrderPayment(key)
        if (result.found) return
      } catch (error) {
        console.warn('[paycrest-reconcile] attempt failed:', error instanceof Error ? error.message : String(error))
      }
    }
  })().finally(() => {
    reconcileInFlight.delete(key)
  })
}
