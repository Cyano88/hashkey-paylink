import { useCallback, useEffect, useState } from 'react'
import { readPocketFxQuote, parsePocketFxQuote, type PocketFxQuote } from '../api/pocketFxClient'
import { registerPocketRefreshHandler } from '../lib/pocketRefresh'

const cache = new Map<string, PocketFxQuote>()
const pending = new Map<string, Promise<PocketFxQuote>>()
function cachedQuote(key: string): PocketFxQuote | undefined {
  const memory = cache.get(key)
  if (memory) return memory
  try {
    const raw = localStorage.getItem('pocket:fx:v1:' + key)
    if (!raw) return undefined
    const quote = parsePocketFxQuote({ ok: true, quote: JSON.parse(raw) })
    if (((quote.asset ?? 'USDC') === 'USDT' ? 'USDT:' : '') + quote.currency + ':' + quote.amount !== key) return undefined
    cache.set(key, quote)
    return quote
  } catch { return undefined }
}
export default function usePocketFxQuote(balance: number, enabled = true, currency: 'NGN' | 'UGX' = 'NGN', retainDisplayEstimate = false, asset:'USDC'|'USDT'='USDC') {
  const amount = Number.isFinite(balance) && balance > 0 ? balance.toFixed(6).replace(/\.?0+$/, '') : '1'
  const key = (asset === 'USDT' ? 'USDT:' : '') + currency + ':' + amount
  const [quote, setQuote] = useState<PocketFxQuote | null>(() => cachedQuote(key) ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(async () => { setRevision(n => n + 1) }, [])
  useEffect(() => {
    if (!enabled) return
    let active = true
    setError('')
    setQuote(cachedQuote(key) ?? null)
    const update = async () => {
      const saved = cachedQuote(key)
      if (saved && !saved.stale && saved.expiresAt > Date.now() && Date.now() - saved.quotedAt < 30_000) {
        setQuote(saved); setBusy(false); setError(''); return
      }
      setBusy(true)
      setError('')
      try {
        let request = pending.get(key)
        if (!request) {
          request = readPocketFxQuote(amount, fetch, currency, asset).then(value => { cache.set(key, value); try { if (!value.stale) localStorage.setItem('pocket:fx:v1:' + key, JSON.stringify(value)) } catch { /* Optional display cache. */ } return value }).finally(() => pending.delete(key))
          pending.set(key, request)
        }
        const value = await request
        if (active) { setQuote(value); setError(value.stale ? 'Live FX rate is unavailable.' : '') }
      } catch (reason) {
        if (active) { setError(reason instanceof Error ? reason.message : 'Live rate is unavailable.') }
      } finally { if (active) setBusy(false) }
    }
    void update()
    const visible = () => { if (document.visibilityState === 'visible') void update() }
    const timer = window.setInterval(visible, 30_000)
    window.addEventListener('focus', visible)
    document.addEventListener('visibilitychange', visible)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible) }
  }, [key, amount, currency, asset, enabled, revision])
  useEffect(() => enabled ? registerPocketRefreshHandler(refresh) : undefined, [enabled, refresh])
  useEffect(() => {
    if (!quote || quote.expiresAt <= Date.now()) return
    const timer = window.setTimeout(() => { if (!retainDisplayEstimate) setQuote(null); void refresh() }, quote.expiresAt - Date.now())
    return () => window.clearTimeout(timer)
  }, [quote, refresh, retainDisplayEstimate])
  const visibleQuote = enabled && quote?.currency === currency && (quote.asset ?? 'USDC') === asset && quote.amount === amount && (retainDisplayEstimate || (!quote.stale && quote.expiresAt > Date.now())) ? quote : null
  const loading = enabled && !visibleQuote && (busy || !error)
  return { quote: visibleQuote, loading, busy, error, refresh }
}
