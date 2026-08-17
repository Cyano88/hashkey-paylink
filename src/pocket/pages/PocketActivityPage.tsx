import { useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useState } from 'react'
import type { PocketNavTab } from '../components/PocketBottomNav'
import PocketRouteShell from '../components/PocketRouteShell'
import PocketLoadingState from '../components/PocketLoadingState'
import PocketActivityPanel from '../features/activity/PocketActivityPanel'
import PocketResourceActivityPanel from '../features/activity/PocketResourceActivityPanel'
import usePocketActivity from '../hooks/usePocketActivity'
import usePocketIdentity from '../hooks/usePocketIdentity'
import { POCKET_BASE_PATH, pocketPathFor, type PocketActivityView } from '../lib/pocketRoutes'
import { processPocketBillRefund } from '../api/pocketBillsClient'
import { POCKET_REQUESTS_UPDATED_EVENT, readPocketRequests, type PocketRequestItem } from '../api/pocketRequestsClient'
import { registerPocketRefreshHandler } from '../lib/pocketRefresh'

export default function PocketActivityPage({ view }: { view: PocketActivityView }) {
  const navigate = useNavigate()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const activity = usePocketActivity({ authenticated, email, enabled: true, getAccessToken })
  const [requests, setRequests] = useState<PocketRequestItem[]>([])
  const [requestsError, setRequestsError] = useState('')

  const refreshRequests = useCallback(async () => {
    if (!authenticated) { setRequests([]); return }
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new Error('Sign in again to load requests.')
      const next = await readPocketRequests(accessToken)
      setRequests(next)
      setRequestsError('')
    } catch (reason) {
      setRequestsError(reason instanceof Error ? reason.message : 'Requests could not load.')
    }
  }, [authenticated, getAccessToken])

  useEffect(() => {
    void refreshRequests()
  }, [refreshRequests])

  useEffect(() => {
    if (!authenticated) return
    const refresh = () => { void refreshRequests() }
    const unregister = registerPocketRefreshHandler(refreshRequests)
    window.addEventListener(POCKET_REQUESTS_UPDATED_EVENT, refresh)
    return () => { unregister(); window.removeEventListener(POCKET_REQUESTS_UPDATED_EVENT, refresh) }
  }, [authenticated, refreshRequests])

  const handleBillsRefund = useCallback(async (intentId: string) => {
    const accessToken = await getAccessToken()
    if (!accessToken) throw new Error('Sign in again to claim this refund.')
    let result = await processPocketBillRefund({ accessToken, intentId })
    for (let attempt = 0; attempt < 6 && result.intent.state !== 'refunded'; attempt += 1) {
      await new Promise(resolve => window.setTimeout(resolve, 2_500))
      try {
        result = await processPocketBillRefund({ accessToken, intentId })
      } catch {
        break
      }
    }
    await activity.refresh()
    return result.intent.state
  }, [activity.refresh, getAccessToken])

  const selectNav = (tab: PocketNavTab) => {
    const path = tab === 'home'
        ? pocketPathFor({ section: 'home', view: 'overview' })
        : tab === 'profile'
        ? pocketPathFor({ section: 'profile', view: 'details' })
        : tab === 'bills'
          ? pocketPathFor({ section: 'bills', view: 'airtime' })
          : pocketPathFor({ section: 'activity', view })
    navigate(`${POCKET_BASE_PATH}${path}`)
  }

  if (authenticated && !activity.resolved) return <PocketLoadingState active="activity" />

  return (
    <PocketRouteShell active="activity" onSelect={selectNav}>
      {view === 'pos' || view === 'collections' ? <PocketResourceActivityPanel
        view={view}
        rows={activity.rows}
        merchants={activity.merchants}
        collections={activity.collections}
        requests={requests}
        busy={activity.busy}
        error={view === 'collections' ? activity.error || requestsError : activity.error}
      /> : <PocketActivityPanel
        view={view}
        rows={activity.rows}
        authenticated={authenticated}
        busy={activity.busy}
        error={activity.error}
        onRefund={handleBillsRefund}
      />}
    </PocketRouteShell>
  )
}
