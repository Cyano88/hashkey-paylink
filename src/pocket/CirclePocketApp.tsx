import { lazy, Suspense, useEffect, useMemo, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { POCKET_BASE_PATH, POCKET_ROUTES, resolvePocketRoute } from './lib/pocketRoutes'
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

const PocketActivityPage = lazy(() => import('./pages/PocketActivityPage'))
const PocketAssistantPage = lazy(() => import('./pages/PocketAssistantPage'))
const PocketBillsPage = lazy(() => import('./pages/PocketBillsPage'))
const PocketLandingPage = lazy(() => import('./pages/PocketLandingPage'))
const PocketHomePage = lazy(() => import('./pages/PocketHomePage'))
const PocketProfilePage = lazy(() => import('./pages/PocketProfilePage'))
const PocketVerifyNamePage = lazy(() => import('./pages/PocketVerifyNamePage'))
const PocketDepositPage = lazy(() => import('./pages/PocketDepositPage'))
const PocketSwapPage = lazy(() => import('./pages/PocketSwapPage'))
const PocketSendPage = lazy(() => import('./pages/PocketSendPage'))
const PocketNotificationsPage = lazy(() => import('./pages/PocketNotificationsPage'))
const PocketMoveBankPage = lazy(() => import('./pages/PocketMoveBankPage'))
const PocketMovePosPage = lazy(() => import('./pages/PocketMovePosPage'))
const PocketMoveUsdcPage = lazy(() => import('./pages/PocketMoveUsdcPage'))

function PocketPageBoundary({ active, children }: { active: PocketNavTab; children: ReactNode }) {
  return <Suspense fallback={<PocketLoadingState active={active} />}>{children}</Suspense>
}

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
    if (landing) return <PocketPageBoundary active="home"><PocketLandingPage splashState={splashState} /></PocketPageBoundary>
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

  if (landing) return <PocketPageBoundary active="home"><PocketLandingPage splashState={splashState} /></PocketPageBoundary>

  if (!route) return null

  if (route.section === 'home' && route.view === 'deposit') return <PocketPageBoundary active="home"><PocketDepositPage /></PocketPageBoundary>
  if (route.section === 'home' && route.view === 'send') return <PocketPageBoundary active="home"><PocketSendPage /></PocketPageBoundary>
  if (route.section === 'home' && route.view === 'swap') return <PocketPageBoundary active="home"><PocketSwapPage /></PocketPageBoundary>
  if (route.section === 'home') return <PocketPageBoundary active="home"><PocketHomePage /></PocketPageBoundary>
  if (route.section === 'profile' && route.view === 'verify-name') return <PocketPageBoundary active="profile"><PocketVerifyNamePage /></PocketPageBoundary>
  if (route.section === 'profile') return <PocketPageBoundary active="profile"><PocketProfilePage /></PocketPageBoundary>
  if (route.section === 'notifications') return <PocketPageBoundary active="home"><PocketNotificationsPage /></PocketPageBoundary>
  if (route.section === 'bills') return <PocketPageBoundary active="bills"><PocketBillsPage view={route.view} /></PocketPageBoundary>
  if (route.section === 'activity') return <PocketPageBoundary active="activity"><PocketActivityPage view={route.view} /></PocketPageBoundary>
  if (route.section === 'assistant') return <PocketPageBoundary active="home"><PocketAssistantPage /></PocketPageBoundary>
  if (route.section === 'move' && route.view === 'usdc') return <PocketPageBoundary active="home"><PocketMoveUsdcPage /></PocketPageBoundary>
  if (route.section === 'move' && route.view === 'bank') return <PocketPageBoundary active="home"><PocketMoveBankPage /></PocketPageBoundary>
  if (route.section === 'move' && route.view === 'pos') return <PocketPageBoundary active="home"><PocketMovePosPage /></PocketPageBoundary>

  return null
}
