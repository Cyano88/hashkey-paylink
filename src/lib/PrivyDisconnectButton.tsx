import type { ReactNode } from 'react'
import { usePrivy } from '@privy-io/react-auth'

type PrivyDisconnectButtonProps = {
  className?: string
  title?: string
  onDisconnectWallets?: () => void
  children: ReactNode
}

export function PrivyDisconnectButton({
  className,
  title,
  onDisconnectWallets,
  children,
}: PrivyDisconnectButtonProps) {
  const { ready, logout } = usePrivy()

  async function handleClick() {
    onDisconnectWallets?.()
    await logout()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!ready}
      title={title}
      className={className}
    >
      {children}
    </button>
  )
}
