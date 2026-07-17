import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, CheckCircle2, Clock3, Loader2, Search, ShieldCheck, Store } from 'lucide-react'
import {
  buyPocketMarketplaceService,
  readPocketMarketplace,
  type PocketMarketplacePurchase,
  type PocketMarketplaceService,
  type PocketMarketplaceSnapshot,
} from '../api/pocketMarketplaceClient'

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
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<PocketMarketplaceService | null>(null)
  const [buying, setBuying] = useState(false)
  const [purchase, setPurchase] = useState<PocketMarketplacePurchase | null>(null)
  const autoLoadAttempted = useRef(false)
  const lastRefreshToken = useRef(refreshToken)

  const load = useCallback(async (nextQuery = query) => {
    if (!connected) return
    setLoading(true)
    setError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to open Marketplace.')
      setSnapshot(await readPocketMarketplace({ accessToken: token, query: nextQuery }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Circle Marketplace is temporarily unavailable.')
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

  const buy = async () => {
    if (!selected || !canPay) return
    setBuying(true)
    setError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again before paying.')
      const next = await buyPocketMarketplaceService({ accessToken: token, selected })
      setPurchase(next)
      setSelected(null)
      await load(query)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Marketplace payment failed.')
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
          <span className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-gray-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-300">Base</span>
        </div>
      </div>

      {network === 'arc' ? (
        <div className="p-3.5">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Marketplace payments currently use Base</p>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">Circle’s live registry does not currently advertise Arc Testnet marketplace endpoints.</p>
          <button type="button" onClick={onUseBase} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white dark:bg-white dark:text-gray-950"><ArrowRight className="h-4 w-4" /> Use Base App Pay</button>
        </div>
      ) : (
        <div className="space-y-3 p-3.5">
          <form onSubmit={event => { event.preventDefault(); void load(query) }} className="flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 dark:border-white/10 dark:bg-white/[0.05]">
            <Search className="h-4 w-4 text-gray-400" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search services" className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-white" />
            <button type="submit" disabled={loading} className="text-xs font-bold text-gray-600 disabled:opacity-50 dark:text-gray-300">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}</button>
          </form>

          {error && <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">{error}</p>}

          {purchase && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 dark:border-emerald-400/20 dark:bg-emerald-400/10">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4" /><p className="text-xs font-bold">Service completed</p></div>
              {resultPreview(purchase.result) && <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white/70 p-2 text-[10px] leading-4 text-gray-600 dark:bg-black/20 dark:text-gray-300">{resultPreview(purchase.result)}</pre>}
              {purchase.receiptActivityId && <a href={`/receipt/${encodeURIComponent(purchase.receiptActivityId)}`} className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-200">View receipt <ArrowRight className="h-3 w-3" /></a>}
            </div>
          )}

          <div className="space-y-2">
            {loading && !snapshot ? (
              <div className="flex items-center justify-center gap-2 py-8 text-xs font-medium text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading compatible services</div>
            ) : snapshot?.services.length ? snapshot.services.map(item => (
              <button key={item.resource} type="button" onClick={() => { setPurchase(null); setSelected(item); }} className="flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-3 text-left transition hover:border-gray-200 hover:bg-white active:scale-[0.99] dark:border-white/[0.07] dark:bg-white/[0.03] dark:hover:border-white/15 dark:hover:bg-white/[0.06]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-xs font-black text-gray-800 shadow-sm dark:bg-white/[0.08] dark:text-white">{item.provider.slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-gray-900 dark:text-white">{item.description}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-gray-400">{item.provider} · {categoryLabel(item.category)}</span>
                </span>
                <span className="shrink-0 text-right"><span className="block text-xs font-black text-gray-900 dark:text-white">{item.amount}</span><span className="block text-[9px] font-bold text-gray-400">USDC</span></span>
              </button>
            )) : (
              <p className="py-8 text-center text-xs text-gray-400">No one-tap Gateway services matched this search.</p>
            )}
          </div>

          {snapshot?.activity.length ? (
            <details className="rounded-xl border border-gray-100 px-3 py-2 dark:border-white/[0.07]">
              <summary className="cursor-pointer list-none text-[11px] font-bold text-gray-500 dark:text-gray-300">Recent purchases</summary>
              <div className="mt-2 space-y-2 border-t border-gray-100 pt-2 dark:border-white/[0.07]">
                {snapshot.activity.map(item => <div key={item.id} className="flex items-center justify-between gap-3 text-[10px]"><span className="min-w-0 truncate text-gray-500 dark:text-gray-400">{item.title}</span><span className="shrink-0 font-bold text-gray-700 dark:text-gray-200">{item.amount} {item.asset}</span></div>)}
              </div>
            </details>
          ) : null}
        </div>
      )}

      {selected && (
        <div className="border-t border-gray-100 bg-gray-50/80 p-3.5 dark:border-white/10 dark:bg-black/10">
          <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200"><ShieldCheck className="h-4 w-4" /><p className="text-xs font-black uppercase tracking-wider">Confirm purchase</p></div>
          <p className="mt-2 text-sm font-semibold text-gray-950 dark:text-white">{selected.description}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Pay {selected.amount} USDC from Base App Pay to {selected.provider}. You will only approve this request.</p>
          {!enoughBalance(gatewayBalance, selected.amount) && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:bg-amber-400/10 dark:text-amber-200">Add at least {selected.amount} USDC to App Pay first.</p>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setSelected(null)} disabled={buying} className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200">Cancel</button>
            <button type="button" onClick={() => void buy()} disabled={buying || !canPay} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">{buying ? <><Clock3 className="h-4 w-4" /> Paying</> : <>Pay {selected.amount}<ArrowRight className="h-4 w-4" /></>}</button>
          </div>
        </div>
      )}
    </section>
  )
}
