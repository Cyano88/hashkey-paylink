import { GiftIcon } from '@heroicons/react/24/outline'
import { createElement } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Receipt, Landmark, Store, QrCode, RequestMoney, Wallet, CreditCard, Phone, Wifi, Tv, Lightbulb } from './PocketIcons'
import type { PocketActivityRow } from '../models/pocketActivity'
import { isOutgoingPosPurchase, isIncomingPosPayment } from '../lib/pocketPurchaseKind'
import { pocketActivityStatus } from '../lib/pocketReceipt'

// Match the filled receipt artwork and monochrome treatment.
function UsdcActivityLogo({ className }: { className?: string }) {
  return createElement('img', { src: '/brand/usdc-circle-logo.png', alt: 'USDC', className: (className || '') + ' rounded-full object-contain grayscale contrast-200 dark:invert' })
}
function UsdtActivityLogo({ className }: { className?: string }) {
  return createElement('img', { src: '/brand/usdt.svg', alt: 'USDT', className: (className || '') + ' rounded-full object-contain grayscale contrast-200 dark:invert' })
}
export function pocketActivityIconIsFilled(icon: ReturnType<typeof pocketActivityIcon>) {
  return icon === UsdcActivityLogo || icon === UsdtActivityLogo
}

export function pocketActivityIcon(row: PocketActivityRow) {
  if(row.source==='hosted_checkout'||row.settlementType==='hosted_checkout')return row.paymentMethod==='card'?CreditCard:row.paymentMethod==='bank_transfer'?Landmark:Wallet
  const source = String(row.source || '').toLowerCase().replace(/_/g, '-')
  if (source === 'gift') return GiftIcon
  if (source === 'esim') return Wifi
  if (isOutgoingPosPurchase(row)) return Store
  if (source === 'bills') return ({ airtime: Phone, data: Wifi, tv: Tv, electricity: Lightbulb })[row.billCategory!] || Receipt
  if (source === 'request' || source === 'collection') return RequestMoney
  if (source.startsWith('bank-') || row.settlementType?.toLowerCase() === 'instant_fiat') return Landmark
  if (source === 'xpay' && ['NGN','UGX'].includes(row.fiatCurrency || row.assetSymbol || '')) return Landmark
  if (isIncomingPosPayment(row) || source === 'xpay') return QrCode
  if (source === 'wallet-bridge') {
    if (row.assetSymbol?.toUpperCase() === 'USDT') return UsdtActivityLogo
    if (!row.assetSymbol || row.assetSymbol.toUpperCase() === 'USDC') return UsdcActivityLogo
    return ArrowLeftRight
  }
  if (source === 'wallet-swap') return ArrowLeftRight
  if (source.startsWith('wallet-') || row.settlementType?.startsWith('wallet_')) {
    if (!row.assetSymbol || row.assetSymbol.toUpperCase() === 'USDC') return UsdcActivityLogo
    if (row.assetSymbol.toUpperCase() === 'USDT') return UsdtActivityLogo
    return row.direction === 'in' || ['refunded', 'reversed'].includes(pocketActivityStatus(row)) ? ArrowDownToLine : ArrowUpFromLine
  }
  return CreditCard
}

export function pocketActivityShortDate(timestamp: number) {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return ''
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
