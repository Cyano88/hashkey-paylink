import { useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { POCKET_ROUTES, resolvePocketRoute } from './lib/pocketRoutes'
import PocketActivityPage from './pages/PocketActivityPage'
import PocketAssistantPage from './pages/PocketAssistantPage'
import PocketBillsPage from './pages/PocketBillsPage'
import PocketHomePage from './pages/PocketHomePage'
import PocketLandingPage from './pages/PocketLandingPage'
import PocketMoveBankPage from './pages/PocketMoveBankPage'
import PocketMovePosPage from './pages/PocketMovePosPage'
import PocketMoveUsdcPage from './pages/PocketMoveUsdcPage'
import PocketX402Page from './pages/PocketX402Page'

const POCKET_BASE_PATH = '/pocket'

function pocketRelativePath(pathname: string) {
  if (!pathname.startsWith(POCKET_BASE_PATH)) return pathname
  return pathname.slice(POCKET_BASE_PATH.length) || '/'
}

export default function CirclePocketApp() {
  const location = useLocation()
  const navigate = useNavigate()
  const relativePath = pocketRelativePath(location.pathname)
  const landing = relativePath === '/'
  const route = useMemo(() => landing ? null : resolvePocketRoute(relativePath), [landing, relativePath])

  useEffect(() => {
    if (landing || route) return
    navigate(`${POCKET_BASE_PATH}${POCKET_ROUTES.smartWallet}`, { replace: true })
  }, [landing, navigate, route])

  if (landing) return <PocketLandingPage />

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
