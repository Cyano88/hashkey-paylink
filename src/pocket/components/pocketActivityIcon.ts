import { createElement } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Receipt, Landmark, Store, QrCode, RequestMoney, CreditCard, Phone, Wifi, Tv, Lightbulb } from './PocketIcons'
import type { PocketActivityRow } from '../models/pocketActivity'
import { isOutgoingPosPurchase, isIncomingPosPayment } from '../lib/pocketPurchaseKind'
import { pocketActivityStatus } from '../lib/pocketReceipt'

function UsdcActivityLogo({ className }: { className?: string }) {
  return createElement('img', { src: '/brand/usdc-circle-logo.png', alt: 'USDC', className,
    style: { width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%' } })
}

export function pocketActivityIcon(row: PocketActivityRow) {
  const source = String(row.source || '').toLowerCase().replace(/_/g, '-')
  if (isOutgoingPosPurchase(row)) return Store
  if (source === 'bills') return ({ airtime: Phone, data: Wifi, tv: Tv, electricity: Lightbulb })[row.billCategory!] || Receipt
  if (source === 'request' || source === 'collection') return RequestMoney
  if (source.startsWith('bank-') || row.settlementType?.toLowerCase() === 'instant_fiat') return Landmark
  if (source === 'xpay' && ['NGN','UGX'].includes(row.fiatCurrency || row.assetSymbol || '')) return Landmark
  if (isIncomingPosPayment(row) || source === 'xpay') return QrCode
  if (source === 'wallet-swap' || source === 'wallet-bridge') return ArrowLeftRight
  if (source.startsWith('wallet-') || row.settlementType?.startsWith('wallet_')) {
    if (row.direction === 'in' || ['refunded', 'reversed'].includes(pocketActivityStatus(row))) return ArrowDownToLine
    return !row.assetSymbol || row.assetSymbol.toUpperCase() === 'USDC' ? UsdcActivityLogo : ArrowUpFromLine
  }
  return CreditCard
}

export function pocketActivityShortDate(timestamp: number) {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return ''
  return [date.getDate(), date.getMonth() + 1, date.getFullYear() % 100].map(value => String(value).padStart(2, '0')).join(':')
}
