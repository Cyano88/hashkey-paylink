import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import UnifiedReceipt from '../../components/UnifiedReceipt'
import { Check, Clock3 } from './PocketIcons'
import type { PaylinkReceipt } from '../../lib/paymentReceiptPdf'
import { paymentReceiptView } from '../../lib/paymentReceiptPdf'
import { POCKET_NATIVE_BACK_EVENT } from '../lib/pocketNativeBack'

type PocketPaymentOutcome = 'completed' | 'handed-off' | 'pending'

export default function PocketPaymentSuccess({ receipt, onDone, title = 'Bank payout', outcome = 'completed' }: { receipt: PaylinkReceipt; onDone: () => void; title?: string; outcome?: PocketPaymentOutcome }) {
  const view = paymentReceiptView(receipt)
  const pending = outcome === 'pending'
  const heading = pending ? 'Payment pending' : 'Payment successful'
  const detail = outcome === 'handed-off'
    ? 'Your USDC reached the payout recipient. Bank delivery will update in Activity.'
    : pending
      ? 'The payment window elapsed before the recipient detected your USDC. Follow the final status or reversal in Activity.'
      : ''
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])
  useEffect(() => {
    const handleNativeBack = (event: Event) => {
      event.preventDefault()
      onDone()
    }
    window.addEventListener(POCKET_NATIVE_BACK_EVENT, handleNativeBack)
    return () => window.removeEventListener(POCKET_NATIVE_BACK_EVENT, handleNativeBack)
  }, [onDone])
  return createPortal(
    <div className="fixed inset-x-0 bottom-0 z-[130] flex flex-col overflow-hidden bg-[#F5F5F7] font-sans text-gray-950 dark:bg-[#0A0A0A] dark:text-white" style={{ top: 'var(--pocket-safe-top)' }} role="dialog" aria-modal="true" aria-label={heading}>
      <header className="z-10 shrink-0 bg-[#F5F5F7]/95 px-4 backdrop-blur dark:bg-[#0A0A0A]/95">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between">
          <span className="h-10 w-12" />
          <span className="text-sm font-bold tracking-[-0.02em]">{title}</span>
          <button type="button" onClick={onDone} className="h-10 rounded-full px-1 text-xs font-bold">Done</button>
        </div>
      </header>
      <main className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col overflow-y-auto px-4 pb-[max(1.25rem,var(--pocket-safe-bottom))]">
        <section className="flex min-h-[15rem] flex-1 flex-col items-center justify-center py-5 text-center">
          <span className={`flex h-14 w-14 items-center justify-center rounded-full text-white shadow-sm ${pending ? 'bg-blue-600' : 'bg-emerald-500'}`}>
            {pending ? <Clock3 className="h-7 w-7" /> : <Check className="h-7 w-7" strokeWidth={2.5} />}
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-[-0.04em]">{heading}</h1>
          <p className="mt-2 text-[32px] font-bold tabular-nums tracking-[-0.05em]">{view.amount}</p>
          <p className="mt-2 text-xs font-medium text-gray-400">{view.timestamp}</p>
          {detail && <p className="mt-3 max-w-sm text-xs leading-5 text-gray-500 dark:text-gray-400">{detail}</p>}
        </section>
        <UnifiedReceipt receipt={receipt} className="shrink-0" />
      </main>
    </div>,
    document.body,
  )
}
