import type { EsimIntent } from './esim-orders.js'
import type { PocketActivityRow } from '../../src/pocket/models/pocketActivity.js'
import { formatUnits, parseUnits } from 'viem'

export function esimActivityRow(item: EsimIntent): PocketActivityRow | null {
  if (item.state === 'quoted' || !item.txHash) return null
  const status = item.state === 'ready' ? 'completed' : item.state === 'payment_failed' ? 'failed'
    : item.state === 'refunded' ? 'refunded' : ['refund_eligible','refunding'].includes(item.state) ? 'refunding' : 'processing'
  return { eventId: item.id, providerReference: item.id, source: 'esim', chain: 'base',
    payer: item.payer, recipient: 'Pocket eSIM', memo: item.packageLabel || 'Travel data', contextLabel: item.packageLabel || 'Travel data',
    amount: item.state === 'refunded' ? item.price.total : item.totalDebit || item.price.total,
    feeAmount: item.state === 'refunded' ? undefined : formatUnits(parseUnits(item.price.platformFee, 6) + parseUnits(item.networkFee || '0', 6), 6),
    assetSymbol: item.asset, txHash: item.txHash, ...(item.refundTxHash ? { refundTxHash: item.refundTxHash } : {}),
    ts: item.createdAt, paycrestStatus: status, direction: 'out', settlementType: 'esim_purchase',
  }
}
