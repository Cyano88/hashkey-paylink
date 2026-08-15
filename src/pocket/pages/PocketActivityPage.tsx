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
import { readPocketRequests, type PocketRequestItem } from '../api/pocketRequestsClient'

export default function PocketActivityPage({ view }: { view: PocketActivityView }) {
  const navigate = useNavigate()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const activity = usePocketActivity({ authenticated, email, enabled: true, getAccessToken })
  const [requests, setRequests] = useState<PocketRequestItem[]>([])
  const [requestsError, setRequestsError] = useState('')

  useEffect(() => {
    if (!authenticated) { setRequests([]); return }
    let cancelled = false
    ;(async () => {
      try {
        const accessToken = await getAccessToken()
        if (!accessToken) throw new Error('Sign in again to load requests.')
        const next = await readPocketRequests(accessToken)
        if (!cancelled) { setRequests(next); setRequestsError('') }
      } catch (reason) {
        if (!cancelled) setRequestsError(reason instanceof Error ? reason.message : 'Requests could not load.')
      }
    })()
    return () => { cancelled = true }
  }, [authenticated, getAccessToken])

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
