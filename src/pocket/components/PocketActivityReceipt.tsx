import { pocketActivityAmount } from '../lib/pocketActivityPresentation'
import { useState, type ReactNode } from 'react'
import { paymentReceiptOutcome } from '../../lib/paymentReceiptPdf'
import PocketTransactionSheet from './PocketTransactionSheet'
import type { PocketActivityRow } from '../models/pocketActivity'
import { pocketActivityReceipt, pocketActivityStatus, pocketMovementTitle } from '../lib/pocketReceipt'

export default function PocketActivityReceipt({ row, onClose, onRefund, children }: { row: PocketActivityRow; onClose: () => void; onRefund?: (id: string) => Promise<string>; children?: ReactNode }) {
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState('')
  const receipt = pocketActivityReceipt(row, { allowPending: true })
  const refundId = row.source === 'bills' ? row.merchantId : undefined
  const actions = <>{children}{row.refundAction && refundId && onRefund && <div className="py-3 text-center">
    <button type="button" disabled={busy} onClick={async () => {setBusy(true);setMessage('');try{setMessage(await onRefund(refundId))}catch(error){setMessage(error instanceof Error ? error.message : 'Refund status is unavailable.')}finally{setBusy(false)}}} className="min-h-10 rounded-full bg-gray-950 px-5 text-xs font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">{busy ? 'Checking refund' : row.refundAction === 'claim' ? 'Claim refund' : 'Check refund'}</button>
    {message && <p role="status" className="mt-2 text-xs">{message}</p>}
  </div>}</>
  const state = paymentReceiptOutcome({status: pocketActivityStatus(row)}).state
  return <PocketTransactionSheet title={pocketMovementTitle(row)} state={state} receipt={receipt} amount={pocketActivityAmount(row)} onDone={onClose}
    detail={state === 'pending' ? 'Waiting for confirmation. You can check Activity for updates.' : undefined}>
    <dl className="space-y-3 text-xs text-gray-500">
      {row.direction === 'in' && row.payer && <div className="flex justify-between gap-4"><dt>From</dt><dd className="max-w-[70%] break-all text-right">{row.payer}</dd></div>}
      {row.direction !== 'in' && row.recipient && <div className="flex justify-between gap-4"><dt>To</dt><dd className="max-w-[70%] break-all text-right">{row.recipient}</dd></div>}
      <div className="flex justify-between gap-4"><dt>Network</dt><dd className="capitalize">{row.chain}</dd></div>
      <div className="flex justify-between gap-4"><dt>Date</dt><dd>{new Date(row.ts).toLocaleString()}</dd></div>
    </dl>
    {actions}
  </PocketTransactionSheet>
}
