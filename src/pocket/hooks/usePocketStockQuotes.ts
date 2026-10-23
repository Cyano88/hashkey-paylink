import { useEffect, useState } from 'react'
import { pocketApiUrl } from '../lib/pocketRoutes'

export type StockQuote = { usd: number; change: number | null; volume: number; fetchedAt: number }
type Pair = { chainId?: string; baseToken?: { address?: string }; priceUsd?: string; priceChange?: { h24?: number }; volume?: { h24?: number }; liquidity?: { usd?: number } }
export function selectStockQuotes(pairs: unknown, addresses: string[], fetchedAt: number): Record<string, StockQuote> {
  if (!Array.isArray(pairs)) throw new Error('Invalid quote response')
  const allowed = new Set(addresses.map(a => a.toLowerCase()))
  const result: Record<string, StockQuote> = {}
  const liquidities: Record<string, number> = {}
  for (const p of pairs as Pair[]) {
    const address = p.baseToken?.address?.toLowerCase() || ''
    const usd = Number(p.priceUsd)
    const liquidity = p.liquidity?.usd ?? 0
    if (p.chainId !== 'xlayer' || !allowed.has(address) || !Number.isFinite(usd) || usd <= 0 || !Number.isFinite(liquidity) || liquidity <= 0) continue
    if (liquidities[address] !== undefined && liquidities[address] >= liquidity) continue
    liquidities[address] = liquidity
    result[address] = { usd, change: Number.isFinite(p.priceChange?.h24) ? p.priceChange!.h24! : null, volume: Number.isFinite(p.volume?.h24) ? Math.max(0, p.volume!.h24!) : 0, fetchedAt }
  }
  return result
}


// Shared public quotes survive navigation; never reuse a quote after its display TTL.
const quoteCache = new Map<string, StockQuote>()
try {
 if (typeof localStorage !== 'undefined') {
  const saved=JSON.parse(localStorage.getItem('pocket:xstocks:display-prices:v1') || '{}')
  for (const [address,q] of Object.entries(saved) as [string,StockQuote][]) if (/^0x[0-9a-f]{40}$/.test(address) && Number.isFinite(q?.usd) && q.usd>0 && Number.isFinite(q?.fetchedAt) && q.fetchedAt>0 && q.fetchedAt<=Date.now()+5000) quoteCache.set(address,q)
 }
} catch { /* Invalid stored display prices are ignored. */ }
const attempts = new Map<string, number>()
const pending = new Map<string, Promise<void>>()
async function refreshStockQuotes(addresses: string[]) {
  const now = Date.now()
  const needed = addresses.filter(a => !pending.has(a) && now - (attempts.get(a) || 0) >= 30_000)
  const tasks: Promise<void>[] = []
  for (let i = 0; i < needed.length; i += 100) {
    const batch = needed.slice(i, i + 100)
    batch.forEach(a => attempts.set(a, now))
    const work = (async () => {
      const response = await fetch(pocketApiUrl('/api/pocket/xstocks/prices'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ addresses: batch }), signal: AbortSignal.timeout(12_000), cache: 'no-store' })
      if (!response.ok) throw Error('Quote feed unavailable')
      const body = await response.json()
      if (!body.ok || !body.quotes) throw Error('Invalid price response')
      const quotes = Object.fromEntries(batch.flatMap(a => { const q = body.quotes[a]; return q && Number.isFinite(q.usd) && q.usd > 0 && Number.isFinite(q.fetchedAt) && q.fetchedAt <= Date.now() + 5000 && Date.now() - q.fetchedAt < 60_000 ? [[a, q as StockQuote]] : [] }))
      batch.forEach(a => { if (quotes[a]) quoteCache.set(a, quotes[a]); /* Retain last-known display price on a partial provider response. */ })
      try { localStorage.setItem('pocket:xstocks:display-prices:v1', JSON.stringify(Object.fromEntries(quoteCache))) } catch { /* In-memory prices remain. */ }
    })().finally(() => batch.forEach(a => pending.delete(a)))
    batch.forEach(a => pending.set(a, work)); tasks.push(work)
  }
  await Promise.all([...tasks, ...addresses.flatMap(a => pending.has(a) ? [pending.get(a)!] : [])])
}
export default function usePocketStockQuotes(addresses: string[]): { quotes: Record<string, StockQuote>; displayQuotes: Record<string, StockQuote>; stale: boolean; busy: boolean; error: string; refresh: () => void } {
  const key = [...new Set(addresses.map(a => a.toLowerCase()))].sort().join(',')
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState({ key: '', busy: false, attempted: false, error: '' })
  useEffect(() => {
    let disposed = false, active = false
    const requested = key ? key.split(',') : []
    const tick = async () => {
      if (disposed || document.visibilityState !== 'visible') return
      if (active) { setState(previous => ({ ...previous })); return }
      if (navigator.onLine === false) { setState({ key, busy: false, attempted: true, error: 'You are offline.' }); return }
      active = true
      const work = refreshStockQuotes(requested)
      setState(previous => ({ key, attempted: previous.key === key && previous.attempted, error: previous.key === key ? previous.error : '', busy: requested.some(a => pending.has(a)) }))
      try { await work; if (!disposed) setState({ key, busy: false, attempted: true, error: requested.some(a => !quoteCache.has(a)) ? 'Some stock prices are unavailable.' : '' }) }
      catch { if (!disposed) setState({ key, busy: false, attempted: true, error: 'Prices are temporarily unavailable.' }) }
      finally { active = false }
    }
    void tick()
    const timer = window.setInterval(tick, 5_000)
    window.addEventListener('focus', tick); window.addEventListener('online', tick); document.addEventListener('visibilitychange', tick)
    return () => { disposed = true; window.clearInterval(timer); window.removeEventListener('focus', tick); window.removeEventListener('online', tick); document.removeEventListener('visibilitychange', tick) }
  }, [key, revision])
  const quotes = Object.fromEntries((key ? key.split(',') : []).flatMap(a => { const q = quoteCache.get(a); return q && Date.now() - q.fetchedAt < 60_000 ? [[a, q]] : [] }))
  const displayQuotes = Object.fromEntries((key ? key.split(',') : []).flatMap(a => quoteCache.has(a) ? [[a, quoteCache.get(a)!]] : []))
  return { quotes, displayQuotes, stale: Object.keys(displayQuotes).some(a => !quotes[a]), busy: state.key === key ? state.busy && key.split(',').some(a => !quotes[a]) : !!key, error: state.key === key ? state.error : '', refresh: () => setRevision(n => n + 1) }
}
