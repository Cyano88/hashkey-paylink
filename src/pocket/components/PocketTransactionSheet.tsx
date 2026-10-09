import {localCurrencyAmount} from '../lib/pocketDisplayCurrency'
import PocketLocalEquivalent from './PocketLocalEquivalent'
import PocketTransactionDetails from './PocketTransactionDetails'
import { formatPocketPaymentAmount } from '../lib/pocketMoney'
import { Children, useState, type ReactNode } from 'react'
import { FullScreenReceiptSurface } from '../../components/UnifiedReceipt'
import { type PaylinkReceipt } from '../../lib/paymentReceiptPdf'
import PocketBottomSheet from './PocketBottomSheet'
import PocketGetApp from './PocketGetApp'
import { Check, Clock3, X, Undo2 } from './PocketIcons'

export type PocketTransactionState = 'successful' | 'pending' | 'failed' | 'reversed'
export default function PocketTransactionSheet({ title, state, statusLabel, amount, detail, receipt, onDone, inline = false, embedded = false, children, detailsRows, statusAction }: {
  embedded?: boolean; statusAction?: ReactNode; detailsRows?: Array<[string, ReactNode]>; statusLabel?: string; title: string; state: PocketTransactionState; amount?: string; detail?: string; receipt?: PaylinkReceipt | null; onDone: () => void; inline?: boolean; children?: ReactNode
}) {
  const [viewReceipt, setViewReceipt] = useState(false)
  const [viewDetails, setViewDetails] = useState(false)
  const hasAction = state !== 'successful' && Children.toArray(statusAction).length > 0
  const canViewDetails = !receipt && Boolean(detailsRows?.length || Children.toArray(children).length)
  const canViewReceipt = Boolean(receipt)
  const localAmount = receipt?.amountNgn && Number.isFinite(Number(receipt.amountNgn)) && (!receipt.asset || receipt.asset === 'USDC' || receipt.asset === 'USDT')
    ? localCurrencyAmount(Number(receipt.amountNgn),receipt.fiatCurrency === 'UGX' ? 'UGX' : 'NGN') : undefined
  const usdcEquivalent = receipt && (!receipt.asset || receipt.asset === 'USDC' || receipt.asset === 'USDT') && receipt.amount !== '' && Number.isFinite(Number(receipt.amount))
    ? `${formatPocketPaymentAmount(Number(receipt.amount))} ${receipt.asset || 'USDC'}` : undefined
  const label = statusLabel || (state === 'successful' ? 'Successful' : state === 'failed' ? 'Failed' : state === 'reversed' ? 'Reversed' : 'Processing')
  const Icon = label.toLowerCase().startsWith('refund') ? Undo2 : state === 'failed' ? X : state === 'reversed' ? Undo2 : Clock3
  if (viewReceipt && receipt) return <FullScreenReceiptSurface receipt={receipt} surface="receipt" onClose={() => setViewReceipt(false)} extraActions={children} />
  if (viewDetails) return <PocketBottomSheet title={title} onClose={() => setViewDetails(false)} dismissOnBackdrop={false}><h2 className="mb-5 text-base font-bold">{title}</h2><PocketTransactionDetails rows={detailsRows || []} />{detail && <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{detail}</p>}{children}</PocketBottomSheet>
  const content = <>
    {inline && !embedded && <p className="text-right text-xs font-semibold text-gray-500 dark:text-gray-400">{title}</p>}
    <div data-pocket-status-core className="flex h-48 shrink-0 flex-col items-center pt-1 text-center" role="status" aria-live="polite">
      {state === 'successful' ? <span className="mx-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-green-600 text-white"><Check aria-hidden="true" strokeWidth={2.5} className="h-8 w-8" /></span> : <span className={`mx-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${state === 'failed' ? 'bg-red-50 text-red-500 dark:bg-red-400/10' : 'bg-blue-50 text-blue-500 dark:bg-blue-400/10'}`}><Icon aria-hidden="true" className="h-9 w-9" /></span>}
      <h1 className="mt-3 text-xl font-bold tracking-tight">{label}</h1>
      {(usdcEquivalent || amount || localAmount) && <p className="mt-2 text-lg font-semibold tabular-nums">{localAmount || usdcEquivalent || amount}</p>}
      <div className="mt-1 h-8 w-full shrink-0 overflow-y-auto text-xs leading-4 text-gray-500 dark:text-gray-400">
        {usdcEquivalent && receipt && (localAmount ? <p>{usdcEquivalent}</p> : receipt.asset === 'USDT' ? null : <PocketLocalEquivalent amount={Number(receipt.amount)} className="text-xs leading-4 text-gray-500 dark:text-gray-400" />)}
        {state !== 'successful' && detail && <p className="mx-auto max-w-sm">{detail}</p>}
      </div>
    </div>
    {(!embedded || canViewReceipt || canViewDetails || hasAction) && <div data-pocket-status-actions className={`mt-4 grid h-12 items-stretch gap-3 [&>button]:h-12 [&>button]:min-w-0 [&>button]:px-2 [&>button]:py-1 ${hasAction && !inline ? 'grid-cols-3' : (canViewReceipt || canViewDetails) && !inline ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {canViewReceipt && <button type="button" onClick={() => setViewReceipt(true)} className="pocket-cta-secondary">View receipt</button>}
      {canViewDetails && <button type="button" onClick={() => setViewDetails(true)} className="pocket-cta-secondary">View details</button>}
      {hasAction && statusAction}
      {!inline && <button type="button" onClick={onDone} className="pocket-cta-primary ">Done</button>}
    </div>}
    {inline && state === 'successful' && <PocketGetApp />}
  </>
  return inline ? <section className={embedded ? 'font-sans' : 'font-sans rounded-3xl border border-gray-100 p-5 dark:border-white/10'}>{content}</section> : <PocketBottomSheet title={label} headerLabel={title} onClose={onDone} dismissible={false} showCloseButton={false} dismissOnBackdrop={false}>{content}</PocketBottomSheet>
}
