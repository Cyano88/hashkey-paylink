import { useEffect, useState, type ReactNode } from 'react'
import { usePrivy } from '@privy-io/react-auth'

type PrivyConnectButtonProps = {
  className?: string
  disabled?: boolean
  logoutOnAuthenticated?: boolean
  onBeforeLogin?: () => void
  children: ReactNode
}

export function PrivyConnectButton({ className, disabled, logoutOnAuthenticated = true, onBeforeLogin, children }: PrivyConnectButtonProps) {
  const { authenticated, ready, login, logout } = usePrivy()
  const [reopenAfterLogout, setReopenAfterLogout] = useState(false)

  useEffect(() => {
    if (!ready || authenticated || !reopenAfterLogout) return
    setReopenAfterLogout(false)
    void login()
  }, [authenticated, login, ready, reopenAfterLogout])

  async function handleClick() {
    if (authenticated) {
      if (!logoutOnAuthenticated) return
      setReopenAfterLogout(true)
      await logout()
      return
    }
    onBeforeLogin?.()
    void login()
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
