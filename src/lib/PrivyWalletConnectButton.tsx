import { type ReactNode } from 'react'
import { useConnectWallet, usePrivy, type ConnectWalletModalOptions } from '@privy-io/react-auth'

type PrivyWalletConnectButtonProps = {
  className?: string
  disabled?: boolean
  options?: ConnectWalletModalOptions
  children: ReactNode
}

export function PrivyWalletConnectButton({
  className,
  disabled,
  options,
  children,
}: PrivyWalletConnectButtonProps) {
  const { ready } = usePrivy()
  const { connectWallet } = useConnectWallet()

  return (
    <button
      type="button"
      onClick={() => connectWallet(options)}
      disabled={disabled || !ready}
      className={className}
    >
      {children}
    </button>
  )
}
