import { useEffect, useRef, useState, type ReactNode, type TouchEvent, type UIEvent } from 'react'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'
import { useLocation } from 'react-router-dom'
import PocketBottomNav, { type PocketNavTab } from './PocketBottomNav'
import { Loader2 } from './PocketIcons'
import { refreshPocketData } from '../lib/pocketRefresh'

export default function PocketRouteShell({
  active,
  children,
  onSelect,
  navigationDisabled = false,
}: {
  active: PocketNavTab
  children: ReactNode
  onSelect: (tab: PocketNavTab) => void
  navigationDisabled?: boolean
}) {
  const { pathname, state, key: locationKey } = useLocation()
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const [headerHeight, setHeaderHeight] = useState(120)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState('')
  const scrollerRef = useRef<HTMLDivElement>(null)
  const scrollFrame = useRef<number | null>(null)
  const pullStartY = useRef<number | null>(null)
  const pullDistanceRef = useRef(0)
  const refreshTriggered = useRef(false)
  const refreshInFlight = useRef(false)

  useEffect(() => {
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
  }, [])

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const saved = Number(window.sessionStorage.getItem(`pocket:scroll:${pathname}`) || 0)
    scroller.scrollTop = Number.isFinite(saved) && saved > 0 ? saved : 0
    return () => {
      if (scrollFrame.current !== null) window.cancelAnimationFrame(scrollFrame.current)
      window.sessionStorage.setItem(`pocket:scroll:${pathname}`, String(scroller.scrollTop))
    }
  }, [pathname])

  const rememberScroll = (event: UIEvent<HTMLDivElement>) => {
    const top = event.currentTarget.scrollTop
    if (scrollFrame.current !== null) return
    scrollFrame.current = window.requestAnimationFrame(() => {
      window.sessionStorage.setItem(`pocket:scroll:${pathname}`, String(top))
      scrollFrame.current = null
    })
  }

  const startPull = (event: TouchEvent<HTMLDivElement>) => {
    if (navigationDisabled || refreshInFlight.current || event.touches.length !== 1 || (scrollerRef.current?.scrollTop ?? 0) > 0) return
    pullDistanceRef.current = 0
    refreshTriggered.current = false
    pullStartY.current = event.touches[0].clientY
  }

  const runRefresh = async () => {
    if (refreshInFlight.current || refreshTriggered.current) return
    refreshInFlight.current = true
    refreshTriggered.current = true
    pullStartY.current = null
    setRefreshMessage('')
    setRefreshing(true)
    pullDistanceRef.current = 42
    setPullDistance(42)
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

  const movePull = (event: TouchEvent<HTMLDivElement>) => {
    if (pullStartY.current === null || event.touches.length !== 1 || (scrollerRef.current?.scrollTop ?? 0) > 0) return
    const distance = event.touches[0].clientY - pullStartY.current
    if (distance <= 0) {
      pullDistanceRef.current = 0
      setPullDistance(0)
      return
    }
    const nextDistance = Math.min(78, distance * 0.62)
    pullDistanceRef.current = nextDistance
    setPullDistance(nextDistance)
    if (nextDistance >= 62 && !refreshTriggered.current) void runRefresh()
  }

  const finishPull = () => {
    pullStartY.current = null
    if (pullDistanceRef.current < 62 || refreshInFlight.current || refreshTriggered.current) {
      pullDistanceRef.current = 0
      if (!refreshInFlight.current) setPullDistance(0)
      return
    }
    void runRefresh()
  }

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
      void Promise.all([
        Keyboard.addListener('keyboardWillShow', () => { if (!disposed) setKeyboardOpen(true) }),
        Keyboard.addListener('keyboardDidShow', () => { if (!disposed) setKeyboardOpen(true) }),
        Keyboard.addListener('keyboardWillHide', () => { /* Keep navigation hidden until the keyboard is fully closed. */ }),
        Keyboard.addListener('keyboardDidHide', () => { if (!disposed) { setKeyboardOpen(false); setInputFocused(false) } }),
      ]).then(next => handles.push(...next))
      return () => {
        disposed = true
        setKeyboardOpen(false)
        handles.forEach(handle => { void handle.remove() })
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
            ref={scrollerRef}
            onScroll={rememberScroll}
            onTouchStart={startPull}
            onTouchMove={movePull}
            onTouchEnd={finishPull}
            onTouchCancel={() => { pullStartY.current = null; if (!refreshing) { pullDistanceRef.current = 0; setPullDistance(0) } }}
            className="absolute inset-x-0 bottom-0 overflow-x-hidden overflow-y-auto overscroll-y-contain [scrollbar-color:rgba(148,163,184,0.35)_transparent] [scrollbar-width:thin]"
            style={{
              top: headerHeight > 0 ? headerHeight : 'var(--pocket-safe-top)',
              scrollPaddingTop: 16,
              scrollPaddingBottom: 'calc(7.5rem + var(--pocket-safe-bottom))',
            }}
          >
            <div role="status" aria-label={refreshing ? 'Refreshing Pocket' : 'Pull to refresh'} aria-hidden={pullDistance <= 4 && !refreshing} className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center transition-opacity duration-150" style={{ opacity: pullDistance > 4 || refreshing ? 1 : 0, transform: `translateY(${Math.max(0, pullDistance - 30)}px)` }}>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-900 shadow-md ring-2 ring-gray-200/80 dark:bg-[#171717] dark:text-gray-300 dark:ring-white/10"><Loader2 className="h-6 w-6 animate-spin" style={{ animationDuration: '650ms', animationPlayState: refreshing ? 'running' : 'paused' }} /></span>
            </div>
            <div
              key={locationKey}
              className={`mx-auto w-[calc(100%-2rem)] max-w-[430px] space-y-5 pb-[calc(7.5rem+var(--pocket-safe-bottom))] ${state?.pocketRailTransition ? 'pocket-mode-content' : ''}`}
              style={{
                minHeight: `calc(100dvh - ${headerHeight}px)`,
                paddingTop: 16,
              }}
            >
              {refreshMessage && <p role="status" className="text-center text-xs text-gray-500 dark:text-gray-400">{refreshMessage}</p>}
              {children}
            </div>
          </div>

          <PocketBottomNav active={active} disabled={navigationDisabled} keyboardOpen={keyboardOpen || inputFocused} onSelect={onSelect} />
      </div>
    </div>
  )
}
