import { useState } from 'react'
import { FullScreenReceiptSurface } from '../../components/UnifiedReceipt'
import PocketBottomSheet from './PocketBottomSheet'
import { CheckCircle2, Clock3 } from './PocketIcons'
import type { PaylinkReceipt } from '../../lib/paymentReceiptPdf'

type PocketPaymentOutcome = 'completed' | 'handed-off' | 'pending'

export default function PocketPaymentSuccess({ receipt, onDone, title = 'Bank payout', outcome = 'completed' }: { receipt: PaylinkReceipt; onDone: () => void; title?: string; outcome?: PocketPaymentOutcome }) {
  const [viewReceipt, setViewReceipt] = useState(false)
  const pending = outcome === 'pending'
  const heading = pending ? 'Payment pending' : outcome === 'handed-off' ? 'Transfer submitted' : title === 'Data' ? 'Data purchased' : title === 'Airtime' ? 'Airtime purchased' : 'Payment successful'
  const detail = outcome === 'handed-off' ? 'Your USDC was sent. Bank delivery will update in Activity.' : pending ? 'Check Activity for the final payment status.' : ''
  if (viewReceipt) return <FullScreenReceiptSurface receipt={receipt} surface="receipt" onClose={() => setViewReceipt(false)} />
  return <PocketBottomSheet title={heading} onClose={onDone}>
    <div className="pb-6 pt-2 text-center">
      {pending ? <Clock3 className="mx-auto h-16 w-16 text-blue-500" /> : <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />}
      <h1 className="mt-4 text-xl font-bold tracking-tight">{heading}</h1>
      {detail && <p className="mx-auto mt-3 max-w-sm text-xs leading-5 text-gray-500 dark:text-gray-400">{detail}</p>}
    </div>
    <div className="grid grid-cols-2 gap-3">
      <button type="button" onClick={() => setViewReceipt(true)} className="min-h-12 rounded-xl border border-gray-200 text-xs font-bold dark:border-[#262626]">View receipt</button>
      <button type="button" onClick={onDone} className="min-h-12 rounded-xl bg-gray-950 text-xs font-bold text-white dark:bg-white dark:text-gray-950">Done</button>
    </div>
  </PocketBottomSheet>
}
