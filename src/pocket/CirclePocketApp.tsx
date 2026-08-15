import { useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { POCKET_BASE_PATH, POCKET_ROUTES, resolvePocketRoute } from './lib/pocketRoutes'
import PocketActivityPage from './pages/PocketActivityPage'
import PocketAssistantPage from './pages/PocketAssistantPage'
import PocketBillsPage from './pages/PocketBillsPage'
import PocketLandingPage from './pages/PocketLandingPage'
import PocketHomePage from './pages/PocketHomePage'
import PocketProfilePage from './pages/PocketProfilePage'
import PocketVerifyNamePage from './pages/PocketVerifyNamePage'
import PocketDepositPage from './pages/PocketDepositPage'
import PocketSwapPage from './pages/PocketSwapPage'
import PocketSendPage from './pages/PocketSendPage'
import PocketNotificationsPage from './pages/PocketNotificationsPage'
import PocketMoveBankPage from './pages/PocketMoveBankPage'
import PocketMovePosPage from './pages/PocketMovePosPage'
import PocketMoveUsdcPage from './pages/PocketMoveUsdcPage'
import PocketLoadingState from './components/PocketLoadingState'
import type { PocketNavTab } from './components/PocketBottomNav'
import usePocketIdentity from './hooks/usePocketIdentity'
import usePocketSessionSplash from './hooks/usePocketSessionSplash'
import usePocketProfile from './hooks/usePocketProfile'
import { prefetchPocketWalletSnapshot } from './hooks/usePocketWallets'
import { prefetchPocketActivity } from './hooks/usePocketActivity'
import { readPocketBankWithdrawStatus } from './api/pocketBankWithdrawClient'
import { clearActivePocketBankPayout, readActivePocketBankPayout } from './lib/pocketBankPayoutState'
import { registerPocketRefreshHandler } from './lib/pocketRefresh'

function pocketRelativePath(pathname: string) {
  if (!POCKET_BASE_PATH || !pathname.startsWith(POCKET_BASE_PATH)) return pathname
  return pathname.slice(POCKET_BASE_PATH.length) || '/'
}

export default function CirclePocketApp() {
  const location = useLocation()
  const navigate = useNavigate()
  const relativePath = pocketRelativePath(location.pathname)
  const landing = relativePath === '/'
  const route = useMemo(() => landing ? null : resolvePocketRoute(relativePath), [landing, relativePath])
  const { ready, authenticated, email, getAccessToken } = usePocketIdentity()
  const profile = usePocketProfile({ authenticated, email, getAccessToken })
  const splashState = usePocketSessionSplash(landing)

  useEffect(() => {
    if (!authenticated || !email) return
    return registerPocketRefreshHandler(profile.reload)
  }, [authenticated, email, profile.reload])

  useEffect(() => {
    if (!ready || !authenticated || !email) return
    void Promise.allSettled([
      prefetchPocketWalletSnapshot({ email, getAccessToken }),
      prefetchPocketActivity({ email, getAccessToken }),
    ])
  }, [authenticated, email, getAccessToken, ready])

  useEffect(() => {
    if (!ready || !authenticated) return
    let checking = false
    const reconcile = async () => {
      const intentId = readActivePocketBankPayout()
      if (!intentId || checking || document.visibilityState !== 'visible') return
      checking = true
      try {
        const accessToken = await getAccessToken()
        if (!accessToken) return
        const payout = await readPocketBankWithdrawStatus({ accessToken, intentId })
        if (payout.state === 'sent' || payout.state === 'refunded' || payout.state === 'failed') clearActivePocketBankPayout(intentId)
      } catch {
        // Keep the active payout for the next quiet reconciliation attempt.
      } finally {
        checking = false
      }
    }
    void reconcile()
    const interval = window.setInterval(reconcile, 15_000)
    const refreshVisible = () => { if (document.visibilityState === 'visible') void reconcile() }
    window.addEventListener('focus', refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshVisible)
      document.removeEventListener('visibilitychange', refreshVisible)
    }
  }, [authenticated, getAccessToken, ready])

  useEffect(() => {
    if (landing || route) return
    navigate(`${POCKET_BASE_PATH}${POCKET_ROUTES.home}`, { replace: true })
  }, [landing, navigate, route])

  if (!ready) {
    if (landing) return <PocketLandingPage splashState={splashState} />
    const active: PocketNavTab = route?.section === 'home'
      ? 'home'
      : route?.section === 'profile'
      ? 'profile'
      : route?.section === 'bills'
        ? 'bills'
        : route?.section === 'activity'
          ? 'activity'
          : 'home'
    return <PocketLoadingState active={active} />
  }

  if (landing) return <PocketLandingPage splashState={splashState} />

  if (authenticated && (!profile.loaded || profile.busy && !profile.profile)) {
    const active: PocketNavTab = route?.section === 'profile' ? 'profile' : route?.section === 'bills' ? 'bills' : route?.section === 'activity' ? 'activity' : 'home'
    return <PocketLoadingState active={active} />
  }

  if (!route) return null

  if (route.section === 'home' && route.view === 'deposit') return <PocketDepositPage />
  if (route.section === 'home' && route.view === 'send') return <PocketSendPage />
  if (route.section === 'home' && route.view === 'swap') return <PocketSwapPage />
  if (route.section === 'home') return <PocketHomePage />
  if (route.section === 'profile' && route.view === 'verify-name') return <PocketVerifyNamePage />
  if (route.section === 'profile') return <PocketProfilePage />
  if (route.section === 'notifications') return <PocketNotificationsPage />
  if (route.section === 'bills') return <PocketBillsPage view={route.view} />
  if (route.section === 'activity') return <PocketActivityPage view={route.view} />
  if (route.section === 'assistant') return <PocketAssistantPage />
  if (route.section === 'move' && route.view === 'usdc') return <PocketMoveUsdcPage />
  if (route.section === 'move' && route.view === 'bank') return <PocketMoveBankPage />
  if (route.section === 'move' && route.view === 'pos') return <PocketMovePosPage />

  return null
}
