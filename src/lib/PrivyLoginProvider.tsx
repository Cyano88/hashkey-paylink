import { createContext, useCallback, useContext, useRef, type ReactNode } from 'react'
import { useLogin, useModalStatus, usePrivy, type LoginModalOptions } from '@privy-io/react-auth'

type PrivyLoginRequest = {
  debugLabel?: string
  loginOptions?: LoginModalOptions
  onBeforeLogin?: () => void
}

type PrivyLoginContextValue = {
  requestLogin: (request?: PrivyLoginRequest) => void
}

const PrivyLoginContext = createContext<PrivyLoginContextValue | null>(null)

export function PrivyLoginProvider({ children }: { children: ReactNode }) {
  const { authenticated, ready } = usePrivy()
  const { isOpen } = useModalStatus()
  const lastRequest = useRef<PrivyLoginRequest | undefined>(undefined)
  const { login } = useLogin({
    onError: error => {
      if (shouldLogPrivyDebug()) console.warn('[privy-login:error]', { request: lastRequest.current, error })
    },
  })

  const requestLogin = useCallback((request?: PrivyLoginRequest) => {
    lastRequest.current = request
    if (shouldLogPrivyDebug()) {
      console.info('[privy-login:request]', {
        debugLabel: request?.debugLabel ?? 'privy-connect',
        ready,
        authenticated,
        modalOpen: isOpen,
      })
    }
    if (!ready || authenticated) return

    request?.onBeforeLogin?.()
    if (shouldLogPrivyDebug()) {
      console.info('[privy-login:open]', {
        debugLabel: request?.debugLabel ?? 'privy-connect',
        modalOpen: isOpen,
      })
    }
    login(request?.loginOptions)
  }, [authenticated, isOpen, login, ready])

  return (
    <PrivyLoginContext.Provider value={{ requestLogin }}>
      {children}
    </PrivyLoginContext.Provider>
  )
}

export function usePrivyLoginLauncher() {
  return useContext(PrivyLoginContext)
}

function shouldLogPrivyDebug() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('privyDebug') === '1'
}
