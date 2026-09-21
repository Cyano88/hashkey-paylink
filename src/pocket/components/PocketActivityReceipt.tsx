import { useState, type ReactNode } from 'react'
import { FullScreenReceiptSurface } from '../../components/UnifiedReceipt'
import type { PocketActivityRow } from '../models/pocketActivity'
import { pocketActivityReceipt, pocketActivityStatus } from '../lib/pocketReceipt'
import PocketBottomSheet from './PocketBottomSheet'

export default function PocketActivityReceipt({ row, onClose, onRefund, children }: { row: PocketActivityRow; onClose: () => void; onRefund?: (id: string) => Promise<string>; children?: ReactNode }) {
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState('')
  const receipt = pocketActivityReceipt(row, {allowPending:true})
  const refundId = row.source === 'bills' ? row.merchantId : undefined
  const actions = <>{children}{row.refundAction && refundId && onRefund && <div className="py-3 text-center">
    <button type="button" disabled={busy} onClick={async () => {setBusy(true);setMessage('');try{setMessage(await onRefund(refundId))}catch(error){setMessage(error instanceof Error ? error.message : 'Refund status is unavailable.')}finally{setBusy(false)}}} className="min-h-10 rounded-full bg-gray-950 px-5 text-xs font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">{busy ? 'Checking refund' : row.refundAction === 'claim' ? 'Claim refund' : 'Check refund'}</button>
    {message && <p role="status" className="mt-2 text-xs">{message}</p>}
  </div>}</>
  if (receipt) return <FullScreenReceiptSurface receipt={receipt} surface="receipt" onClose={onClose} extraActions={actions} />
  return <PocketBottomSheet title="Transaction details" onClose={onClose}>
    <h2 className="mb-4 text-center text-lg font-bold">{row.activityLabel || row.memo || 'Transaction details'}</h2>
    <dl className="space-y-3 text-xs"><div className="flex justify-between gap-4"><dt>Status</dt><dd className="capitalize">{pocketActivityStatus(row)}</dd></div><div className="flex justify-between gap-4"><dt>Amount</dt><dd>{row.amountNgn ? 'NGN ' + row.amountNgn : row.amount + ' USDC'}</dd></div><div><dt className="text-gray-500">Reference</dt><dd className="mt-1 break-all font-mono">{row.supportReference || row.txHash || row.eventId}</dd></div></dl>
    {actions}
  </PocketBottomSheet>
}
