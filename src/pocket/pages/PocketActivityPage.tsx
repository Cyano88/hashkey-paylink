import { useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
import type { PocketActivityRow } from '../models/pocketActivity'

function requestActivityRows(rows: PocketActivityRow[], requests: PocketRequestItem[]) {
  const paidHashes = new Set(requests.filter(request => request.status === 'paid' && request.transactionHash).map(request => request.transactionHash.toLowerCase()))
  const activityRows = rows.filter(row => !row.txHash || !paidHashes.has(row.txHash.toLowerCase()))
  const requestRows = requests.map<PocketActivityRow>(request => ({
    eventId: request.id,
    txHash: request.transactionHash,
    chain: request.network,
    payer: request.direction === 'incoming' ? request.senderName : request.recipientName,
    memo: request.title,
    amount: request.amount,
    ts: request.createdAt,
    source: 'request',
    settlementType: 'pocket_request',
    activityLabel: request.title,
    contextLabel: `${request.direction === 'incoming' ? `From ${request.senderName}` : `To ${request.recipientName}`} · ${request.status === 'pending' ? 'Awaiting response' : request.status.charAt(0).toUpperCase() + request.status.slice(1)}`,
    paycrestStatus: request.status === 'pending' ? 'awaiting response' : request.status,
    direction: request.direction === 'incoming' ? 'out' : 'in',
    recipient: request.direction === 'incoming' ? request.senderName : request.recipientName,
    supportReference: request.id,
  }))
  return [...activityRows, ...requestRows]
}
export default function PocketActivityPage({ view }: { view: PocketActivityView }) {
  const navigate = useNavigate()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const activity = usePocketActivity({ authenticated, email, enabled: true, getAccessToken })
  const [requests, setRequests] = useState<PocketRequestItem[]>([])
  const [requestsError, setRequestsError] = useState('')
  const [requestsResolved, setRequestsResolved] = useState(!authenticated)
  const rowsWithRequests = useMemo(() => requestActivityRows(activity.rows, requests), [activity.rows, requests])

  const refreshRequests = useCallback(async () => {
    if (!authenticated) { setRequests([]); setRequestsResolved(true); return }
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new Error('Sign in again to load requests.')
      const next = await readPocketRequests(accessToken)
      setRequests(next)
      setRequestsError('')
    } catch (reason) {
      setRequestsError(reason instanceof Error ? reason.message : 'Requests could not load.')
    } finally {
      setRequestsResolved(true)
    }
  }, [authenticated, getAccessToken])

  useEffect(() => {
    if (authenticated) setRequestsResolved(false)
    void refreshRequests()
  }, [authenticated, refreshRequests])

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
        rows={rowsWithRequests}
        authenticated={authenticated}
        busy={activity.busy || !requestsResolved}
        error={view === 'all' ? activity.error || requestsError : activity.error}
        onRefund={handleBillsRefund}
      />}
    </PocketRouteShell>
  )
}
