import { pocketBankStatus } from './pocketBankStatus'
import { isOutgoingPosPurchase } from './pocketPurchaseKind'
import type { PaylinkReceipt } from '../../lib/paymentReceiptPdf'
import type { PocketActivityRow } from '../models/pocketActivity'

export type PocketReceiptKind = 'money_in' | 'money_out' | 'bill_purchase' | 'app_purchase'
export type PocketReceiptAvailability = 'ready' | 'pending' | 'none'

const FINAL_STATUSES = new Set([
  'completed',
  'confirmed',
  'delivered',
  'paid',
  'refunded',
  'reversed',
  'settled',
  'successful',
  'test complete',
  'validated',
])

const PENDING_STATUSES = new Set([
  'bridging',
  'deposited',
  'fulfilled',
  'fulfilling',
  'needs review',
  'payout incomplete',
  'paid pending',
  'pending',
  'processing',
  'reconciling',
  'refund available',
  'refund pending',
  'refunding',
  'settling',
  'submitted',
  'verification pending',
])

function normalizedSource(row: PocketActivityRow) {
  return String(row.source || '').trim().toLowerCase().replace(/_/g, '-')
}

function normalizedSettlement(row: PocketActivityRow) {
  return String(row.settlementType || '').trim().toLowerCase()
}

export function pocketActivityStatus(row: PocketActivityRow) {
  const status = String(row.paycrestStatus || '').trim().toLowerCase()
  const source = normalizedSource(row)
  if (source.startsWith('bank-') || normalizedSettlement(row) === 'instant_fiat') return pocketBankStatus(status, source, /^0x[a-f0-9]{64}$/i.test(row.txHash))
  return status || 'status unavailable'
}

export function pocketReceiptKind(row: PocketActivityRow): PocketReceiptKind | null {
  const source = normalizedSource(row)
  const settlement = normalizedSettlement(row)

  if ((source === 'wallet-bridge' || source === 'wallet-swap') || settlement === 'wallet_bridge') return null
  if (source === 'bills' || settlement === 'bill_payment' || settlement.startsWith('bill_payment:')) return 'bill_purchase'
  if (source === 'xpay') return row.direction === 'in' ? 'money_in' : 'app_purchase'
  if (isOutgoingPosPurchase(row)) return 'app_purchase'
  if (source === 'purchase' || source === 'app-pay' || settlement === 'app_pay' || settlement === 'hosted_checkout' || settlement === 'service_funding') return 'app_purchase'
  if (source === 'wallet-deposit') return 'money_in'
  if (source === 'collection') return 'money_in'
  if (source === 'request' && (row.txHash || ['paid', 'processing', 'submitted', 'failed'].includes(String(row.paycrestStatus)))) return row.direction === 'in' ? 'money_in' : 'money_out'
  if (source === 'wallet-withdrawal') return 'money_out'
  if (source === 'bank-withdraw') return 'money_out'
  if (source === 'bank-send' || source === 'bank-receive' || source === 'ngpos' || source === 'pos') return 'money_in'
  if (settlement === 'paycrest_onramp') return 'money_in'
  if (settlement === 'instant_fiat') return row.direction === 'out' ? 'money_out' : 'money_in'
  if (settlement === 'wallet_transfer') return row.direction === 'in' ? 'money_in' : row.direction === 'out' ? 'money_out' : null
  return null
}

export function pocketReceiptAvailability(row: PocketActivityRow): PocketReceiptAvailability {
  const kind = pocketReceiptKind(row)
  if (!kind) return 'none'
  const source = normalizedSource(row)
  if (kind === 'money_out' && source === 'wallet-withdrawal' && !String(row.recipient || '').trim()) return 'none'
  if (kind === 'money_in' && source === 'wallet-deposit' && row.chain === 'solana' && (!row.payer || row.payer === 'Solana wallet')) return 'none'
  const status = pocketActivityStatus(row)
  if (FINAL_STATUSES.has(status)) return 'ready'
  if (PENDING_STATUSES.has(status) || status === 'reversing' || ['failed', 'cancelled', 'canceled', 'rejected', 'expired'].includes(status)) return 'pending'
  return 'none'
}

export function pocketMovementTitle(row: PocketActivityRow): string {
  const kind = pocketReceiptKind(row)
  if (normalizedSource(row) === 'xpay' && row.direction === 'in') return 'Received'
  if (normalizedSource(row) === 'request' || normalizedSource(row) === 'collection') return 'Request payment'
  if (normalizedSource(row).startsWith('bank-')) return 'Bank transfer'
  if (kind === 'bill_purchase' || kind === 'app_purchase' || isOutgoingPosPurchase(row) || ['pos', 'ngpos'].includes(normalizedSource(row))) return 'Payment'
  return row.direction === 'in' || kind === 'money_in' ? 'Received' : 'Sent'
}

export function pocketActivityReceipt(row: PocketActivityRow, options: { allowPending?: boolean } = {}): PaylinkReceipt | null {
  const kind = pocketReceiptKind(row)
  const availability = pocketReceiptAvailability(row)
  if (!kind || (availability !== 'ready' && !(options.allowPending && availability === 'pending'))) return null

  const source = normalizedSource(row)
  const category = row.billCategory || 'airtime'
  const reference = row.providerReference || row.billReference || row.txHash || row.eventId
  const bankDestination = [row.accountName, row.bankName, row.bankLast4 ? `****${row.bankLast4}` : ''].filter(Boolean).join(' · ')
  const recipient = row.recipient || (kind === 'app_purchase' ? row.memo : '') || row.contextLabel || row.merchantId || '-'
  const destination = row.destination || bankDestination || row.contextLabel || `${row.chain || 'Base'} ${row.assetSymbol || 'USDC'} wallet`

  return {
    type: kind === 'bill_purchase' ? category : kind,
    receiptId: row.receiptId || row.billReference || row.eventId,
    receiptHash: row.txHash || reference,
    title: pocketMovementTitle(row),
    status: pocketActivityStatus(row),
    eventId: row.eventId,
    txHash: row.txHash,
    chain: row.chain || 'base',
    payer: row.payer,
    memo: row.memo,
    amount: row.amount,
    amountNgn: row.amountNgn,
    asset: row.assetSymbol || 'USDC',
    createdAt: row.ts,
    source,
    merchantId: row.merchantId,
    settlementType: kind === 'bill_purchase' ? `bill_payment:${category}` : row.settlementType,
    variant: kind === 'bill_purchase' ? 'bills' : 'general',
    providerName: kind === 'bill_purchase' ? row.billProvider || row.memo : undefined,
    recipient,
    destination,
    targetLabel: kind === 'bill_purchase' ? category === 'electricity' ? 'Meter Number' : category === 'tv' ? 'Smartcard Number' : 'Phone Number' : undefined,
    targetValue: kind === 'bill_purchase' ? row.billTarget || row.contextLabel || '-' : undefined,
    narration: row.memo,
    referenceId: reference,
    billToken: kind === 'bill_purchase' ? row.billToken : undefined,
    brandName: 'Pocket',
    brandKind: 'pocket',
  }
}
