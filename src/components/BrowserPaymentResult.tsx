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
  return <PocketBottomSheet fullScreen={fullScreen} desktopCentered title="Payment status" dismissible={false} showCloseButton={false} onClose={() => {}}>
    <p className="mb-5 text-center text-sm font-semibold">{merchant}</p>
    <PocketTransactionSheet inline embedded title="Payment" state={state} statusLabel={statusLabel} amount={amount} receipt={receipt} detail={detail} onDone={() => {}} />
    {state === 'pending' && onCheckStatus && <button type="button" className="pocket-cta-secondary mt-4 w-full" onClick={onCheckStatus}>Check payment status</button>}
    {state === 'successful' && returnUrl && <a className="pocket-cta-primary mt-4 w-full" href={returnUrl}>{returnLabel}</a>}
    <p className="mt-5 text-center text-xs text-gray-500">Powered by Hash PayLink</p>
  </PocketBottomSheet>
}
