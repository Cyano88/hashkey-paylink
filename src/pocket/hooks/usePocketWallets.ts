import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { CirclePocketWallets } from '../models/pocketWallet'
import { registerPocketRefreshHandler } from '../lib/pocketRefresh'
import usePocketReadScope from './usePocketReadScope'
import { balanceOwner, loadPocketBalance, readCachedPocketBalance, replacePocketBalanceWallets, subscribePocketBalance } from '../lib/pocketBalanceCache'

type Reader = () => Promise<string | null>
export async function prefetchPocketWalletSnapshot({ email, getAccessToken, signal }: { email: string; getAccessToken: Reader; signal?: AbortSignal }) {
  const owner = balanceOwner(email), saved = readCachedPocketBalance(owner)
  if (signal?.aborted || (saved?.totalComplete && Date.now() - saved.savedAt < 10_000)) return
  return loadPocketBalance(owner, getAccessToken, false, () => !signal?.aborted)
}
export async function refreshPocketWalletSnapshot({ email, getAccessToken }: { email: string; getAccessToken: Reader }) {
  return loadPocketBalance(balanceOwner(email), getAccessToken, true)
}

export default function usePocketWallets({ authenticated, email, getAccessToken }: { authenticated: boolean; email: string; getAccessToken: Reader }) {
  const owner = authenticated ? balanceOwner(email) : ''
  const reader = useRef(getAccessToken); reader.current = getAccessToken
  const stableReader = useCallback(() => reader.current(), [])
  const scope = usePocketReadScope(owner, stableReader)
  const failureCount = useRef(0)
  const lastAttemptAt = useRef(0)
  const [, render] = useState(0)
  const [state, setState] = useState({ scope, busy: false, attempted: false, error: '' })
  const snapshot = readCachedPocketBalance(owner)
  const refresh = useCallback(async (fresh = false) => {
    if (!owner || !scope.active) return
    const generation = scope.generation
    const valid = () => scope.active && scope.generation === generation
    lastAttemptAt.current = Date.now()
    setState({ scope, busy: true, attempted: false, error: '' })
    try {
      await loadPocketBalance(owner, stableReader, fresh, valid)
      if (valid()) { failureCount.current = 0; setState({ scope, busy: false, attempted: true, error: '' }) }
    } catch (error) {
      if (valid()) { failureCount.current++; setState({ scope, busy: false, attempted: true, error: error instanceof Error ? error.message : 'Try refreshing balances again.' }) }
    }
  }, [owner, scope, stableReader])
  const refreshBalances = useCallback(() => refresh(true), [refresh])
  const setWallets: Dispatch<SetStateAction<CirclePocketWallets>> = useCallback(next => {
    if (!owner || !scope.active) return
    const previous = readCachedPocketBalance(owner)?.wallets ?? {}
    void replacePocketBalanceWallets(owner, typeof next === 'function' ? next(previous) : next)
  }, [owner, scope])
  const setError: Dispatch<SetStateAction<string>> = useCallback(value => {
    if (scope.active) setState(previous => ({ ...previous, scope, error: typeof value === 'function' ? value(previous.scope === scope ? previous.error : '') : value }))
  }, [scope])

  useEffect(() => {
    if (!owner) return
    const unsubscribe = subscribePocketBalance(owner, () => render(value => value + 1))
    void refresh()
    const onFocus = () => {
      const saved = readCachedPocketBalance(owner)
      if (document.visibilityState === 'visible' && Date.now() - lastAttemptAt.current >= 10_000 && (!saved?.totalComplete || Date.now() - saved.savedAt >= 10_000)) void refresh()
    }
    const unregister = registerPocketRefreshHandler(refreshBalances)
    window.addEventListener('focus', onFocus); document.addEventListener('visibilitychange', onFocus)
    return () => { unsubscribe(); unregister(); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus) }
  }, [owner, scope, refresh, refreshBalances])
  useEffect(() => {
    if (!owner) return
    // No RPC while hidden. Failures back off to 60s; user refresh remains immediate.
    const delay = snapshot?.totalComplete ? 45_000 : Math.min(60_000, 15_000 * 2 ** Math.max(0, failureCount.current - 1))
    const timer = window.setTimeout(() => { if (document.visibilityState === 'visible') void refresh() }, delay)
    return () => window.clearTimeout(timer)
  }, [owner, refresh, snapshot?.totalComplete, state])

  const active = state.scope === scope ? state : { busy: false, attempted: false, error: '' }
  const stale = Boolean(snapshot?.displayRows.some(row => row.stale))
  const observed = snapshot?.displayRows.filter(row => row.known).map(row => row.observedAt || 0) ?? []
  return { wallets: snapshot?.wallets ?? {}, setWallets,
    rows: snapshot?.rows ?? [], total: snapshot?.total ?? 0, totalComplete: snapshot?.totalComplete ?? false,
    displayRows: snapshot?.displayRows ?? [], displayTotal: snapshot?.displayTotal ?? 0, displayComplete: snapshot?.displayComplete ?? false,
    balanceStale: stale, balanceObservedAt: observed.length ? Math.min(...observed) : 0,
    balanceBusy: active.busy, resolved: !authenticated || Boolean(snapshot) || active.attempted,
    error: active.error, setError, refreshBalances,
    walletUpdate: snapshot?.walletUpdate === 'resume' ? 'resume' as const : active.error ? 'hidden' as const : snapshot?.walletUpdate ?? 'hidden' as const,
  }
}
