import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

// ── ERC-20 Transfer event ABI (matches viem parseAbi output exactly) ─────────
const TRANSFER_ABI = [{
  name:   'Transfer',
  type:   'event'   as const,
  inputs: [
    { name: 'from',  type: 'address' as const, indexed: true  as const },
    { name: 'to',    type: 'address' as const, indexed: true  as const },
    { name: 'value', type: 'uint256' as const, indexed: false as const },
  ],
}] as const

// ── Types ─────────────────────────────────────────────────────────────────────

/** Payment detected directly from the blockchain — always has txHash + amount */
type ChainPayment = {
  txHash: string
  payer:  string
  amount: string   // human-readable, e.g. "1.00"
  chain:  string
  ts:     number
}

/** Payment registered server-side via POST /api/event-register — has name */
type ServerPayment = {
  txHash: string
  payer:  string
  memo:   string
  amount: string
  chain:  string
  ts:     number
}

/** Merged display row */
type DisplayPayment = ChainPayment & { memo: string }

type Toast = { id: number; addr: string; amount: string; chain: string }

// ─────────────────────────────────────────────────────────────────────────────

export default function EventDashboard() {
  const [searchParams] = useSearchParams()
  const eventId  = searchParams.get('id')   ?? ''
  const evm      = searchParams.get('evm')  ?? ''
  const amt      = searchParams.get('amt')  ?? ''
  const eventName = searchParams.get('name') ?? 'Event'

  // ── Separate sources of truth ─────────────────────────────────────────────
  // chainPayments: populated by blockchain watcher (real-time, always accurate)
  // serverPayments: populated by 5s poll (used only to enrich with payer names)
  const [chainPayments,  setChainPayments]  = useState<ChainPayment[]>([])
  const [serverPayments, setServerPayments] = useState<ServerPayment[]>([])

  const [loading,       setLoading]       = useState(false)
  const [lastRefresh,   setLastRefresh]   = useState<Date | null>(null)
  const [dashCopied,    setDashCopied]    = useState(false)
  const [linkCopied,    setLinkCopied]    = useState(false)
  const [counterFlash,  setCounterFlash]  = useState(false)
  const [toasts,        setToasts]        = useState<Toast[]>([])

  const qrRef      = useRef<HTMLDivElement>(null)
  const qrHiResRef = useRef<HTMLDivElement>(null)
  const toastId    = useRef(0)

  const paymentLink = `${window.location.origin}/pay?evm=${encodeURIComponent(evm)}&amt=${encodeURIComponent(amt)}&memo=${encodeURIComponent(eventName)}&event=1&id=${encodeURIComponent(eventId)}`

  // ── Merge: chain is source of truth; server enriches with names ───────────
  const displayPayments = useMemo<DisplayPayment[]>(() => {
    // Build flat lookup tables from server data — no Map mutation during iteration
    const memoByTxHash = new Map<string, string>()
    const memoByPayer  = new Map<string, string>()
    for (const sp of serverPayments) {
      if (sp.txHash) memoByTxHash.set(sp.txHash.toLowerCase(), sp.memo)
      if (sp.payer)  memoByPayer.set(sp.payer.toLowerCase(),   sp.memo)
    }

    // Chain payments are source of truth — enrich with name from either lookup
    const chainDisplay: DisplayPayment[] = chainPayments.map(cp => ({
      ...cp,
      memo: memoByTxHash.get(cp.txHash.toLowerCase())
         ?? memoByPayer.get(cp.payer.toLowerCase())
         ?? '',
    }))

    // Add server-only entries (page was opened after the payment was made)
    const seenPayers = new Set(chainPayments.map(c => c.payer.toLowerCase()))
    const seenTxs    = new Set(chainPayments.map(c => c.txHash.toLowerCase()))
    const serverOnly: DisplayPayment[] = serverPayments
      .filter(sp =>
        !seenTxs.has(sp.txHash.toLowerCase()) &&
        !seenPayers.has(sp.payer.toLowerCase()),
      )
      .map(sp => ({ ...sp }))

    console.log('[Dashboard] chain:', chainDisplay.length, 'server-only:', serverOnly.length)

    return [...chainDisplay, ...serverOnly].sort((a, b) => b.ts - a.ts)
  }, [chainPayments, serverPayments])

  const total = useMemo(
    () => displayPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0),
    [displayPayments],
  )

  // ── Server poll — ONLY updates serverPayments, never touches chainPayments ─
  const fetchServerPayments = useCallback(async () => {
    if (!eventId) return
    setLoading(true)
    try {
      const res  = await fetch(`/api/list-event-payments?id=${encodeURIComponent(eventId)}`)
      const data = await res.json() as { ok: boolean; payments?: ServerPayment[] }
      if (data.ok && data.payments) setServerPayments(data.payments)
    } catch { /* retry next tick */ }
    finally { setLoading(false); setLastRefresh(new Date()) }
  }, [eventId])

  useEffect(() => {
    fetchServerPayments()
    const t = setInterval(fetchServerPayments, 5_000)
    return () => clearInterval(t)
  }, [fetchServerPayments])

  // ── Historical fetch on mount — catches payments made before page opened ────
  useEffect(() => {
    if (!evm) return

    async function fetchHistorical(chainKey: 'base' | 'arc', decimals: number, chainLabel: string) {
      try {
        const client = EVM_CLIENTS[chainKey]
        const latest = await client.getBlockNumber()
        const fromBlock = latest > 5000n ? latest - 5000n : 0n
        console.log(`[Dashboard] fetching ${chainLabel} history from block ${fromBlock}`)

        const logs = await client.getContractEvents({
          address:   CHAIN_META[chainKey].tokenAddress,
          abi:       TRANSFER_ABI,
          eventName: 'Transfer',
          args:      { to: evm as `0x${string}` },
          fromBlock,
          toBlock:   latest,
        })

        console.log(`[Dashboard] ${chainLabel} history: ${logs.length} transfers found`)
        if (logs.length === 0) return

        const newPayments: ChainPayment[] = logs
          .filter(l => l.args.from && l.args.value !== undefined)
          .map((l, i, arr) => ({
            txHash: l.transactionHash ?? (`chain_${Date.now()}_${i}` as `0x${string}`),
            payer:  l.args.from as `0x${string}`,
            amount: parseFloat(formatUnits(l.args.value as bigint, decimals)).toFixed(2),
            chain:  chainLabel.toLowerCase(),
            ts:     Date.now() - (arr.length - 1 - i) * 60_000, // oldest → furthest in past
          }))

        setChainPayments(prev => {
          const seen = new Set(prev.map(p => p.txHash.toLowerCase()))
          const fresh = newPayments.filter(p => !seen.has(p.txHash.toLowerCase()))
          if (fresh.length === 0) return prev
          return [...prev, ...fresh].sort((a, b) => b.ts - a.ts)
        })
      } catch (err) {
        console.error(`[Dashboard] ${chainLabel} historical fetch error:`, err)
      }
    }

    fetchHistorical('base', CHAIN_META.base.decimals, 'Base')
    fetchHistorical('arc',  CHAIN_META.arc.decimals,  'Arc')
  }, [evm])

  // ── Live Blockchain Transfer watcher (new payments while page is open) ────
  useEffect(() => {
    if (!evm) return

    console.log('[Dashboard] starting watcher for address:', evm)

    function processLog(
      rawLog: { args: { from?: `0x${string}`; value?: bigint }; transactionHash: `0x${string}` | null },
      chainLabel: string,
      decimals: number,
    ) {
      const { from, value } = rawLog.args
      const txHash = rawLog.transactionHash ?? (`chain_${Date.now()}` as `0x${string}`)

      console.table({ chainLabel, from, value: value?.toString(), txHash })

      if (!from || value === undefined) return

      const amount     = parseFloat(formatUnits(value, decimals)).toFixed(2)
      const newPayment: ChainPayment = { txHash, payer: from, amount, chain: chainLabel.toLowerCase(), ts: Date.now() }

      console.log('[Dashboard] live payment:', newPayment)

      setChainPayments(prev =>
        prev.some(p => p.txHash === txHash) ? prev : [newPayment, ...prev],
      )
      setCounterFlash(true)
      setTimeout(() => setCounterFlash(false), 1800)
      const id = ++toastId.current
      setToasts(prev => [...prev, { id, addr: from, amount, chain: chainLabel }])
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5_000)
      fetchServerPayments()
    }

    const evmAddr = evm as `0x${string}`

    const unwatchers = [
      EVM_CLIENTS.base.watchContractEvent({
        address:         CHAIN_META.base.tokenAddress,
        abi:             TRANSFER_ABI,
        eventName:       'Transfer',
        args:            { to: evmAddr },
        pollingInterval: 3_000,
        onLogs: (logs) => logs.forEach(l => processLog(l as Parameters<typeof processLog>[0], 'Base', CHAIN_META.base.decimals)),
        onError: (err) => console.error('[Dashboard] Base watcher error:', err),
      }),
      EVM_CLIENTS.arc.watchContractEvent({
        address:         CHAIN_META.arc.tokenAddress,
        abi:             TRANSFER_ABI,
        eventName:       'Transfer',
        args:            { to: evmAddr },
        pollingInterval: 3_000,
        onLogs: (logs) => logs.forEach(l => processLog(l as Parameters<typeof processLog>[0], 'Arc', CHAIN_META.arc.decimals)),
        onError: (err) => console.error('[Dashboard] Arc watcher error:', err),
      }),
    ]

    return () => unwatchers.forEach(u => u())
  }, [evm, fetchServerPayments])

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
    const rows   = displayPayments.map(p => [
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

      {/* ── Toasts ── */}
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
            <p className="text-sm text-gray-500">Live · watching Base &amp; Arc</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={copyDashLink}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all active:scale-[0.97]"
          >
            {dashCopied ? <><CheckCheck className="h-3.5 w-3.5 text-emerald-500" />Copied</> : <><Copy className="h-3.5 w-3.5" />Copy Dashboard Link</>}
          </button>
          <button onClick={fetchServerPayments} disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Stats + QR ── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="col-span-2 grid grid-cols-2 gap-4">

          {/* Payers counter */}
          <div className={cn(
            'rounded-2xl border p-5 shadow-sm transition-all duration-500',
            counterFlash ? 'border-emerald-300 bg-emerald-50' : 'border-gray-100 bg-white',
          )}>
            <div className={cn('mb-2 flex items-center gap-1.5 text-xs font-medium transition-colors duration-500',
              counterFlash ? 'text-emerald-600' : 'text-gray-500')}>
              {counterFlash ? <Zap className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
              Payers
            </div>
            <p className={cn('text-4xl font-bold transition-colors duration-500',
              counterFlash ? 'text-emerald-600' : 'text-gray-900')}>
              {displayPayments.length}
            </p>
          </div>

          {/* Total collected */}
          <div className={cn(
            'rounded-2xl border p-5 shadow-sm transition-all duration-500',
            counterFlash ? 'border-emerald-300 bg-emerald-50' : 'border-gray-100 bg-white',
          )}>
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

        {/* Hidden hi-res canvas for download */}
        <div ref={qrHiResRef} aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', visibility: 'hidden' }}>
          <QRCodeCanvas value={paymentLink} size={1024} level="H" marginSize={4} />
        </div>

        {/* QR Code card */}
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
            <button onClick={exportCSV} disabled={displayPayments.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.97]"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </div>
        </div>

        {displayPayments.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
              <Users className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-600">No payments yet</p>
            <p className="mt-1 text-xs text-gray-400">Share the QR code or payment link to start collecting</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {displayPayments.map((p, i) => {
              const chainMeta   = p.chain && p.chain in CHAIN_META ? CHAIN_META[p.chain as keyof typeof CHAIN_META] : null
              const explorerUrl = chainMeta && !p.txHash.startsWith('chain_') && !p.txHash.startsWith('manual')
                ? `${chainMeta.explorerUrl}/tx/${p.txHash}`
                : null
              return (
                <div key={p.txHash + i} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">
                    {displayPayments.length - i}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{p.memo || <span className="text-gray-400 font-normal italic">name pending…</span>}</p>
                    <p className="truncate font-mono text-[11px] text-gray-400">{truncateAddress(p.payer, 6)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-900">${parseFloat(p.amount).toFixed(2)}</p>
                    <p className="text-[10px] capitalize text-gray-400">{p.chain || '—'}</p>
                  </div>
                  <div className="hidden sm:block text-right shrink-0">
                    <p className="text-[11px] text-gray-400">{new Date(p.ts).toLocaleTimeString()}</p>
                    <p className="text-[10px] text-gray-300">{new Date(p.ts).toLocaleDateString()}</p>
                  </div>
                  {explorerUrl ? (
                    <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
                      className="shrink-0 text-gray-300 hover:text-gray-600 transition-colors" title="View on explorer">
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
          <button onClick={copyPayLink} className="shrink-0 text-gray-400 hover:text-gray-700 transition-colors" title="Copy link">
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
