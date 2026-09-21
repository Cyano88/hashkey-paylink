import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from './PocketIcons'
import { POCKET_NATIVE_BACK_EVENT } from '../lib/pocketNativeBack'

export default function PocketBottomSheet({ title, onClose, children, dismissible = true }: { title: string; onClose: () => void; children: ReactNode; dismissible?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  const canDismiss = useRef(dismissible)
  close.current = onClose
  canDismiss.current = dismissible
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    root.current?.focus()
    const topmost = () => { const dialogs = document.querySelectorAll('[role="dialog"]'); return !document.getElementById('pocket-payment-pin') && dialogs[dialogs.length - 1] === root.current }
    const back = (event: Event) => {
      if (!topmost() || event.defaultPrevented) return
      event.preventDefault()
      if (canDismiss.current) close.current()
    }
    const key = (event: KeyboardEvent) => {
      if (!topmost()) return
      if (event.key === 'Escape') back(event)
      if (event.key !== 'Tab') return
      const nodes = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]') ?? []).filter(node => node.getClientRects().length)
      const first = nodes[0], last = nodes[nodes.length - 1]
      if (!first) { event.preventDefault(); root.current?.focus(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root.current)) { event.preventDefault(); first.focus() }
    }
    window.addEventListener(POCKET_NATIVE_BACK_EVENT, back)
    document.addEventListener('keydown', key)
    return () => {
      window.removeEventListener(POCKET_NATIVE_BACK_EVENT, back)
      document.removeEventListener('keydown', key)
      document.body.style.overflow = overflow
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  return createPortal(<div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/40 px-0 pt-[max(1rem,var(--pocket-safe-top))]" onClick={event => { if (event.target === event.currentTarget && dismissible) onClose() }}>
    <div data-pocket-sheet ref={root} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-white px-5 pb-[max(1.5rem,var(--pocket-safe-bottom))] pt-4 text-gray-950 outline-none dark:bg-[#121212] dark:text-white">
      <div aria-hidden="true" className="mx-auto mb-6 h-1 w-8 rounded-full bg-gray-200 dark:bg-gray-700" />
      {dismissible && <button type="button" aria-label="Close" onClick={onClose} className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full"><X className="h-5 w-5" /></button>}
      {children}
    </div>
  </div>, document.body)
}
