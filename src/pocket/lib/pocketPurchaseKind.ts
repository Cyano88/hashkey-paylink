import type { PocketActivityRow } from '../models/pocketActivity'

// A merchant's incoming POS collection is not a purchase by that merchant.
export function isOutgoingPosPurchase(row: PocketActivityRow): boolean {
  return row.direction === 'out' && (
    ['pos', 'ngpos'].includes(String(row.source ?? '').toLowerCase())
    || String(row.settlementType ?? '').toLowerCase() === 'pos_payment'
  )
}

export function isIncomingPosPayment(row: PocketActivityRow): boolean {
  return row.direction !== 'out' && (
    ['pos', 'ngpos'].includes(String(row.source ?? '').toLowerCase())
    || (row.direction === 'in' && String(row.settlementType ?? '').toLowerCase() === 'pos_payment')
  )
}

export function pocketBankRecipientLabel(row: PocketActivityRow): string {
  if (!['bank-withdraw', 'bank_withdraw'].includes(String(row.source ?? '').toLowerCase())) return ''
  return row.accountName?.trim() || row.recipient?.trim() || 'Bank transfer'
}
