import type { PaylinkReceipt } from '../../lib/paymentReceiptPdf'
import { paymentReceiptOutcome } from '../../lib/paymentReceiptPdf'
import PocketTransactionSheet from './PocketTransactionSheet'

type PocketPaymentOutcome = 'completed' | 'handed-off' | 'pending'
export default function PocketPaymentSuccess({ receipt, onDone, inline = false, title, outcome = 'completed' }: { receipt: PaylinkReceipt; inline?: boolean; onDone: () => void; title?: string; outcome?: PocketPaymentOutcome }) {
  const actual = paymentReceiptOutcome(receipt)
  const state = actual.state
  const kind = receipt.source === 'bank-withdraw' ? 'Bank transfer' : title || receipt.title || 'Payment'
  return <PocketTransactionSheet title={kind} state={state} amount={`${receipt.amount} ${receipt.asset || 'USDC'}`} receipt={receipt} onDone={onDone} inline={inline}
    detail={state === 'pending' ? 'Waiting for confirmation. You can check Activity for updates.' : undefined} />
}
