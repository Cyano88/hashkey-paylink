import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Copy, Download, Loader2, ShieldCheck, XCircle } from 'lucide-react'

type ReceiptResponse = {
  ok?: boolean
  error?: string
  receipt?: {
    type: string
    activityId: string
    agentSlug: string
    title: string
    amount?: string
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
  const [copied, setCopied] = useState(false)
  const [circleNotice, setCircleNotice] = useState(false)

  async function load() {
    setBusy(true)
    try {
      const res = await fetch(`/api/x402/receipt?id=${encodeURIComponent(activityId)}`)
      setData(await res.json())
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
  }, [activityId])

  const receiptJson = JSON.stringify(data?.receipt ?? {}, null, 2)
  const proof = data?.receipt?.proof ?? {}
  const og = data?.receipt?.og
  const legal = data?.receipt?.legal ?? {}
  const governance = data?.receipt?.governance ?? {}
  const circleOk = data?.circle?.ok
  const receiptFile = useMemo(() => {
    const receipt = data?.receipt
    if (!receipt) return ''
    return [
      'Hash PayLink x402 Receipt',
      '',
      `Title: ${receipt.title ?? 'Receipt'}`,
      `Amount: ${receipt.amount ?? 'x402 payment'}`,
      `Service: ${String(proof.service ?? 'Hash PayLink service')}`,
      `Buyer: ${String(proof.buyerAgent ?? proof.payer ?? '')}`,
      `Seller: ${String(proof.sellerAgent ?? proof.seller ?? '')}`,
      `Counterparty: ${String(legal.entityName ?? 'Hash PayLink Agent')}`,
      `Network: ${String(proof.network ?? 'Circle Gateway')}`,
      `Transaction reference: ${String(proof.transaction ?? '')}`,
      `Governance version: ${String(governance.governanceVersion ?? 'unversioned')}`,
      `Proof: ${String(proof.proofHash ?? '')}`,
      og?.rootHash ? `0G root: ${og.rootHash}` : '',
      og?.ogTxHash ? `0G tx: ${og.ogTxHash}` : '',
      '',
      'This receipt records an agent-to-agent x402 service payment. Hash PayLink does not place, cancel, or manage Polymarket orders.',
    ].filter(Boolean).join('\n')
  }, [data?.receipt, governance.governanceVersion, legal.entityName, og?.ogTxHash, og?.rootHash, proof])

  async function copyReceipt() {
    await navigator.clipboard.writeText(receiptJson)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  function showCircleComingSoon() {
    setCircleNotice(true)
    window.setTimeout(() => setCircleNotice(false), 5000)
  }

  function downloadReceipt() {
    if (!receiptFile) return
    const blob = new Blob([receiptFile], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `hashpaylink-x402-receipt-${activityId || 'receipt'}.txt`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
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
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Hash PayLink receipt</p>
            <h1 className="mt-1 truncate text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
              {data?.receipt?.title ?? 'Receipt'}
            </h1>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {data?.receipt?.amount ?? 'x402 payment'} · {String(proof.service ?? 'Hash PayLink service')}
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
              <div className="flex justify-between gap-3"><span className="text-gray-400">Buyer</span><span className="truncate font-mono text-gray-700 dark:text-gray-200">{String(proof.buyerAgent ?? proof.payer ?? '')}</span></div>
              <div className="flex justify-between gap-3"><span className="text-gray-400">Seller</span><span className="truncate font-mono text-gray-700 dark:text-gray-200">{String(proof.sellerAgent ?? proof.seller ?? '')}</span></div>
              <div className="flex justify-between gap-3"><span className="text-gray-400">Counterparty</span><span className="truncate font-mono text-gray-700 dark:text-gray-200">{String(legal.entityName ?? 'Not configured')}</span></div>
              <div className="flex justify-between gap-3"><span className="text-gray-400">Network</span><span className="font-mono text-gray-700 dark:text-gray-200">{String(proof.network ?? 'Circle Gateway')}</span></div>
              <div className="flex justify-between gap-3"><span className="text-gray-400">Tx ref</span><span className="truncate font-mono text-gray-700 dark:text-gray-200">{String(proof.transaction ?? '')}</span></div>
              <div className="flex justify-between gap-3"><span className="text-gray-400">Gov version</span><span className="truncate font-mono text-gray-700 dark:text-gray-200">{String(governance.governanceVersion ?? 'unversioned')}</span></div>
              <div className="flex justify-between gap-3"><span className="text-gray-400">Proof</span><span className="truncate font-mono text-gray-700 dark:text-gray-200">{String(proof.proofHash ?? '').slice(0, 24)}</span></div>
              {og?.rootHash && (
                <div className="flex justify-between gap-3"><span className="text-gray-400">0G root</span><span className="truncate font-mono text-gray-700 dark:text-gray-200">{og.rootHash.slice(0, 24)}</span></div>
              )}
            </div>

            {og?.ogExplorer && (
              <a
                href={og.ogExplorer}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center gap-2 rounded-xl border border-purple-100 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700 transition-colors hover:bg-purple-100 dark:border-purple-400/20 dark:bg-purple-400/10 dark:text-purple-200"
              >
                <ShieldCheck className="h-4 w-4" />
                0G proof archived
              </a>
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
                onClick={copyReceipt}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 transition-all hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-100"
              >
                <Copy className="h-4 w-4" />
                {copied ? 'Copied' : 'Copy receipt'}
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
