import { useEffect, useState, type ReactNode } from 'react'
import { usePrivy } from '@privy-io/react-auth'

type PrivyConnectButtonProps = {
  className?: string
  disabled?: boolean
  children: ReactNode
}

export function PrivyConnectButton({ className, disabled, children }: PrivyConnectButtonProps) {
  const { authenticated, ready, login, logout } = usePrivy()
  const [reopenAfterLogout, setReopenAfterLogout] = useState(false)

  useEffect(() => {
    if (!ready || authenticated || !reopenAfterLogout) return
    setReopenAfterLogout(false)
    void login()
  }, [authenticated, login, ready, reopenAfterLogout])

  async function handleClick() {
    if (authenticated) {
      setReopenAfterLogout(true)
      await logout()
      return
    }
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
