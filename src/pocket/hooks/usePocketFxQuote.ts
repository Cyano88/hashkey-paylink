import { useCallback, useEffect, useRef, useState } from 'react'
import { readPocketFxQuote, type PocketFxQuote } from '../api/pocketFxClient'

const POCKET_FX_REFRESH_INTERVAL_MS = 30_000
const POCKET_FX_FOCUS_THROTTLE_MS = 10_000

let cachedQuote: PocketFxQuote | null = null

function quoteAmount(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '1'
  return value.toFixed(6).replace(/\.?0+$/, '')
}

export default function usePocketFxQuote(balance: number) {
  const amount = quoteAmount(balance)
  const initialQuote = cachedQuote?.amount === amount && cachedQuote.expiresAt > Date.now() ? cachedQuote : null
  const [quote, setQuote] = useState<PocketFxQuote | null>(initialQuote)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const requestInFlight = useRef(false)
  const lastRequestAt = useRef(0)

  const refresh = useCallback(async () => {
    if (requestInFlight.current) return
    requestInFlight.current = true
    lastRequestAt.current = Date.now()
    setBusy(true)
    try {
      const nextQuote = await readPocketFxQuote(amount)
      cachedQuote = nextQuote
      setQuote(nextQuote)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Live FX rate is unavailable.')
    } finally {
      requestInFlight.current = false
      setBusy(false)
    }
  }, [amount])

  useEffect(() => {
    if (!quote) return
    const remaining = quote.expiresAt - Date.now()
    if (remaining <= 0) {
      cachedQuote = null
      setQuote(null)
      return
    }
    const expiry = window.setTimeout(() => {
      cachedQuote = null
      setQuote(null)
    }, remaining)
    return () => window.clearTimeout(expiry)
  }, [quote])

  useEffect(() => {
    const refreshVisibleQuote = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastRequestAt.current < POCKET_FX_FOCUS_THROTTLE_MS) return
      void refresh()
    }

    if (!initialQuote) void refresh()
    const interval = window.setInterval(refreshVisibleQuote, POCKET_FX_REFRESH_INTERVAL_MS)
    window.addEventListener('focus', refreshVisibleQuote)
    document.addEventListener('visibilitychange', refreshVisibleQuote)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshVisibleQuote)
      document.removeEventListener('visibilitychange', refreshVisibleQuote)
    }
  }, [initialQuote, refresh])

  return { quote: quote?.amount === amount ? quote : null, busy, error, refresh }
}
