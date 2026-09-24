import { useState, type ReactNode } from 'react'
import { FullScreenReceiptSurface } from '../../components/UnifiedReceipt'
import { type PaylinkReceipt } from '../../lib/paymentReceiptPdf'
import PocketBottomSheet from './PocketBottomSheet'
import PocketGetApp from './PocketGetApp'
import { CheckCircle2, Clock3, X, Undo2 } from './PocketIcons'

export type PocketTransactionState = 'successful' | 'pending' | 'failed' | 'reversed'
export default function PocketTransactionSheet({ title, state, amount, detail, receipt, onDone, inline = false, children }: {
  title: string; state: PocketTransactionState; amount?: string; detail?: string; receipt?: PaylinkReceipt | null; onDone: () => void; inline?: boolean; children?: ReactNode
}) {
  const [viewReceipt, setViewReceipt] = useState(false)
  const canViewReceipt = Boolean(receipt)
  const label = state === 'successful' ? 'Successful' : state === 'failed' ? 'Failed' : state === 'reversed' ? 'Reversed' : 'Processing'
  const Icon = state === 'successful' ? CheckCircle2 : state === 'failed' ? X : state === 'reversed' ? Undo2 : Clock3
  if (viewReceipt && receipt) return <FullScreenReceiptSurface receipt={receipt} surface="receipt" onClose={() => setViewReceipt(false)} />
  const content = <>
    <p className="text-right text-xs font-semibold text-gray-500">{title}</p>
    <div className="pb-6 pt-3 text-center" role="status" aria-live="polite">
      <span className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${state === 'successful' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10' : state === 'failed' ? 'bg-red-50 text-red-500 dark:bg-red-400/10' : 'bg-blue-50 text-blue-500 dark:bg-blue-400/10'}`}><Icon aria-hidden="true" className="h-9 w-9" /></span>
      <h1 className="mt-4 text-xl font-bold tracking-tight">{label}</h1>
      {amount && <p className="mt-2 text-lg font-semibold tabular-nums">{amount}</p>}
      {detail && <p className="mx-auto mt-3 max-w-sm text-xs leading-5 text-gray-500 dark:text-gray-400">{detail}</p>}
    </div>
    {children}
    <div className={`mt-4 grid gap-3 ${canViewReceipt && !inline ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {canViewReceipt && <button type="button" onClick={() => setViewReceipt(true)} className="min-h-12 rounded-xl border border-gray-200 text-xs font-bold dark:border-[#262626]">View receipt</button>}
      {!inline && <button type="button" onClick={onDone} className="min-h-12 rounded-xl bg-gray-950 text-xs font-bold text-white dark:bg-white dark:text-gray-950">Done</button>}
    </div>
    {inline && state === 'successful' && <PocketGetApp />}
  </>
  return inline ? <section className="rounded-3xl border border-gray-100 p-5 dark:border-white/10">{content}</section> : <PocketBottomSheet title={label} onClose={onDone} dismissible={false} showCloseButton={false} dismissOnBackdrop={false}>{content}</PocketBottomSheet>
}
