import { useCallback, useEffect, useState } from 'react'
import { readPocketFxQuote, type PocketFxQuote } from '../api/pocketFxClient'
import { registerPocketRefreshHandler } from '../lib/pocketRefresh'

const cache = new Map<string, PocketFxQuote>()
const pending = new Map<string, Promise<PocketFxQuote>>()
export default function usePocketFxQuote(balance: number, enabled = true, currency: 'NGN' | 'UGX' = 'NGN') {
  const amount = Number.isFinite(balance) && balance > 0 ? balance.toFixed(6).replace(/\.?0+$/, '') : '1'
  const key = currency + ':' + amount
  const [quote, setQuote] = useState<PocketFxQuote | null>(() => cache.get(key) ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(async () => { setRevision(n => n + 1) }, [])
  useEffect(() => {
    if (!enabled) return
    let active = true
    const update = async () => {
      const saved = cache.get(key)
      if (saved && !saved.stale && saved.expiresAt > Date.now() && Date.now() - saved.quotedAt < 30_000) {
        setQuote(saved); return
      }
      setBusy(true)
      try {
        let request = pending.get(key)
        if (!request) {
          request = readPocketFxQuote(amount, fetch, currency).then(value => { cache.set(key, value); return value }).finally(() => pending.delete(key))
          pending.set(key, request)
        }
        const value = await request
        if (active) { setQuote(value); setError('') }
      } catch (reason) {
        if (active) { setError(reason instanceof Error ? reason.message : 'Live rate is unavailable.'); setQuote(null) }
      } finally { if (active) setBusy(false) }
    }
    void update()
    const visible = () => { if (document.visibilityState === 'visible') void update() }
    const timer = window.setInterval(visible, 30_000)
    window.addEventListener('focus', visible)
    document.addEventListener('visibilitychange', visible)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible) }
  }, [key, amount, currency, enabled, revision])
  useEffect(() => enabled ? registerPocketRefreshHandler(refresh) : undefined, [enabled, refresh])
  useEffect(() => {
    if (!quote || quote.expiresAt <= Date.now()) return
    const timer = window.setTimeout(() => { setQuote(null); void refresh() }, quote.expiresAt - Date.now())
    return () => window.clearTimeout(timer)
  }, [quote, refresh])
  return { quote: enabled && quote?.currency === currency && quote.amount === amount && !quote.stale && quote.expiresAt > Date.now() ? quote : null, busy, error, refresh }
}
