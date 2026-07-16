import { RefreshCw, Wallet } from 'lucide-react'
import { cn, formatAmount, truncateAddress } from '../../../lib/utils'

export type PocketHomeNetworkKey = 'base' | 'arbitrum' | 'arc' | 'solana'

export type PocketHomeNetwork = {
  key: PocketHomeNetworkKey
  label: string
}

export const POCKET_HOME_NETWORKS: PocketHomeNetwork[] = [
  { key: 'base', label: 'Base' },
  { key: 'arbitrum', label: 'Arbitrum' },
  { key: 'arc', label: 'Arc' },
  { key: 'solana', label: 'Solana' },
]

export type PocketHomeBalanceRow = {
  key: PocketHomeNetworkKey
  balance?: number
  status?: string
}

export type PocketHomeWallet = {
  address: string
}

type PocketHomeOverviewProps = {
  globalBalance: number
  openedWalletCount: number
  networks: PocketHomeNetwork[]
  rows: PocketHomeBalanceRow[]
  wallets: Partial<Record<PocketHomeNetworkKey, PocketHomeWallet>>
  authenticated: boolean
  balanceBusy: boolean
  walletBusy: boolean
  selectedNetwork: PocketHomeNetworkKey
  onRefresh: () => void
  onSelectNetwork: (network: PocketHomeNetworkKey, shouldOpen: boolean) => void
}

export default function PocketHomeOverview({
  globalBalance,
  openedWalletCount,
  networks,
  rows,
  wallets,
  authenticated,
  balanceBusy,
  walletBusy,
  selectedNetwork,
  onRefresh,
  onSelectNetwork,
}: PocketHomeOverviewProps) {
  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-br from-white via-white to-blue-50/70 p-4 shadow-sm dark:border-white/10 dark:from-[#111216] dark:via-[#111216] dark:to-blue-500/[0.08]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Total available</p>
            <p className="mt-1 text-2xl font-black tracking-tight text-gray-950 dark:text-white">${formatAmount(globalBalance, 6)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-bold">
              <span className="rounded-full border border-gray-200 bg-white/80 px-2 py-1 text-gray-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-400">
                {openedWalletCount} of {networks.length} wallets ready
              </span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">USDC</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={!authenticated || balanceBusy}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-600 transition-all hover:bg-gray-100 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300"
            aria-label="Refresh Circle Pocket balance"
          >
            <RefreshCw className={cn('h-4 w-4', balanceBusy && 'animate-spin')} />
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-[#111216]">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-white/[0.07]">
          <div>
            <p className="text-sm font-black text-gray-950 dark:text-white">Wallet networks</p>
            <p className="mt-0.5 text-[11px] text-gray-400">Your USDC across supported networks</p>
          </div>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-black text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
            {openedWalletCount}/{networks.length} ready
          </span>
        </div>
        <div className="space-y-1 p-2">
          {networks.map(network => {
            const row = rows.find(item => item.key === network.key)
            const wallet = wallets[network.key]
            const canOpenWallet = !wallet?.address && authenticated && !walletBusy
            const statusLabel = row?.status === 'error' && wallet?.address
              ? 'Balance unavailable'
              : wallet?.address
                ? 'Ready'
                : authenticated
                  ? 'Open wallet'
                  : 'Sign in to open'
            return (
              <button
                key={network.key}
                type="button"
                onClick={() => onSelectNetwork(network.key, canOpenWallet)}
                disabled={!canOpenWallet && !wallet?.address}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-xl p-3 text-left transition-all',
                  canOpenWallet ? 'hover:bg-gray-50 active:scale-[0.99] dark:hover:bg-white/[0.04]' : 'disabled:cursor-default',
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-300">
                    <Wallet className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-950 dark:text-white">{network.label}</p>
                    <p className="mt-0.5 truncate text-[11px] text-gray-400">{wallet?.address ? truncateAddress(wallet.address) : 'Wallet not opened'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-gray-950 dark:text-white">${formatAmount(row?.balance ?? 0, 6)}</p>
                  <p className={cn('mt-0.5 text-[9px] font-black uppercase tracking-wider', row?.status === 'error' && wallet?.address ? 'text-amber-500' : wallet?.address ? 'text-emerald-500' : 'text-blue-500')}>
                    {walletBusy && selectedNetwork === network.key ? 'Opening' : statusLabel}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
