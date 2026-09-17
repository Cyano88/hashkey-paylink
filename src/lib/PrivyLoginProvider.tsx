import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePrivy, type LoginModalOptions } from '@privy-io/react-auth'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import PocketEmailLogin from '../pocket/components/PocketEmailLogin'
import { POCKET_NATIVE_BACK_EVENT } from '../pocket/lib/pocketNativeBack'
import { isPocketHostname } from '../pocket/lib/pocketRoutes'

type PrivyLoginRequest = {
  debugLabel?: string
  loginOptions?: LoginModalOptions
  onBeforeLogin?: () => void
}
type PrivyLoginContextValue = {
  requestLogin: (request?: PrivyLoginRequest) => void
  isOpen: boolean
}
const PrivyLoginContext = createContext<PrivyLoginContextValue | null>(null)

export function PrivyLoginProvider({ children }: { children: ReactNode }) {
  const { authenticated, ready } = usePrivy()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'email' | 'code'>('email')
  const previousFocus = useRef<HTMLElement | null>(null)
  const screen = useRef<HTMLElement | null>(null)
  const visible = open && !authenticated
  const pocket = isPocketHostname(window.location.hostname)
  const product = pocket ? 'Pocket' : 'Hash PayLink'

  const requestLogin = useCallback((request?: PrivyLoginRequest) => {
    if (!ready || authenticated || open) return
    request?.onBeforeLogin?.()
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setStep('email')
    setOpen(true)
  }, [authenticated, open, ready])

  useEffect(() => { if (authenticated) setOpen(false) }, [authenticated])
  useEffect(() => {
    if (!visible) return
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = requestAnimationFrame(() => screen.current?.querySelector<HTMLInputElement>('input')?.focus())
    return () => {
      cancelAnimationFrame(frame)
      document.body.style.overflow = overflow
      if (previousFocus.current?.isConnected) previousFocus.current.focus()
    }
  }, [visible])
  useEffect(() => {
    // The shared code-entry screen owns its own native Back action.
    if (!visible || step !== 'email') return
    const nativeBack = (event: Event) => { event.preventDefault(); setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false) } }
    window.addEventListener(POCKET_NATIVE_BACK_EVENT, nativeBack)
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener(POCKET_NATIVE_BACK_EVENT, nativeBack)
      window.removeEventListener('keydown', escape)
    }
  }, [step, visible])

  return <PrivyLoginContext.Provider value={{ requestLogin, isOpen: visible }}>
    {/* Keep payment state mounted while removing it from keyboard navigation. */}
    <div style={{ display: visible ? 'none' : 'contents' }}>{children}</div>
    {visible && createPortal(
      <div className="fixed inset-0 z-[140] overflow-y-auto bg-[#F5F5F7] px-6 pb-[max(1.25rem,var(--pocket-safe-bottom))] pt-[max(1.25rem,var(--pocket-safe-top))] text-gray-950">
        <button type="button" onClick={() => setOpen(false)} aria-label="Back to previous page" className="fixed left-4 top-[calc(var(--pocket-safe-top)+0.75rem)] flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-950 shadow-sm"><ArrowLeftIcon className="h-5 w-5" /></button>
        <main ref={screen} aria-label={'Sign in to ' + product} className="mx-auto flex min-h-[calc(100dvh-var(--pocket-safe-top)-var(--pocket-safe-bottom)-2.5rem)] w-full max-w-[430px] flex-col justify-center py-16">
          <p className="text-center text-sm font-bold">{product}</p>
          <h1 className="mt-5 text-center text-3xl font-black tracking-[-0.045em]">Sign in with email</h1>
          <p className="mb-8 mt-3 text-center text-sm font-medium leading-6 text-gray-500">Enter your email to receive a secure sign-in code.</p>
          <PocketEmailLogin context={pocket ? 'pocket' : 'hashpaylink'} onStepChange={setStep} />
          <p className="mt-6 text-center text-xs font-semibold text-gray-500">{product} will never ask you to share your code.</p>
          <div className="mt-4 flex justify-center gap-5 text-xs text-gray-500"><a href="https://docs.hashpaylink.com/docs/terms" target="_blank" rel="noreferrer">Terms</a><a href="https://docs.hashpaylink.com/docs/privacy" target="_blank" rel="noreferrer">Privacy</a></div>
        </main>
      </div>, document.body,
    )}
  </PrivyLoginContext.Provider>
}
export function usePrivyLoginLauncher() { return useContext(PrivyLoginContext) }
