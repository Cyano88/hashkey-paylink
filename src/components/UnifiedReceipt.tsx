import { useState } from 'react'
import { Check, FileDown, Loader2 } from 'lucide-react'
import {
  createPaymentReceiptPdf,
  createX402PaylinkReceipt,
  type PaylinkReceipt,
  type X402ReceiptLike,
} from '../lib/paymentReceiptPdf'

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

function openPreparingWindow() {
  const preview = window.open('about:blank', '_blank')
  if (!preview) return null
  preview.opener = null
  preview.document.title = 'Preparing receipt'
  preview.document.body.style.cssText = 'margin:0;display:grid;min-height:100vh;place-items:center;background:#f5f5f7;color:#6b7280;font:600 13px Inter,Arial,sans-serif'
  preview.document.body.textContent = 'Preparing receipt PDF...'
  return preview
}

export default function UnifiedReceipt({ receipt, receiptId, className = '', label = 'Open receipt PDF', showAction = true, compact = false }: UnifiedReceiptProps) {
  const [opening, setOpening] = useState(false)
  const [opened, setOpened] = useState(false)
  const [error, setError] = useState('')

  if (!showAction) return null

  async function openPdf() {
    if (opening) return
    const preview = openPreparingWindow()
    setOpening(true)
    setOpened(false)
    setError('')
    try {
      const resolved = receipt ?? (receiptId ? await readReceipt(receiptId) : null)
      if (!resolved) throw new Error('Receipt is not ready.')
      const pdf = await createPaymentReceiptPdf(resolved)
      const url = URL.createObjectURL(pdf)
      if (preview) preview.location.replace(url)
      else {
        const link = document.createElement('a')
        link.href = url
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        document.body.appendChild(link)
        link.click()
        link.remove()
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 300_000)
      setOpened(true)
      window.setTimeout(() => setOpened(false), 1800)
    } catch (reason) {
      preview?.close()
      setError(reason instanceof Error ? reason.message : 'Receipt PDF could not be opened.')
    } finally {
      setOpening(false)
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void openPdf()}
        disabled={opening}
        className={`inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white font-black text-gray-950 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 active:scale-[0.99] disabled:cursor-wait disabled:opacity-70 dark:border-white/10 dark:bg-white/[0.08] dark:text-white dark:hover:bg-white/[0.12] ${compact ? 'min-h-9 px-3 text-xs' : 'min-h-12 w-full px-5 text-sm'}`}
      >
        {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : opened ? <Check className="h-4 w-4" /> : <FileDown className="h-4 w-4" />}
        {opening ? 'Preparing PDF' : opened ? 'Receipt opened' : label}
      </button>
      {error && <p role="alert" className="mt-2 text-center text-xs font-semibold text-red-500">{error}</p>}
    </div>
  )
}
