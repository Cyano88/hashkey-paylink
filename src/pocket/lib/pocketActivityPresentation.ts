import { pocketActivityStatus } from './pocketReceipt'
import type { PocketActivityRow } from '../models/pocketActivity'
import { formatPocketDisplayAmount } from './pocketMoney'
import { formatStockQuantity } from './pocketStockDisplay'

/** Recorded local payments use their original settlement amount, never a live conversion. */
export function pocketActivityAmount(row: Pick<PocketActivityRow, 'source' | 'amountNgn' | 'fiatCurrency' | 'amount' | 'assetSymbol'>): string {
  const local = row.amountNgn !== undefined && row.amountNgn !== '' && Number.isFinite(Number(row.amountNgn))
  if (local && (row.source === 'bills' || row.source?.startsWith('bank-') || row.source === 'xpay' || !row.amount || !Number.isFinite(Number(row.amount)))) {
    return Number(row.amountNgn).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + (row.fiatCurrency === 'UGX' ? 'UGX' : 'NGN')
  }
  if (row.source === 'wallet-swap' && (!row.amount || !Number.isFinite(Number(row.amount)))) return 'Swap'
  const asset = row.assetSymbol || 'USDC'
  return (['USDC','USDT'].includes(asset.toUpperCase()) ? formatPocketDisplayAmount(row.amount) : formatStockQuantity(row.amount)) + ' ' + asset
}

export function pocketActivityTitle(row: PocketActivityRow): string {
  if (row.source === 'esim') return row.contextLabel || 'Travel data'
  if (row.source === 'bills') {
    const kind = ({airtime:'airtime',data:'data',tv:'TV',electricity:'electricity'})[row.billCategory!] || 'Bill payment'
    const provider = (row.billProvider || '').trim().replace(/\s+(?:airtime(?:\s+VTU)?|data|subscription|payment)$/i, '')
    return provider || kind.charAt(0).toUpperCase() + kind.slice(1)
  }
  if (row.source?.startsWith('bank-') || row.settlementType?.toLowerCase() === 'instant_fiat') return row.accountName?.trim() || row.recipient?.trim() || 'Bank transfer'
  if (['wallet-deposit','wallet-withdrawal','wallet-bridge','wallet-swap','gift','request','collection'].includes(row.source || '')) return row.assetSymbol || 'USDC'
  return row.contextLabel || row.activityLabel || row.assetSymbol || 'USDC'
}

export function pocketActivityAction(row: PocketActivityRow): string {
  if (row.source === 'esim') return 'eSIM'
  if (row.source?.startsWith('bank-') || row.settlementType?.toLowerCase() === 'instant_fiat') return 'Bank transfer'
  if (row.source === 'bills') return ({airtime:'Airtime',data:'Data',tv:'TV',electricity:'Electricity'}[row.billCategory!] || 'Bill payment')
  if (row.source === 'wallet-bridge') return 'Bridge'
  if (row.source === 'wallet-swap') return 'Swap'
  if (row.source === 'wallet-deposit') return 'Received'
  if (row.source === 'wallet-withdrawal') return 'Sent'
  if (row.source === 'gift') return pocketActivityStatus(row) === 'refunded' ? 'Gift refunded' : row.direction === 'in' ? 'Gift received' : 'Gift sent'
  if (row.source === 'request' || row.source === 'collection') return 'Request payment'
  if (['xpay','purchase','app-pay','pos','ngpos'].includes(row.source || '')) return row.direction === 'in' ? 'Payment received' : 'Payment'
  return row.direction === 'in' ? 'Received' : 'Sent'
}

export function pocketActivitySignedAmount(row: PocketActivityRow): string {
  const amount = pocketActivityAmount(row)
  if (row.source === 'wallet-bridge' || row.source === 'wallet-swap') return amount
  const incoming = row.direction === 'in' || ['refunded','reversed'].includes(pocketActivityStatus(row))
  return (incoming ? '+' : '\u2212') + amount
}

export function pocketActivityVisibleStatus(row: PocketActivityRow): string {
  const status = pocketActivityStatus(row)
  if (status === 'awaiting_approval') return 'Approval required'
  if (status === 'needs_review') return 'Checking status'
  if (status === 'failed' && row.source === 'wallet-bridge') return 'Bridge failed'
  if (status === 'failed' && row.source === 'wallet-swap') return 'Swap failed'
  if (['pending','processing','submitted','started','accepted'].includes(status)) return 'Processing'
  return ['completed','confirmed','delivered','paid','settled','successful','validated','test complete'].includes(status) ? '' : status.replace(/_/g, ' ')
}

/** A bill keeps its identity when its transaction/provider reference arrives. */
export function currentPocketActivityRow(selected: PocketActivityRow | null, rows: PocketActivityRow[]): PocketActivityRow | null {
  if (!selected) return null
  return rows.find(row => {
    if (row.source !== selected.source || row.chain !== selected.chain) return false
    const bank = row.source?.startsWith('bank-') || row.settlementType?.toLowerCase() === 'instant_fiat'
    const refs = [selected.providerReference, selected.bankOrderId].filter(Boolean)
    if (bank && refs.some(ref => ref === row.providerReference || ref === row.bankOrderId)) return true
    return row.eventId === selected.eventId && (['bills', 'request', 'xpay', 'esim'].includes(row.source || '') || row.txHash === selected.txHash)
  }) ?? selected
}
