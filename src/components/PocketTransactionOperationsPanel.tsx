import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { AlertTriangle, ChevronDown, ChevronUp, Clock3, Loader2, RefreshCw, RotateCcw } from 'lucide-react'

type Execution = {
  id: string; owner: string; kind: string; state: string; asset: string; amount: string
  sourceNetwork: string; settlementNetwork: string; destinationType: string
  resourceId: string; providerReference: string; transactionHash: string; failureCode: string
  createdAt: number; updatedAt: number; pendingForMs: number; ageMs: number
}
type Summary = { unresolved: number; processing: number; needsReview: number; stale: number }
type ReconciliationItem = { id: string; kind: string; result: 'reconciled' | 'unchanged' | 'review' | 'error'; message?: string }
type Payload = { ok?: boolean; executions?: Execution[]; summary?: Summary; error?: string; reconciliation?: { processed: number; reconciled: number; unchanged: number; review: number; errors: number; results: ReconciliationItem[] } }

const EMPTY: Summary = { unresolved: 0, processing: 0, needsReview: 0, stale: 0 }
const LABELS: Record<string, string> = { bank_payout: 'Bank payout', bill_payment: 'Bill payment', pos_settlement: 'POS settlement', hosted_checkout: 'Checkout', wallet_transfer: 'Wallet transfer', service_funding: 'Service funding' }

function elapsed(value: number) {
  if (value < 60_000) return 'Less than a minute'
  if (value < 3_600_000) return `${Math.floor(value / 60_000)}m`
  if (value < 86_400_000) return `${Math.floor(value / 3_600_000)}h ${Math.floor((value % 3_600_000) / 60_000)}m`
  return `${Math.floor(value / 86_400_000)}d ${Math.floor((value % 86_400_000) / 3_600_000)}h`
}

function dateTime(value: number) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

async function responseJson(response: Response) {
  if (!(response.headers.get('content-type') || '').toLowerCase().includes('application/json')) throw new Error('Operations returned an unexpected response. Try again.')
  return response.json() as Promise<Payload>
}

export default function PocketTransactionOperationsPanel() {
  const { getAccessToken } = usePrivy()
  const [items, setItems] = useState<Execution[]>([])
  const [summary, setSummary] = useState<Summary>(EMPTY)
  const [expanded, setExpanded] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [lastChecks, setLastChecks] = useState<Record<string, ReconciliationItem>>({})

  const call = useCallback(async (reconcile = false) => {
    const token = await getAccessToken()
    if (!token) throw new Error('Sign in again to continue.')
    const response = await fetch('/api/admin/pocket/transactions', {
      method: reconcile ? 'POST' : 'GET', cache: 'no-store',
      headers: { authorization: `Bearer ${token}`, ...(reconcile ? { 'content-type': 'application/json' } : {}) },
      ...(reconcile ? { body: JSON.stringify({ action: 'reconcile' }) } : {}),
    })
    const data = await responseJson(response)
    if (!response.ok || !data.ok) throw new Error(data.error || 'Transaction operations request failed.')
    return data
  }, [getAccessToken])

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const data = await call()
      setItems(data.executions || [])
      setSummary(data.summary || EMPTY)
      setError('')
    } catch (reason) {
      if (!quiet) setError(reason instanceof Error ? reason.message : 'Transactions could not be loaded.')
    } finally { if (!quiet) setLoading(false) }
  }, [call])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(true), 20_000)
    return () => window.clearInterval(timer)
  }, [load])

  async function reconcile() {
    setBusy(true); setError(''); setNotice('')
    try {
      const data = await call(true)
      setItems(data.executions || []); setSummary(data.summary || EMPTY)
      const result = data.reconciliation
      setLastChecks(Object.fromEntries((result?.results || []).map(item => [item.id, item])))
      setNotice(result
        ? `Reconciliation checked ${result.processed} records and advanced ${result.reconciled}.${result.errors ? ` ${result.errors} still need attention.` : ''}`
        : 'Reconciliation completed.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Reconciliation could not be completed.') }
    finally { setBusy(false) }
  }

  const ordered = useMemo(() => [...items].sort((a, b) => b.ageMs - a.ageMs), [items])
  if (loading) return <div className="mt-7 flex min-h-48 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>

  return <section className="mt-7">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">Money operations</p><h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-gray-950 dark:text-white">Transaction control</h1><p className="mt-1 max-w-2xl text-xs leading-5 text-gray-500 dark:text-gray-400">See unresolved Pocket payments and safely recheck their provider state. Operators cannot move funds or overwrite a transaction.</p></div>
      <div className="flex gap-2"><button type="button" onClick={() => void load()} className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold dark:border-white/10 dark:bg-[#111216]"><RefreshCw className="h-3.5 w-3.5" />Refresh</button><button type="button" disabled={busy || !items.length} onClick={() => void reconcile()} className="inline-flex h-9 items-center gap-2 rounded-full bg-gray-950 px-3 text-xs font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}Reconcile</button></div>
    </div>
    <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Unresolved', summary.unresolved], ['Processing', summary.processing], ['Needs review', summary.needsReview], ['Stale', summary.stale]].map(([label, value]) => <div key={label} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-[#111216]"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p></div>)}</div>
    {error && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
    {notice && <p className="mt-4 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">{notice}</p>}
    {!ordered.length ? <div className="mt-4 rounded-3xl border border-gray-200 bg-white p-8 text-center dark:border-white/10 dark:bg-[#111216]"><p className="text-sm font-semibold">No unresolved transactions</p><p className="mt-1 text-xs text-gray-500">Pocket currently has no payment requiring reconciliation.</p></div> : <div className="mt-4 space-y-2">{ordered.map(item => {
      const open = expanded === item.id
      return <article key={item.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-[#111216]">
        <button type="button" onClick={() => setExpanded(open ? '' : item.id)} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.state === 'needs_review' ? 'bg-amber-500' : 'bg-blue-500'}`} />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{LABELS[item.kind] || item.kind.replace(/_/g, ' ')}</span><span className="mt-1 block text-[11px] text-gray-500">{item.amount} {item.asset} on {item.sourceNetwork} to {item.settlementNetwork}</span></span>
          <span className="text-right"><span className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">{item.state.replace(/_/g, ' ')}</span><span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-gray-400"><Clock3 className="h-3 w-3" />{elapsed(item.pendingForMs)}</span></span>
          {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </button>
        {open && <div className="border-t border-gray-100 px-4 py-4 dark:border-white/[0.06]">{lastChecks[item.id] && <div className="mb-4 rounded-xl bg-gray-50 px-3 py-2 text-xs dark:bg-white/[0.04]"><p className="font-semibold">Last check: {lastChecks[item.id].result}</p>{lastChecks[item.id].message && <p className="mt-1 text-gray-500 dark:text-gray-400">{lastChecks[item.id].message}</p>}</div>}<div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">{[
          ['Execution ID', item.id], ['Owner', item.owner], ['Updated', dateTime(item.updatedAt)], ['Provider reference', item.providerReference], ['Resource ID', item.resourceId], ['Transaction hash', item.transactionHash],
        ].map(([label, value]) => <div key={label}><p className="text-[9px] font-bold uppercase tracking-wide text-gray-400">{label}</p><p className="mt-1 break-all font-medium">{value || 'Not available'}</p></div>)}</div>{item.failureCode && <p className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-400/10 dark:text-amber-300"><AlertTriangle className="h-3.5 w-3.5" />{item.failureCode}</p>}</div>}
      </article>
    })}</div>}
  </section>
}
