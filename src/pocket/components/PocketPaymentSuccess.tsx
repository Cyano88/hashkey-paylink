import type { ReactNode } from 'react'
import { pocketActivityAmount } from '../lib/pocketActivityPresentation'
import type { PaylinkReceipt } from '../../lib/paymentReceiptPdf'
import { paymentReceiptOutcome } from '../../lib/paymentReceiptPdf'
import PocketTransactionSheet from './PocketTransactionSheet'

type PocketPaymentOutcome = 'completed' | 'handed-off' | 'pending'
export default function PocketPaymentSuccess({ receipt, onDone, children, inline = false, title, outcome = 'completed' }: { children?: ReactNode; receipt: PaylinkReceipt; inline?: boolean; onDone: () => void; title?: string; outcome?: PocketPaymentOutcome }) {
  const actual = paymentReceiptOutcome(receipt)
  const state = actual.state
  const kind = receipt.source === 'bank-withdraw' ? 'Bank transfer' : title || receipt.title || 'Payment'
  return <PocketTransactionSheet title={kind} state={state} statusLabel={actual.label} amount={receipt.source === 'bills' ? pocketActivityAmount({ source: 'bills', amount: receipt.amount, amountNgn: receipt.amountNgn }) : `${receipt.amount} ${receipt.asset || 'USDC'}`} receipt={receipt} onDone={onDone} inline={inline}
    detail={state === 'pending' && !actual.label.startsWith('Refund') ? 'Waiting for confirmation. You can check Activity for updates.' : undefined}>{children}</PocketTransactionSheet>
}
