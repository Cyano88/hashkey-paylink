import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Address } from 'viem'
import { readStockDisplayCache, saveStockDisplayCache } from '../lib/pocketStockDisplayCache'
import { stockBalanceCache } from '../lib/pocketStockBalanceCache'
import { readRemoteStockBalances } from '../api/pocketStockBalanceClient'
import type { StockBalanceSnapshot } from '../lib/pocketXStocksWallet'
import { registerPocketRefreshHandler } from '../lib/pocketRefresh'

export default function usePocketStockBalances(ownerKey: string, address: Address | undefined, getAccessToken: () => Promise<string | null>) {
  const reader = useCallback((owner: Address, _previous?: StockBalanceSnapshot, signal?: AbortSignal, options?: { force?: boolean }) => readRemoteStockBalances(getAccessToken, owner, signal, options?.force), [getAccessToken])
  const restored = useMemo(() => address ? readStockDisplayCache(ownerKey) : undefined, [ownerKey, address])
  const [, render] = useState(0)
  const refresh = useCallback(async () => { if (address) await stockBalanceCache.load(ownerKey, address, true, reader) }, [ownerKey, address, reader])
  useEffect(() => {
    if (!address) return
    const unsubscribe = stockBalanceCache.subscribe(ownerKey, () => render(n => n + 1))
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      render(n => n + 1) // Enforce expiry even when offline or a request fails.
      if (navigator.onLine === false) return
      void stockBalanceCache.load(ownerKey, address, false, reader)
    }
    tick()
    const timer = window.setInterval(tick, 5_000)
    const unregister = registerPocketRefreshHandler(refresh)
    window.addEventListener('focus', tick); window.addEventListener('online', tick); document.addEventListener('visibilitychange', tick)
    return () => { unsubscribe(); unregister(); window.clearInterval(timer); window.removeEventListener('focus', tick); window.removeEventListener('online', tick); document.removeEventListener('visibilitychange', tick) }
  }, [ownerKey, address, refresh, reader])
  const current = address ? stockBalanceCache.peek(ownerKey) : { snapshot: undefined, displaySnapshot: undefined, stale: false, error: '', busy: false }
  const display = current.displaySnapshot || restored
  useEffect(() => { if (current.snapshot) saveStockDisplayCache(ownerKey, current.snapshot) }, [ownerKey, current.snapshot])
  return { displaySnapshot: display ? { ...display, key: ownerKey } : null, balanceStale: current.stale || (!!display && !current.snapshot), snapshot: current.snapshot ? { ...current.snapshot, key: ownerKey } : null, balanceError: navigator.onLine === false ? 'You are offline.' : current.error, balanceBusy: current.busy, refresh }
}
