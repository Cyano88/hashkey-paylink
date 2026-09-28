import PocketTransactionDetails from './PocketTransactionDetails'
import { formatPocketPaymentAmount } from '../lib/pocketMoney'
import { useState, type ReactNode } from 'react'
import { FullScreenReceiptSurface } from '../../components/UnifiedReceipt'
import { type PaylinkReceipt } from '../../lib/paymentReceiptPdf'
import PocketBottomSheet from './PocketBottomSheet'
import PocketGetApp from './PocketGetApp'
import { Check, Clock3, X, Undo2 } from './PocketIcons'

export type PocketTransactionState = 'successful' | 'pending' | 'failed' | 'reversed'
export default function PocketTransactionSheet({ title, state, statusLabel, amount, detail, receipt, onDone, inline = false, children, detailsRows }: {
  detailsRows?: Array<[string, ReactNode]>; statusLabel?: string; title: string; state: PocketTransactionState; amount?: string; detail?: string; receipt?: PaylinkReceipt | null; onDone: () => void; inline?: boolean; children?: ReactNode
}) {
  const [viewReceipt, setViewReceipt] = useState(false)
  const canViewReceipt = Boolean(receipt)
  const localAmount = receipt?.amountNgn && Number.isFinite(Number(receipt.amountNgn)) && (!receipt.asset || receipt.asset === 'USDC')
    ? `${receipt.fiatCurrency || 'NGN'} ${Number(receipt.amountNgn).toLocaleString('en-NG', { maximumFractionDigits: 2 })}` : undefined
  const usdcEquivalent = localAmount && receipt && Number.isFinite(Number(receipt.amount))
    ? `${formatPocketPaymentAmount(Number(receipt.amount))} USDC` : undefined
  const label = statusLabel || (state === 'successful' ? 'Successful' : state === 'failed' ? 'Failed' : state === 'reversed' ? 'Reversed' : 'Processing')
  const Icon = label.toLowerCase().startsWith('refund') ? Undo2 : state === 'failed' ? X : state === 'reversed' ? Undo2 : Clock3
  if (viewReceipt && receipt) return <FullScreenReceiptSurface receipt={receipt} surface="receipt" onClose={() => setViewReceipt(false)} />
  const rows: Array<[string, ReactNode]> = detailsRows ?? (receipt ? [
    ...(receipt.providerName ? [['Provider', receipt.providerName] as [string, ReactNode]] : []),
    ...(receipt.targetLabel && receipt.targetValue ? [[receipt.targetLabel, receipt.targetValue] as [string, ReactNode]] : []),
    ...(receipt.recipient ? [['To', receipt.recipient] as [string, ReactNode]] : []),
    ...(receipt.destination ? [['Destination', receipt.destination] as [string, ReactNode]] : []),
    ...(receipt.chain ? [['Network', <span className="capitalize">{receipt.chain}</span>] as [string, ReactNode]] : []),
    ...(Number.isFinite(receipt.createdAt) && receipt.createdAt > 0 ? [['Date', new Date(receipt.createdAt).toLocaleString()] as [string, ReactNode]] : []),
  ] : [])
  const content = <>
    <p className="text-right text-xs font-semibold text-gray-500 dark:text-gray-400">{title}</p>
    <div className="pb-6 pt-3 text-center" role="status" aria-live="polite">
      {state === 'successful' ? <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-600 text-white"><Check aria-hidden="true" strokeWidth={2.5} className="h-8 w-8" /></span> : <span className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${state === 'failed' ? 'bg-red-50 text-red-500 dark:bg-red-400/10' : 'bg-blue-50 text-blue-500 dark:bg-blue-400/10'}`}><Icon aria-hidden="true" className="h-9 w-9" /></span>}
      <h1 className="mt-4 text-xl font-bold tracking-tight">{label}</h1>
      {(localAmount || amount) && <p className="mt-2 text-lg font-semibold tabular-nums">{localAmount || amount}</p>}
      {usdcEquivalent && <p className="mt-1 text-xs font-medium tabular-nums text-gray-500 dark:text-gray-400">{usdcEquivalent}</p>}
      {detail && <p className="mx-auto mt-3 max-w-sm text-xs leading-5 text-gray-500 dark:text-gray-400">{detail}</p>}
    </div>
    <PocketTransactionDetails rows={rows} />
    {children}
    <div className={`mt-4 grid gap-3 ${canViewReceipt && !inline ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {canViewReceipt && <button type="button" onClick={() => setViewReceipt(true)} className="pocket-cta-secondary">View receipt</button>}
      {!inline && <button type="button" onClick={onDone} className="pocket-cta-primary ">Done</button>}
    </div>
    {inline && state === 'successful' && <PocketGetApp />}
  </>
  return inline ? <section className="font-sans rounded-3xl border border-gray-100 p-5 dark:border-white/10">{content}</section> : <PocketBottomSheet title={label} onClose={onDone} dismissible={false} showCloseButton={false} dismissOnBackdrop={false}>{content}</PocketBottomSheet>
}
