import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Receipt, Landmark, Store, RequestMoney, CreditCard, Phone, Wifi, Tv, Lightbulb } from './PocketIcons'
import type { PocketActivityRow } from '../models/pocketActivity'
import { isOutgoingPosPurchase } from '../lib/pocketPurchaseKind'
import { pocketActivityStatus } from '../lib/pocketReceipt'

export function pocketActivityIcon(row: PocketActivityRow) {
  const source = String(row.source || '').toLowerCase().replace(/_/g, '-')
  if (isOutgoingPosPurchase(row)) return Store
  if (source === 'bills') return ({ airtime: Phone, data: Wifi, tv: Tv, electricity: Lightbulb })[row.billCategory!] || Receipt
  if (source === 'request' || source === 'collection') return RequestMoney
  if (source.startsWith('bank-') || row.settlementType?.toLowerCase() === 'instant_fiat') return Landmark
  if (source === 'wallet-swap' || source === 'wallet-bridge') return ArrowLeftRight
  if (source.startsWith('wallet-') || row.settlementType?.startsWith('wallet_')) return row.direction === 'in' || ['refunded', 'reversed'].includes(pocketActivityStatus(row)) ? ArrowDownToLine : ArrowUpFromLine
  return CreditCard
}

export function pocketActivityShortDate(timestamp: number) {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return ''
  return [date.getDate(), date.getMonth() + 1, date.getFullYear() % 100].map(value => String(value).padStart(2, '0')).join(' ')
}
