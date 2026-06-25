import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { useLogin, useModalStatus, usePrivy, type LoginModalOptions } from '@privy-io/react-auth'

type PrivyConnectButtonProps = {
  className?: string
  disabled?: boolean
  debugLabel?: string
  loginOptions?: LoginModalOptions
  logoutOnAuthenticated?: boolean
  onBeforeLogin?: () => void
  children: ReactNode
}

export function PrivyConnectButton({
  className,
  disabled,
  debugLabel = 'privy-connect',
  loginOptions,
  logoutOnAuthenticated = true,
  onBeforeLogin,
  children,
}: PrivyConnectButtonProps) {
  const { authenticated, ready, logout } = usePrivy()
  const { isOpen } = useModalStatus()
  const { login } = useLogin({
    onError: error => {
      if (shouldLogPrivyDebug()) console.warn('[privy-login:error]', { debugLabel, error })
    },
  })
  const [reopenAfterLogout, setReopenAfterLogout] = useState(false)

  useEffect(() => {
    if (!ready || authenticated || !reopenAfterLogout) return
    setReopenAfterLogout(false)
    login(loginOptions)
  }, [authenticated, login, loginOptions, ready, reopenAfterLogout])

  async function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (shouldLogPrivyDebug()) {
      console.info('[privy-login:click]', { debugLabel, ready, authenticated, modalOpen: isOpen, disabled })
    }
    if (!ready) return
    if (authenticated) {
      if (!logoutOnAuthenticated) return
      setReopenAfterLogout(true)
      await logout()
      return
    }
    onBeforeLogin?.()
    login(loginOptions ?? event)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || !ready}
      className={className}
    >
      {children}
    </button>
  )
}

function shouldLogPrivyDebug() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('privyDebug') === '1'
}
