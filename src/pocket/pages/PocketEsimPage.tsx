import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import PocketRouteShell from '../components/PocketRouteShell'
import PocketFlowHeader from '../components/PocketFlowHeader'
import PocketBottomSheet from '../components/PocketBottomSheet'
import PocketCountryFlag from '../components/PocketCountryFlag'
import { PocketSkeletonBar } from '../components/PocketContentSkeletons'
import { Wifi, ChevronRight, Search } from '../components/PocketIcons'
import usePocketIdentity from '../hooks/usePocketIdentity'
import { POCKET_BASE_PATH, POCKET_ROUTES, pocketApiUrl } from '../lib/pocketRoutes'
import { xpayOrigin } from '../lib/pocketXPayNavigation'
import type { PocketEsimCatalog, PocketEsimPlan, PocketEsimPrice } from '../lib/pocketEsim'

export default function PocketEsimPage() {
  const navigate = useNavigate(), location = useLocation(), [params, setParams] = useSearchParams()
  const { ready, authenticated, email, getAccessToken } = usePocketIdentity()
  const tokenReader = useRef(getAccessToken); tokenReader.current = getAccessToken
  const [catalog, setCatalog] = useState<PocketEsimCatalog | null>(null)
  const [error, setError] = useState(''), [retry, setRetry] = useState(0)
  const [plan, setPlan] = useState<PocketEsimPlan | null>(null)
  const [days, setDays] = useState('1')
  const [price, setPrice] = useState<PocketEsimPrice | null>(null)
  const [priceError, setPriceError] = useState('')
  const origin = xpayOrigin(location.state)
  const destination = catalog?.destinations.find(item => item.id === params.get('destination'))
  const tab = params.get('tab') === 'regional' ? 'regional' : 'countries'
  const query = params.get('q') || ''
  const open = (path: string) => navigate(POCKET_BASE_PATH + path, { state: { xpayOrigin: origin } })
  const changeParams = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) value ? next.set(key, value) : next.delete(key)
    setParams(next, { replace: true, state: location.state })
  }
  useEffect(() => {
    const abort = new AbortController()
    setCatalog(null); setError(''); setPlan(null)
    if (!ready || !authenticated) return () => abort.abort()
    void (async () => {
      const token = await tokenReader.current()
      if (!token) throw new Error('AUTH')
      const response = await fetch(pocketApiUrl('/api/pocket/esim/catalog'), { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15_000)]) })
      if (!response.ok) throw new Error('CATALOG')
      const data = await response.json() as PocketEsimCatalog
      if (!['coming_soon', 'available'].includes(data.status) || !Array.isArray(data.destinations)) throw new Error('CATALOG')
      if (!abort.signal.aborted) setCatalog(data)
    })().catch(() => { if (!abort.signal.aborted) setError('Could not update eSIM plans. Please try again.') })
    return () => abort.abort()
  }, [ready, authenticated, email, retry])
  const rows = catalog?.destinations.filter(item => item.region === (tab === 'regional') && item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) || []
  useEffect(() => {
    setPrice(null); setPriceError('')
    if (!plan || (plan.daily && (!/^\d+$/.test(days) || Number(days) < 1 || Number(days) > 365))) return
    const abort = new AbortController()
    void (async () => {
      const token = await tokenReader.current()
      if (!token) throw Error('AUTH')
      const response = await fetch(pocketApiUrl('/api/pocket/esim/price'), { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ packageCode: plan.id, days: plan.daily ? Number(days) : plan.days }), signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15_000)]) })
      if (!response.ok) throw Error('PRICE')
      const result = await response.json()
      if (result.price?.currency !== 'USD' || !['subtotal', 'platformFee', 'total'].every(key => /^\d+(\.\d{1,6})?$/.test(result.price?.[key]))) throw Error('PRICE')
      if (!abort.signal.aborted) setPrice(result.price)
    })().catch(() => { if (!abort.signal.aborted) setPriceError('This plan is temporarily unavailable.') })
    return () => abort.abort()
  }, [plan, days])
  return <PocketRouteShell active="services" rail={origin} refreshEnabled={false} onSelect={tab => open(tab === 'profile' ? POCKET_ROUTES.profile : POCKET_ROUTES.home)}>
    <PocketFlowHeader title={destination?.name || 'eSIM'} centered onBack={() => destination ? changeParams({ destination: '' }) : open(POCKET_ROUTES.services)} />
    {!catalog && !error ? <section role="status" aria-label="Updating eSIM plans" className="mt-7 space-y-5"><PocketSkeletonBar className="h-12 w-full rounded-2xl" />{[0, 1, 2, 3].map(i => <PocketSkeletonBar key={i} className="h-16 w-full rounded-2xl" />)}</section>
      : error ? <section className="py-16 text-center"><p role="status" className="text-sm text-gray-500 dark:text-gray-400">{error}</p><button type="button" className="pocket-cta-primary mt-6 w-full" onClick={() => setRetry(value => value + 1)}>Try again</button></section>
      : catalog?.status === 'coming_soon' ? <section className="flex min-h-[55dvh] flex-col items-center justify-center text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-[24px] bg-gray-100 dark:bg-[#171717]"><Wifi className="h-9 w-9 text-gray-800 dark:text-gray-200" /></span>
        <h2 className="mt-6 text-xl font-semibold tracking-tight">Stay connected abroad</h2>
        <p className="mt-2 max-w-[260px] text-sm leading-6 text-gray-500 dark:text-gray-400">Travel data, right from Pocket.</p>
        <span className="mt-6 rounded-full bg-gray-100 px-5 py-2 text-sm font-medium text-gray-600 dark:bg-[#171717] dark:text-gray-300">Coming soon</span>
      </section>
      : destination ? <section className="mt-6 space-y-3" aria-label="Data packages">
        {destination.plans.map(item => <button type="button" key={item.id} onClick={() => { setDays('1'); setPrice(null); setPlan(item) }} className="flex min-h-20 w-full items-center gap-4 rounded-2xl bg-gray-100 p-4 text-left dark:bg-[#171717]">
          <span className="flex-1"><span className="block text-base font-semibold">{item.data}</span><span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{item.daily ? 'Daily high-speed allowance' : `${item.days} ${item.days === 1 ? 'day' : 'days'}`}{item.coverage?.length ? ` · ${item.coverage.length} countries / areas` : ''}</span></span><ChevronRight className="h-4 w-4" />
        </button>)}
      </section> : <section className="mt-5">
        <label className="flex h-12 items-center gap-3 rounded-2xl bg-gray-100 px-4 dark:bg-[#171717]"><Search className="h-5 w-5 shrink-0 text-gray-400" /><input aria-label="Search destinations" placeholder="Where are you travelling?" value={query} onChange={event => changeParams({ q: event.target.value })} className="min-w-0 flex-1 bg-transparent text-sm outline-none border-0 focus:ring-0" /></label>
        <div className="my-5 flex gap-2" aria-label="Destination type">{(['countries', 'regional'] as const).map(value => <button key={value} type="button" aria-pressed={tab === value} onClick={() => changeParams({ tab: value })} className={`min-h-10 rounded-full px-5 text-sm font-medium ${tab === value ? 'bg-gray-200 text-gray-950 dark:bg-[#262626] dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>{value === 'countries' ? 'Countries' : 'Regional'}</button>)}</div>
        <div className="divide-y divide-gray-100 dark:divide-[#262626]">{rows.map(item => <button type="button" key={item.id} onClick={() => changeParams({ destination: item.id })} className="flex min-h-20 w-full items-center gap-4 py-4 text-left">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center"><PocketCountryFlag code={item.region ? undefined : item.countryCode} /></span><span className="flex-1 text-sm font-medium">{item.name}</span><ChevronRight className="h-4 w-4 text-gray-400" />
        </button>)}</div>
        {!rows.length && <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">{query ? 'No matching destinations.' : 'No plans available right now.'}</p>}
      </section>}
    {plan && <PocketBottomSheet title="Plan details" onClose={() => setPlan(null)}>
      <h2 className="text-lg font-semibold">{plan.data} · {destination?.name}</h2>
      {!plan.daily && <dl className="mt-6 text-sm"><div className="flex justify-between gap-5"><dt className="text-gray-500 dark:text-gray-400">Validity</dt><dd className="text-right font-medium">{plan.days} {plan.days === 1 ? 'day' : 'days'}</dd></div></dl>}
      {plan.daily && <label className="mt-5 flex items-center justify-between text-sm"><span>Days</span><input aria-label="Days" type="text" inputMode="numeric" maxLength={3} value={days} onChange={event => { if (/^\d{0,3}$/.test(event.target.value)) { setPrice(null); setDays(event.target.value) } }} onBlur={() => setDays(String(Math.min(365, Math.max(1, Number(days) || 1))))} className="w-20 rounded-xl border-0 bg-gray-100 p-3 text-center outline-none focus:ring-0 dark:bg-[#171717]" /></label>}
      {priceError ? <p role="status" className="mt-5 text-sm text-gray-500 dark:text-gray-400">{priceError}</p> : !price ? <div role="status" aria-label="Updating price" className="mt-5 space-y-3"><PocketSkeletonBar className="h-5 w-full" /><PocketSkeletonBar className="h-5 w-full" /></div> : <dl className="mt-5 space-y-3 text-sm">{[['Plan', price.subtotal], ['Platform fee', price.platformFee], ['Total', price.total]].map(([label, amount]) => <div key={label} className="flex justify-between gap-4"><dt className="text-gray-500 dark:text-gray-400">{label}</dt><dd className="font-medium">{Number(amount) > 0 && Number(amount) < 0.01 ? '<0.01' : Number(amount).toFixed(2)} USD</dd></div>)}</dl>}
      {plan.daily && plan.fairUsage && <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">Up to {plan.fairUsage} after your daily allowance.</p>}
      <details className="mt-5 text-sm">
        <summary className="cursor-pointer font-medium text-gray-600 dark:text-gray-300">Plan information</summary>
        <div className="mt-3 space-y-3 text-sm leading-6 text-gray-500 dark:text-gray-400">
          <p>Unlocked, eSIM-compatible phone required.</p>
          {plan.activation && <p>{plan.activation}</p>}
          {!plan.daily && plan.fairUsage && <p>{plan.fairUsage}</p>}
          {plan.coverage?.length ? <p><span className="font-medium text-gray-700 dark:text-gray-200">Coverage: </span>{plan.coverage.join(', ')}</p> : null}
        </div>
      </details>
      <button type="button" disabled className="pocket-cta-primary mt-6 w-full">Coming soon</button>
    </PocketBottomSheet>}
  </PocketRouteShell>
}
