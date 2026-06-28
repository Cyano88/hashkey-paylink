import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Download, ExternalLink, Loader2, Share2, ShieldCheck, XCircle } from 'lucide-react'
import {
  compactReceiptAmount,
  createPaymentReceiptImage,
  createPaymentReceiptPdf,
  paymentReceiptFileName,
  type PaylinkReceipt,
} from '../lib/paymentReceiptPdf'

type ReceiptResponse = {
  ok?: boolean
  error?: string
  receipt?: {
    type: string
    activityId?: string
    receiptId?: string
    receiptHash?: string
    agentSlug?: string
    title: string
    amount?: string
    asset?: string
    chain?: string
    txHash?: string
    payer?: string
    memo?: string
    merchantId?: string
    source?: string
    detail?: string
    createdAt: number
    legal?: Record<string, unknown>
    governance?: Record<string, unknown>
    proof: Record<string, unknown>
    og?: {
      rootHash: string
      ogTxHash: string
      ogExplorer: string
      archivedAt: number
    }
  }
  circle?: {
    ok?: boolean
    status?: string
    error?: string
    httpStatus?: number
    transfer?: unknown
  }
}

export default function X402Receipt() {
  const { activityId = '' } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<ReceiptResponse | null>(null)
  const [busy, setBusy] = useState(true)
  const [shared, setShared] = useState(false)
  const [circleNotice, setCircleNotice] = useState(false)
  const [paylinkReceiptImage, setPaylinkReceiptImage] = useState('')

  async function load() {
    setBusy(true)
    try {
      const res = await fetch(`/api/x402/receipt?id=${encodeURIComponent(activityId)}`)
      const x402 = await res.json() as ReceiptResponse
      if (res.ok && x402.ok && x402.receipt) {
        setData(x402)
        return
      }
      const paylinkRes = await fetch(`/api/receipt?id=${encodeURIComponent(activityId)}`)
      setData(await paylinkRes.json())
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
  }, [activityId])

  const proof = data?.receipt?.proof ?? {}
  const og = data?.receipt?.og ?? (
    proof.ogTxHash || proof.ogRootHash
      ? {
          rootHash: String(proof.ogRootHash ?? ''),
          ogTxHash: String(proof.ogTxHash ?? ''),
          ogExplorer: String(proof.ogExplorer ?? ''),
          archivedAt: data?.receipt?.createdAt ?? Date.now(),
        }
      : undefined
  )
  const legal = data?.receipt?.legal ?? {}
  const governance = data?.receipt?.governance ?? {}
  const circleOk = data?.circle?.ok
  const paylinkReceipt = data?.receipt?.receiptId ? data.receipt as PaylinkReceipt : null
  const receiptFile = useMemo(() => {
    const receipt = data?.receipt
    if (!receipt) return ''
    return [
      'Hash PayLink Agentic Receipt',
      '',
      `Title: ${receipt.title ?? 'Receipt'}`,
      `Amount: ${receipt.amount ?? 'x402 payment'}`,
      `Service: ${String(proof.service ?? receipt.source ?? 'Hash PayLink service')}`,
      `Buyer: ${String(proof.buyerAgent ?? proof.payer ?? receipt.payer ?? '')}`,
      `Seller: ${String(proof.sellerAgent ?? proof.seller ?? receipt.merchantId ?? '')}`,
      `Counterparty: ${String(legal.entityName ?? 'Hash PayLink Agent')}`,
      `Network: ${String(proof.network ?? receipt.chain ?? 'Circle Gateway')}`,
      `Transaction reference: ${String(proof.transaction ?? receipt.txHash ?? '')}`,
      `Governance version: ${String(governance.governanceVersion ?? 'unversioned')}`,
      `Proof: ${String(proof.proofHash ?? proof.receiptHash ?? receipt.receiptHash ?? '')}`,
      og?.rootHash ? `0G root: ${og.rootHash}` : '',
      og?.ogTxHash ? `0G tx: ${og.ogTxHash}` : '',
      `Receipt URL: ${window.location.href}`,
      '',
      'This receipt records an agent-to-agent x402 service payment. Hash PayLink does not place, cancel, or manage Polymarket orders.',
    ].filter(Boolean).join('\n')
  }, [data?.receipt, governance.governanceVersion, legal.entityName, og?.ogTxHash, og?.rootHash, proof])

  useEffect(() => {
    if (!paylinkReceipt) {
      setPaylinkReceiptImage('')
      return
    }
    let cancelled = false
    createPaymentReceiptImage(paylinkReceipt)
      .then(image => {
        if (cancelled) return
        setPaylinkReceiptImage(image)
      })
      .catch(() => {
        if (!cancelled) setPaylinkReceiptImage('')
      })
    return () => {
      cancelled = true
    }
  }, [paylinkReceipt])

  async function receiptPdfBlob() {
    if (!data?.receipt) return new Blob([], { type: 'application/pdf' })
    if (paylinkReceipt) return createPaymentReceiptPdf(paylinkReceipt)
    return createReceiptImagePdf({
      receipt: data.receipt,
      proof,
      legal,
      governance,
      og,
      receiptUrl: window.location.href,
    })
  }

  function receiptPdfName() {
    if (paylinkReceipt) return paymentReceiptFileName(paylinkReceipt)
    return `hashpaylink-agentic-receipt-${activityId || 'receipt'}.pdf`
  }

  async function shareReceipt() {
    if (!receiptFile && !paylinkReceipt) return
    const pdf = await receiptPdfBlob()
    const file = new File([pdf], receiptPdfName(), { type: 'application/pdf' })
    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean
      share?: (data: ShareData) => Promise<void>
    }
    if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
      await nav.share({
        title: paylinkReceipt ? paylinkReceipt.title : 'Hash PayLink Agentic Receipt',
        text: paylinkReceipt
          ? `${compactReceiptAmount(paylinkReceipt.amount)} ${paylinkReceipt.asset} confirmed`
          : data?.receipt?.title ?? 'Hash PayLink x402 receipt',
        files: [file],
      })
      return
    }
    downloadReceipt()
    setShared(true)
    window.setTimeout(() => setShared(false), 1800)
  }

  function showCircleComingSoon() {
    setCircleNotice(true)
    window.setTimeout(() => setCircleNotice(false), 5000)
  }

  async function downloadReceipt() {
    if (!receiptFile) return
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

  if (paylinkReceipt && data?.ok) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-120px)] w-full max-w-2xl flex-col px-4 py-6 sm:py-10">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-3 inline-flex w-fit items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card dark:border-white/10 dark:bg-[#1c1c20]">
          {paylinkReceiptImage ? (
            <img
              src={paylinkReceiptImage}
              alt={paylinkReceipt.title || 'Hash PayLink receipt'}
              className="block w-full bg-white"
            />
          ) : (
            <div className="flex min-h-[420px] items-center justify-center gap-2 text-sm font-semibold text-gray-500 dark:text-gray-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparing receipt...
            </div>
          )}
        </section>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-120px)] w-full max-w-2xl flex-col px-4 py-6 sm:py-10">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-3 inline-flex w-fit items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
      </button>
      <section className="w-full rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#1c1c20] sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-100 bg-gray-950 p-2 dark:border-white/10 dark:bg-white">
            <img src="/hash-logo-transparent.png" alt="" className="h-full w-full object-contain invert dark:invert-0" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Hash PayLink Agentic Receipt</p>
            <h1 className="mt-1 truncate text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
              {data?.receipt?.title ?? 'Receipt'}
            </h1>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {data?.receipt?.amount ?? 'x402 payment'} {data?.receipt?.asset ?? ''} - {String(proof.service ?? data?.receipt?.type ?? 'Hash PayLink service')}
            </p>
          </div>
          {data?.ok && data.receipt && (
            <button
              type="button"
              onClick={downloadReceipt}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-[11px] font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
          )}
        </div>

        {busy ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading receipt
          </div>
        ) : data?.ok && data.receipt ? (
          <>
            <div className="mt-5 grid gap-2 rounded-xl border border-gray-100 bg-gray-50/70 p-3 text-xs dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex justify-between gap-3"><span className="text-gray-400">Payer</span><span className="truncate font-mono text-gray-700 dark:text-gray-200">{String(proof.buyerAgent ?? proof.payer ?? data.receipt.payer ?? '')}</span></div>
              <div className="flex justify-between gap-3"><span className="text-gray-400">Recipient</span><span className="truncate font-mono text-gray-700 dark:text-gray-200">{String(proof.sellerAgent ?? proof.seller ?? data.receipt.merchantId ?? '')}</span></div>
              <div className="flex justify-between gap-3"><span className="text-gray-400">Counterparty</span><span className="truncate font-mono text-gray-700 dark:text-gray-200">{String(legal.entityName ?? 'Not configured')}</span></div>
              <div className="flex justify-between gap-3"><span className="text-gray-400">Network</span><span className="font-mono text-gray-700 dark:text-gray-200">{String(proof.network ?? data.receipt.chain ?? 'Circle Gateway')}</span></div>
              <div className="flex justify-between gap-3"><span className="text-gray-400">Tx ref</span><span className="truncate font-mono text-gray-700 dark:text-gray-200">{String(proof.transaction ?? data.receipt.txHash ?? '')}</span></div>
              <div className="flex justify-between gap-3"><span className="text-gray-400">Gov version</span><span className="truncate font-mono text-gray-700 dark:text-gray-200">{String(governance.governanceVersion ?? 'unversioned')}</span></div>
              <div className="flex justify-between gap-3"><span className="text-gray-400">Proof</span><span className="truncate font-mono text-gray-700 dark:text-gray-200">{String(proof.proofHash ?? proof.receiptHash ?? data.receipt.receiptHash ?? '').slice(0, 24)}</span></div>
              {og?.rootHash && (
                <div className="flex justify-between gap-3"><span className="text-gray-400">0G root</span><span className="truncate font-mono text-gray-700 dark:text-gray-200">{og.rootHash.slice(0, 24)}</span></div>
              )}
            </div>

            {og?.ogExplorer ? (
              <a
                href={og.ogExplorer}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center gap-2 rounded-xl border border-purple-100 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700 transition-colors hover:bg-purple-100 dark:border-purple-400/20 dark:bg-purple-400/10 dark:text-purple-200"
              >
                <ShieldCheck className="h-4 w-4" />
                <span className="inline-flex items-center rounded border border-purple-100 bg-purple-50 px-1 py-0.5 text-[8px] font-bold leading-none text-purple-500 dark:border-purple-900/60 dark:bg-purple-950/50 dark:text-purple-300">
                  0G
                </span>
                <span>Archived</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                <span className="text-xs text-gray-400 dark:text-gray-500">0G proof</span>
                <span className="rounded border border-gray-100 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-500">
                  Archiving
                </span>
              </div>
            )}

            {data.circle && (
              <div className={`mt-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
                circleOk
                  ? 'border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200'
                  : 'border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200'
              }`}>
                {circleOk ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {circleOk ? 'Circle transfer verified' : data.circle.error ?? 'Circle verification unavailable'}
              </div>
            )}

            {circleNotice && (
              <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-200">
                Circle verification is coming soon.
              </div>
            )}

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={showCircleComingSoon}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950"
              >
                <ShieldCheck className="h-4 w-4" />
                Verify with Circle
              </button>
              <button
                type="button"
                onClick={shareReceipt}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 transition-all hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-100"
              >
                <Share2 className="h-4 w-4" />
                {shared ? 'PDF downloaded' : 'Share'}
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
  proof: Record<string, unknown>
  legal: Record<string, unknown>
  governance: Record<string, unknown>
  og?: NonNullable<ReceiptResponse['receipt']>['og']
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
  const proof = input.proof
  const legal = input.legal
  const governance = input.governance
  ctx.fillStyle = '#f5f5f7'
  ctx.fillRect(0, 0, width, height)
  roundRect(ctx, 36, 34, width - 72, height - 68, 24, '#ffffff')
  ctx.fillStyle = '#111827'
  roundRect(ctx, 64, 64, 48, 48, 14, '#111827')
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 16px Arial'
  ctx.fillText('HP', 78, 94)
  ctx.fillStyle = '#111827'
  ctx.font = '700 22px Arial'
  ctx.fillText('Hash PayLink', 128, 82)
  ctx.fillStyle = '#6b7280'
  ctx.font = '700 10px Arial'
  ctx.fillText('AGENTIC RECEIPT', 128, 101)
  drawBadge(ctx, input.og?.ogExplorer ? '0G ARCHIVED' : '0G ARCHIVING', input.og?.ogExplorer ? '#f3e8ff' : '#f3f4f6', input.og?.ogExplorer ? '#7e22ce' : '#6b7280', 438, 73)

  ctx.fillStyle = '#111827'
  ctx.font = '700 24px Arial'
  drawText(ctx, input.receipt.title ?? 'Receipt', 64, 154, 470, 28)
  ctx.fillStyle = '#4b5563'
  ctx.font = '500 13px Arial'
  drawText(ctx, `${input.receipt.amount ?? 'x402 payment'} - ${String(proof.service ?? 'Hash PayLink service')}`, 64, 186, 470, 18)

  const rows: Array<[string, string]> = [
    ['Buyer', String(proof.buyerAgent ?? proof.payer ?? '')],
    ['Seller', String(proof.sellerAgent ?? proof.seller ?? '')],
    ['Counterparty', String(legal.entityName ?? 'Hash PayLink Agent')],
    ['Network', String(proof.network ?? 'Circle Gateway')],
    ['Tx ref', String(proof.transaction ?? '')],
    ['Gov version', String(governance.governanceVersion ?? 'unversioned')],
    ['Proof', String(proof.proofHash ?? '').slice(0, 28)],
    ['0G root', input.og?.rootHash ? input.og.rootHash.slice(0, 30) : 'Pending archive'],
  ]
  let y = 232
  for (const [label, value] of rows) {
    ctx.fillStyle = '#f9fafb'
    roundRect(ctx, 64, y - 20, width - 128, 38, 10, '#f9fafb')
    ctx.fillStyle = '#6b7280'
    ctx.font = '600 11px Arial'
    ctx.fillText(label, 82, y + 3)
    ctx.fillStyle = '#111827'
    ctx.font = '600 11px Courier New'
    drawRightText(ctx, value || '-', 526, y + 3, 300)
    y += 45
  }

  const statusText = input.og?.ogExplorer ? 'Archived on 0G Storage and anchored on-chain' : '0G archive is still being finalized'
  roundRect(ctx, 64, y - 12, width - 128, 48, 14, input.og?.ogExplorer ? '#faf5ff' : '#f9fafb')
  ctx.fillStyle = input.og?.ogExplorer ? '#7e22ce' : '#6b7280'
  ctx.font = '700 12px Arial'
  ctx.fillText(statusText, 82, y + 17)
  y += 82

  ctx.fillStyle = '#6b7280'
  ctx.font = '500 11px Arial'
  drawText(ctx, 'This receipt records an agent-to-agent x402 service payment. Hash PayLink does not place, cancel, or manage Polymarket orders.', 64, y, width - 128, 18)
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
