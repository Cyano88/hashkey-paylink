import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  createPaymentReceiptImage,
  createPaymentReceiptPdf,
  createX402PaylinkReceipt,
  paymentReceiptBrand,
  paymentReceiptFileName,
  paymentReceiptImageFileName,
  paymentReceiptView,
  type PaylinkReceipt,
  type X402ReceiptLike,
} from '../lib/paymentReceiptPdf'
import { Check, Clock3, Copy, Eye, Loader2, Share2 } from '../pocket/components/PocketIcons'
import { CPurseIcon } from '../pocket/components/CPurseIcon'

type UnifiedReceiptProps = {
  receipt?: PaylinkReceipt
  receiptId?: string
  className?: string
  label?: string
  showAction?: boolean
  compact?: boolean
}

type ReceiptResponse = {
  ok?: boolean
  error?: string
  receipt?: X402ReceiptLike & Partial<PaylinkReceipt>
}

type ReceiptSurface = 'details' | 'receipt' | null

const PENDING_RECEIPT_STATUSES = new Set(['deposited', 'fulfilling', 'fulfilled', 'needs review', 'pending', 'processing', 'reconciling', 'settling', 'submitted', 'verification pending'])

function isPendingReceipt(receipt: PaylinkReceipt) {
  return PENDING_RECEIPT_STATUSES.has(String(receipt.status || '').trim().toLowerCase())
}

function isCanonicalReceipt(receipt: ReceiptResponse['receipt']): receipt is PaylinkReceipt {
  return Boolean(receipt?.receiptId && receipt.receiptHash && receipt.eventId && receipt.status)
}

async function readReceipt(receiptId: string) {
  const encoded = encodeURIComponent(receiptId)
  for (const endpoint of [`/api/x402/receipt?id=${encoded}`, `/api/receipt?id=${encoded}`]) {
    const response = await fetch(endpoint, { cache: 'no-store' })
    const data = await response.json().catch(() => undefined) as ReceiptResponse | undefined
    if (!response.ok || !data?.ok || !data.receipt) continue
    return isCanonicalReceipt(data.receipt)
      ? data.receipt
      : createX402PaylinkReceipt(data.receipt, receiptId)
  }
  throw new Error('Receipt could not be loaded.')
}

function BrandMark({ receipt, className = '' }: { receipt: PaylinkReceipt; className?: string }) {
  const brand = paymentReceiptBrand(receipt)
  const [failed, setFailed] = useState(false)
  if (brand.kind === 'pocket') {
    return <CPurseIcon size="100%" title="" className={`text-gray-950 ${className}`} />
  }
  if (brand.imageUrl && !failed) {
    return <img src={brand.imageUrl} alt="" onError={() => setFailed(true)} className={`object-contain ${className}`} />
  }
  return (
    <span className={`flex items-center justify-center rounded-xl bg-gray-950 text-[10px] font-bold text-white ${className}`}>
      {brand.name.slice(0, 2).toUpperCase()}
    </span>
  )
}

function ReceiptDocument({ receipt }: { receipt: PaylinkReceipt }) {
  const view = useMemo(() => paymentReceiptView(receipt), [receipt])
  const brand = paymentReceiptBrand(receipt)
  const pending = isPendingReceipt(receipt)
  return (
    <article className="mx-auto flex h-full min-h-0 w-full max-w-md flex-col bg-white px-7 pb-4 pt-4 font-sans text-gray-950 sm:px-9">
      <header className="flex items-center justify-between gap-4">
        <span className="flex min-w-0 items-center gap-3">
          <BrandMark receipt={receipt} className="h-9 w-9 shrink-0" />
          <span className="truncate text-sm font-bold tracking-[-0.02em]">{brand.name}</span>
        </span>
        <span className="rounded-full bg-gray-100 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-gray-500">{view.badge}</span>
      </header>

      <section className="mt-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-full text-white ${pending ? 'bg-blue-600' : 'bg-emerald-500'}`}>
          {pending ? <Clock3 className="h-5 w-5" /> : <Check className="h-5 w-5" strokeWidth={2.5} />}
        </span>
        <h2 className="mt-2 text-[15px] font-semibold tracking-[-0.02em]">{pending ? 'Payment pending' : 'Payment successful'}</h2>
        <p className="mt-1 text-[11px] font-medium text-gray-400">{view.timestamp}</p>
        <p className="mt-3 break-words text-[30px] font-bold tracking-[-0.045em]">{view.amount}</p>
      </section>

      <dl className="mt-3 border-t border-gray-100 pt-0.5">
        {view.rows.map(row => (
          <div key={row.label} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-5 py-1.5">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">{row.label}</dt>
            <dd className={`min-w-0 break-words text-right text-[11px] font-semibold leading-5 text-gray-700 ${row.mono ? 'font-mono' : ''}`}>{row.value || '-'}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-1.5 border-t border-gray-100 pt-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">Reference ID</p>
        <p className="mt-1 break-all font-mono text-[10px] font-semibold leading-5 text-gray-600">{view.reference}</p>
      </div>

      <footer className="mt-auto pt-2 text-center text-[10px] font-semibold text-gray-400">Powered by Hash PayLink</footer>
    </article>
  )
}

function TransactionDetails({ receipt, copied, onCopy }: { receipt: PaylinkReceipt; copied: boolean; onCopy: () => void }) {
  const view = paymentReceiptView(receipt)
  const pending = isPendingReceipt(receipt)
  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-12 pt-8">
      <div className="rounded-[28px] bg-white p-5 shadow-sm dark:bg-[#111216]">
        <div className="flex items-center gap-3">
          <span className={`flex h-11 w-11 items-center justify-center rounded-full text-white ${pending ? 'bg-blue-600' : 'bg-emerald-500'}`}>{pending ? <Clock3 className="h-5 w-5" /> : <Check className="h-5 w-5" />}</span>
          <span>
            <span className="block text-sm font-bold text-gray-950 dark:text-white">{pending ? 'Payment pending' : 'Payment successful'}</span>
            <span className="mt-0.5 block text-[11px] font-medium text-gray-400">{view.timestamp}</span>
          </span>
        </div>
        <p className="mt-8 text-[32px] font-bold tracking-[-0.045em] text-gray-950 dark:text-white">{view.amount}</p>
        <dl className="mt-7 divide-y divide-gray-100 border-t border-gray-100 dark:divide-white/10 dark:border-white/10">
          {[...view.rows, { label: 'Status', value: receipt.status || 'confirmed' }].map(row => (
            <div key={row.label} className="flex items-start justify-between gap-5 py-3.5">
              <dt className="text-[11px] font-medium text-gray-400">{row.label}</dt>
              <dd className="max-w-[66%] break-words text-right text-[11px] font-semibold leading-5 text-gray-700 dark:text-gray-200">{row.value || '-'}</dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-gray-100 pt-4 dark:border-white/10">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">Reference ID</p>
            <button type="button" onClick={onCopy} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 dark:text-gray-300" aria-label="Copy reference">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-2 break-all font-mono text-[10px] font-semibold leading-5 text-gray-600 dark:text-gray-300">{view.reference}</p>
        </div>
      </div>
    </div>
  )
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

async function shareFile(file: File, title: string) {
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    await navigator.share({ title, files: [file] })
    return
  }
  downloadBlob(file, file.name)
}

function receiptDataUrlBlob(dataUrl: string) {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl)
  if (!match) throw new Error('Receipt image could not be prepared.')
  const bytes = Uint8Array.from(atob(match[2]), character => character.charCodeAt(0))
  return new Blob([bytes], { type: match[1] })
}

function FullScreenReceiptSurface({ receipt, surface, onClose }: { receipt: PaylinkReceipt; surface: Exclude<ReceiptSurface, null>; onClose: () => void }) {
  const [sharing, setSharing] = useState<'image' | 'pdf' | ''>('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const brand = paymentReceiptBrand(receipt)
  const reference = paymentReceiptView(receipt).reference

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  async function share(kind: 'image' | 'pdf') {
    if (sharing) return
    setSharing(kind)
    setError('')
    try {
      if (kind === 'image') {
        const dataUrl = await createPaymentReceiptImage(receipt)
        const blob = receiptDataUrlBlob(dataUrl)
        await shareFile(new File([blob], paymentReceiptImageFileName(receipt), { type: 'image/jpeg' }), `${brand.name} receipt`)
      } else {
        const blob = await createPaymentReceiptPdf(receipt)
        await shareFile(new File([blob], paymentReceiptFileName(receipt), { type: 'application/pdf' }), `${brand.name} receipt`)
      }
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : 'Receipt could not be shared.')
    } finally {
      setSharing('')
    }
  }

  return createPortal(
    <div className="fixed inset-x-0 bottom-0 z-[140] flex flex-col overflow-hidden bg-[#F5F5F7] font-sans text-gray-950 dark:bg-[#0A0A0A] dark:text-white" style={{ top: 'var(--pocket-safe-top)' }} role="dialog" aria-modal="true" aria-label={surface === 'details' ? 'Transaction details' : 'Receipt preview'}>
      <div className="z-10 shrink-0 border-b border-gray-200/80 bg-[#F5F5F7]/95 px-4 backdrop-blur dark:border-white/10 dark:bg-[#0A0A0A]/95">
        <div className="mx-auto grid h-14 max-w-lg grid-cols-[48px_1fr_48px] items-center">
          <span className="h-10 w-12" />
          <h1 className="text-sm font-bold tracking-[-0.02em]">{surface === 'details' ? 'Transaction details' : 'Receipt'}</h1>
          <button type="button" onClick={onClose} className="inline-flex h-10 items-center justify-end rounded-full text-xs font-bold">Done</button>
        </div>
      </div>

      {surface === 'details' ? <div className="min-h-0 flex-1 overflow-y-auto"><TransactionDetails receipt={receipt} copied={copied} onCopy={() => void navigator.clipboard.writeText(reference).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200) })} /></div> : (
        <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col px-3 pb-[max(0.5rem,var(--pocket-safe-bottom))] pt-2">
          <div className="min-h-0 flex-1 overflow-hidden rounded-[28px] border border-gray-100 bg-white shadow-sm"><ReceiptDocument receipt={receipt} /></div>
          <div className="mt-2 grid shrink-0 grid-cols-2 gap-2">
            <button type="button" disabled={Boolean(sharing)} onClick={() => void share('image')} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-xs font-bold text-gray-950 disabled:opacity-60">
              {sharing === 'image' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}Share as image
            </button>
            <button type="button" disabled={Boolean(sharing)} onClick={() => void share('pdf')} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-gray-950 px-4 text-xs font-bold text-white disabled:opacity-60">
              {sharing === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}Share as PDF
            </button>
          </div>
          {error && <p role="alert" className="mt-3 text-center text-xs font-semibold text-red-500">{error}</p>}
        </div>
      )}
    </div>,
    document.body,
  )
}

export default function UnifiedReceipt({ receipt, receiptId, className = '', label = 'View details', showAction = true, compact = false }: UnifiedReceiptProps) {
  const [resolved, setResolved] = useState<PaylinkReceipt | null>(receipt ?? null)
  const [surface, setSurface] = useState<ReceiptSurface>(null)
  const [opening, setOpening] = useState<ReceiptSurface>(null)
  const [error, setError] = useState('')

  useEffect(() => { if (receipt) setResolved(receipt) }, [receipt])
  if (!showAction) return null

  async function open(next: Exclude<ReceiptSurface, null>) {
    if (opening) return
    setOpening(next)
    setError('')
    try {
      const nextReceipt = resolved ?? (receiptId ? await readReceipt(receiptId) : null)
      if (!nextReceipt) throw new Error('Receipt is not ready.')
      setResolved(nextReceipt)
      setSurface(next)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Receipt could not be loaded.')
    } finally {
      setOpening(null)
    }
  }

  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => void open('details')} disabled={Boolean(opening)} className={`inline-flex items-center justify-center gap-1.5 rounded-full border border-gray-200 bg-white font-bold text-gray-950 shadow-sm transition active:scale-[0.99] disabled:cursor-wait disabled:opacity-70 dark:border-white/10 dark:bg-white/[0.08] dark:text-white ${compact ? 'min-h-9 px-2.5 text-[11px]' : 'min-h-10 px-3 text-xs'}`}>
          {opening === 'details' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}{label === 'Open receipt PDF' ? 'View details' : label}
        </button>
        <button type="button" onClick={() => void open('receipt')} disabled={Boolean(opening)} className={`inline-flex items-center justify-center gap-1.5 rounded-full bg-gray-950 font-bold text-white shadow-sm transition active:scale-[0.99] disabled:cursor-wait disabled:opacity-70 dark:bg-white dark:text-gray-950 ${compact ? 'min-h-9 px-2.5 text-[11px]' : 'min-h-10 px-3 text-xs'}`}>
          {opening === 'receipt' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}Share receipt
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-center text-xs font-semibold text-red-500">{error}</p>}
      {resolved && surface && <FullScreenReceiptSurface receipt={resolved} surface={surface} onClose={() => setSurface(null)} />}
    </div>
  )
}
