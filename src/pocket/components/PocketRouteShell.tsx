import { useEffect, useRef, useState, type ReactNode, type UIEvent } from 'react'
import { useLocation } from 'react-router-dom'
import PocketBottomNav, { type PocketNavTab } from './PocketBottomNav'

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
  const { pathname } = useLocation()
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [headerHeight, setHeaderHeight] = useState(120)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const scrollFrame = useRef<number | null>(null)

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
      <div className="relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-[#F5F5F7] dark:bg-[#0A0A0A]">
          <div
            data-pocket-scroller
            ref={scrollerRef}
            onScroll={rememberScroll}
            className="h-full w-full overflow-x-hidden overflow-y-auto overscroll-y-contain [scrollbar-color:rgba(148,163,184,0.35)_transparent] [scrollbar-width:thin]"
            style={{ scrollPaddingTop: contentTop, scrollPaddingBottom: 'calc(7.5rem + env(safe-area-inset-bottom))' }}
          >
            <div
              className="mx-auto w-[calc(100%-2rem)] max-w-[430px] space-y-5 pb-[calc(7.5rem+env(safe-area-inset-bottom))]"
              style={{ minHeight: `calc(100dvh - ${contentTop}px)`, paddingTop: contentTop }}
            >
              {children}
            </div>
          </div>

          <PocketBottomNav active={active} disabled={navigationDisabled} keyboardOpen={keyboardOpen} onSelect={onSelect} />
      </div>
    </div>
  )
}
