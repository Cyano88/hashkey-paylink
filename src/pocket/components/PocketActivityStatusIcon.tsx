import type { PocketActivityRow } from '../models/pocketActivity'
import { pocketActivityStatus } from '../lib/pocketReceipt'
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Undo2, X, Clock3, AlertCircle } from './PocketIcons'

export default function PocketActivityStatusIcon({ row }: { row: PocketActivityRow }) {
  const status = pocketActivityStatus(row)
  const refund = /refund|revers/.test(status)
  const failed = ['failed', 'cancelled', 'canceled', 'rejected', 'expired'].includes(status)
  const successful = ['completed', 'confirmed', 'delivered', 'paid', 'settled', 'successful', 'test complete', 'validated'].includes(status)
  const unknown = status === 'status unavailable'
  const incoming = row.direction === 'in'
  const bridge = String(row.source || '').replace(/_/g, '-') === 'wallet-bridge'
  const Icon = refund ? Undo2 : failed ? X : unknown ? AlertCircle : !successful ? Clock3 : bridge ? ArrowLeftRight : incoming ? ArrowDownToLine : ArrowUpFromLine
  const label = refund ? status : failed ? 'Failed' : unknown ? 'Status unavailable' : !successful ? status : bridge ? 'Bridge' : incoming ? 'Incoming' : 'Outgoing'
  return <span aria-label={label} title={label} className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-current"><Icon className="h-2.5 w-2.5" /></span>
}
