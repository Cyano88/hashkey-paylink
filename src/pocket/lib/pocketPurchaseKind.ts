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
    || (row.direction === 'in' && String(row.source ?? '').toLowerCase() === 'xpay')
    || (row.direction === 'in' && String(row.settlementType ?? '').toLowerCase() === 'pos_payment')
  )
}

export function pocketBankRecipientLabel(row: PocketActivityRow): string {
  if (!['bank-withdraw', 'bank_withdraw'].includes(String(row.source ?? '').toLowerCase())) return ''
  return row.accountName?.trim() || row.recipient?.trim() || 'Bank transfer'
}

export function personalPocketActivity(rows: PocketActivityRow[]) {
  const business = (row: PocketActivityRow) => row.source === 'collection' || (row.source === 'bank-receive' && row.direction !== 'out') || isIncomingPosPayment(row)
  const hashes = new Set(rows.filter(business).filter(row=>row.txHash).map(row=>row.chain+':'+row.txHash.toLowerCase()))
  return rows.filter(row=>!business(row) && !(row.source === 'request' && !row.txHash && !row.paymentFunding?.length && ['pending','awaiting response','accepted','declined','cancelled'].includes(String(row.paycrestStatus))) && !(row.source?.startsWith('wallet-') && row.txHash && hashes.has(row.chain+':'+row.txHash.toLowerCase())))
}
