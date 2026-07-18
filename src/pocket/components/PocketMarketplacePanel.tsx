import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, CheckCircle2, Clock3, Loader2, Search, Store } from 'lucide-react'
import { cn } from '../../lib/utils'
import {
  buyPocketMarketplaceService,
  readPocketMarketplace,
  type PocketMarketplacePurchase,
  type PocketMarketplaceService,
  type PocketMarketplaceSnapshot,
} from '../api/pocketMarketplaceClient'
import { createPocketIdempotencyKey } from '../lib/pocketSchemas'

type Props = {
  connected: boolean
  network: 'base' | 'arc'
  gatewayBalance?: string
  getAccessToken(): Promise<string | null>
  onUseBase(): void
  refreshToken?: number
}

function categoryLabel(value: string) {
  return value.toLowerCase().split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function enoughBalance(balance: string | undefined, amount: string) {
  const available = Number(balance ?? '0')
  const price = Number(amount)
  return Number.isFinite(available) && Number.isFinite(price) && available >= price
}

function resultPreview(value: unknown) {
  if (value === undefined) return ''
  try {
    const text = JSON.stringify(value, null, 2)
    return text.length > 4_000 ? `${text.slice(0, 4_000)}\n…` : text
  } catch {
    return 'Service completed.'
  }
}

export default function PocketMarketplacePanel({ connected, network, gatewayBalance, getAccessToken, onUseBase, refreshToken = 0 }: Props) {
  const [query, setQuery] = useState('')
  const [snapshot, setSnapshot] = useState<PocketMarketplaceSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [purchaseError, setPurchaseError] = useState('')
  const [selected, setSelected] = useState<PocketMarketplaceService | null>(null)
  const [buying, setBuying] = useState(false)
  const [purchase, setPurchase] = useState<PocketMarketplacePurchase | null>(null)
  const autoLoadAttempted = useRef(false)
  const lastRefreshToken = useRef(refreshToken)
  const purchaseKey = useRef('')

  const load = useCallback(async (nextQuery = query) => {
    if (!connected) return
    setLoading(true)
    setLoadError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to open Marketplace.')
      const next = await readPocketMarketplace({ accessToken: token, query: nextQuery })
      if (!next.catalogAvailable) {
        setLoadError(next.catalogMessage || 'Couldn\'t refresh Marketplace. App Pay history is still available.')
        setSnapshot(current => ({ ...next, services: current?.services ?? [] }))
      } else {
        setSnapshot(next)
      }
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : 'Circle Marketplace is temporarily unavailable.')
    } finally {
      setLoading(false)
    }
  }, [connected, getAccessToken, query])

  useEffect(() => {
    if (!connected) {
      autoLoadAttempted.current = false
      return
    }
    if (network !== 'base' || autoLoadAttempted.current) return
    autoLoadAttempted.current = true
    void load('')
  }, [connected, load, network])

  useEffect(() => {
    if (lastRefreshToken.current === refreshToken) return
    lastRefreshToken.current = refreshToken
    if (connected && network === 'base') void load(query)
  }, [connected, load, network, query, refreshToken])

  const canPay = useMemo(() => (
    selected !== null
    && network === 'base'
    && enoughBalance(gatewayBalance, selected.amount)
  ), [gatewayBalance, network, selected])
  const hasCachedServices = Boolean(snapshot?.services.length)

  const buy = async () => {
    if (!selected || !canPay) return
    setBuying(true)
    setPurchaseError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again before paying.')
      if (!purchaseKey.current) purchaseKey.current = createPocketIdempotencyKey('marketplace')
      const next = await buyPocketMarketplaceService({ accessToken: token, selected, idempotencyKey: purchaseKey.current })
      setPurchase(next)
      setSelected(null)
      purchaseKey.current = ''
      await load(query)
    } catch (reason) {
      setPurchaseError(reason instanceof Error ? reason.message : 'Marketplace payment failed.')
    } finally {
      setBuying(false)
    }
  }

  if (!connected) return null

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-white/10 dark:bg-white/[0.04]">
      <div className="border-b border-gray-100 px-3.5 py-3.5 dark:border-white/10">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gray-950 text-white dark:bg-white dark:text-gray-950"><Store className="h-4 w-4" /></span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-950 dark:text-white">Circle Marketplace</p>
              <p className="mt-0.5 text-[11px] leading-4 text-gray-500 dark:text-gray-400">Buy compatible data and AI services with App Pay.</p>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-gray-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-300">Circle Gateway</span>
        </div>
      </div>

      {network === 'arc' ? (
        <div className="p-3.5">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Marketplace payments use mainnet App Pay</p>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">Circle Gateway routes purchases from your unified mainnet balance. Arc Testnet is not used for live purchases.</p>
          <button type="button" onClick={onUseBase} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white dark:bg-white dark:text-gray-950"><ArrowRight className="h-4 w-4" /> Use mainnet App Pay</button>
        </div>
      ) : (
        <div className="space-y-3 p-3.5">
          <form onSubmit={event => { event.preventDefault(); void load(query) }} className="flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 dark:border-white/10 dark:bg-white/[0.05]">
            <Search className="h-4 w-4 text-gray-400" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search services" className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-white" />
            <button type="submit" disabled={loading} className="text-xs font-bold text-gray-600 disabled:opacity-50 dark:text-gray-300">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}</button>
          </form>

          {loadError && (
            <p className={cn(
              'rounded-xl border px-3 py-2 text-xs font-medium',
              hasCachedServices
                ? 'border-gray-200 bg-gray-50 text-gray-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-300'
                : 'border-red-100 bg-red-50 text-red-600 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200',
            )}>
              {hasCachedServices ? 'Couldn\'t refresh Marketplace. Showing the latest available services.' : loadError}
            </p>
          )}

          {purchase && (
            <div className={cn(
              'rounded-xl border p-3',
              purchase.status === 'completed'
                ? 'border-emerald-100 bg-emerald-50/70 dark:border-emerald-400/20 dark:bg-emerald-400/10'
                : 'border-amber-100 bg-amber-50/70 dark:border-amber-400/20 dark:bg-amber-400/10',
            )}>
              <div className={cn('flex items-center gap-2', purchase.status === 'completed' ? 'text-emerald-700 dark:text-emerald-200' : 'text-amber-700 dark:text-amber-200')}>
                {purchase.status === 'completed' ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
                <p className="text-xs font-bold">{purchase.status === 'completed' ? 'Service completed' : 'Payment submitted — reconciliation pending'}</p>
              </div>
              {purchase.message && <p className="mt-1.5 text-[11px] leading-4 text-gray-500 dark:text-gray-300">{purchase.message}</p>}
              {purchase.status === 'completed' && resultPreview(purchase.result) && <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white/70 p-2 text-[10px] leading-4 text-gray-600 dark:bg-black/20 dark:text-gray-300">{resultPreview(purchase.result)}</pre>}
              {purchase.receiptActivityId && <a href={`/receipt/${encodeURIComponent(purchase.receiptActivityId)}`} className={cn('mt-2 inline-flex items-center gap-1 text-[11px] font-bold', purchase.status === 'completed' ? 'text-emerald-700 dark:text-emerald-200' : 'text-amber-700 dark:text-amber-200')}>View activity <ArrowRight className="h-3 w-3" /></a>}
            </div>
          )}

          <div className="space-y-2">
            {loading && !snapshot ? (
              <div className="flex items-center justify-center gap-2 py-8 text-xs font-medium text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading compatible services</div>
            ) : snapshot?.services.length ? snapshot.services.map(item => (
              <button
                key={item.resource}
                type="button"
                aria-pressed={selected?.resource === item.resource}
                onClick={() => { setPurchase(null); setPurchaseError(''); purchaseKey.current = createPocketIdempotencyKey('marketplace'); setSelected(item); }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition active:scale-[0.99]',
                  selected?.resource === item.resource
                    ? 'border-gray-900 bg-white ring-1 ring-gray-900/10 dark:border-white dark:bg-white/[0.09]'
                    : 'border-gray-100 bg-gray-50/70 hover:border-gray-200 hover:bg-white dark:border-white/[0.07] dark:bg-white/[0.03] dark:hover:border-white/15 dark:hover:bg-white/[0.06]',
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-xs font-black text-gray-800 shadow-sm dark:bg-white/[0.08] dark:text-white">{item.provider.slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-gray-900 dark:text-white">{item.description}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-gray-400">{item.provider} · {categoryLabel(item.category)}</span>
                </span>
                <span className="shrink-0 text-right"><span className="block text-xs font-black text-gray-900 dark:text-white">{item.amount}</span><span className="block text-[9px] font-bold text-gray-400">USDC</span></span>
              </button>
            )) : snapshot && !snapshot.catalogAvailable ? (
              <p className="py-8 text-center text-xs text-gray-400">Catalog temporarily unavailable. Pull down to retry.</p>
            ) : (
              <p className="py-8 text-center text-xs text-gray-400">No one-tap Gateway services matched this search.</p>
            )}
          </div>

          <div className="rounded-xl border border-gray-100 px-3 py-2.5 dark:border-white/[0.07]">
            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-300">App Pay history</p>
            {snapshot?.activity.length ? (
              <div className="mt-2 space-y-2 border-t border-gray-100 pt-2 dark:border-white/[0.07]">
                {snapshot.activity.map(item => <div key={item.id} className="flex items-center justify-between gap-3 text-[10px]"><span className="min-w-0 truncate text-gray-500 dark:text-gray-400">{item.title}</span><span className="shrink-0 font-bold text-gray-700 dark:text-gray-200">{item.amount || '—'} {item.asset || ''}</span></div>)}
              </div>
            ) : <p className="mt-1 text-[10px] leading-4 text-gray-400">No App Pay attempts recorded yet.</p>}
          </div>
        </div>
      )}

      {selected && (
        <>
          <button type="button" aria-label="Close purchase confirmation" onClick={() => { if (!buying) setSelected(null) }} className="fixed inset-0 z-40 bg-gray-950/30 backdrop-blur-[2px] dark:bg-black/60" />
          <div role="dialog" aria-modal="true" aria-label="Confirm Marketplace purchase" className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-[430px] -translate-x-1/2 overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.32)] dark:border-white/10 dark:bg-[#17181c]">
            <div className="flex justify-center pt-2.5"><span className="h-1 w-9 rounded-full bg-gray-200 dark:bg-white/15" /></div>
            <div className="p-5 pt-3.5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#0071E3] ring-1 ring-blue-100 dark:bg-blue-400/10 dark:text-blue-300 dark:ring-blue-400/20">
                  <Check className="h-5 w-5 stroke-[2.5]" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">App Pay</p>
                  <p className="text-base font-bold tracking-tight text-gray-950 dark:text-white">Confirm purchase</p>
                </div>
              </div>

              <p className="mt-4 line-clamp-2 text-sm font-semibold leading-5 text-gray-900 dark:text-white">{selected.description}</p>
              <div className="mt-3 overflow-hidden rounded-2xl border border-gray-100 bg-gray-50/80 dark:border-white/[0.07] dark:bg-white/[0.04]">
                <div className="flex items-center justify-between gap-4 px-3.5 py-3">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Service</span>
                  <span className="max-w-[65%] truncate text-xs font-semibold text-gray-900 dark:text-gray-100">{selected.provider}</span>
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-gray-100 px-3.5 py-3 dark:border-white/[0.07]">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Pay from App Pay</span>
                  <span className="text-sm font-black text-gray-950 dark:text-white">{selected.amount} <span className="text-[10px] font-bold text-gray-400">USDC</span></span>
                </div>
              </div>
              <p className="mt-2.5 text-[11px] leading-4 text-gray-400">You are approving this request only. The service cannot make another charge.</p>
              {!enoughBalance(gatewayBalance, selected.amount) && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:bg-amber-400/10 dark:text-amber-200">Add at least {selected.amount} USDC to App Pay before paying.</p>}
              {purchaseError && <p className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">{purchaseError}</p>}
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <button type="button" onClick={() => setSelected(null)} disabled={buying} className="rounded-full border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition active:scale-[0.98] disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-200">Cancel</button>
                <button type="button" onClick={() => void buy()} disabled={buying || !canPay} className="inline-flex items-center justify-center gap-2 rounded-full bg-gray-950 px-4 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-40 dark:bg-white dark:text-gray-950">{buying ? <><Clock3 className="h-4 w-4" /> Paying</> : <>Pay {selected.amount}<ArrowRight className="h-4 w-4" /></>}</button>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
