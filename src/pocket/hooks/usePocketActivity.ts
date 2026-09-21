import { useCallback, useEffect, useRef, useState } from 'react'
import { activityScope, cachedPocketActivity, refreshPocketActivity, subscribePocketActivity } from '../lib/pocketActivityCache'
import { registerPocketRefreshHandler } from '../lib/pocketRefresh'

type PocketAccessTokenReader = () => Promise<string | null>
export async function prefetchPocketActivity({ email, getAccessToken, recent = false, signal }: { email: string; getAccessToken: PocketAccessTokenReader; recent?: boolean; signal?: AbortSignal }) {
  if (signal?.aborted) return
  const scope = activityScope(email)
  const cached = cachedPocketActivity(scope)
  if (cached && Date.now() - cached.savedAt < 15_000 && (recent || cached.full)) return
  return refreshPocketActivity(scope, getAccessToken, recent, () => !signal?.aborted)
}

export default function usePocketActivity({ authenticated, email, enabled, recent = false, getAccessToken }: {
  authenticated: boolean; email: string; enabled: boolean; recent?: boolean; getAccessToken: PocketAccessTokenReader
}) {
  const scope = authenticated ? activityScope(email) : ''
  const [, render] = useState(0)
  const [state, setState] = useState({ scope, busy: false, error: '', attempted: false })
  const current = useRef(scope)
  current.current = scope
  const generation = useRef(0)
  const tokenReader = useRef(getAccessToken)
  tokenReader.current = getAccessToken
  const snapshot = cachedPocketActivity(scope)
  const refresh = useCallback(async (fresh = false) => {
    if (!scope) return
    const epoch = generation.current
    const valid = () => current.current === scope && generation.current === epoch
    if (valid()) setState({ scope, busy: true, error: '', attempted: false })
    try {
      await refreshPocketActivity(scope, () => tokenReader.current(), recent, () => current.current === scope, fresh)
      if (valid()) setState({ scope, busy: false, error: '', attempted: true })
    } catch (reason) {
      if (valid()) setState({ scope, busy: false, attempted: true, error: !navigator.onLine
        ? 'No internet connection. Showing saved activity.'
        : reason instanceof Error ? reason.message : 'Activity could not refresh.' })
    }
  }, [scope, recent])

  useEffect(() => {
    generation.current++
    if (!scope || !enabled) return
    const unsubscribe = subscribePocketActivity(scope, () => render(value => value + 1))
    void refresh()
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    const unregister = registerPocketRefreshHandler(() => refresh(true))
    return () => { generation.current++; unsubscribe(); unregister(); window.removeEventListener('focus', onVisible); document.removeEventListener('visibilitychange', onVisible) }
  }, [enabled, scope, refresh])

  useEffect(() => {
    if (!scope || !enabled) return
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, snapshot?.refreshing ? 2_000 : 20_000)
    return () => window.clearInterval(timer)
  }, [scope, enabled, refresh, snapshot?.refreshing])

  const scoped = state.scope === scope ? state : { busy: false, error: '', attempted: false }
  const hasContent = Boolean(snapshot && (snapshot.payments.length || snapshot.merchants.length || snapshot.collections.length))
  return {
    rows: recent ? snapshot?.payments.slice(0, 4) ?? [] : snapshot?.payments ?? [],
    merchants: snapshot?.merchants ?? [], collections: snapshot?.collections ?? [],
    busy: scoped.busy && !hasContent,
    resolved: !authenticated || hasContent || Boolean(snapshot?.complete) || scoped.attempted,
    error: scoped.error || (snapshot?.partial ? snapshot.refreshing ? 'Activity is updating.' : 'Some activity is still updating. Your saved history is retained.' : ''),
    refresh,
  }
}
