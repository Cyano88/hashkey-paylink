import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { useLocation, useNavigate } from 'react-router-dom'
import { isPocketNativeRuntime, POCKET_BASE_PATH, POCKET_ROUTES, resolvePocketRoute } from './lib/pocketRoutes'
import PocketLoadingState from './components/PocketLoadingState'
import PocketSessionSplash from './components/PocketSessionSplash'
import type { PocketNavTab } from './components/PocketBottomNav'
import usePocketIdentity from './hooks/usePocketIdentity'
import usePocketSessionSplash from './hooks/usePocketSessionSplash'
import usePocketProfile from './hooks/usePocketProfile'
import usePocketPushNotifications from './hooks/usePocketPushNotifications'
import { prefetchPocketWalletSnapshot, refreshPocketWalletSnapshot } from './hooks/usePocketWallets'
import { prefetchPocketActivity } from './hooks/usePocketActivity'
import { readPocketBankWithdrawStatus } from './api/pocketBankWithdrawClient'
import { clearActivePocketBankPayout, readActivePocketBankPayout, readActivePocketBankPayoutTransfer } from './lib/pocketBankPayoutState'
import { registerPocketRefreshHandler } from './lib/pocketRefresh'
import { POCKET_NATIVE_BACK_EVENT } from './lib/pocketNativeBack'
import { unlockPocketBaseWallet } from './controllers/usePocketWalletController'

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

function PocketWalletUnlockScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return <main className='fixed inset-0 z-[60] flex items-center justify-center bg-[#F5F5F7] px-6 text-gray-950 dark:bg-[#0A0A0A] dark:text-white'>
    <section className='w-full max-w-[390px] rounded-[28px] border border-gray-200 bg-white p-6 text-center shadow-xl dark:border-white/10 dark:bg-[#17181c]'>
      <span className='mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-xl dark:bg-blue-400/10'>◎</span>
      <h1 className='mt-4 text-xl font-black tracking-tight'>{error ? 'Unlock your Pocket wallets' : 'Opening your Pocket wallets'}</h1>
      <p className='mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400'>{error || 'Complete the Circle wallet check once, then Pocket can prepare requests, deposits, and payments without interrupting you later.'}</p>
      {error ? <button type='button' onClick={onRetry} className='mt-5 min-h-14 w-full rounded-full bg-gray-950 px-5 text-sm font-bold text-white dark:bg-white dark:text-gray-950'>Try wallet unlock again</button> : <span className='mx-auto mt-5 block h-3 w-3 animate-pulse rounded-full bg-blue-600' aria-label='Unlocking Circle wallet' />}
    </section>
  </main>
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
  usePocketPushNotifications({ ready, authenticated, getAccessToken, navigate })
  const profile = usePocketProfile({ authenticated, email, getAccessToken })
  const unlockedEmail = useRef('')
  const [walletUnlockAttempt, setWalletUnlockAttempt] = useState(0)
  const [walletUnlockState, setWalletUnlockState] = useState<'ready' | 'unlocking' | 'error'>('ready')
  const [walletUnlockError, setWalletUnlockError] = useState('')
  const [initialDataReady, setInitialDataReady] = useState(false)
  const sessionResolved = ready && (!authenticated || (
    profile.loaded
    && !profile.busy
    && !profile.loadError
    && Boolean(profile.profile)
    && initialDataReady
  ))
  const [launchSurface] = useState(() => landing || isPocketNativeRuntime())
  const splashState = usePocketSessionSplash(launchSurface, sessionResolved)

  useEffect(() => {
    if (!ready || !authenticated || !email) {
      unlockedEmail.current = ''
      setWalletUnlockState('ready')
      setWalletUnlockError('')
      return
    }
    if (unlockedEmail.current === email) {
      setWalletUnlockState('ready')
      return
    }
    let active = true
    setWalletUnlockState('unlocking')
    setWalletUnlockError('')
    void unlockPocketBaseWallet({ authenticated, email, getAccessToken })
      .then(async () => {
        await refreshPocketWalletSnapshot({ email, getAccessToken }).catch(() => undefined)
        if (!active) return
        unlockedEmail.current = email
        setWalletUnlockState('ready')
      })
      .catch(reason => {
        if (!active) return
        setWalletUnlockState('error')
        setWalletUnlockError(reason instanceof Error ? reason.message : 'Circle wallet unlock did not complete.')
      })
    return () => { active = false }
  }, [authenticated, email, getAccessToken, ready, walletUnlockAttempt])

  useEffect(() => {
    if (!isPocketNativeRuntime()) return
    let disposed = false
    let remove: (() => Promise<void>) | undefined
    void CapacitorApp.addListener('backButton', () => {
      const event = new Event(POCKET_NATIVE_BACK_EVENT, { cancelable: true })
      if (!window.dispatchEvent(event)) return
      if (landing || route?.section === 'home' && route.view === 'overview') {
        void CapacitorApp.minimizeApp()
        return
      }
      navigate(-1)
    }).then(handle => {
      if (disposed) void handle.remove()
      else remove = handle.remove
    })
    return () => {
      disposed = true
      if (remove) void remove()
    }
  }, [landing, navigate, route])

  useEffect(() => {
    if (!landing || !sessionResolved || !authenticated) return
    navigate(`${POCKET_BASE_PATH}${POCKET_ROUTES.home}`, { replace: true })
  }, [authenticated, landing, navigate, sessionResolved])

  useEffect(() => {
    if (!authenticated || !email) return
    return registerPocketRefreshHandler(profile.reload)
  }, [authenticated, email, profile.reload])

  useEffect(() => {
    if (!ready || !authenticated || !email) return
    let active = true
    setInitialDataReady(false)
    const walletSnapshot = prefetchPocketWalletSnapshot({ email, getAccessToken })
    const recentActivity = prefetchPocketActivity({ email, getAccessToken, recent: true })
    const activityDeadline = new Promise<void>(resolve => window.setTimeout(resolve, 900))
    void Promise.allSettled([
      walletSnapshot,
      Promise.race([recentActivity, activityDeadline]),
    ]).then(() => { if (active) setInitialDataReady(true) })
    return () => { active = false }
  }, [authenticated, email, getAccessToken, ready])

  useEffect(() => {
    if (!ready || !authenticated) return
    let checking = false
    const reconcile = async () => {
      const intentId = readActivePocketBankPayout()
      if (!intentId || checking || document.visibilityState !== 'visible') return
      if (!readActivePocketBankPayoutTransfer(intentId)) {
        clearActivePocketBankPayout(intentId)
        return
      }
      checking = true
      try {
        const accessToken = await getAccessToken()
        if (!accessToken) return
        const payout = await readPocketBankWithdrawStatus({ accessToken, intentId })
        if (payout.state === 'sent' || payout.state === 'refunded' || payout.state === 'failed' || payout.state === 'expired') clearActivePocketBankPayout(intentId)
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

  const active: PocketNavTab = route?.section === 'home'
      ? 'home'
      : route?.section === 'profile'
      ? 'profile'
      : route?.section === 'bills'
        ? 'bills'
        : route?.section === 'activity'
          ? 'activity'
          : 'home'
  let content: ReactNode = null
  const concealLaunchContent = splashState !== 'idle' && (!sessionResolved || (authenticated && landing))
  if (ready && authenticated && email && walletUnlockState !== 'ready') content = <PocketWalletUnlockScreen error={walletUnlockState === 'error' ? walletUnlockError : ''} onRetry={() => setWalletUnlockAttempt(value => value + 1)} />
  else if (concealLaunchContent) content = <main className="min-h-screen bg-[#F5F5F7]" aria-hidden="true" />
  else if (!ready) content = <PocketLoadingState active={active} />
  else if (landing) content = <PocketPageBoundary active="home"><PocketLandingPage /></PocketPageBoundary>
  else if (route?.section === 'home' && route.view === 'deposit') content = <PocketPageBoundary active="home"><PocketDepositPage /></PocketPageBoundary>
  else if (route?.section === 'home' && route.view === 'send') content = <PocketPageBoundary active="home"><PocketSendPage /></PocketPageBoundary>
  else if (route?.section === 'home' && route.view === 'swap') content = <PocketPageBoundary active="home"><PocketSwapPage /></PocketPageBoundary>
  else if (route?.section === 'home') content = <PocketPageBoundary active="home"><PocketHomePage /></PocketPageBoundary>
  else if (route?.section === 'profile' && route.view === 'verify-name') content = <PocketPageBoundary active="profile"><PocketVerifyNamePage /></PocketPageBoundary>
  else if (route?.section === 'profile') content = <PocketPageBoundary active="profile"><PocketProfilePage /></PocketPageBoundary>
  else if (route?.section === 'notifications') content = <PocketPageBoundary active="home"><PocketNotificationsPage /></PocketPageBoundary>
  else if (route?.section === 'bills') content = <PocketPageBoundary active="bills"><PocketBillsPage view={route.view} /></PocketPageBoundary>
  else if (route?.section === 'activity') content = <PocketPageBoundary active="activity"><PocketActivityPage view={route.view} /></PocketPageBoundary>
  else if (route?.section === 'assistant') content = <PocketPageBoundary active="home"><PocketAssistantPage /></PocketPageBoundary>
  else if (route?.section === 'move' && route.view === 'usdc') content = <PocketPageBoundary active="home"><PocketMoveUsdcPage /></PocketPageBoundary>
  else if (route?.section === 'move' && route.view === 'bank') content = <PocketPageBoundary active="home"><PocketMoveBankPage /></PocketPageBoundary>
  else if (route?.section === 'move' && route.view === 'pos') content = <PocketPageBoundary active="home"><PocketMovePosPage /></PocketPageBoundary>

  return (
    <>
      {content}
      {walletUnlockState === 'ready' && <PocketSessionSplash state={splashState} />}
    </>
  )
}
