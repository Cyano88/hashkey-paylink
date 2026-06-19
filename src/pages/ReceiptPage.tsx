import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, Share2, ShieldCheck } from 'lucide-react'
import { CHAIN_META, type ChainKey } from '../lib/chains'
import { cn } from '../lib/utils'

type ReceiptResponse = {
  ok?: boolean
  error?: string
  receipt?: {
    type: string
    receiptId: string
    receiptHash: string
    title: string
    status: string
    eventId: string
    txHash: string
    chain: string
    payer: string
    memo: string
    amount: string
    requestedAmount?: string
    asset: string
    createdAt: number
    source?: string
    merchantId?: string
    settlementType?: string
    amountNgn?: string
    proof?: {
      receiptHash?: string
      ogRootHash?: string
      ogTxHash?: string
      ogExplorer?: string
    }
  }
}

function chainKey(value?: string): ChainKey {
  return value === 'solana' || value === 'starknet' || value === 'arc' || value === 'arbitrum' || value === 'hashkey'
    ? value
    : 'base'
}

function fmtTime(value?: number) {
  if (!value) return '-'
  return new Date(value).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function receiptLabels(receipt?: NonNullable<ReceiptResponse['receipt']>) {
  const isStream = receipt?.source === 'streampay' || receipt?.settlementType === 'stream-created'
  const isPos = receipt?.source === 'ngpos'
  const heading = isStream ? 'StreamPay Receipt' : isPos ? 'Retail POS Receipt' : 'Hash PayLink Receipt'
  const title = isStream ? 'Stream created' : isPos ? 'Retail payment confirmed' : 'Payment confirmed'
  const description = isStream
    ? 'Public confirmation for an Arc USDC stream creation.'
    : isPos
    ? 'Public confirmation for a retail USDC checkout.'
    : 'Public confirmation for a completed USDC payment.'
  const amountLabel = isStream ? 'Stream amount' : 'Amount paid'
  const payer = isStream ? 'Sender' : isPos ? 'Customer wallet' : 'Payer'
  const context = isStream ? 'Stream memo' : isPos ? 'Customer' : 'Memo'
  const contextValue = isStream
    ? (receipt?.memo || receipt?.merchantId || receipt?.eventId || '-')
    : isPos
    ? (receipt?.memo || receipt?.eventId || '-')
    : (receipt?.memo || receipt?.merchantId || receipt?.eventId || '-')
  const merchantLabel = isStream ? 'Stream vault' : isPos ? 'Merchant' : 'Recipient'
  const merchantValue = receipt?.merchantId || ''
  return { heading, title, description, amountLabel, payer, context, contextValue, merchantLabel, merchantValue }
}

export default function ReceiptPage() {
  const { receiptId = '' } = useParams()
  const [data, setData] = useState<ReceiptResponse | null>(null)
  const [busy, setBusy] = useState(true)
  const [shared, setShared] = useState(false)

  useEffect(() => {
    let cancelled = false
    setBusy(true)
    fetch(`/api/receipt?id=${encodeURIComponent(receiptId)}`)
      .then(res => res.json())
      .then((next: ReceiptResponse) => {
        if (!cancelled) setData(next)
      })
      .catch((error: unknown) => {
        if (!cancelled) setData({ ok: false, error: error instanceof Error ? error.message : 'Receipt lookup failed.' })
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => { cancelled = true }
  }, [receiptId])

  const receipt = data?.receipt
  const meta = CHAIN_META[chainKey(receipt?.chain)]
  const labels = receiptLabels(receipt)
  const txExplorer = receipt?.txHash && !receipt.txHash.startsWith('manual_')
    ? `${meta.explorerUrl}/tx/${receipt.txHash}`
    : ''
  const receiptUrl = useMemo(() => window.location.href, [])

  async function receiptPdfBlob() {
    if (!receipt) return new Blob([], { type: 'application/pdf' })
    return createReceiptImagePdf({ receipt, labels, metaLabel: meta.label, receiptUrl })
  }

  function receiptPdfName() {
    const prefix = receipt?.source === 'streampay' ? 'streampay'
      : receipt?.source === 'ngpos' ? 'pos'
      : 'paylink'
    return `hashpaylink-${prefix}-receipt-${receipt?.receiptId.slice(0, 10) || 'receipt'}.pdf`
  }

  async function downloadReceiptPdf() {
    if (!receipt) return
    const blob = await receiptPdfBlob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = receiptPdfName()
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  async function shareReceipt() {
    if (!receipt) return
    const pdf = await receiptPdfBlob()
    const file = new File([pdf], receiptPdfName(), { type: 'application/pdf' })
    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean
      share?: (data: ShareData) => Promise<void>
    }
    if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
      await nav.share({
        title: labels.heading,
        text: `${receipt.amount} ${receipt.asset} confirmed on ${meta.label}`,
        files: [file],
      })
      return
    }
    await downloadReceiptPdf()
    setShared(true)
    window.setTimeout(() => setShared(false), 1800)
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-120px)] w-full max-w-2xl flex-col px-4 py-6 sm:py-10">
      <Link
        to="/app"
        className="mb-3 inline-flex w-fit items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        App
      </Link>

      <section className="w-full rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#1c1c20] sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-100 bg-gray-950 p-2 dark:border-white/10 dark:bg-white">
            <img src="/hash-logo-transparent.png" alt="" className="h-full w-full object-contain invert dark:invert-0" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{labels.heading}</p>
            <h1 className="mt-1 truncate text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
              {receipt ? labels.title : 'Receipt'}
            </h1>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {labels.description}
            </p>
          </div>
          {receipt && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
              <CheckCircle2 className="h-3 w-3" />
              Confirmed
            </span>
          )}
        </div>

        {busy ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading receipt
          </div>
        ) : receipt ? (
          <>
            <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50/70 p-4 text-center dark:border-white/10 dark:bg-white/[0.04]">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{labels.amountLabel}</p>
              <p className="mt-1 font-mono text-3xl font-bold tracking-tight text-gray-950 dark:text-white">
                {receipt.amount} {receipt.asset}
              </p>
              {receipt.requestedAmount && receipt.requestedAmount !== receipt.amount && (
                <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                  Requested {receipt.requestedAmount} {receipt.asset}
                </p>
              )}
              {receipt.amountNgn && (
                <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">{receipt.amountNgn}</p>
              )}
            </div>

            <div className="mt-4 grid gap-2 rounded-xl border border-gray-100 bg-white p-3 text-xs dark:border-white/10 dark:bg-white/[0.03]">
              {[
                ['Network', meta.label],
                [labels.payer, receipt.payer],
                [labels.context, labels.contextValue],
                ...(labels.merchantValue ? [[labels.merchantLabel, labels.merchantValue]] : []),
                ...(receipt.settlementType ? [['Type', receipt.settlementType.replace(/-/g, ' ')]] : []),
                ['Time', fmtTime(receipt.createdAt)],
                ['Tx hash', receipt.txHash],
                ['Receipt hash', receipt.receiptHash],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <span className="shrink-0 text-gray-400">{label}</span>
                  <span className={cn('truncate text-right font-semibold text-gray-700 dark:text-gray-200', label.includes('hash') || label === 'Payer' ? 'font-mono' : '')}>
                    {String(value || '-')}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
              <span className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                <ShieldCheck className="h-4 w-4" />
                0G proof
              </span>
              {receipt.proof?.ogExplorer ? (
                <a
                  href={receipt.proof.ogExplorer}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-purple-100 bg-purple-50 px-2 py-1 text-[11px] font-bold text-purple-600 transition-colors hover:bg-purple-100 dark:border-purple-900/60 dark:bg-purple-950/50 dark:text-purple-300"
                >
                  Archived
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="rounded border border-gray-100 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-500">
                  Archiving
                </span>
              )}
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {txExplorer && (
                <a
                  href={txExplorer}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950"
                >
                  <ExternalLink className="h-4 w-4" />
                  View transaction
                </a>
              )}
              <button
                type="button"
                onClick={shareReceipt}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 transition-all hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-100"
              >
                <Share2 className="h-4 w-4" />
                {shared ? 'Downloaded' : 'Share receipt'}
              </button>
            </div>
          </>
        ) : (
          <div className="mt-5 rounded-xl border border-red-100 bg-red-50 px-3 py-3 text-sm font-medium text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">
            {data?.error ?? 'Receipt not found.'}
          </div>
        )}
      </section>
    </main>
  )
}

type VisualReceiptInput = {
  receipt: NonNullable<ReceiptResponse['receipt']>
  labels: ReturnType<typeof receiptLabels>
  metaLabel: string
  receiptUrl: string
}

async function createReceiptImagePdf(input: VisualReceiptInput) {
  const canvas = document.createElement('canvas')
  const scale = 2
  const width = 612
  const height = 792
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return new Blob([], { type: 'application/pdf' })
  ctx.scale(scale, scale)
  drawReceiptCanvas(ctx, input, width, height)
  const jpeg = await new Promise<string>((resolve) => canvas.toBlob(blob => {
    if (!blob) return resolve('')
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsDataURL(blob)
  }, 'image/jpeg', 0.92))
  return createPdfWithJpeg(jpeg, width, height)
}

function drawReceiptCanvas(ctx: CanvasRenderingContext2D, input: VisualReceiptInput, width: number, height: number) {
  const { receipt, labels } = input
  const archived = Boolean(receipt.proof?.ogExplorer || receipt.proof?.ogTxHash)
  ctx.fillStyle = '#f5f5f7'
  ctx.fillRect(0, 0, width, height)
  roundRect(ctx, 36, 34, width - 72, height - 68, 24, '#ffffff')
  roundRect(ctx, 64, 64, 48, 48, 14, '#111827')
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 16px Arial'
  ctx.fillText('HP', 78, 94)
  ctx.fillStyle = '#111827'
  ctx.font = '700 22px Arial'
  ctx.fillText('Hash PayLink', 128, 82)
  ctx.fillStyle = '#6b7280'
  ctx.font = '700 10px Arial'
  ctx.fillText(labels.heading.toUpperCase(), 128, 101)
  drawBadge(ctx, archived ? '0G ARCHIVED' : '0G ARCHIVING', archived ? '#f3e8ff' : '#f3f4f6', archived ? '#7e22ce' : '#6b7280', 438, 73)

  ctx.fillStyle = '#111827'
  ctx.font = '700 24px Arial'
  drawText(ctx, labels.title, 64, 154, 470, 28)
  ctx.fillStyle = '#4b5563'
  ctx.font = '500 13px Arial'
  drawText(ctx, `${receipt.amount} ${receipt.asset} confirmed on ${input.metaLabel}`, 64, 186, 470, 18)

  const rows: Array<[string, string]> = [
    ['Status', receipt.status],
    [labels.amountLabel, `${receipt.amount} ${receipt.asset}`],
    ...(receipt.requestedAmount && receipt.requestedAmount !== receipt.amount ? [['Requested', `${receipt.requestedAmount} ${receipt.asset}`] as [string, string]] : []),
    ['Network', input.metaLabel],
    [labels.payer, receipt.payer],
    [labels.context, labels.contextValue],
    ...(labels.merchantValue ? [[labels.merchantLabel, labels.merchantValue] as [string, string]] : []),
    ['Type', receipt.settlementType?.replace(/-/g, ' ') || receipt.source || 'payment'],
    ['Time', fmtTime(receipt.createdAt)],
    ['Tx hash', receipt.txHash],
    ['Receipt hash', receipt.receiptHash],
  ]
  let y = 232
  for (const [label, value] of rows.slice(0, 10)) {
    roundRect(ctx, 64, y - 20, width - 128, 38, 10, '#f9fafb')
    ctx.fillStyle = '#6b7280'
    ctx.font = '600 11px Arial'
    ctx.fillText(label, 82, y + 3)
    ctx.fillStyle = '#111827'
    ctx.font = '600 11px Courier New'
    drawRightText(ctx, value || '-', 526, y + 3, 300)
    y += 45
  }

  const statusText = archived ? 'Archived on 0G Storage and anchored on-chain' : '0G archive is still being finalized'
  roundRect(ctx, 64, y - 12, width - 128, 48, 14, archived ? '#faf5ff' : '#f9fafb')
  ctx.fillStyle = archived ? '#7e22ce' : '#6b7280'
  ctx.font = '700 12px Arial'
  ctx.fillText(statusText, 82, y + 17)
  y += 82

  ctx.fillStyle = '#6b7280'
  ctx.font = '500 11px Arial'
  drawText(ctx, 'This receipt records a confirmed USDC workflow on Hash PayLink. Verify the transaction hash and 0G proof status from the public receipt page.', 64, y, width - 128, 18)
  ctx.fillStyle = '#9ca3af'
  ctx.font = '500 9px Arial'
  drawText(ctx, input.receiptUrl, 64, height - 72, width - 128, 12)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
}

function drawBadge(ctx: CanvasRenderingContext2D, text: string, bg: string, fg: string, x: number, y: number) {
  roundRect(ctx, x, y, 108, 26, 13, bg)
  ctx.fillStyle = fg
  ctx.font = '700 9px Arial'
  ctx.fillText(text, x + 15, y + 17)
}

function drawRightText(ctx: CanvasRenderingContext2D, text: string, right: number, y: number, maxWidth: number) {
  const clipped = clipCanvasText(ctx, text, maxWidth)
  ctx.fillText(clipped, right - ctx.measureText(clipped).width, y)
}

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, x, y)
      y += lineHeight
      line = word
    } else {
      line = next
    }
  }
  if (line) ctx.fillText(line, x, y)
}

function clipCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let clipped = text
  while (clipped.length > 4 && ctx.measureText(`${clipped.slice(0, -1)}...`).width > maxWidth) {
    clipped = clipped.slice(0, -1)
  }
  return `${clipped}...`
}

function createPdfWithJpeg(dataUrl: string, width: number, height: number) {
  const base64 = dataUrl.split(',')[1] ?? ''
  const binary = atob(base64)
  const imageBytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) imageBytes[i] = binary.charCodeAt(i)

  const encoder = new TextEncoder()
  const parts: BlobPart[] = []
  const offsets: number[] = [0]
  let offset = 0
  const add = (part: string | ArrayBuffer) => {
    parts.push(part)
    offset += typeof part === 'string' ? encoder.encode(part).length : part.byteLength
  }
  const start = (id: number) => {
    offsets[id] = offset
    add(`${id} 0 obj\n`)
  }
  const stream = `q\n${width} 0 0 ${height} 0 0 cm\n/Im1 Do\nQ`

  add('%PDF-1.4\n')
  start(1); add('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  start(2); add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n')
  start(3); add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`)
  start(4); add(`<< /Type /XObject /Subtype /Image /Width ${width * 2} /Height ${height * 2} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.byteLength} >>\nstream\n`); add(imageBytes.buffer.slice(0) as ArrayBuffer); add('\nendstream\nendobj\n')
  start(5); add(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream\nendobj\n`)
  const xref = offset
  add('xref\n0 6\n0000000000 65535 f \n')
  for (let i = 1; i <= 5; i += 1) add(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`)
  add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`)
  return new Blob(parts, { type: 'application/pdf' })
}
