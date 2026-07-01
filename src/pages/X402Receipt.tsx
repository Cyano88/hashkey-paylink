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
    transfer?: Record<string, unknown>
  }
}

export default function X402Receipt() {
  const { activityId = '' } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<ReceiptResponse | null>(null)
  const [busy, setBusy] = useState(true)
  const [verifyingCircle, setVerifyingCircle] = useState(false)
  const [shared, setShared] = useState(false)
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
  const circleTransfer = data?.circle?.transfer
  const circleStatus = String(circleTransfer?.status ?? data?.circle?.status ?? '')
  const circleTxHash = String(circleTransfer?.transactionHash ?? '')
  const circleTxIsExplorerHash = /^0x[a-fA-F0-9]{64}$/.test(circleTxHash)
  const paylinkReceipt = useMemo(() => {
    const receipt = data?.receipt
    if (!receipt) return null
    if (receipt.receiptId) return receipt as PaylinkReceipt
    const txRef = String(proof.transaction ?? receipt.txHash ?? '')
    const proofHash = String(proof.proofHash ?? proof.receiptHash ?? receipt.receiptHash ?? receipt.activityId ?? activityId)
    const amountText = String(proof.amount ?? receipt.amount ?? '0')
    const amountMatch = amountText.match(/-?\d+(?:\.\d+)?/)
    const amount = amountMatch?.[0] ?? '0'
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
      createdAt: receipt.createdAt,
      source: 'x402',
      merchantId: creator,
      settlementType: 'circle-gateway-x402',
      proof: {
        receiptHash: proofHash,
        ogRootHash: og?.rootHash,
        ogTxHash: og?.ogTxHash,
        ogExplorer: og?.ogExplorer,
      },
    } satisfies PaylinkReceipt
  }, [activityId, data?.receipt, og?.ogExplorer, og?.ogTxHash, og?.rootHash, proof])
  const receiptFile = useMemo(() => {
    const receipt = data?.receipt
    if (!receipt) return ''
    return [
      'Hash PayLink Receipt',
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
      'This receipt records a Circle Gateway x402 creator content payment.',
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
    return new Blob([], { type: 'application/pdf' })
  }

  function receiptPdfName() {
    return paymentReceiptFileName(paylinkReceipt ?? undefined)
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
        title: paylinkReceipt ? paylinkReceipt.title : 'Hash PayLink Receipt',
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

  async function verifyWithCircle() {
    if (!activityId || verifyingCircle) return
    setVerifyingCircle(true)
    try {
      const res = await fetch(`/api/x402/receipt?id=${encodeURIComponent(activityId)}&verify=1`)
      setData(await res.json() as ReceiptResponse)
    } finally {
      setVerifyingCircle(false)
    }
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
        {!data.receipt?.receiptId && (
          <section className="mt-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#1c1c20]">
            {data.circle && (
              <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
                circleOk
                  ? 'border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200'
                  : 'border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200'
              }`}>
                {circleOk ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {circleOk
                  ? `Circle transfer verified${circleStatus ? ` - ${circleStatus}` : ''}`
                  : data.circle.error ?? 'Circle verification unavailable'}
              </div>
            )}
            {circleTxIsExplorerHash && (
              <a
                href={`https://testnet.arcscan.app/tx/${circleTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
              >
                <CheckCircle2 className="h-4 w-4" />
                Circle settlement transaction
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={verifyWithCircle}
                disabled={verifyingCircle}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-60 dark:bg-white dark:text-gray-950"
              >
                {verifyingCircle ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {verifyingCircle ? 'Checking Circle' : 'Verify with Circle'}
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
          </section>
        )}
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
                {circleOk
                  ? `Circle transfer verified${circleStatus ? ` - ${circleStatus}` : ''}`
                  : data.circle.error ?? 'Circle verification unavailable'}
              </div>
            )}

            {circleTxIsExplorerHash && (
              <a
                href={`https://testnet.arcscan.app/tx/${circleTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
              >
                <CheckCircle2 className="h-4 w-4" />
                Circle settlement transaction
                <ExternalLink className="h-3 w-3" />
              </a>
            )}

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={verifyWithCircle}
                disabled={verifyingCircle}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950"
              >
                {verifyingCircle ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {verifyingCircle ? 'Checking Circle' : 'Verify with Circle'}
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

