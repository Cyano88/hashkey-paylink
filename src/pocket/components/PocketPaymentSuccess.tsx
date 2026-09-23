import PocketGetApp from './PocketGetApp'
import type { ComponentProps } from 'react'
import { useState } from 'react'
import { FullScreenReceiptSurface } from '../../components/UnifiedReceipt'
import PocketBottomSheet from './PocketBottomSheet'
import { CheckCircle2, Clock3, X, Undo2 } from './PocketIcons'
import { paymentReceiptOutcome, type PaylinkReceipt } from '../../lib/paymentReceiptPdf'

type PocketPaymentOutcome = 'completed' | 'handed-off' | 'pending'

function InlineSuccess({children}:ComponentProps<typeof PocketBottomSheet>){return <section className="rounded-3xl border border-gray-100 p-5 dark:border-white/10">{children}</section>}
export default function PocketPaymentSuccess({ receipt, onDone, inline = false, title = 'Bank payout', outcome = 'completed' }: { receipt: PaylinkReceipt; inline?:boolean; onDone: () => void; title?: string; outcome?: PocketPaymentOutcome }) {
  const [viewReceipt, setViewReceipt] = useState(false)
  const bank = receipt.source === 'bank-withdraw'
  const actual = paymentReceiptOutcome(receipt)
  const pending = bank ? actual.state !== 'successful' : outcome === 'pending'
  const heading = bank ? actual.label : pending ? 'Payment pending' : outcome === 'handed-off' ? 'Transfer submitted' : title === 'Data' ? 'Data purchased' : title === 'Airtime' ? 'Airtime purchased' : 'Payment successful'
  const detail = bank ? actual.state === 'pending' ? 'Your transfer was submitted. Waiting for bank delivery confirmation.' : '' : outcome === 'handed-off' ? 'Your transfer was submitted.' : pending ? 'Check Activity for the final payment status.' : ''
  if (viewReceipt) return <FullScreenReceiptSurface receipt={receipt} surface="receipt" onClose={() => setViewReceipt(false)} />
  const Surface=inline?InlineSuccess:PocketBottomSheet
  return <Surface title={heading} onClose={onDone} dismissOnBackdrop={false}>
    <div className="pb-6 pt-2 text-center">
      {bank && actual.state === 'failed' ? <X className="mx-auto h-16 w-16 text-red-500" /> : bank && actual.state === 'reversed' ? <Undo2 className="mx-auto h-16 w-16 text-amber-500" /> : pending ? <Clock3 className="mx-auto h-16 w-16 text-blue-500" /> : <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />}
      <h1 className="mt-4 text-xl font-bold tracking-tight">{heading}</h1>
      {detail && <p className="mx-auto mt-3 max-w-sm text-xs leading-5 text-gray-500 dark:text-gray-400">{detail}</p>}
    </div>
    <div className={inline ? "grid grid-cols-1 gap-3" : "grid grid-cols-2 gap-3"}>
      <button type="button" onClick={() => setViewReceipt(true)} className="min-h-12 rounded-xl border border-gray-200 text-xs font-bold dark:border-[#262626]">View receipt</button>
      {!inline && <button type="button" onClick={onDone} className="min-h-12 rounded-xl bg-gray-950 text-xs font-bold text-white dark:bg-white dark:text-gray-950">Done</button>}
    </div>
  {inline && actual.state==='successful' && <PocketGetApp/>}
  </Surface>
}
