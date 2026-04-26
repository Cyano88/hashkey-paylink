import { useEffect, useState } from 'react'
import type { PendingTx } from '../hooks/usePendingTx'

const ARC_EXPLORER = 'https://testnet.arcscan.app'

interface PendingTxToastProps {
  txs:       PendingTx[]
  onDismiss: (txHash: `0x${string}`) => void
}

export function PendingTxToast({ txs, onDismiss }: PendingTxToastProps) {
  const visible = txs.filter(() => true)
  if (visible.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-24 right-4 z-50 flex flex-col items-end gap-2 sm:right-6">
      {visible.map(tx => (
        <Toast key={tx.txHash} tx={tx} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function Toast({ tx, onDismiss }: { tx: PendingTx; onDismiss: (h: `0x${string}`) => void }) {
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setVisible(true), 30)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    if (tx.status !== 'confirmed') return
    const id = setTimeout(() => handleDismiss(), 6_000)
    return () => clearTimeout(id)
  }, [tx.status]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleDismiss() {
    setLeaving(true)
    setTimeout(() => onDismiss(tx.txHash), 300)
  }

  const isConfirmed = tx.status === 'confirmed'
  const isFailed    = tx.status === 'failed'
  const isPending   = tx.status === 'pending'
  const actionLabel = tx.action === 'claim' ? 'Withdrawal' : 'Cancellation'

  return (
    <div
      className="pointer-events-auto"
      style={{
        transform:  visible && !leaving ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.97)',
        opacity:    visible && !leaving ? 1 : 0,
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div className="flex w-72 items-start gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3.5 shadow-lg">

        {/* Status icon */}
        <div className="mt-0.5 shrink-0">
          {isPending && (
            <div className="flex h-5 w-5 items-center justify-center">
              <svg className="h-4 w-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}
          {isConfirmed && (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 border border-emerald-100">
              <svg className="h-3 w-3 text-emerald-500" fill="none" viewBox="0 0 24 24"
                stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
          )}
          {isFailed && (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-50 border border-red-100">
              <svg className="h-3 w-3 text-red-400" fill="none" viewBox="0 0 24 24"
                stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          )}
        </div>

        {/* Copy */}
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-gray-800">
            {isPending   && `${actionLabel} Pending`}
            {isConfirmed && `${actionLabel} Confirmed`}
            {isFailed    && `${actionLabel} Failed`}
          </p>
          <p className="mt-0.5 text-[12px] text-gray-400">
            {isPending   && 'Waiting for Arc block confirmation…'}
            {isConfirmed && 'Your transaction has been finalized on-chain.'}
            {isFailed    && 'The transaction was reverted. No funds were moved.'}
          </p>
          <a
            href={`${ARC_EXPLORER}/tx/${tx.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-2 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            View on Arcscan
          </a>
        </div>

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          className="mt-0.5 shrink-0 rounded p-0.5 text-gray-300 hover:bg-gray-100 hover:text-gray-500 transition-colors"
          aria-label="Dismiss"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
