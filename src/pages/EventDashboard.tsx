import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'
import { formatUnits } from 'viem'
import {
  ArrowLeft, CheckCheck, Copy, Download, DollarSign,
  ExternalLink, RefreshCw, Users, Zap,
} from 'lucide-react'
import { CHAIN_META } from '../lib/chains'
import { EVM_CLIENTS } from '../lib/router'
import { cn, truncateAddress } from '../lib/utils'

// Minimal ERC-20 Transfer ABI for getLogs
const TRANSFER_ABI = [{
  name:   'Transfer',
  type:   'event'  as const,
  inputs: [
    { name: 'from',  type: 'address' as const, indexed: true  as const },
    { name: 'to',    type: 'address' as const, indexed: true  as const },
    { name: 'value', type: 'uint256' as const, indexed: false as const },
  ],
}] as const

// Server registry entry — source of truth for the payment log
type ServerPayment = {
  txHash:  string
  payer:   string
  memo:    string   // payer's name / handle
  amount:  string
  chain:   string
  ts:      number
}

type Toast = { id: number; addr: string; amount: string; chain: string }

export default function EventDashboard() {
  const [searchParams] = useSearchParams()
  const eventId   = searchParams.get('id')   ?? ''
  const evm       = searchParams.get('evm')  ?? ''
  const sol       = searchParams.get('sol')  ?? ''
  const amt       = searchParams.get('amt')  ?? ''
  const eventName = searchParams.get('name') ?? 'Event'
  const netParam  = searchParams.get('net')  ?? ''

  // Which EVM chains to watch for flash/toast notifications.
  // New links carry ?net= so we scope to exactly that chain.
  // Legacy links (no net param) fall back to watching both Base & Arc.
  const evmChainsToWatch: ('base' | 'arc')[] =
    netParam === 'base' ? ['base'] :
    netParam === 'arc'  ? ['arc']  :
    netParam            ? []       :   // starknet / solana / hashkey — no EVM poll
    evm                 ? ['base', 'arc'] : []  // legacy fallback

  // Human-readable label for the live-watching indicator
  const watchLabel =
    netParam === 'base'     ? 'Base'     :
    netParam === 'arc'      ? 'Arc'      :
    netParam === 'starknet' ? 'Starknet' :
    netParam === 'solana'   ? 'Solana'   :
    netParam === 'hashkey'  ? 'HashKey'  :
    'Base & Arc'

  // Server registry is the single source of truth for the payment log.
  // It is keyed by eventId — only shows payments for THIS event.
  const [payments,     setPayments]     = useState<ServerPayment[]>([])
  const [loading,      setLoading]      = useState(false)
  const [lastRefresh,  setLastRefresh]  = useState<Date | null>(null)
  const [dashCopied,   setDashCopied]   = useState(false)
  const [linkCopied,   setLinkCopied]   = useState(false)
  const [counterFlash, setCounterFlash] = useState(false)
  const [toasts,       setToasts]       = useState<Toast[]>([])

  const qrRef      = useRef<HTMLDivElement>(null)
  const qrHiResRef = useRef<HTMLDivElement>(null)
  const toastId    = useRef(0)

  const paymentLink = (() => {
    const p = new URLSearchParams({ amt, memo: eventName, event: '1', id: eventId })
    if (netParam) p.set('net', netParam)
    if (sol)      p.set('sol', sol)
    else if (evm) p.set('evm', evm)
    return `${window.location.origin}/pay?${p.toString()}`
  })()

  const total = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)

  // ── Server registry poll (every 5s) — only source for the payment log ──────
  const fetchPayments = useCallback(async () => {
    if (!eventId) return
    setLoading(true)
    try {
      const res  = await fetch(`/api/list-event-payments?id=${encodeURIComponent(eventId)}`)
      const data = await res.json() as { ok: boolean; payments?: ServerPayment[] }
      if (data.ok && data.payments) {
        setPayments(data.payments.slice().sort((a, b) => b.ts - a.ts))
      }
    } catch { /* retry next tick */ }
    finally { setLoading(false); setLastRefresh(new Date()) }
  }, [eventId])

  useEffect(() => {
    fetchPayments()
    const t = setInterval(fetchPayments, 5_000)
    return () => clearInterval(t)
  }, [fetchPayments])

  // ── Blockchain poll (every 5s) — flash + toast ONLY, does not touch log ────
  // Detects any USDC transfer to the recipient address in real time.
  // This gives the organiser an instant visual ping when a payment arrives,
  // regardless of whether the payer's name has been registered yet.
  useEffect(() => {
    if (!evm) return

    const fromBlock: Record<string, bigint> = {}

    async function pollChain(chainKey: 'base' | 'arc', chainLabel: string, decimals: number) {
      const client = EVM_CLIENTS[chainKey]
      try {
        const latest = await client.getBlockNumber()
        if (!fromBlock[chainKey]) { fromBlock[chainKey] = latest; return }
        if (latest <= fromBlock[chainKey]) return

        const logs = await client.getContractEvents({
          address:   CHAIN_META[chainKey].tokenAddress,
          abi:       TRANSFER_ABI,
          eventName: 'Transfer',
          args:      { to: evm as `0x${string}` },
          fromBlock: fromBlock[chainKey],
          toBlock:   latest,
        })

        fromBlock[chainKey] = latest + 1n

        for (const log of logs) {
          const { from, value } = log.args
          if (!from || value === undefined) continue
          const amount = parseFloat(formatUnits(value, decimals)).toFixed(2)

          // Flash the counter cards green
          setCounterFlash(true)
          setTimeout(() => setCounterFlash(false), 1800)

          // Toast: "Payment received · …XXXX"
          const id = ++toastId.current
          setToasts(prev => [...prev, { id, addr: from, amount, chain: chainLabel }])
          setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5_000)

          // Pull server registry immediately so the name shows ASAP
          fetchPayments()
        }
      } catch { /* silent — watcher is best-effort */ }
    }

    const t = setInterval(() => {
      for (const key of evmChainsToWatch) {
        void pollChain(key, CHAIN_META[key].label, CHAIN_META[key].decimals)
      }
    }, 5_000)

    return () => clearInterval(t)
  }, [evm, fetchPayments, evmChainsToWatch.join(',')])

  // ── QR download ───────────────────────────────────────────────────────────
  function downloadQR() {
    const canvas = qrHiResRef.current?.querySelector('canvas')
    if (!canvas) return
    const out = document.createElement('canvas')
    out.width = canvas.width; out.height = canvas.height
    const ctx = out.getContext('2d')!
    ctx.drawImage(canvas, 0, 0)
    const logo = new Image()
    logo.onload = () => {
      const size = Math.round(canvas.width * 0.15)
      const x = Math.round((canvas.width  - size) / 2)
      const y = Math.round((canvas.height - size) / 2)
      const pad = 10
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(x - pad, y - pad, size + pad * 2, size + pad * 2)
      ctx.drawImage(logo, x, y, size, size)
      const a = document.createElement('a')
      a.href = out.toDataURL('image/png')
      a.download = `${eventName.replace(/\s+/g, '-')}-qr.png`
      a.click()
    }
    logo.src = '/hash-logo.png'
  }

  // ── CSV export ────────────────────────────────────────────────────────────
  function exportCSV() {
    const header = ['Name / Handle', 'Wallet Address', 'Chain', 'Amount (USDC)', 'Time', 'Tx Hash']
    const rows   = payments.map(p => [
      p.memo || '—', p.payer, p.chain.toUpperCase(), p.amount,
      new Date(p.ts).toISOString(), p.txHash,
    ])
    const csv  = [header, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `${eventName.replace(/\s+/g, '-')}-payments.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function copyDashLink() {
    await navigator.clipboard.writeText(window.location.href)
    setDashCopied(true); setTimeout(() => setDashCopied(false), 2000)
  }

  async function copyPayLink() {
    await navigator.clipboard.writeText(paymentLink)
    setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000)
  }

  if (!eventId || (!evm && !sol)) {
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

      {/* ── Toast notifications ── */}
      <div className="fixed bottom-6 right-4 sm:right-6 z-50 flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map(t => (
          <div key={t.id}
            className="flex items-center gap-2.5 rounded-xl border border-emerald-700 bg-emerald-900 px-4 py-3 text-sm text-white shadow-xl animate-slide-up"
          >
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </span>
            <span className="font-semibold">${t.amount} received</span>
            <span className="font-mono text-emerald-300 text-xs">…{t.addr.slice(-4)}</span>
          </div>
        ))}
      </div>

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <Link to="/" className="mb-1 inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Create a new link
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{eventName}</h1>
          <div className="mt-1 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <p className="text-sm text-gray-500">Live · watching {watchLabel}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={copyDashLink}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all active:scale-[0.97]"
          >
            {dashCopied ? <><CheckCheck className="h-3.5 w-3.5 text-emerald-500" />Copied</> : <><Copy className="h-3.5 w-3.5" />Copy Dashboard Link</>}
          </button>
          <button onClick={fetchPayments} disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Stats + QR ── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="col-span-2 grid grid-cols-2 gap-4">

          <div className={cn('rounded-2xl border p-5 shadow-sm transition-all duration-500',
            counterFlash ? 'border-emerald-300 bg-emerald-50' : 'border-gray-100 bg-white')}>
            <div className={cn('mb-2 flex items-center gap-1.5 text-xs font-medium transition-colors duration-500',
              counterFlash ? 'text-emerald-600' : 'text-gray-500')}>
              {counterFlash ? <Zap className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
              Payers
            </div>
            <p className={cn('text-4xl font-bold transition-colors duration-500',
              counterFlash ? 'text-emerald-600' : 'text-gray-900')}>
              {payments.length}
            </p>
          </div>

          <div className={cn('rounded-2xl border p-5 shadow-sm transition-all duration-500',
            counterFlash ? 'border-emerald-300 bg-emerald-50' : 'border-gray-100 bg-white')}>
            <div className={cn('mb-2 flex items-center gap-1.5 text-xs font-medium transition-colors duration-500',
              counterFlash ? 'text-emerald-600' : 'text-gray-500')}>
              <DollarSign className="h-3.5 w-3.5" /> Total Collected
            </div>
            <p className={cn('text-4xl font-bold transition-colors duration-500',
              counterFlash ? 'text-emerald-600' : 'text-gray-900')}>
              ${total.toFixed(2)}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">USDC · HSK</p>
          </div>
        </div>

        {/* Hidden hi-res QR for download */}
        <div ref={qrHiResRef} aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', visibility: 'hidden' }}>
          <QRCodeCanvas value={paymentLink} size={1024} level="H" marginSize={4} />
        </div>

        {/* QR Code */}
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm flex flex-col items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 self-start">Payment QR</p>
          <div ref={qrRef} className="relative rounded-xl bg-white p-2 shadow-sm border border-gray-100">
            <QRCodeCanvas value={paymentLink} size={160} level="H" marginSize={4} />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="rounded-sm bg-white p-0.5">
                <img src="/hash-logo.png" alt="" className="h-6 w-6 object-contain" />
              </div>
            </div>
          </div>
          <button onClick={downloadQR}
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
            <button onClick={exportCSV} disabled={payments.length === 0}
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
            <p className="mt-1 text-xs text-gray-400">Share the QR code or payment link to start collecting</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {payments.map((p, i) => {
              const chainMeta   = p.chain && p.chain in CHAIN_META ? CHAIN_META[p.chain as keyof typeof CHAIN_META] : null
              const explorerUrl = chainMeta && !p.txHash.startsWith('manual')
                ? `${chainMeta.explorerUrl}/tx/${p.txHash}`
                : null
              return (
                <div key={p.txHash + i} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">
                    {payments.length - i}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{p.memo || '—'}</p>
                    <p className="truncate font-mono text-[11px] text-gray-400">{truncateAddress(p.payer, 6)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-900">${parseFloat(p.amount || '0').toFixed(2)}</p>
                    <p className="text-[10px] capitalize text-gray-400">{p.chain || '—'}</p>
                  </div>
                  <div className="hidden sm:block text-right shrink-0">
                    <p className="text-[11px] text-gray-400">{new Date(p.ts).toLocaleTimeString()}</p>
                    <p className="text-[10px] text-gray-300">{new Date(p.ts).toLocaleDateString()}</p>
                  </div>
                  {explorerUrl ? (
                    <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
                      className="shrink-0 text-gray-300 hover:text-gray-600 transition-colors">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : <div className="h-3.5 w-3.5 shrink-0" />}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Payment link for payers ── */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Payment Link for Payers</p>
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50/60 px-3.5 py-2.5">
          <p className="min-w-0 flex-1 truncate font-mono text-xs text-gray-500">{paymentLink}</p>
          <button onClick={copyPayLink} className="shrink-0 text-gray-400 hover:text-gray-700 transition-colors">
            {linkCopied ? <CheckCheck className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
        <p className="text-[11px] text-gray-400">
          Each payer must enter their name before paying. Payments appear live in the log above.
        </p>
      </div>

    </div>
  )
}
