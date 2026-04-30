import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'
import {
  ArrowLeft, CheckCheck, Copy, Download, DollarSign,
  ExternalLink, RefreshCw, Users,
} from 'lucide-react'
import { CHAIN_META } from '../lib/chains'
import { truncateAddress } from '../lib/utils'

type PaymentEntry = {
  txHash:  string
  chain:   string
  payer:   string
  memo:    string
  amount:  string
  ts:      number
}

export default function EventDashboard() {
  const [searchParams]  = useSearchParams()
  const eventId         = searchParams.get('id')   ?? ''
  const evm             = searchParams.get('evm')  ?? ''
  const amt             = searchParams.get('amt')  ?? ''
  const eventName       = searchParams.get('name') ?? 'Event'

  const [payments,     setPayments]     = useState<PaymentEntry[]>([])
  const [loading,      setLoading]      = useState(false)
  const [lastRefresh,  setLastRefresh]  = useState<Date | null>(null)
  const [dashCopied,   setDashCopied]   = useState(false)
  const [linkCopied,   setLinkCopied]   = useState(false)

  const qrRef = useRef<HTMLDivElement>(null)

  const paymentLink = `${window.location.origin}/pay?evm=${encodeURIComponent(evm)}&amt=${encodeURIComponent(amt)}&memo=${encodeURIComponent(eventName)}&event=1&id=${encodeURIComponent(eventId)}`

  const fetchPayments = useCallback(async () => {
    if (!eventId) return
    setLoading(true)
    try {
      const res  = await fetch(`/api/list-event-payments?id=${encodeURIComponent(eventId)}`)
      const data = await res.json() as { ok: boolean; payments?: PaymentEntry[] }
      if (data.ok && data.payments) setPayments(data.payments)
    } catch { /* network hiccup — retry next tick */ }
    finally { setLoading(false); setLastRefresh(new Date()) }
  }, [eventId])

  // Initial load + 5s auto-refresh
  useEffect(() => {
    fetchPayments()
    const t = setInterval(fetchPayments, 5_000)
    return () => clearInterval(t)
  }, [fetchPayments])

  function downloadQR() {
    const canvas = qrRef.current?.querySelector('canvas')
    if (!canvas) return
    const url = canvas.toDataURL('image/png')
    const a   = document.createElement('a')
    a.href     = url
    a.download = `${eventName.replace(/\s+/g, '-')}-qr.png`
    a.click()
  }

  function exportCSV() {
    const header = ['Name / Handle', 'Wallet Address', 'Chain', 'Amount (USDC/HSK)', 'Time', 'Tx Hash']
    const rows   = payments.map(p => [
      p.memo,
      p.payer,
      p.chain.toUpperCase(),
      p.amount,
      new Date(p.ts).toISOString(),
      p.txHash,
    ])
    const csv  = [header, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${eventName.replace(/\s+/g, '-')}-payments.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function copyDashLink() {
    await navigator.clipboard.writeText(window.location.href)
    setDashCopied(true)
    setTimeout(() => setDashCopied(false), 2000)
  }

  async function copyPayLink() {
    await navigator.clipboard.writeText(paymentLink)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  const total = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)

  if (!eventId || !evm) {
    return (
      <div className="mx-auto max-w-md py-20 text-center animate-fade-in">
        <p className="text-gray-500 text-sm">Invalid event link — missing event ID or recipient address.</p>
        <Link to="/" className="mt-4 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> Create an event link
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl animate-fade-in space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <Link to="/" className="mb-1 inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Create a new link
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{eventName}</h1>
          <p className="text-sm text-gray-500">Event Dashboard · auto-refreshes every 5 s</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={copyDashLink}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all active:scale-[0.97]"
          >
            {dashCopied
              ? <><CheckCheck className="h-3.5 w-3.5 text-emerald-500" /> Copied</>
              : <><Copy className="h-3.5 w-3.5" /> Copy Dashboard Link</>}
          </button>
          <button
            onClick={fetchPayments}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Stats + QR ── */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Stat cards */}
        <div className="col-span-2 grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <Users className="h-3.5 w-3.5" /> Attendees Paid
            </div>
            <p className="text-4xl font-bold text-gray-900">{payments.length}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <DollarSign className="h-3.5 w-3.5" /> Total Collected
            </div>
            <p className="text-4xl font-bold text-gray-900">${total.toFixed(2)}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">USDC · HSK</p>
          </div>
        </div>

        {/* QR Code */}
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm flex flex-col items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 self-start">Payment QR</p>
          <div ref={qrRef} className="rounded-xl overflow-hidden bg-white p-1 shadow-sm border border-gray-100">
            <QRCodeCanvas value={paymentLink} size={110} level="H" />
          </div>
          <button
            onClick={downloadQR}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 transition-all active:scale-[0.97]"
          >
            <Download className="h-3 w-3" /> Download PNG
          </button>
        </div>
      </div>

      {/* ── Payment log ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <p className="text-sm font-semibold text-gray-800">Payment Log</p>
          <div className="flex items-center gap-3">
            {lastRefresh && (
              <p className="hidden sm:block text-[11px] text-gray-400">
                Updated {lastRefresh.toLocaleTimeString()}
              </p>
            )}
            <button
              onClick={exportCSV}
              disabled={payments.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.97]"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </div>
        </div>

        {payments.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
              <Users className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-600">No payments yet</p>
            <p className="mt-1 text-xs text-gray-400">Share the QR code or payment link with attendees</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {payments.map((p, i) => {
              const chainMeta  = p.chain && p.chain in CHAIN_META
                ? CHAIN_META[p.chain as keyof typeof CHAIN_META]
                : null
              const explorerUrl = chainMeta && p.txHash !== 'manual'
                ? `${chainMeta.explorerUrl}/tx/${p.txHash}`
                : null

              return (
                <div key={p.txHash + i} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
                  {/* Rank */}
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">
                    {payments.length - i}
                  </div>

                  {/* Name + address */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{p.memo}</p>
                    <p className="truncate font-mono text-[11px] text-gray-400">{truncateAddress(p.payer, 6)}</p>
                  </div>

                  {/* Amount */}
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-900">
                      ${parseFloat(p.amount).toFixed(2)}
                    </p>
                    <p className="text-[10px] capitalize text-gray-400">{p.chain || '—'}</p>
                  </div>

                  {/* Time */}
                  <div className="hidden sm:block text-right shrink-0">
                    <p className="text-[11px] text-gray-400">{new Date(p.ts).toLocaleTimeString()}</p>
                    <p className="text-[10px] text-gray-300">{new Date(p.ts).toLocaleDateString()}</p>
                  </div>

                  {/* Explorer link */}
                  {explorerUrl ? (
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-gray-300 hover:text-gray-600 transition-colors"
                      title="View on explorer"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <div className="h-3.5 w-3.5 shrink-0" />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Attendee payment link ── */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Payment Link for Attendees
        </p>
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50/60 px-3.5 py-2.5">
          <p className="min-w-0 flex-1 truncate font-mono text-xs text-gray-500">{paymentLink}</p>
          <button
            onClick={copyPayLink}
            className="shrink-0 text-gray-400 hover:text-gray-700 transition-colors"
            title="Copy link"
          >
            {linkCopied
              ? <CheckCheck className="h-3.5 w-3.5 text-emerald-500" />
              : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
        <p className="text-[11px] text-gray-400">
          Attendees must enter their name before paying. Payments auto-appear in the log above.
        </p>
      </div>

    </div>
  )
}
