import { useEffect, useMemo, useState } from 'react'
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
import { CPurseIcon } from './components/CPurseIcon'
import usePocketIdentity from './hooks/usePocketIdentity'
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
  const [appReady, setAppReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!ready) {
      setAppReady(false)
      return () => { cancelled = true }
    }

    setAppReady(false)
    void (async () => {
      const fontsReady = document.fonts?.ready ?? Promise.resolve()
      const pocketDataReady = authenticated && email
        ? prefetchPocketWalletSnapshot({ email, getAccessToken })
        : Promise.resolve()
      await Promise.allSettled([fontsReady, pocketDataReady])
      await new Promise<void>(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())))
      if (!cancelled) setAppReady(true)
    })()

    return () => { cancelled = true }
  }, [authenticated, email, getAccessToken, ready])

  useEffect(() => {
    if (landing || route) return
    navigate(`${POCKET_BASE_PATH}${POCKET_ROUTES.smartWallet}`, { replace: true })
  }, [landing, navigate, route])

  if (!ready || !appReady) {
    return (
      <div className="flex h-full min-h-[100dvh] w-full items-center justify-center bg-[#F5F5F7] text-gray-950 dark:bg-[#0A0A0A] dark:text-white" aria-label="Restoring Pocket session">
        <div className="text-center">
          <CPurseIcon size={64} title="" className="mx-auto opacity-90" />
          <span className="mx-auto mt-5 block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-50" />
          <p className="mt-3 text-xs font-semibold text-gray-400 dark:text-white/40">Restoring your Pocket</p>
        </div>
      </div>
    )
  }

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
