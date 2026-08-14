import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import UnifiedReceipt from '../../components/UnifiedReceipt'
import { Check } from './PocketIcons'
import type { PaylinkReceipt } from '../../lib/paymentReceiptPdf'
import { paymentReceiptView } from '../../lib/paymentReceiptPdf'

export default function PocketPaymentSuccess({ receipt, onDone, title = 'Bank payout' }: { receipt: PaylinkReceipt; onDone: () => void; title?: string }) {
  const view = paymentReceiptView(receipt)
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])
  return createPortal(
    <div className="fixed inset-0 z-[130] overflow-y-auto bg-[#F5F5F7] font-sans text-gray-950 dark:bg-[#0A0A0A] dark:text-white" role="dialog" aria-modal="true" aria-label="Payment successful">
      <header className="sticky top-0 z-10 bg-[#F5F5F7]/95 px-4 backdrop-blur dark:bg-[#0A0A0A]/95">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between">
          <span className="h-10 w-12" />
          <span className="text-sm font-bold tracking-[-0.02em]">{title}</span>
          <button type="button" onClick={onDone} className="h-10 rounded-full px-1 text-xs font-bold">Done</button>
        </div>
      </header>
      <main className="mx-auto flex min-h-[calc(100dvh-56px)] w-full max-w-lg flex-col px-4 pb-8">
        <section className="flex flex-1 flex-col items-center justify-center py-12 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
            <Check className="h-7 w-7" strokeWidth={2.5} />
          </span>
          <h1 className="mt-6 text-2xl font-bold tracking-[-0.04em]">Payment successful</h1>
          <p className="mt-3 text-[34px] font-bold tabular-nums tracking-[-0.05em]">{view.amount}</p>
          <p className="mt-2 text-xs font-medium text-gray-400">{view.timestamp}</p>
        </section>
        <UnifiedReceipt receipt={receipt} />
      </main>
    </div>,
    document.body,
  )
}
