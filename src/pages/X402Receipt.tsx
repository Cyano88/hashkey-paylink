import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Copy, Loader2, ShieldCheck, XCircle } from 'lucide-react'

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
    proof: Record<string, unknown>
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
  const [data, setData] = useState<ReceiptResponse | null>(null)
  const [busy, setBusy] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [copied, setCopied] = useState(false)

  async function load(verify = false) {
    if (verify) setVerifying(true)
    else setBusy(true)
    try {
      const res = await fetch(`/api/x402/receipt?id=${encodeURIComponent(activityId)}${verify ? '&verify=1' : ''}`)
      setData(await res.json())
    } finally {
      setBusy(false)
      setVerifying(false)
    }
  }

  useEffect(() => {
    void load(false)
  }, [activityId])

  const receiptJson = JSON.stringify(data?.receipt ?? {}, null, 2)
  const proof = data?.receipt?.proof ?? {}
  const circleOk = data?.circle?.ok

  async function copyReceipt() {
    await navigator.clipboard.writeText(receiptJson)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-120px)] w-full max-w-2xl items-center px-4 py-10">
      <section className="w-full rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#1c1c20] sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 dark:border-blue-900/30 dark:bg-blue-900/20">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Circle Gateway x402 Receipt</p>
            <h1 className="mt-1 truncate text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
              {data?.receipt?.title ?? 'Receipt'}
            </h1>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {data?.receipt?.amount ?? 'x402 payment'} · {String(proof.service ?? 'Hash PayLink service')}
            </p>
          </div>
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
              <div className="flex justify-between gap-3"><span className="text-gray-400">Network</span><span className="font-mono text-gray-700 dark:text-gray-200">{String(proof.network ?? 'Circle Gateway')}</span></div>
              <div className="flex justify-between gap-3"><span className="text-gray-400">Tx ref</span><span className="truncate font-mono text-gray-700 dark:text-gray-200">{String(proof.transaction ?? '')}</span></div>
              <div className="flex justify-between gap-3"><span className="text-gray-400">Proof</span><span className="truncate font-mono text-gray-700 dark:text-gray-200">{String(proof.proofHash ?? '').slice(0, 24)}</span></div>
            </div>

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

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => load(true)}
                disabled={verifying}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-950"
              >
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
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
