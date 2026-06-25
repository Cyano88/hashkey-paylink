import { useEffect, useState, type ReactNode } from 'react'
import { useModalStatus, usePrivy, type LoginModalOptions } from '@privy-io/react-auth'
import { usePrivyLoginLauncher } from './PrivyLoginProvider'

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
  const launcher = usePrivyLoginLauncher()
  const [reopenAfterLogout, setReopenAfterLogout] = useState(false)

  useEffect(() => {
    if (!ready || authenticated || !reopenAfterLogout) return
    setReopenAfterLogout(false)
    launcher?.requestLogin({ debugLabel, loginOptions, onBeforeLogin })
  }, [authenticated, debugLabel, launcher, loginOptions, onBeforeLogin, ready, reopenAfterLogout])

  async function handleClick() {
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
    launcher?.requestLogin({ debugLabel, loginOptions: loginOptions ?? undefined, onBeforeLogin })
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
