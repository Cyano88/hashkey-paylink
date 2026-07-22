import { useMemo, useState } from 'react'
import { Building2, Check, Copy, FileDown, Link2, Loader2, ReceiptText } from 'lucide-react'
import {
  compactReceiptAmount,
  createPaymentReceiptPdf,
  paymentReceiptFileName,
  paymentReceiptView,
  type PaylinkReceipt,
} from '../lib/paymentReceiptPdf'

type UnifiedReceiptProps = {
  receipt: PaylinkReceipt
  className?: string
  showAction?: boolean
}

function shortValue(value: string) {
  if (value.length <= 34) return value
  return `${value.slice(0, 18)}...${value.slice(-10)}`
}

export default function UnifiedReceipt({ receipt, className = '', showAction = true }: UnifiedReceiptProps) {
  const view = useMemo(() => paymentReceiptView(receipt), [receipt])
  const [copied, setCopied] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  const [shareError, setShareError] = useState('')

  async function copyReference() {
    try {
      await navigator.clipboard.writeText(view.reference)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  async function sharePdf() {
    if (sharing) return
    setSharing(true)
    setShareError('')
    try {
      const pdf = await createPaymentReceiptPdf(receipt)
      const file = new File([pdf], paymentReceiptFileName(receipt), { type: 'application/pdf' })
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean; share?: (data: ShareData) => Promise<void> }
      if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await nav.share({
          title: receipt.title || 'Hash PayLink receipt',
          text: `${compactReceiptAmount(receipt.amount)} ${receipt.asset} confirmed`,
          files: [file],
        })
      } else {
        const url = URL.createObjectURL(pdf)
        const link = document.createElement('a')
        link.href = url
        link.download = file.name
        document.body.appendChild(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(url)
        setDownloaded(true)
        window.setTimeout(() => setDownloaded(false), 1800)
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setShareError('The PDF could not be prepared. Please try again.')
    } finally {
      setSharing(false)
    }
  }

  const BadgeIcon = view.variant === 'bills' ? ReceiptText : view.badge === 'Bank Transfer' ? Building2 : Link2
  return (
    <section className={className} aria-label={`${view.variant === 'bills' ? 'Bills' : 'Payment'} receipt`}>
      <div className={`relative overflow-hidden bg-black px-5 pb-6 pt-5 text-white shadow-[0_24px_70px_rgba(0,0,0,0.2)] sm:px-7 sm:pb-8 sm:pt-7 ${view.variant === 'bills' ? 'rounded-t-[1.75rem]' : 'rounded-[1.75rem]'}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white p-1.5">
              <img src="/hash-logo-transparent.png" alt="" className="h-full w-full object-contain" />
            </span>
            <span className="truncate text-[13px] font-black tracking-[-0.02em]">Hash_PayLink</span>
          </div>
          <span className="inline-flex min-h-8 max-w-[50%] items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.07] px-3 text-[9px] font-black uppercase tracking-[0.13em] text-white/75">
            <BadgeIcon className="h-3 w-3 shrink-0" />
            <span className="truncate">{view.badge}</span>
          </span>
        </div>

        <div className="pb-8 pt-12 text-center sm:pb-10 sm:pt-14">
          <p className="break-words text-[2.05rem] font-black leading-none tracking-[-0.055em] sm:text-[2.65rem]">{view.amount}</p>
          <p className="mt-3 text-[10px] font-semibold tracking-[0.08em] text-white/45">{view.timestamp}</p>
        </div>

        <dl className="border-t border-dashed border-white/15">
          {view.rows.map(row => (
            <div key={`${row.label}-${row.value}`} className="grid grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] gap-4 border-b border-dashed border-white/15 py-4">
              <dt className="text-[9px] font-black uppercase tracking-[0.14em] text-white/40">{row.label}</dt>
              <dd className={`break-words text-right text-[11px] font-bold leading-5 text-white/90 ${row.mono ? 'font-mono text-[10px]' : ''}`}>{shortValue(row.value)}</dd>
            </div>
          ))}
          <div className="grid grid-cols-[minmax(0,0.34fr)_minmax(0,0.66fr)] items-center gap-3 pt-4">
            <dt className="text-[9px] font-black uppercase tracking-[0.14em] text-white/40">Reference ID</dt>
            <dd className="flex min-w-0 items-center justify-end gap-2 text-right font-mono text-[10px] font-bold text-white/90">
              <span className="truncate">{shortValue(view.reference)}</span>
              <button type="button" onClick={() => void copyReference()} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.07] text-white/65 transition hover:bg-white/[0.12] hover:text-white" aria-label="Copy receipt reference">
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </button>
            </dd>
          </div>
        </dl>
      </div>

      {view.variant === 'bills' && (
        <svg aria-hidden="true" viewBox="0 0 120 7" preserveAspectRatio="none" className="block h-3 w-full -translate-y-px text-black">
          <path fill="currentColor" d="M0 0h120v2L117 7l-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5-3-5-3 5L0 2z" />
        </svg>
      )}

      {showAction && (
        <button type="button" onClick={() => void sharePdf()} disabled={sharing} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-gray-100 px-5 text-sm font-black text-gray-950 transition hover:bg-white active:scale-[0.99] disabled:cursor-wait disabled:opacity-70">
          {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : downloaded ? <Check className="h-4 w-4" /> : <FileDown className="h-4 w-4" />}
          {sharing ? 'Preparing PDF' : downloaded ? 'PDF downloaded' : 'Share as PDF'}
        </button>
      )}
      {shareError && <p role="alert" className="mt-2 text-center text-xs font-semibold text-red-500">{shareError}</p>}
    </section>
  )
}
