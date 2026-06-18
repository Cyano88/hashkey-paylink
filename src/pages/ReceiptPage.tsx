import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Copy, ExternalLink, Loader2, Share2, ShieldCheck } from 'lucide-react'
import { CHAIN_META, type ChainKey } from '../lib/chains'
import { cn, copyToClipboard, truncateAddress } from '../lib/utils'

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

function receiptFile(receipt: NonNullable<ReceiptResponse['receipt']>, receiptUrl: string) {
  return [
    'Hash PayLink Receipt',
    '',
    `Status: ${receipt.status}`,
    `Amount: ${receipt.amount} ${receipt.asset}`,
    `Network: ${CHAIN_META[chainKey(receipt.chain)].label}`,
    `Payer: ${receipt.payer}`,
    `Recipient context: ${receipt.memo || receipt.eventId}`,
    `Transaction: ${receipt.txHash}`,
    `Receipt hash: ${receipt.receiptHash}`,
    receipt.proof?.ogTxHash ? `0G tx: ${receipt.proof.ogTxHash}` : '0G tx: pending',
    `Receipt URL: ${receiptUrl}`,
  ].join('\n')
}

export default function ReceiptPage() {
  const { receiptId = '' } = useParams()
  const [data, setData] = useState<ReceiptResponse | null>(null)
  const [busy, setBusy] = useState(true)
  const [copied, setCopied] = useState(false)
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
  const txExplorer = receipt?.txHash && !receipt.txHash.startsWith('manual_')
    ? `${meta.explorerUrl}/tx/${receipt.txHash}`
    : ''
  const receiptUrl = useMemo(() => window.location.href, [])

  async function copyReceiptLink() {
    await copyToClipboard(receiptUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  async function shareReceipt() {
    if (!receipt) return
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> }
    if (nav.share) {
      await nav.share({
        title: 'Hash PayLink receipt',
        text: `${receipt.amount} ${receipt.asset} confirmed on ${meta.label}`,
        url: receiptUrl,
      })
      return
    }
    await copyReceiptLink()
    setShared(true)
    window.setTimeout(() => setShared(false), 1800)
  }

  function downloadReceipt() {
    if (!receipt) return
    const blob = new Blob([receiptFile(receipt, receiptUrl)], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `hashpaylink-receipt-${receipt.receiptId.slice(0, 10)}.txt`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
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
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Hash PayLink Receipt</p>
            <h1 className="mt-1 truncate text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
              {receipt?.title ?? 'Receipt'}
            </h1>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Public confirmation for a completed USDC payment.
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
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Amount paid</p>
              <p className="mt-1 font-mono text-3xl font-bold tracking-tight text-gray-950 dark:text-white">
                {receipt.amount} {receipt.asset}
              </p>
              {receipt.amountNgn && (
                <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">{receipt.amountNgn}</p>
              )}
            </div>

            <div className="mt-4 grid gap-2 rounded-xl border border-gray-100 bg-white p-3 text-xs dark:border-white/10 dark:bg-white/[0.03]">
              {[
                ['Network', meta.label],
                ['Payer', receipt.payer],
                [receipt.source === 'ngpos' ? 'Customer' : 'For', receipt.memo || receipt.eventId],
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
                {shared ? 'Copied' : 'Share receipt'}
              </button>
              <button
                type="button"
                onClick={copyReceiptLink}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 transition-all hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-100"
              >
                <Copy className="h-4 w-4" />
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <button
                type="button"
                onClick={downloadReceipt}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 transition-all hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-100"
              >
                Download record
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
