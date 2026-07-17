import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
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
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [pullRefreshing, setPullRefreshing] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const touchStartY = useRef<number | null>(null)

  const isRefreshing = refreshing || pullRefreshing
  const pullProgress = Math.min(1, pullDistance / 68)

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!onRefresh || isRefreshing || (scrollerRef.current?.scrollTop ?? 1) > 0) return
    touchStartY.current = event.touches[0]?.clientY ?? null
  }

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartY.current === null) return
    const delta = (event.touches[0]?.clientY ?? touchStartY.current) - touchStartY.current
    setPullDistance(delta > 0 ? Math.min(92, delta * 0.48) : 0)
  }

  const finishPull = async () => {
    touchStartY.current = null
    if (!onRefresh || pullDistance < 68 || isRefreshing) {
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
    <div className="-mx-4 -my-10 w-[calc(100%+2rem)] max-w-none min-w-0 sm:-mx-6 sm:w-[calc(100%+3rem)]">
      <div className="relative h-[100dvh] min-h-[100svh] w-full min-w-0 overflow-x-hidden bg-white dark:bg-[#111114]">
          <div
            ref={scrollerRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={() => void finishPull()}
            onTouchCancel={() => { touchStartY.current = null; setPullDistance(0) }}
            className="h-full w-full overflow-x-hidden overflow-y-auto overscroll-y-contain [scrollbar-color:rgba(148,163,184,0.35)_transparent] [scrollbar-width:thin]"
          >
            {onRefresh && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-[7.65rem] z-30 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition-opacity dark:border-white/10 dark:bg-[#1b1b20] dark:text-gray-300"
                style={{ opacity: isRefreshing ? 1 : pullProgress, transform: `translate(-50%, ${Math.max(-28, pullDistance - 40)}px) scale(${0.78 + pullProgress * 0.22})` }}
              >
                {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" style={{ transform: `rotate(${pullProgress * 180}deg)` }} />}
              </div>
            )}
            <div className="mx-auto min-h-[calc(100dvh-8.5rem)] w-[calc(100%-2rem)] max-w-[430px] space-y-5 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-[8.5rem]">
              {children}
            </div>
          </div>

          <PocketBottomNav active={active} keyboardOpen={keyboardOpen} onSelect={onSelect} />
      </div>
    </div>
  )
}
