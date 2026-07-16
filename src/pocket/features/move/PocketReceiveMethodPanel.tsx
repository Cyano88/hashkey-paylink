import type { ReactNode } from 'react'
import { CheckCheck, Loader2, LogOut, Mail, Wallet } from 'lucide-react'
import { cn } from '../../../lib/utils'

type ReceiveMode = 'paste' | 'email' | 'bank'

type PocketReceiveMethodPanelProps = {
  receiveMode: ReceiveMode
  canReceiveWithEmail: boolean
  selectedNetwork: string
  networkLabel: string
  recipientPending: boolean
  recipientError: string | null
  recipientAddressLabel: string
  walletBalance: string
  walletReady: boolean
  selectorLabel?: string
  addressOptionLabel?: string
  addressOptionBody?: string
  hideLabel?: boolean
  bankSignInControl?: ReactNode
  emailSignInControl?: ReactNode
  bankFields?: ReactNode
  onSelectPaste: () => void
  onSelectEmail: () => void
  onDisconnectEmail: () => void
}

export function PocketReceiveMethodPanel({
  receiveMode,
  canReceiveWithEmail,
  selectedNetwork,
  networkLabel,
  recipientPending,
  recipientError,
  recipientAddressLabel,
  walletBalance,
  walletReady,
  selectorLabel,
  addressOptionLabel,
  addressOptionBody,
  hideLabel = false,
  bankSignInControl,
  emailSignInControl,
  bankFields,
  onSelectPaste,
  onSelectEmail,
  onDisconnectEmail,
}: PocketReceiveMethodPanelProps) {
  return (
    <div className="space-y-1.5">
      {!hideLabel && (
        <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {selectorLabel ?? (receiveMode === 'bank' ? 'Bank payout' : 'Receive to')}
        </label>
      )}
      {receiveMode === 'bank' && bankSignInControl}
      {receiveMode !== 'bank' && <div className="grid gap-2">
        <button
          type="button"
          onClick={onSelectPaste}
          className={cn(
            'rounded-xl border px-3 py-2.5 text-left transition-all active:scale-[0.99]',
            receiveMode === 'paste'
              ? 'border-gray-900 bg-gray-50 text-gray-900 dark:border-white/30 dark:bg-white/10 dark:text-gray-100'
              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:border-white/20 dark:hover:bg-white/[0.07]',
          )}
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Wallet className="h-4 w-4 text-gray-500" />
            {addressOptionLabel ?? 'Paste wallet address'}
          </span>
          <span className="mt-1 block text-[11px] text-gray-400">{addressOptionBody ?? 'Any wallet or exchange'}</span>
        </button>
        {canReceiveWithEmail && emailSignInControl ? emailSignInControl : canReceiveWithEmail && (
          <button
            type="button"
            onClick={onSelectEmail}
            disabled={recipientPending}
            className={cn(
              'rounded-xl border px-3 py-2.5 text-left transition-all active:scale-[0.99]',
              receiveMode === 'email'
                ? 'border-gray-900 bg-gray-50 text-gray-900 dark:border-white/30 dark:bg-white/10 dark:text-gray-100'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:border-white/20 dark:hover:bg-white/[0.07]',
              recipientPending && 'cursor-not-allowed opacity-70',
            )}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              {recipientPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4 text-blue-500" />}
              Receive with Circle Pocket
            </span>
            <span className="mt-1 block text-[11px] text-gray-400">
              Email-backed Circle wallet
            </span>
          </button>
        )}
      </div>}

      {receiveMode === 'bank' && bankFields}

      {canReceiveWithEmail && receiveMode === 'email' && (
        <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3.5 py-3 dark:border-white/10 dark:bg-white/[0.04]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">
                {selectedNetwork === 'solana' ? 'Circle Solana wallet' : `${networkLabel} Circle wallet`}
              </p>
              <p className="mt-0.5 truncate font-mono text-[11px] text-gray-500 dark:text-gray-400">
                {recipientAddressLabel}
              </p>
              {walletReady && (
                <p className="mt-1 text-[11px] font-medium text-gray-400 dark:text-gray-500">
                  {walletBalance}
                </p>
              )}
            </div>
            {!recipientPending && walletReady && (
              <div className="flex shrink-0 items-center gap-1.5">
                <CheckCheck className="h-4 w-4 text-emerald-500" />
                <button
                  type="button"
                  onClick={onDisconnectEmail}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/80 text-gray-500 transition-colors hover:bg-white hover:text-gray-900 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/15 dark:hover:text-white"
                  aria-label="Disconnect email wallet"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
          {recipientError && <p className="mt-2 text-xs text-red-500">{recipientError}</p>}
        </div>
      )}
      {!canReceiveWithEmail && selectedNetwork === 'solana' && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Circle Pocket receiving for Solana is not enabled here yet.
        </p>
      )}
    </div>
  )
}
