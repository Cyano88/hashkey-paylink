import type { PocketActivityRow } from '../models/pocketActivity'
import { formatPocketDisplayAmount } from './pocketMoney'
import { formatStockQuantity } from './pocketStockDisplay'

/** USDC remains primary; the recorded local delivery amount stays in details. */
export function pocketActivityAmount(row: Pick<PocketActivityRow, 'source' | 'amountNgn' | 'fiatCurrency' | 'amount' | 'assetSymbol'>): string {
  if (row.source === 'wallet-swap') return 'Swap'
  if ((!row.amount || !Number.isFinite(Number(row.amount))) && row.amountNgn && Number.isFinite(Number(row.amountNgn))) return (row.fiatCurrency === 'UGX' ? 'UGX ' : 'NGN ') + Number(row.amountNgn).toLocaleString('en-NG', { maximumFractionDigits: 2 })
  return (row.assetSymbol ? formatStockQuantity(row.amount) : formatPocketDisplayAmount(Number(row.amount))) + ' ' + (row.assetSymbol || 'USDC')
}

/** A bill keeps its identity when its transaction/provider reference arrives. */
export function currentPocketActivityRow(selected: PocketActivityRow | null, rows: PocketActivityRow[]): PocketActivityRow | null {
  if (!selected) return null
  return rows.find(row => row.eventId === selected.eventId && row.source === selected.source && row.chain === selected.chain
    && (row.source === 'bills' || row.txHash === selected.txHash)) ?? selected
}
