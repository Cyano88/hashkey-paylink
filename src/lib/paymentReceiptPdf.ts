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
  proof?: {
    receiptHash?: string
    ogRootHash?: string
    ogTxHash?: string
    ogExplorer?: string
  }
}

export type ReceiptLookupResponse = {
  ok?: boolean
  error?: string
  receipt?: PaylinkReceipt
}

export type X402ReceiptLike = {
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
  detail?: string
  createdAt?: number
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
  return {
    type: 'circle_gateway_x402_receipt',
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
    source: 'x402',
    merchantId: creator,
    settlementType: 'circle-gateway-x402',
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
  return value === 'solana' || value === 'arc' || value === 'arbitrum' || value === 'hashkey'
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
    : receipt?.source === 'bank-receive' ? 'bank-receive'
    : receipt?.source === 'ngpos' ? 'pos'
    : receipt?.source === 'polymarket-funding' ? 'polymarket-funding'
    : receipt?.source === 'x402' ? 'hashpaystream'
    : 'paylink'
  return `hashpaylink-${prefix}-receipt-${receipt?.receiptId.slice(0, 10) || 'receipt'}.pdf`
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
  return `NGN ${numeric.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`
}

function receiptLabels(receipt: PaylinkReceipt) {
  const isStream = receipt.source === 'streampay' || receipt.settlementType === 'stream-created'
  const isPos = receipt.source === 'ngpos'
  const isBank = receipt.source === 'bank-receive'
  const isPolymarket = receipt.source === 'polymarket-funding' || receipt.settlementType === 'polymarket_bridge'
  const isX402 = receipt.source === 'x402' || receipt.settlementType === 'circle-gateway-x402'
  const heading = isStream ? 'HashpayStream receipt' : isBank ? 'Bank receive receipt' : isPos ? 'Retail POS receipt' : isPolymarket ? 'Polymarket funding receipt' : isX402 ? 'HashpayStream receipt' : 'Request payment receipt'
  const title = isStream ? 'Stream created' : isBank ? 'Bank payout confirmed' : isPos ? 'Retail payment confirmed' : isPolymarket ? 'Polymarket funded' : isX402 ? 'Creator content unlocked' : 'Payment confirmed'
  const amountLabel = isStream ? 'Stream amount' : isBank ? 'Amount paid' : isPolymarket ? 'Amount funded' : isX402 ? 'Access price' : 'Amount paid'
  const payer = isStream ? 'Sender' : isBank ? 'Payer wallet' : isPos ? 'Payer wallet' : isPolymarket ? 'Funder' : isX402 ? 'Reader wallet' : 'Payer'
  const context = isStream ? 'Stream memo' : isBank ? 'Payer' : isPos ? 'Payer' : isPolymarket ? 'For' : isX402 ? 'Access' : 'Memo'
  const contextValue = isStream
    ? (receipt.memo || receipt.merchantId || receipt.eventId || '-')
    : isBank
    ? (receipt.memo || receipt.eventId || '-')
    : isPos
    ? (receipt.memo || receipt.eventId || '-')
    : isPolymarket
    ? 'Polymarket funding'
    : isX402
    ? (receipt.memo || receipt.eventId || 'Creator content')
    : (receipt.memo || receipt.merchantId || receipt.eventId || '-')
  const merchantLabel = isStream ? 'Stream vault' : isBank ? 'Bank receive link' : isPos ? 'Merchant' : isPolymarket ? 'Polymarket profile' : isX402 ? 'Creator' : 'Recipient'
  const merchantValue = receipt.merchantId || ''
  return { heading, title, amountLabel, payer, context, contextValue, merchantLabel, merchantValue }
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

  const [logo, ogLogo] = await Promise.all([
    loadImage('/hash-logo-transparent.png'),
    loadImage('/brand/0g-logo.jpeg'),
  ])
  drawReceiptCanvas(ctx, receipt, width, height, logo, ogLogo)
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
  ogLogo: HTMLImageElement | null,
) {
  const labels = receiptLabels(receipt)
  const meta = CHAIN_META[receiptChainKey(receipt.chain)]
  const archived = Boolean(receipt.proof?.ogExplorer || receipt.proof?.ogTxHash)
  const amount = compactReceiptAmount(receipt.amount)
  const isPos = receipt.source === 'ngpos'
  const settlement = String(receipt.settlementType || '').toLowerCase()
  const isLocalCurrency = isPos || receipt.source === 'bank-receive' || receipt.source === 'bills' || settlement === 'instant_fiat' || settlement === 'bill_payment'
  const amountNgn = isLocalCurrency ? formatNgn(receipt.amountNgn) : ''

  ctx.fillStyle = '#f4f7fb'
  ctx.fillRect(0, 0, width, height)
  roundRect(ctx, 34, 32, width - 68, height - 64, 26, '#ffffff')

  if (logo) {
    ctx.drawImage(logo, 62, 58, 48, 48)
  } else {
    roundRect(ctx, 64, 60, 44, 44, 13, '#111827')
    ctx.fillStyle = '#ffffff'
    ctx.font = '800 15px Arial'
    ctx.fillText('HP', 78, 88)
  }

  ctx.fillStyle = '#111827'
  ctx.font = '800 22px Arial'
  ctx.fillText('Hash', 126, 78)
  ctx.fillStyle = '#2563eb'
  ctx.fillText(' PayLink', 176, 78)
  ctx.fillStyle = '#667085'
  ctx.font = '700 10px Arial'
  ctx.fillText(labels.heading.toUpperCase(), 128, 100)
  drawBadge(ctx, 'CONFIRMED', '#ecfdf3', '#027a48', 438, 64)

  ctx.fillStyle = '#111827'
  ctx.font = '800 25px Arial'
  drawText(ctx, labels.title, 64, 152, 470, 30)
  ctx.fillStyle = '#475467'
  ctx.font = '600 14px Arial'
  drawText(ctx, `${amount} ${receipt.asset} confirmed on ${meta.label}`, 64, 184, 470, 20)

  roundRect(ctx, 64, 216, width - 128, 88, 18, '#f8fafc')
  ctx.fillStyle = '#667085'
  ctx.font = '700 10px Arial'
  ctx.fillText(labels.amountLabel.toUpperCase(), 84, 244)
  ctx.fillStyle = '#101828'
  ctx.font = '800 30px Arial'
  ctx.fillText(`${amount} ${receipt.asset}`, 84, 274)
  if (amountNgn) {
    ctx.fillStyle = '#667085'
    ctx.font = '700 13px Arial'
    ctx.fillText(amountNgn, 84, 294)
  }

  const typeLabel = settlement === 'instant_fiat'
    ? 'Base USDC to Naira'
    : receipt.source === 'bills' || settlement === 'bill_payment'
    ? 'Local bill payment'
    : receipt.settlementType?.replace(/[-_]/g, ' ') || receipt.source || 'payment'
  const rows: Array<[string, string]> = [
    ['Network', meta.label],
    [labels.payer, receipt.payer],
    [labels.context, labels.contextValue],
    ...(labels.merchantValue ? [[labels.merchantLabel, labels.merchantValue] as [string, string]] : []),
    ['Type', typeLabel],
    ['Time', fmtTime(receipt.createdAt)],
    ['Tx hash', receipt.txHash],
    ['Receipt hash', receipt.receiptHash],
  ]
  let y = 342
  for (const [label, value] of rows.slice(0, 8)) {
    roundRect(ctx, 64, y - 22, width - 128, 37, 11, '#fbfcfe')
    ctx.fillStyle = '#667085'
    ctx.font = '700 11px Arial'
    ctx.fillText(label, 84, y + 3)
    ctx.fillStyle = '#101828'
    ctx.font = '700 11px Courier New'
    drawRightText(ctx, shortPdfValue(value || '-'), 526, y + 3, 300)
    y += 39
  }

  const proofLabel = '0G proof'
  const proofValue = archived
    ? `Archived for support - ${shortPdfValue(receipt.proof?.ogTxHash || receipt.proof?.ogRootHash || '')}`
    : 'Archiving after payment'
  roundRect(ctx, 64, 660, width - 128, 50, 16, archived ? '#faf5ff' : '#f8fafc')
  if (ogLogo && archived) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(88, 685, 13, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(ogLogo, 75, 672, 26, 26)
    ctx.restore()
  } else {
    ctx.fillStyle = '#98a2b3'
    ctx.beginPath()
    ctx.arc(88, 685, 13, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = archived ? '#7e22ce' : '#667085'
  ctx.font = '800 13px Arial'
  ctx.fillText(proofLabel, 112, 681)
  ctx.font = archived ? '700 10px Courier New' : '700 10px Arial'
  ctx.fillText(proofValue, 112, 696)

  ctx.fillStyle = '#667085'
  ctx.font = '600 11px Arial'
  const isPolymarket = receipt.source === 'polymarket-funding' || receipt.settlementType === 'polymarket_bridge'
  drawText(ctx, isPos ? 'Keep this receipt for store verification.' : isPolymarket ? 'Keep this receipt for Polymarket funding verification.' : 'Keep this receipt for payment verification.', 64, 734, width - 128, 16)
  ctx.fillStyle = '#667085'
  ctx.font = '800 11px Arial'
  const poweredBy = 'Powered by Circle USDC'
  ctx.fillText(poweredBy, (width - ctx.measureText(poweredBy).width) / 2, 760)
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

function drawBadge(ctx: CanvasRenderingContext2D, text: string, bg: string, fg: string, x: number, y: number) {
  roundRect(ctx, x, y, 108, 26, 13, bg)
  ctx.fillStyle = fg
  ctx.font = '800 9px Arial'
  ctx.fillText(text, x + 18, y + 17)
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
