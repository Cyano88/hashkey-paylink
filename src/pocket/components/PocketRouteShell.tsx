import { useEffect, useState, type ReactNode } from 'react'
import PocketBottomNav, { type PocketNavTab } from './PocketBottomNav'

export default function PocketRouteShell({
  active,
  children,
  onSelect,
}: {
  active: PocketNavTab
  children: ReactNode
  onSelect: (tab: PocketNavTab) => void
}) {
  const [keyboardOpen, setKeyboardOpen] = useState(false)

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
      <div className="min-h-[100dvh] w-full min-w-0 bg-white dark:bg-[#111114]">
        <div className="flex h-[100dvh] w-full flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-color:rgba(148,163,184,0.35)_transparent] [scrollbar-width:thin]">
            <div className="mx-auto w-[calc(100%-2rem)] max-w-[430px] space-y-5 pb-28 pt-[4.75rem]">
              {children}
            </div>
          </div>

          <PocketBottomNav active={active} keyboardOpen={keyboardOpen} onSelect={onSelect} />
        </div>
      </div>
    </div>
  )
}
