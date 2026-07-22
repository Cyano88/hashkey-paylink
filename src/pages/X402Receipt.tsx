import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Loader2, ShieldCheck, XCircle } from 'lucide-react'
import UnifiedReceipt from '../components/UnifiedReceipt'
import { createX402PaylinkReceipt, type PaylinkReceipt, type X402ReceiptLike } from '../lib/paymentReceiptPdf'

type ReceiptResponse = {
  ok?: boolean
  error?: string
  receipt?: X402ReceiptLike & {
    type?: string
    eventId?: string
    status?: string
    legal?: Record<string, unknown>
    governance?: Record<string, unknown>
    proof?: Record<string, unknown>
    og?: { rootHash?: string; ogTxHash?: string; ogExplorer?: string; archivedAt?: number }
  }
  circle?: { ok?: boolean; status?: string; error?: string; transfer?: Record<string, unknown> }
}

export default function X402Receipt() {
  const { activityId = '' } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<ReceiptResponse | null>(null)
  const [busy, setBusy] = useState(true)
  const [verifying, setVerifying] = useState(false)

  async function load(verify = false) {
    if (verify) setVerifying(true)
    else setBusy(true)
    try {
      const response = await fetch(`/api/x402/receipt?id=${encodeURIComponent(activityId)}${verify ? '&verify=1' : ''}`)
      const x402 = await response.json().catch(() => undefined) as ReceiptResponse | undefined
      if (response.ok && x402?.ok && x402.receipt) {
        setData(x402)
        return
      }
      if (!verify) {
        const fallback = await fetch(`/api/receipt?id=${encodeURIComponent(activityId)}`)
        setData(await fallback.json().catch(() => ({ ok: false, error: 'Receipt could not be loaded.' })) as ReceiptResponse)
      } else if (x402) {
        setData(x402)
      }
    } finally {
      setBusy(false)
      setVerifying(false)
    }
  }

  useEffect(() => { void load() }, [activityId])

  const receipt = useMemo(() => {
    const raw = data?.receipt
    if (!raw) return null
    if (raw.receiptId && raw.receiptHash && raw.eventId && raw.status) return raw as PaylinkReceipt
    return createX402PaylinkReceipt(raw, activityId)
  }, [activityId, data?.receipt])

  const circleStatus = String(data?.circle?.transfer?.status ?? data?.circle?.status ?? '')
  if (busy) return <main className="flex min-h-[calc(100vh-120px)] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-500" /></main>

  return (
    <main className="mx-auto flex min-h-[calc(100vh-120px)] w-full max-w-xl flex-col px-4 py-6 sm:py-10">
      <button type="button" onClick={() => navigate(-1)} className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      {receipt && data?.ok ? <UnifiedReceipt receipt={receipt} /> : (
        <section className="rounded-[1.75rem] border border-gray-200 bg-white p-7 text-center dark:border-white/10 dark:bg-[#111216]">
          <XCircle className="mx-auto h-10 w-10 text-red-500" />
          <h1 className="mt-4 text-xl font-black text-gray-950 dark:text-white">Receipt unavailable</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{data?.error || 'This payment record could not be found.'}</p>
        </section>
      )}

      {receipt && data?.ok && !data.receipt?.receiptId && (
        <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-[#111216]">
          {data.circle && (
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold ${data.circle.ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200' : 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200'}`}>
              {data.circle.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {data.circle.ok ? `Circle transfer verified${circleStatus ? ` · ${circleStatus}` : ''}` : data.circle.error || 'Circle verification unavailable'}
            </div>
          )}
          <button type="button" onClick={() => void load(true)} disabled={verifying} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-sm font-bold text-gray-800 transition hover:bg-gray-50 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.06] dark:text-white">
            {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {verifying ? 'Verifying' : 'Verify settlement'}
          </button>
        </section>
      )}
    </main>
  )
}
