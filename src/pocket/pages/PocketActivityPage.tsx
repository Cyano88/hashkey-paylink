import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PocketNavTab } from '../components/PocketBottomNav'
import PocketRouteShell from '../components/PocketRouteShell'
import PocketLoadingState from '../components/PocketLoadingState'
import PocketActivityPanel from '../features/activity/PocketActivityPanel'
import usePocketActivity from '../hooks/usePocketActivity'
import usePocketBridgeActivity from '../hooks/usePocketBridgeActivity'
import usePocketWalletController from '../controllers/usePocketWalletController'
import usePocketIdentity from '../hooks/usePocketIdentity'
import { POCKET_BASE_PATH, POCKET_ROUTES, pocketPathFor, type PocketActivityView } from '../lib/pocketRoutes'
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
  const location = useLocation()
  if (view === 'pos') return <Navigate replace to={POCKET_BASE_PATH + POCKET_ROUTES.posManage + location.search} />
  return <PocketTransactionsPage view={view} />
}
function PocketTransactionsPage({ view }: { view: PocketActivityView }) {
  const navigate = useNavigate()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const activity = usePocketActivity({ authenticated, email, enabled: true, getAccessToken })
  const walletController = usePocketWalletController({ authenticated, email, getAccessToken })
  const bridges = usePocketBridgeActivity({ owner: email, authenticated, rows: activity.rows, getAccessToken, getEvmSession: walletController.getEvmSession })
  const requestScope = authenticated ? email.trim().toLowerCase() : ''
  const activeRequestScope = useRef(requestScope)
  activeRequestScope.current = requestScope
  const requestSequence = useRef(0)
  const [requestsScope, setRequestsScope] = useState(requestScope)
  const [requests, setRequests] = useState<PocketRequestItem[]>([])
  const [requestsError, setRequestsError] = useState('')
  const rowsWithRequests = useMemo(() => requestActivityRows(bridges.rows, requestsScope === requestScope ? requests : []), [bridges.rows, requests, requestsScope, requestScope])

  const refreshRequests = useCallback(async () => {
    const sequence = ++requestSequence.current
    const valid = () => activeRequestScope.current === requestScope && sequence === requestSequence.current
    if (!authenticated) { setRequests([]); return }
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new Error('Sign in again to load requests.')
      const next = await readPocketRequests(accessToken)
      if (!valid()) return
      setRequestsScope(requestScope)
      setRequests(next)
      setRequestsError('')
    } catch (reason) {
      if (!valid()) return
      setRequestsError(reason instanceof Error ? reason.message : 'Requests could not load.')
    }
  }, [authenticated, getAccessToken, requestScope])

  useEffect(() => {
    setRequestsError('')
    void refreshRequests()
    return () => { requestSequence.current++ }
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
          ? pocketPathFor({ section: 'bills', view: 'overview' })
          : pocketPathFor({ section: 'activity', view })
    navigate(`${POCKET_BASE_PATH}${path}`)
  }

  if (authenticated && !activity.resolved && !bridges.rows.length) return <PocketLoadingState active="activity" />

  return (
    <PocketRouteShell active="activity" onSelect={selectNav}>
      <PocketActivityPanel
        view={view}
        rows={rowsWithRequests}
        archivedKeys={activity.archivedKeys}
        authenticated={authenticated}
        busy={activity.busy}
        error={view === 'all' ? activity.error || requestsError || bridges.error : activity.error}
        onRefund={handleBillsRefund}
        onBridgeCheck={bridges.check}
        bridgeChecking={bridges.isChecking}
        bridgeMessages={bridges.messages}
        onNewBridge={() => navigate(POCKET_BASE_PATH + pocketPathFor({ section: 'home', view: 'swap' }))}
      />
    </PocketRouteShell>
  )
}
