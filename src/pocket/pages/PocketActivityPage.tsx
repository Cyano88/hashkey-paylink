import PocketCollectionsPage from './PocketCollectionsPage'
import { requestActivityRows } from '../lib/pocketRequestActivity'
import PocketRequestHistory from '../features/activity/PocketRequestHistory'
import PocketFlowHeader from '../components/PocketFlowHeader'
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


export default function PocketActivityPage({ view }: { view: PocketActivityView }) {
  const location = useLocation()
  if (view === 'pos') return <Navigate replace to={POCKET_BASE_PATH + POCKET_ROUTES.posManage + location.search} />
  if (view === 'collections' && new URLSearchParams(location.search).get('kind') !== 'requests') return <PocketCollectionsPage />
  return <PocketTransactionsPage view={view} />
}
function PocketTransactionsPage({ view }: { view: PocketActivityView }) {
  const location = useLocation()
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
  const [requestsBusy, setRequestsBusy] = useState(authenticated)
  const rowsWithRequests = useMemo(() => requestActivityRows(bridges.rows, requestsScope === requestScope ? requests : []), [bridges.rows, requests, requestsScope, requestScope])

  const refreshRequests = useCallback(async () => {
    const sequence = ++requestSequence.current
    const valid = () => activeRequestScope.current === requestScope && sequence === requestSequence.current
    if (!authenticated) { setRequests([]); setRequestsBusy(false); return }
    setRequestsBusy(true)
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
    } finally { if (valid()) setRequestsBusy(false) }
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
    const refreshVisible = () => { if (document.visibilityState === 'visible') refresh() }
    const timer = window.setInterval(refreshVisible, 30_000)
    window.addEventListener(POCKET_REQUESTS_UPDATED_EVENT, refresh)
    window.addEventListener('focus', refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    return () => { unregister(); window.clearInterval(timer); window.removeEventListener(POCKET_REQUESTS_UPDATED_EVENT, refresh); window.removeEventListener('focus', refreshVisible); document.removeEventListener('visibilitychange', refreshVisible) }
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
    await activity.refresh(true)
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

  if (view !== 'collections' && authenticated && !activity.resolved && !bridges.rows.length) return <PocketLoadingState active="activity" />

  return (
    <PocketRouteShell active="activity" onSelect={selectNav}>
      {view === 'collections' ? <>
        <PocketFlowHeader centered title="Requests" onBack={() => location.search.includes('collection=') ? navigate(POCKET_BASE_PATH + '/activity/collections?kind=requests', {replace:true}) : navigate(POCKET_BASE_PATH + POCKET_ROUTES.usdc + '?flow=request')} />
        <PocketRequestHistory key={requestScope} rows={rowsWithRequests} requests={requestsScope === requestScope ? requests : []} busy={requestsBusy} error={requestsError} onRefresh={refreshRequests} />
      </> : <PocketActivityPanel
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
      />}
    </PocketRouteShell>
  )
}
