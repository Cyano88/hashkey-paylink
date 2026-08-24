import { CHAIN_META, type ChainKey } from './chains'

export type PaylinkReceipt = {
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
  variant?: 'general' | 'bills'
  providerName?: string
  recipient?: string
  destination?: string
  targetLabel?: string
  targetValue?: string
  narration?: string
  referenceId?: string
  billToken?: string
  agreementId?: string
  agreementStatus?: 'completed' | 'cancelled' | 'refunded'
  agreementTemplate?: string
  escrowAddress?: string
  releasedAmount?: string
  returnedAmount?: string
  brandName?: string
  brandImageUrl?: string
  brandKind?: 'pocket' | 'partner' | 'hashpaylink'
  proof?: {
    receiptHash?: string
    ogRootHash?: string
    ogTxHash?: string
    ogExplorer?: string
  }
}

export type UnifiedReceiptRow = { label: string; value: string; mono?: boolean }

export type UnifiedReceiptView = {
  variant: 'general' | 'bills'
  badge: string
  amount: string
  timestamp: string
  rows: UnifiedReceiptRow[]
  reference: string
}

export type ReceiptLookupResponse = {
  ok?: boolean
  error?: string
  receipt?: PaylinkReceipt
}

export type X402ReceiptLike = {
  type?: string
  activityId?: string
  receiptId?: string
  receiptHash?: string
  agentSlug?: string
  title?: string
  amount?: string
  asset?: string
  chain?: string
  txHash?: string
  payer?: string
  memo?: string
  merchantId?: string
  source?: string
  settlementType?: string
  detail?: string
  createdAt?: number
  brandName?: string
  brandImageUrl?: string
  brandKind?: 'pocket' | 'partner' | 'hashpaylink'
  proof?: Record<string, unknown>
  og?: {
    rootHash?: string
    ogTxHash?: string
    ogExplorer?: string
  }
}

export function createX402PaylinkReceipt(receipt: X402ReceiptLike, activityId: string): PaylinkReceipt {
  const proof = receipt.proof ?? {}
  const txRef = String(proof.transaction ?? receipt.txHash ?? '')
  const proofHash = String(proof.proofHash ?? proof.receiptHash ?? receipt.receiptHash ?? receipt.activityId ?? activityId)
  const amount = normalizeX402ReceiptAmount(receipt.amount, proof.amount)
  const payer = String(proof.payer ?? proof.buyerAgent ?? receipt.payer ?? '')
  const creator = String(proof.seller ?? proof.sellerAgent ?? receipt.merchantId ?? '')
  const source = receipt.source === 'streampay' ? 'streampay' : 'x402'
  const settlementType = receipt.settlementType || (source === 'streampay' ? 'checkpoint-escrow' : 'circle-gateway-x402')
  return {
    type: receipt.type || 'circle_gateway_x402_receipt',
    receiptId: receipt.activityId ?? activityId,
    receiptHash: proofHash,
    title: receipt.title || 'Creator content unlocked',
    status: 'confirmed',
    eventId: String(proof.service ?? receipt.agentSlug ?? 'creator-x402'),
    txHash: txRef || proofHash,
    chain: 'arc',
    payer,
    memo: receipt.detail || 'Creator content unlocked by Circle Gateway x402',
    amount,
    asset: 'USDC',
    createdAt: receipt.createdAt ?? Date.now(),
    source,
    merchantId: creator,
    settlementType,
    brandName: receipt.brandName,
    brandImageUrl: receipt.brandImageUrl,
    brandKind: receipt.brandKind,
    proof: {
      receiptHash: proofHash,
      ogRootHash: receipt.og?.rootHash ? String(receipt.og.rootHash) : String(proof.ogRootHash ?? ''),
      ogTxHash: receipt.og?.ogTxHash ? String(receipt.og.ogTxHash) : String(proof.ogTxHash ?? ''),
      ogExplorer: receipt.og?.ogExplorer ? String(receipt.og.ogExplorer) : String(proof.ogExplorer ?? ''),
    },
  }
}

function normalizeX402ReceiptAmount(receiptAmount?: string, proofAmount?: unknown) {
  const humanAmount = parseHumanUsdcAmount(receiptAmount)
  if (humanAmount) return humanAmount
  const proofText = String(proofAmount ?? '')
  const proofMatch = proofText.match(/-?\d+(?:\.\d+)?/)
  if (!proofMatch) return '0'
  const numeric = Number(proofMatch[0])
  if (!Number.isFinite(numeric)) return '0'
  const absolute = Math.abs(numeric)
  const normalized = !proofText.includes('.') && absolute >= 1_000
    ? absolute / 1_000_000
    : absolute
  return normalized.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 6 })
}

function parseHumanUsdcAmount(value?: string) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const match = text.match(/-?\d+(?:\.\d+)?/)
  if (!match) return ''
  const numeric = Math.abs(Number(match[0]))
  if (!Number.isFinite(numeric)) return ''
  return numeric.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 6 })
}

export function receiptChainKey(value?: string): ChainKey {
  return value === 'solana' || value === 'arc' || value === 'arbitrum'
    ? value
    : 'base'
}

export function compactReceiptAmount(value?: string) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return value || '0'
  return numeric.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 6 })
}

export function paymentReceiptFileName(receipt?: PaylinkReceipt) {
  const prefix = receipt?.source === 'streampay' ? 'hashpaystream'
    : receipt?.source === 'arc-agreement' ? 'arc-agreement'
    : receipt?.source === 'agentic-checkout' ? 'agent-checkout'
    : receipt?.source === 'bank-receive' ? 'bank-receive'
    : receipt?.source === 'bank-send' ? 'bank-send'
    : receipt?.source === 'ngpos' ? 'pos'
    : receipt?.source === 'polymarket-funding' ? 'polymarket-funding'
    : receipt?.source === 'x402' ? 'hashpaystream'
    : 'paylink'
  const brand = receipt?.brandKind === 'pocket' ? 'pocket' : 'hashpaylink'
  return `${brand}-${prefix}-receipt-${receipt?.receiptId.slice(0, 10) || 'receipt'}.pdf`
}

export function paymentReceiptImageFileName(receipt?: PaylinkReceipt) {
  return paymentReceiptFileName(receipt).replace(/\.pdf$/i, '.jpg')
}

export type PaymentReceiptBrand = {
  kind: 'pocket' | 'partner' | 'hashpaylink'
  name: string
  imageUrl: string
}

export function paymentReceiptBrand(receipt?: PaylinkReceipt): PaymentReceiptBrand {
  if (receipt?.brandKind === 'pocket' || receipt?.brandName === 'Pocket') {
    return { kind: 'pocket', name: 'Pocket', imageUrl: '' }
  }
  if (receipt?.brandName) {
    return { kind: 'partner', name: receipt.brandName, imageUrl: receipt.brandImageUrl || '' }
  }
  return { kind: 'hashpaylink', name: 'Hash PayLink', imageUrl: '/hash-logo-transparent.png' }
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

function formatNgn(value?: string) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return ''
  return `\u20A6${numeric.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function titleCase(value: string) {
  return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function receiptType(receipt: PaylinkReceipt) {
  const settlement = String(receipt.settlementType || '').toLowerCase()
  if (receipt.variant === 'bills' || receipt.source === 'bills' || settlement === 'bill_payment') {
    const category = settlement.replace(/^bill_payment:?/, '') || receipt.type
    return titleCase(category || 'Bill payment')
  }
  if (receipt.source === 'bank-send' || settlement === 'paycrest_onramp') return 'USDC Settlement'
  if (receipt.source === 'bank-receive' || settlement === 'instant_fiat') return 'Bank Transfer'
  if (receipt.source === 'ngpos') return 'POS Funding'
  if (receipt.source === 'polymarket-funding' || settlement === 'polymarket_bridge') return 'External Funding'
  if (receipt.source === 'agentic-checkout' || receipt.source === 'x402' || settlement.includes('x402')) return 'Agent Payment'
  if (receipt.source === 'streampay') return settlement === 'checkpoint-escrow' ? 'Checkpoint Release' : 'Creator Payment'
  return titleCase(receipt.settlementType || receipt.source || 'USDC Payment')
}

export function paymentReceiptView(receipt: PaylinkReceipt): UnifiedReceiptView {
  const variant = receipt.variant === 'bills' || receipt.source === 'bills' || String(receipt.settlementType || '').startsWith('bill_payment') ? 'bills' : 'general'
  const network = CHAIN_META[receiptChainKey(receipt.chain)]?.label || titleCase(receipt.chain || 'Base')
  const localAmount = formatNgn(receipt.amountNgn)
  const amount = localAmount || `${compactReceiptAmount(receipt.amount)} ${receipt.asset}`
  const reference = receipt.referenceId || receipt.txHash || receipt.receiptHash || receipt.receiptId
  const type = receiptType(receipt)
  if (receipt.source === 'arc-agreement') {
    const outcome = receipt.agreementStatus === 'completed'
      ? `${compactReceiptAmount(receipt.releasedAmount)} USDC released`
      : `${compactReceiptAmount(receipt.returnedAmount)} USDC returned`
    return {
      variant: 'general',
      badge: 'Arc Agreement',
      amount,
      timestamp: fmtTime(receipt.createdAt),
      rows: [
        { label: 'Agreement', value: receipt.narration || receipt.title || '-' },
        { label: 'Type', value: receipt.agreementTemplate || 'Arc agreement' },
        { label: 'Payer', value: receipt.payer || '-', mono: true },
        { label: 'Recipient', value: receipt.recipient || '-', mono: true },
        { label: 'Protected by', value: receipt.escrowAddress || receipt.destination || '-', mono: true },
        { label: 'Outcome', value: outcome },
        { label: 'Agreement ID', value: receipt.agreementId || receipt.eventId, mono: true },
      ],
      reference,
    }
  }
  if (variant === 'bills') {
    const targetLabel = receipt.targetLabel || (type.toLowerCase().includes('electric') ? 'Meter Number' : type.toLowerCase().includes('tv') ? 'Smartcard Number' : 'Phone Number')
    return {
      variant,
      badge: receipt.providerName || 'Utility payment',
      amount,
      timestamp: fmtTime(receipt.createdAt),
      rows: [
        { label: 'Type', value: type },
        { label: targetLabel, value: receipt.targetValue || receipt.recipient || '-' },
        { label: 'Amount', value: amount },
        ...(receipt.billToken ? [{ label: 'Meter Token', value: receipt.billToken.replace(/^token\s*:\s*/i, '').trim(), mono: true }] : []),
      ],
      reference,
    }
  }
  const settlement = String(receipt.settlementType || '').toLowerCase()
  const isBank = receipt.source === 'bank-receive' || receipt.source === 'bank-send' || settlement === 'instant_fiat' || settlement === 'paycrest_onramp'
  const recipient = receipt.recipient || receipt.merchantId || receipt.eventId || '-'
  const destination = receipt.destination || (isBank ? `Bank settlement · ${network}` : `${network} · ${receipt.asset}`)
  const narration = receipt.narration || receipt.memo || receipt.title || '-'
  return {
    variant,
    badge: isBank ? 'Bank Transfer' : 'On-Chain',
    amount,
    timestamp: fmtTime(receipt.createdAt),
    rows: [
      { label: 'Type', value: type },
      { label: 'Sent by', value: receipt.payer || '-', mono: true },
      { label: 'Sent to', value: recipient, mono: /^0x/.test(recipient) },
      { label: isBank ? 'Receiver account' : 'Destination', value: destination, mono: /^0x/.test(destination) },
      { label: 'Amount & narration', value: `${amount} · ${narration}` },
    ],
    reference,
  }
}

export async function createPaymentReceiptImage(receipt: PaylinkReceipt) {
  const canvas = document.createElement('canvas')
  const scale = 2
  const width = 612
  const height = 792
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.scale(scale, scale)

  await document.fonts?.load('700 16px "Plus Jakarta Sans"').catch(() => undefined)
  const brand = paymentReceiptBrand(receipt)
  const logo = brand.imageUrl ? await loadImage(brand.imageUrl) : null
  drawReceiptCanvas(ctx, receipt, width, height, logo)
  return new Promise<string>((resolve) => canvas.toBlob(blob => {
    if (!blob) return resolve('')
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsDataURL(blob)
  }, 'image/jpeg', 0.94))
}

export async function createPaymentReceiptPdf(receipt: PaylinkReceipt) {
  const width = 612
  const height = 792
  const jpeg = await createPaymentReceiptImage(receipt)
  return createPdfWithJpeg(jpeg, width, height)
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image()
    if (/^https?:\/\//i.test(src)) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function drawReceiptCanvas(
  ctx: CanvasRenderingContext2D,
  receipt: PaylinkReceipt,
  width: number,
  height: number,
  logo: HTMLImageElement | null,
) {
  const view = paymentReceiptView(receipt)
  const brand = paymentReceiptBrand(receipt)
  const sans = '"Plus Jakarta Sans", Arial, sans-serif'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  if (logo) {
    drawContainedImage(ctx, logo, 52, 48, 38, 38)
  } else if (brand.kind === 'pocket') {
    drawPocketMark(ctx, 52, 48, 38)
  } else {
    roundRect(ctx, 52, 48, 38, 38, 12, '#111827')
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 11px ${sans}`
    ctx.fillText(brand.name.slice(0, 2).toUpperCase(), 62, 72)
  }

  ctx.fillStyle = '#111827'
  ctx.font = `700 17px ${sans}`
  ctx.fillText(clipCanvasText(ctx, brand.name, 320), 104, 72)
  drawBadge(ctx, view.badge.toUpperCase(), '#f3f4f6', '#374151', 438, 54, sans)

  ctx.fillStyle = '#16a34a'
  ctx.beginPath()
  ctx.arc(72, 151, 20, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(63, 151)
  ctx.lineTo(69, 157)
  ctx.lineTo(81, 144)
  ctx.stroke()

  ctx.fillStyle = '#111827'
  ctx.font = `700 15px ${sans}`
  ctx.fillText('Payment successful', 104, 148)
  ctx.fillStyle = '#6b7280'
  ctx.font = `500 11px ${sans}`
  ctx.fillText(view.timestamp, 104, 168)

  ctx.fillStyle = '#111827'
  ctx.font = `700 36px ${sans}`
  drawText(ctx, view.amount, 52, 238, 508, 42)

  ctx.strokeStyle = '#e5e7eb'
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(52, 278)
  ctx.lineTo(560, 278)
  ctx.stroke()

  let y = 320
  for (const row of view.rows) {
    ctx.fillStyle = '#9ca3af'
    ctx.font = `600 10px ${sans}`
    ctx.fillText(row.label.toUpperCase(), 52, y)
    ctx.fillStyle = '#1f2937'
    ctx.font = row.mono ? '600 11px "Courier New", monospace' : `600 12px ${sans}`
    drawRightText(ctx, shortPdfValue(row.value || '-'), 560, y, 326)
    y += 48
  }

  ctx.strokeStyle = '#e5e7eb'
  ctx.beginPath()
  ctx.moveTo(52, y + 2)
  ctx.lineTo(560, y + 2)
  ctx.stroke()
  ctx.fillStyle = '#9ca3af'
  ctx.font = `600 10px ${sans}`
  ctx.fillText('REFERENCE ID', 52, y + 36)
  ctx.fillStyle = '#374151'
  ctx.font = '600 11px "Courier New", monospace'
  drawRightText(ctx, shortPdfValue(view.reference), 560, y + 36, 326)

  ctx.setLineDash([])
  ctx.fillStyle = '#9ca3af'
  ctx.font = `600 10px ${sans}`
  const footer = 'Powered by Hash PayLink'
  ctx.fillText(footer, (width - ctx.measureText(footer).width) / 2, 746)
}

function drawContainedImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight)
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight)
}

function drawPocketMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x + size / 2, y + size / 2, size * 0.40625, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = '#111827'
  ctx.fillRect(x + size * 0.09375, y + size * 0.09375, size * 0.4921875, size * 0.8125)
  ctx.fillRect(x + size * 0.625, y + size * 0.09375, size * 0.046875, size * 0.8125)
  ctx.fillRect(x + size * 0.7109375, y + size * 0.09375, size * 0.1953125, size * 0.8125)
  ctx.restore()
}

function shortPdfValue(value: string) {
  if (!value) return '-'
  if (value.length <= 34) return value
  if (value.startsWith('0x')) return `${value.slice(0, 10)}...${value.slice(-8)}`
  return `${value.slice(0, 22)}...${value.slice(-8)}`
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

function drawBadge(ctx: CanvasRenderingContext2D, text: string, bg: string, fg: string, x: number, y: number, sans: string) {
  roundRect(ctx, x, y, 108, 26, 13, bg)
  ctx.fillStyle = fg
  ctx.font = `700 9px ${sans}`
  ctx.fillText(clipCanvasText(ctx, text, 88), x + 10, y + 17)
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
