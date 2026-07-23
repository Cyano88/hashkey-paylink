import { useEffect, useRef, useState, type ReactNode, type TouchEvent, type UIEvent } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import PocketBottomNav, { type PocketNavTab } from './PocketBottomNav'

export default function PocketRouteShell({
  active,
  children,
  onSelect,
  onRefresh,
  refreshing = false,
}: {
  active: PocketNavTab
  children: ReactNode
  onSelect: (tab: PocketNavTab) => void
  onRefresh?: () => void | Promise<void>
  refreshing?: boolean
}) {
  const { pathname } = useLocation()
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [pullRefreshing, setPullRefreshing] = useState(false)
  const [headerHeight, setHeaderHeight] = useState(120)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const touchStartY = useRef<number | null>(null)
  const scrollFrame = useRef<number | null>(null)
  const pullFrame = useRef<number | null>(null)
  const latestPullDistance = useRef(0)

  const isRefreshing = refreshing || pullRefreshing
  const showPullIndicator = pullRefreshing || pullDistance > 0
  const pullProgress = Math.min(1, pullDistance / 68)
  const contentTop = headerHeight + 16

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
    if (Number.isFinite(saved) && saved > 0) scroller.scrollTop = saved
    return () => {
      if (scrollFrame.current !== null) window.cancelAnimationFrame(scrollFrame.current)
      if (pullFrame.current !== null) window.cancelAnimationFrame(pullFrame.current)
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

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!onRefresh || isRefreshing || (scrollerRef.current?.scrollTop ?? 1) > 0) return
    touchStartY.current = event.touches[0]?.clientY ?? null
  }

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartY.current === null) return
    const delta = (event.touches[0]?.clientY ?? touchStartY.current) - touchStartY.current
    latestPullDistance.current = delta > 0 ? Math.min(92, delta * 0.48) : 0
    if (pullFrame.current !== null) return
    pullFrame.current = window.requestAnimationFrame(() => {
      setPullDistance(latestPullDistance.current)
      pullFrame.current = null
    })
  }

  const finishPull = async () => {
    touchStartY.current = null
    if (pullFrame.current !== null) {
      window.cancelAnimationFrame(pullFrame.current)
      pullFrame.current = null
    }
    const completedDistance = latestPullDistance.current
    latestPullDistance.current = 0
    if (!onRefresh || completedDistance < 68 || isRefreshing) {
      setPullDistance(0)
      return
    }
    setPullRefreshing(true)
    setPullDistance(52)
    try {
      await onRefresh()
    } finally {
      setPullRefreshing(false)
      setPullDistance(0)
    }
  }

  useEffect(() => {
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
      <div className="relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-white dark:bg-[#111114]">
          <div
            data-pocket-scroller
            ref={scrollerRef}
            onScroll={rememberScroll}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={() => void finishPull()}
            onTouchCancel={() => {
              touchStartY.current = null
              latestPullDistance.current = 0
              if (pullFrame.current !== null) window.cancelAnimationFrame(pullFrame.current)
              pullFrame.current = null
              setPullDistance(0)
            }}
            className="h-full w-full overflow-x-hidden overflow-y-auto overscroll-y-contain [scrollbar-color:rgba(148,163,184,0.35)_transparent] [scrollbar-width:thin]"
            style={{ scrollPaddingTop: contentTop, scrollPaddingBottom: 'calc(7.5rem + env(safe-area-inset-bottom))' }}
          >
            {onRefresh && showPullIndicator && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 z-30 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition-opacity dark:border-white/10 dark:bg-[#1b1b20] dark:text-gray-300"
                style={{ top: headerHeight + 8, opacity: pullRefreshing ? 1 : pullProgress, transform: `translate(-50%, ${Math.max(-28, pullDistance - 40)}px) scale(${0.78 + pullProgress * 0.22})` }}
              >
                {pullRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" style={{ transform: `rotate(${pullProgress * 180}deg)` }} />}
              </div>
            )}
            <div
              className="mx-auto w-[calc(100%-2rem)] max-w-[430px] space-y-5 pb-[calc(7.5rem+env(safe-area-inset-bottom))]"
              style={{ minHeight: `calc(100dvh - ${contentTop}px)`, paddingTop: contentTop }}
            >
              {children}
            </div>
          </div>

          <PocketBottomNav active={active} keyboardOpen={keyboardOpen} onSelect={onSelect} />
      </div>
    </div>
  )
}
