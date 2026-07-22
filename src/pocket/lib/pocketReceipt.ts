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
  'settled',
  'test complete',
  'validated',
])

const PENDING_STATUSES = new Set([
  'bridging',
  'needs review',
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
  return status || 'status unavailable'
}

export function pocketReceiptKind(row: PocketActivityRow): PocketReceiptKind | null {
  const source = normalizedSource(row)
  const settlement = normalizedSettlement(row)

  if (source === 'wallet-bridge' || settlement === 'wallet_bridge') return null
  if (source === 'bills' || settlement === 'bill_payment' || settlement.startsWith('bill_payment:')) return 'bill_purchase'
  if (source === 'app-pay' || settlement === 'app_pay') return 'app_purchase'
  if (source === 'wallet-deposit') return 'money_in'
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
  if (PENDING_STATUSES.has(status)) return 'pending'
  return 'none'
}

function receiptTitle(kind: PocketReceiptKind, row: PocketActivityRow) {
  if (kind === 'bill_purchase') return `${row.billCategory === 'tv' ? 'TV' : row.billCategory ? `${row.billCategory[0].toUpperCase()}${row.billCategory.slice(1)}` : 'Bill'} payment`
  if (kind === 'app_purchase') return 'App Pay purchase'
  if (normalizedSource(row) === 'ngpos' || normalizedSource(row) === 'pos') return 'Retail payment'
  if (normalizedSource(row).startsWith('bank-')) return kind === 'money_out' ? 'Bank payout' : 'Bank funding'
  return kind === 'money_out' ? 'USDC sent' : 'USDC received'
}

export function pocketActivityReceipt(row: PocketActivityRow): PaylinkReceipt | null {
  const kind = pocketReceiptKind(row)
  if (!kind || pocketReceiptAvailability(row) !== 'ready') return null

  const source = normalizedSource(row)
  const category = row.billCategory || 'airtime'
  const reference = row.providerReference || row.billReference || row.txHash || row.eventId
  const bankDestination = [row.accountName, row.bankName, row.bankLast4 ? `****${row.bankLast4}` : ''].filter(Boolean).join(' · ')
  const recipient = row.recipient || (kind === 'app_purchase' ? row.memo : '') || row.contextLabel || row.merchantId || '-'
  const destination = row.destination || bankDestination || row.contextLabel || `${row.chain || 'Base'} USDC wallet`

  return {
    type: kind === 'bill_purchase' ? category : kind,
    receiptId: row.billReference || row.eventId,
    receiptHash: row.txHash || reference,
    title: receiptTitle(kind, row),
    status: pocketActivityStatus(row),
    eventId: row.eventId,
    txHash: row.txHash,
    chain: row.chain || 'base',
    payer: row.payer,
    memo: row.memo,
    amount: row.amount,
    amountNgn: row.amountNgn,
    asset: 'USDC',
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
  }
}
