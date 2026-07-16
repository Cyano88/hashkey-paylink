import { CheckCheck, Info, LogOut, XCircle } from 'lucide-react'
import { cn, truncateAddress } from '../../../lib/utils'

type RecipientFieldState = {
  address: string
  dirty: boolean
  valid: boolean
  connectedAddress?: string | null
  onChange: (address: string) => void
  onDisconnect?: () => void
}

type PocketRecipientAddressFieldsProps = {
  showEvm: boolean
  showSolana: boolean
  bankSend: boolean
  multiChain: boolean
  selectedNetwork: string
  receiveMode: 'paste' | 'email' | 'bank'
  evm: RecipientFieldState
  solana: RecipientFieldState
}

export function PocketRecipientAddressFields({
  showEvm,
  showSolana,
  bankSend,
  multiChain,
  selectedNetwork,
  receiveMode,
  evm,
  solana,
}: PocketRecipientAddressFieldsProps) {
  const evmConnected = Boolean(evm.connectedAddress && evm.address.toLowerCase() === evm.connectedAddress.toLowerCase())
  const solanaConnected = Boolean(solana.connectedAddress && solana.address === solana.connectedAddress)

  return (
    <>
      {showEvm && (
        <fieldset className="space-y-1.5">
          <label className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              {bankSend ? 'Recipient wallet address' : multiChain ? 'EVM wallet address' : 'Wallet address'}
            </span>
            <span className="hidden text-[11px] font-medium text-gray-400 sm:inline">
              {multiChain ? 'Base · Arc Testnet · Arbitrum' : 'Starts with 0x'}
            </span>
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="0x... wallet address"
              value={evm.address}
              onChange={event => evm.onChange(event.target.value.trim())}
              spellCheck={false}
              autoComplete="off"
              className={cn(
                'w-full rounded-xl border bg-gray-50/60 px-3.5 py-2.5 font-mono text-sm',
                'placeholder:text-gray-400 transition-all focus:bg-white focus:outline-none focus:ring-2 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100 dark:placeholder:text-gray-600 dark:focus:bg-white/[0.06]',
                evm.dirty && !evm.valid
                  ? 'border-red-300 pr-10 text-red-600 focus:ring-red-100 dark:border-red-400/40 dark:text-red-300 dark:focus:ring-red-400/10'
                  : evm.valid
                    ? 'border-emerald-300 text-gray-900 focus:ring-emerald-100 dark:border-emerald-400/40 dark:text-gray-100 dark:focus:ring-emerald-400/10'
                    : 'border-gray-200 text-gray-900 focus:border-[#0071E3]/40 focus:ring-[#0071E3]/15 dark:border-white/10 dark:text-gray-100 dark:focus:border-blue-400/40 dark:focus:ring-blue-400/10',
              )}
            />
            {evm.dirty && !evm.valid && <XCircle className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-red-400" />}
          </div>
          {evm.dirty && !evm.valid && <p className="flex items-center gap-1 text-xs text-red-500"><Info className="h-3 w-3" /> Enter a valid wallet address that starts with 0x</p>}
          {evm.valid && (
            <div className="flex items-center justify-between gap-3">
              <p className="flex min-w-0 items-center gap-1.5 text-xs text-emerald-600">
                <CheckCheck className="h-3 w-3 shrink-0" />
                <span className="truncate">{evmConnected ? `Connected wallet · ${truncateAddress(evm.address, 8)}` : truncateAddress(evm.address, 8)}</span>
              </p>
              {evmConnected && evm.onDisconnect && (
                <button type="button" onClick={evm.onDisconnect} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 transition-colors hover:bg-zinc-200 hover:text-zinc-950 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/15 dark:hover:text-white" aria-label="Disconnect connected wallet">
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500">{multiChain ? 'EVM address for Base, Arc, or Arbitrum.' : 'Paste EVM address.'}</p>
        </fieldset>
      )}

      {showSolana && (
        <fieldset className="space-y-1.5">
          <label className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">Solana wallet address</span>
            <span className="hidden text-[11px] font-medium text-gray-400 sm:inline">No 0x · usually 32-44 chars</span>
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="Solana wallet address"
              value={solana.address}
              onChange={event => solana.onChange(event.target.value.trim())}
              spellCheck={false}
              autoComplete="off"
              className={cn(
                'w-full rounded-xl border bg-gray-50/60 px-3.5 py-2.5 font-mono text-sm',
                'placeholder:text-gray-400 transition-all focus:bg-white focus:outline-none focus:ring-2 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100 dark:placeholder:text-gray-600 dark:focus:bg-white/[0.06]',
                solana.dirty && !solana.valid
                  ? 'border-red-300 pr-10 text-red-600 focus:ring-red-100 dark:border-red-400/40 dark:text-red-300 dark:focus:ring-red-400/10'
                  : solana.valid
                    ? 'border-emerald-300 text-gray-900 focus:ring-emerald-100 dark:border-emerald-400/40 dark:text-gray-100 dark:focus:ring-emerald-400/10'
                    : 'border-gray-200 text-gray-900 focus:border-[#14F195]/40 focus:ring-[#14F195]/15 dark:border-white/10 dark:text-gray-100 dark:focus:border-emerald-400/40 dark:focus:ring-emerald-400/10',
              )}
            />
            {solana.dirty && !solana.valid && <XCircle className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-red-400" />}
          </div>
          {solana.dirty && !solana.valid && <p className="flex items-center gap-1 text-xs text-red-500"><Info className="h-3 w-3" /> Enter a valid Solana wallet address</p>}
          {solana.valid && (
            <div className="flex items-center justify-between gap-3">
              <p className="flex min-w-0 items-center gap-1 text-xs text-emerald-600">
                <CheckCheck className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {receiveMode === 'email'
                    ? `Circle Solana wallet · ${truncateAddress(solana.address, 8)}`
                    : solanaConnected
                      ? `Connected wallet · ${truncateAddress(solana.address, 8)}`
                      : truncateAddress(solana.address, 8)}
                </span>
              </p>
              {solanaConnected && solana.onDisconnect && (
                <button type="button" onClick={solana.onDisconnect} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 transition-colors hover:bg-zinc-200 hover:text-zinc-950 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/15 dark:hover:text-white" aria-label="Disconnect connected wallet">
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          {selectedNetwork === 'solana' && <p className="text-xs text-gray-400 dark:text-gray-500">{receiveMode === 'email' && solana.valid ? 'Circle Solana wallet.' : 'Paste Solana address.'}</p>}
        </fieldset>
      )}
    </>
  )
}
