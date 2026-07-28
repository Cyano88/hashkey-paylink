import { useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { POCKET_BASE_PATH, POCKET_ROUTES, resolvePocketRoute } from './lib/pocketRoutes'
import PocketActivityPage from './pages/PocketActivityPage'
import PocketAssistantPage from './pages/PocketAssistantPage'
import PocketBillsPage from './pages/PocketBillsPage'
import PocketHomePage from './pages/PocketHomePage'
import PocketLandingPage from './pages/PocketLandingPage'
import PocketMoveBankPage from './pages/PocketMoveBankPage'
import PocketMovePosPage from './pages/PocketMovePosPage'
import PocketMoveUsdcPage from './pages/PocketMoveUsdcPage'
import PocketX402Page from './pages/PocketX402Page'
import PocketLoadingState from './components/PocketLoadingState'
import type { PocketNavTab } from './components/PocketBottomNav'
import usePocketIdentity from './hooks/usePocketIdentity'
import usePocketSessionSplash from './hooks/usePocketSessionSplash'
import { prefetchPocketWalletSnapshot } from './hooks/usePocketWallets'

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
  const splashState = usePocketSessionSplash(landing)

  useEffect(() => {
    if (!ready || !authenticated || !email) return
    void prefetchPocketWalletSnapshot({ email, getAccessToken }).catch(() => undefined)
  }, [authenticated, email, getAccessToken, ready])

  useEffect(() => {
    if (landing || route) return
    navigate(`${POCKET_BASE_PATH}${POCKET_ROUTES.smartWallet}`, { replace: true })
  }, [landing, navigate, route])

  if (!ready) {
    if (landing) return <PocketLandingPage splashState={splashState} />
    const active: PocketNavTab = route?.section === 'move'
      ? 'move'
      : route?.section === 'bills'
        ? 'bills'
        : route?.section === 'activity'
          ? 'activity'
          : 'home'
    return <PocketLoadingState active={active} />
  }

  if (landing) return <PocketLandingPage splashState={splashState} />

  if (!route) return null

  if (route.section === 'bills') return <PocketBillsPage view={route.view} />
  if (route.section === 'activity') return <PocketActivityPage view={route.view} />
  if (route.section === 'assistant') return <PocketAssistantPage />
  if (route.section === 'home' && route.view === 'smart-wallet') return <PocketHomePage />
  if (route.section === 'home' && route.view === 'x402') return <PocketX402Page />
  if (route.section === 'move' && route.view === 'usdc') return <PocketMoveUsdcPage />
  if (route.section === 'move' && route.view === 'bank') return <PocketMoveBankPage />
  if (route.section === 'move' && route.view === 'pos') return <PocketMovePosPage />

  return null
}
