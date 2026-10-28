import {useEffect} from 'react'
import {CheckoutFooter} from './CheckoutChrome'
import PocketBottomSheet from '../pocket/components/PocketBottomSheet'
import PocketTransactionSheet, { type PocketTransactionState } from '../pocket/components/PocketTransactionSheet'
import type { PaylinkReceipt } from '../lib/paymentReceiptPdf'

/** Browser shell around Pocket's result. Return URLs must already be server-verified. */
export default function BrowserPaymentResult({ fullScreen = false, state, amount, merchant, receipt, detail, returnUrl, returnLabel = 'Return to merchant', statusLabel, onCheckStatus }: {
  fullScreen?: boolean
  returnLabel?: string
  statusLabel?: string
  state: PocketTransactionState
  amount: string
  merchant: string
  receipt?: PaylinkReceipt | null
  detail?: string
  returnUrl?: string
  onCheckStatus?: () => void
}) {
  const destination = returnUrl && /^https:\/\//i.test(returnUrl) ? returnUrl : undefined
  useEffect(() => {
    if (state !== 'successful' || !destination) return
    const timer = window.setTimeout(() => window.location.assign(destination), 3000)
    return () => window.clearTimeout(timer)
  }, [state, destination])
  return <PocketBottomSheet fullScreen={fullScreen} desktopCentered title="Payment status" dismissible={false} showCloseButton={false} onClose={() => {}}>
    <p className="mb-5 text-center text-sm font-semibold">{merchant}</p>
    <PocketTransactionSheet inline embedded title="Payment" state={state} statusLabel={statusLabel} amount={amount} receipt={receipt} detail={detail} onDone={() => {}} />
    {state === 'pending' && onCheckStatus && <button type="button" className="pocket-cta-secondary mt-4 w-full" onClick={onCheckStatus}>Check payment status</button>}
    {state === 'successful' && destination && <><p role="status" className="mt-4 text-center text-xs text-gray-500">Returning to {merchant}…</p><a className="pocket-cta-primary mt-4 w-full" href={destination}>{returnLabel}</a></>}
    {state !== 'successful' && destination && <a className="pocket-cta-secondary mt-4 w-full" href={destination}>{returnLabel}</a>}
    <CheckoutFooter/>
  </PocketBottomSheet>
}
