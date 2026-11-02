import {readPocketBridgeTransfers,POCKET_BRIDGES_UPDATED} from '../lib/pocketPendingBridge'
import {mergePocketBridgeActivity} from '../lib/pocketBridgeActivity'
import {mergePocketOperations,readPocketOperations,POCKET_OPERATIONS_UPDATED} from '../lib/pocketOperationRecovery'
import {collapsePocketAssetMoves} from '../lib/pocketAssetMoveActivity'
import { personalPocketActivity } from '../lib/pocketPurchaseKind'
import {readSendAttempts,mergeSendActivity,POCKET_SENDS_UPDATED} from '../lib/pocketSendAttempts'
import { pocketActivityArchiveKey } from '../lib/pocketActivityArchive'
import { isIncomingPosPayment } from '../lib/pocketPurchaseKind'
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
  const followups = useRef(0)
  const lastStarted = useRef(0)
  const snapshot = cachedPocketActivity(scope)
  const refresh = useCallback(async (fresh = false, observe = false) => {
    if (!scope) return
    if (!observe) { followups.current = 0; lastStarted.current = Date.now() }
    const epoch = generation.current
    const valid = () => current.current === scope && generation.current === epoch
    if (valid()) setState({ scope, busy: true, error: '', attempted: false })
    try {
      await refreshPocketActivity(scope, () => tokenReader.current(), recent, valid, fresh, observe)
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
    const onVisible = () => { if (document.visibilityState === 'visible' && Date.now() - lastStarted.current >= 30_000) void refresh() }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    const unregister = registerPocketRefreshHandler(() => refresh(true))
    return () => { generation.current++; unsubscribe(); unregister(); window.removeEventListener('focus', onVisible); document.removeEventListener('visibilitychange', onVisible) }
  }, [enabled, scope, refresh])

  // Observe completion of the one requested refresh. These reads cannot start
  // another provider scan, and stop after five attempts or when the app hides.
  useEffect(() => {
    if (!scope || !enabled || !snapshot?.refreshing || state.busy || followups.current >= 5) return
    const timer = window.setTimeout(() => {
      if (document.visibilityState !== 'visible') return
      followups.current++
      void refresh(false, true)
    }, 2_000)
    return () => window.clearTimeout(timer)
  }, [scope, enabled, refresh, snapshot?.refreshing, snapshot?.savedAt, state.busy])

  useEffect(()=>{const update=()=>render(value=>value+1);window.addEventListener(POCKET_BRIDGES_UPDATED,update);window.addEventListener(POCKET_SENDS_UPDATED,update);window.addEventListener(POCKET_OPERATIONS_UPDATED,update);return()=>{window.removeEventListener(POCKET_BRIDGES_UPDATED,update);window.removeEventListener(POCKET_SENDS_UPDATED,update);window.removeEventListener(POCKET_OPERATIONS_UPDATED,update)}},[])
  let localError=''
  let rows=snapshot?.payments??[]
  if(authenticated)try{rows=collapsePocketAssetMoves(mergePocketOperations(mergeSendActivity(rows,readSendAttempts(email)),readPocketOperations(email)))}catch{localError='Some saved transfers could not be loaded.'}
  if(authenticated)try{rows=mergePocketBridgeActivity(rows,readPocketBridgeTransfers(email,localStorage))}catch{localError='Some saved bridges could not be loaded.'}
  // Apply grouping last: local Earn recovery can reintroduce raw token logs.
  rows=collapsePocketAssetMoves(rows)
  const scoped = state.scope === scope ? state : { busy: false, error: '', attempted: false }
  const hasContent = Boolean(rows.length || snapshot?.merchants.length || snapshot?.collections.length)
  const awaitingRefresh = Boolean(snapshot?.refreshing && followups.current < 5 && !scoped.error)
  return {
    rows: recent ? personalPocketActivity(rows).filter(row=>!isIncomingPosPayment(row)&&!snapshot?.archivedKeys?.includes(pocketActivityArchiveKey(row))).slice(0,4):rows,
    archivedKeys: snapshot?.archivedKeys ?? [],
    merchants: snapshot?.merchants ?? [], collections: snapshot?.collections ?? [],
    busy: (scoped.busy || awaitingRefresh) && !hasContent,
    resolved: !authenticated || hasContent || Boolean(snapshot?.complete) || (scoped.attempted && !awaitingRefresh),
    error: localError || scoped.error || (snapshot?.partial && !awaitingRefresh ? 'Some activity could not be updated. Pull to refresh.' : ''),
    refresh,
  }
}
