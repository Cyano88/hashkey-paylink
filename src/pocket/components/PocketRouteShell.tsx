import { useLayoutEffect, useEffect, useRef, useState, type ReactNode, type TouchEvent, type UIEvent } from 'react'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'
import { useLocation, useNavigationType } from 'react-router-dom'
import PocketBottomNav, { type PocketNavTab } from './PocketBottomNav'
import { Loader2 } from './PocketIcons'
import PocketKycPrompt from './PocketKycPrompt'
import { POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'
import { refreshPocketData } from '../lib/pocketRefresh'

const REFRESH_THRESHOLD = 66

export default function PocketRouteShell({
  active,
  children,
  onSelect,
  navigationDisabled = false,
  fixedPage = false,
  scrollKey,
  rail,
  refreshEnabled = true,
}: {
  active: PocketNavTab
  children: ReactNode
  onSelect: (tab: PocketNavTab) => void
  navigationDisabled?: boolean
  fixedPage?: boolean
  scrollKey?: string
  rail?: 'stablecoins' | 'xstocks'
  refreshEnabled?: boolean
}) {
  const { pathname, state, key: locationKey } = useLocation()
  const navigationType=useNavigationType()
  const path = pathname.slice(POCKET_BASE_PATH.length)
  const hideNavigation = [POCKET_ROUTES.transfer, POCKET_ROUTES.send, POCKET_ROUTES.receive, POCKET_ROUTES.deposit, POCKET_ROUTES.swap, POCKET_ROUTES.usdc, POCKET_ROUTES.bank, '/xstocks/send', '/xstocks/receive'].includes(path) || path === POCKET_ROUTES.bills || path.startsWith(POCKET_ROUTES.bills + '/')
  const scrollPath=pathname+(scrollKey?':'+scrollKey:'')
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const [headerHeight, setHeaderHeight] = useState(() => Math.ceil(document.querySelector<HTMLElement>('[data-hashpaylink-top-nav]')?.getBoundingClientRect().bottom ?? 0))
  const [pullDistance, setPullDistance] = useState(0)
  const [pullDragging, setPullDragging] = useState(false)
  const pullEdge = useRef<'top' | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState('')
  const scrollerRef = useRef<HTMLDivElement>(null)
  const lastScroll=useRef<Record<string,number>>({})
  const scrollFrame = useRef<number | null>(null)
  const pullStartY = useRef<number | null>(null)
  const pullStartX = useRef(0)
  const pullDistanceRef = useRef(0)
  const refreshTriggered = useRef(false)
  const refreshInFlight = useRef(false)

  useLayoutEffect(() => {
    const header = document.querySelector<HTMLElement>('[data-hashpaylink-top-nav]')
    if (!header) return
    const updateHeaderHeight = () => setHeaderHeight(Math.ceil(header.getBoundingClientRect().bottom))
    updateHeaderHeight()
    const observer = new ResizeObserver(updateHeaderHeight)
    observer.observe(header)
    window.addEventListener('resize', updateHeaderHeight)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateHeaderHeight)
    }
  }, [pathname])

  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    if (fixedPage) { scroller.scrollTop = 0; return }
    const saved = lastScroll.current[scrollPath] ?? Number(window.sessionStorage.getItem(`pocket:scroll:${scrollPath}`) || 0)
    scroller.scrollTop = Number.isFinite(saved) && saved > 0 ? saved : 0
    return () => {
      if (scrollFrame.current !== null) window.cancelAnimationFrame(scrollFrame.current)
      scrollFrame.current=null
      window.sessionStorage.setItem(`pocket:scroll:${scrollPath}`, String(lastScroll.current[scrollPath] ?? saved))
    }
  }, [scrollPath, fixedPage])

  const rememberScroll = (event: UIEvent<HTMLDivElement>) => {
    const top = event.currentTarget.scrollTop
    lastScroll.current[scrollPath]=top
    if (scrollFrame.current !== null) return
    scrollFrame.current = window.requestAnimationFrame(() => {
      window.sessionStorage.setItem(`pocket:scroll:${scrollPath}`, String(top))
      scrollFrame.current = null
    })
  }

  const startPull = (event: TouchEvent<HTMLDivElement>) => {
    pullStartY.current = null
    pullEdge.current = null
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target) || document.querySelector('[data-pocket-sheet]')) return
    if (!refreshEnabled || fixedPage || keyboardOpen || inputFocused || navigationDisabled || refreshInFlight.current || event.touches.length !== 1 || (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable=true], [role=slider]'))) return
    pullDistanceRef.current = 0
    refreshTriggered.current = false
    pullStartY.current = event.touches[0].clientY
    pullStartX.current = event.touches[0].clientX
  }

  const runRefresh = async () => {
    if (refreshInFlight.current || refreshTriggered.current) return
    refreshInFlight.current = true
    refreshTriggered.current = true
    pullStartY.current = null
    setRefreshMessage('')
    setRefreshing(true)
    pullDistanceRef.current = REFRESH_THRESHOLD
    setPullDistance(REFRESH_THRESHOLD)
    try {
      await Promise.all([refreshPocketData(), new Promise(resolve => window.setTimeout(resolve, 350))])
    } catch {
      setRefreshMessage('Refresh is taking longer. Pull down to retry.')
    } finally {
      refreshInFlight.current = false
      pullDistanceRef.current = 0
      setRefreshing(false)
      setPullDistance(0)
    }
  }

  const cancelPull = () => {
    pullStartY.current = null
    pullEdge.current = null
    setPullDragging(false)
    if (!refreshInFlight.current) { pullDistanceRef.current = 0; setPullDistance(0) }
  }

  const movePull = (event: TouchEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current
    if (pullStartY.current === null || !scroller) return
    if (event.touches.length !== 1) { cancelPull(); return }
    const y = event.touches[0].clientY
    const distance = y - pullStartY.current
    if (Math.abs(event.touches[0].clientX - pullStartX.current) > Math.max(18, Math.abs(distance))) {
      cancelPull(); return
    }
    if (!pullEdge.current) {
      const atTop = scroller.scrollTop <= 1
      if (atTop && distance > 6) pullEdge.current = 'top'
      else if (atTop && distance >= 0) return
      else { pullStartY.current = y; return }
    }
    const outward = distance
    if (outward <= 0) { cancelPull(); return }
    // Increasing resistance, bounded travel; native momentum handles ordinary scrolling.
    const limit = 104
    const stretch = limit * (1 - Math.exp(-Math.max(0, outward - 6) / 150))
    const nextDistance = stretch
    setPullDragging(true)
    pullDistanceRef.current = nextDistance
    setPullDistance(nextDistance)
  }

  const finishPull = () => {
    const shouldRefresh = refreshEnabled && pullEdge.current === 'top' && pullDistanceRef.current >= REFRESH_THRESHOLD
    pullStartY.current = null
    pullEdge.current = null
    setPullDragging(false)
    if (shouldRefresh && !refreshInFlight.current && !refreshTriggered.current) { void runRefresh(); return }
    if (!refreshInFlight.current) { pullDistanceRef.current = 0; setPullDistance(0) }
  }

  useEffect(() => { cancelPull() }, [scrollPath, fixedPage, keyboardOpen, inputFocused])

  useEffect(() => {
    const editable = (target: EventTarget | null) => target instanceof HTMLElement && (target.matches('textarea, input:not([readonly]):not([disabled]):not([type=button]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file])') || target.isContentEditable)
    let timer: ReturnType<typeof setTimeout>
    const focus = () => { clearTimeout(timer); setInputFocused(editable(document.activeElement)) }
    const blur = () => { clearTimeout(timer); timer = setTimeout(focus, 160) }
    document.addEventListener('focusin', focus); document.addEventListener('focusout', blur)
    return () => { clearTimeout(timer); document.removeEventListener('focusin', focus); document.removeEventListener('focusout', blur) }
  }, [])

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      let disposed = false
      const handles: Array<{ remove(): Promise<void> }> = []
      const subscriptions = [
        Keyboard.addListener('keyboardWillShow', () => { if (!disposed) setKeyboardOpen(true) }),
        Keyboard.addListener('keyboardDidShow', () => { if (!disposed) setKeyboardOpen(true) }),
        Keyboard.addListener('keyboardWillHide', () => { /* Keep navigation hidden until the keyboard is fully closed. */ }),
        Keyboard.addListener('keyboardDidHide', () => { if (!disposed) { setKeyboardOpen(false); setInputFocused(false) } }),
      ]
      subscriptions.forEach(pending => {
        void pending.then(handle => {
          if (disposed) void handle.remove().catch(() => undefined)
          else handles.push(handle)
        }).catch(() => undefined)
      })
      return () => {
        disposed = true
        handles.forEach(handle => { void handle.remove().catch(() => undefined) })
      }
    }
    if (!window.matchMedia('(max-width: 767px)').matches) {
      setKeyboardOpen(false)
      return
    }
    const viewport = window.visualViewport
    const updateKeyboardState = () => {
      const viewportHeight = viewport?.height ?? window.innerHeight
      setKeyboardOpen(window.innerHeight - viewportHeight > 140)
    }
    updateKeyboardState()
    viewport?.addEventListener('resize', updateKeyboardState)
    window.addEventListener('resize', updateKeyboardState)
    return () => {
      viewport?.removeEventListener('resize', updateKeyboardState)
      window.removeEventListener('resize', updateKeyboardState)
      setKeyboardOpen(false)
    }
  }, [])

  return (
    <div className="h-full min-h-0 w-full max-w-none min-w-0">
      <div className="relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-[#F5F5F7] dark:bg-black">
          <div
            data-pocket-scroller
            data-pocket-fixed-page={fixedPage || undefined}
            data-pocket-keyboard={keyboardOpen || inputFocused || undefined}
            ref={scrollerRef}
            onScroll={rememberScroll}
            onTouchStart={startPull}
            onTouchMove={movePull}
            onTouchEnd={finishPull}
            onTouchCancel={cancelPull}
            className="absolute inset-x-0 bottom-0 overflow-x-hidden overflow-y-auto overscroll-y-none [scrollbar-color:rgba(148,163,184,0.35)_transparent] [scrollbar-width:thin]"
            style={{
              overflowY: fixedPage ? 'hidden' : undefined,
              top: headerHeight > 0 ? headerHeight : 'var(--pocket-safe-top)',
              scrollPaddingTop: 16,
              scrollPaddingBottom: hideNavigation ? 'max(1.5rem, calc(0.75rem + var(--pocket-safe-bottom)))' : 'calc(7.5rem + var(--pocket-safe-bottom))',
            }}
          >
            <div data-pocket-refresh-indicator role="status" aria-label={refreshing ? 'Refreshing Pocket' : pullDistance >= REFRESH_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'} aria-hidden={!refreshEnabled || (pullDistance <= 4 && !refreshing)} className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center" style={{ opacity: refreshEnabled && (pullDistance > 4 || refreshing) ? 1 : 0, transform: `translateY(${pullDistance - 48}px)`, transition: pullDragging ? 'none' : 'transform 200ms ease-out, opacity 150ms ease-out' }}>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-900 shadow-md ring-2 ring-gray-200/80 dark:bg-[#121212] dark:text-gray-300 dark:ring-white/10">
                {refreshing ? <Loader2 className="h-6 w-6 animate-spin" style={{ animationDuration: '650ms' }} /> : <svg aria-hidden="true" className="h-6 w-6 -rotate-90" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" pathLength="100" strokeDasharray={`${Math.min(1, pullDistance / REFRESH_THRESHOLD) * 90} 100`} /></svg>}
              </span>
            </div>
            <div
              key={locationKey}
              data-pocket-page-content
              className={`mx-auto w-[calc(100%-2rem)] max-w-[430px] space-y-5 pb-[calc(7.5rem+var(--pocket-safe-bottom))] ${navigationType==='PUSH' && state?.pocketRailTransition ? 'pocket-mode-content' : ''}`}
              style={{
                minHeight: fixedPage ? 0 : `calc(100dvh - ${headerHeight}px)`,
                height: fixedPage ? '100%' : undefined,
                display: fixedPage ? 'flex' : undefined,
                flexDirection: fixedPage ? 'column' : undefined,
                gap: fixedPage ? 12 : undefined,
                paddingBottom: hideNavigation ? (keyboardOpen || inputFocused ? 12 : 'max(1.5rem, calc(0.75rem + var(--pocket-safe-bottom)))') : fixedPage ? (keyboardOpen || inputFocused ? 12 : 'calc(5rem + var(--pocket-safe-bottom))') : undefined,
                paddingTop: 16,
              }}
            >
              {refreshMessage && <p role="status" className="text-center text-xs text-gray-500 dark:text-gray-400">{refreshMessage}</p>}
              {children}
            </div>
          </div>

          <PocketKycPrompt />
          {!hideNavigation && <PocketBottomNav rail={rail} active={active} disabled={navigationDisabled} keyboardOpen={keyboardOpen || inputFocused} onSelect={onSelect} />}
      </div>
    </div>
  )
}
