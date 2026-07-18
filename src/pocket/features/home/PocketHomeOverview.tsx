import { useEffect, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn, truncateAddress } from '../../../lib/utils'
import type { PocketFxQuote } from '../../api/pocketFxClient'
import { formatPocketDisplayAmount } from '../../lib/pocketMoney'

type PocketBalanceCurrency = 'USDC' | 'NGN'
const POCKET_BALANCE_CURRENCIES: PocketBalanceCurrency[] = ['USDC', 'NGN']
const POCKET_BALANCE_CURRENCY_KEY = 'pocket.balanceCurrency'

function initialBalanceCurrency(): PocketBalanceCurrency {
  if (typeof window === 'undefined') return 'USDC'
  return window.localStorage.getItem(POCKET_BALANCE_CURRENCY_KEY) === 'NGN' ? 'NGN' : 'USDC'
}

function formatNaira(value: number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

export type PocketHomeNetworkKey = 'base' | 'arbitrum' | 'arc' | 'solana'

export type PocketHomeNetwork = {
  key: PocketHomeNetworkKey
  label: string
  logo: string
  logoCanvas: 'light' | 'dark'
}

export const POCKET_HOME_NETWORKS: PocketHomeNetwork[] = [
  { key: 'base', label: 'Base', logo: '/brand/base-logo.jpeg', logoCanvas: 'light' },
  { key: 'arbitrum', label: 'Arbitrum', logo: '/brand/arbitrum-logo.jpeg', logoCanvas: 'light' },
  { key: 'arc', label: 'Arc', logo: '/brand/arc-logo.jpeg', logoCanvas: 'dark' },
  { key: 'solana', label: 'Solana', logo: '/brand/solana-logo.jpeg', logoCanvas: 'dark' },
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
  fxQuote: PocketFxQuote | null
  fxBusy: boolean
  fxError: string
  networks: PocketHomeNetwork[]
  rows: PocketHomeBalanceRow[]
  wallets: Partial<Record<PocketHomeNetworkKey, PocketHomeWallet>>
  authenticated: boolean
  walletBusy: boolean
  selectedNetwork: PocketHomeNetworkKey
  onSelectNetwork: (network: PocketHomeNetworkKey, shouldOpen: boolean) => void
  controls?: ReactNode
  showNetworks: boolean
}

export default function PocketHomeOverview({
  globalBalance,
  fxQuote,
  fxBusy,
  fxError,
  networks,
  rows,
  wallets,
  authenticated,
  walletBusy,
  selectedNetwork,
  onSelectNetwork,
  controls,
  showNetworks,
}: PocketHomeOverviewProps) {
  const [balanceCurrency, setBalanceCurrency] = useState<PocketBalanceCurrency>(initialBalanceCurrency)
  const nairaBalance = fxQuote ? globalBalance * fxQuote.rate : null

  useEffect(() => {
    window.localStorage.setItem(POCKET_BALANCE_CURRENCY_KEY, balanceCurrency)
  }, [balanceCurrency])

  const moveBalanceCurrency = (direction: -1 | 1) => {
    const currentIndex = POCKET_BALANCE_CURRENCIES.indexOf(balanceCurrency)
    const nextIndex = (currentIndex + direction + POCKET_BALANCE_CURRENCIES.length) % POCKET_BALANCE_CURRENCIES.length
    setBalanceCurrency(POCKET_BALANCE_CURRENCIES[nextIndex])
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-br from-white via-white to-blue-50/70 p-4 shadow-sm dark:border-white/10 dark:from-[#111216] dark:via-[#111216] dark:to-blue-500/[0.08]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Total available</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-[-0.025em] text-gray-950 dark:text-white">
              {balanceCurrency === 'USDC'
                ? <>{formatPocketDisplayAmount(globalBalance)} <span className="text-sm font-semibold tracking-normal text-gray-400">USDC</span></>
                : nairaBalance === null
                  ? '₦—'
                  : formatNaira(nairaBalance)}
            </p>
            {balanceCurrency === 'NGN' ? (
              <p className="mt-1 text-[11px] font-semibold text-gray-400">
                {nairaBalance === null
                  ? `${formatPocketDisplayAmount(globalBalance)} USDC · ${fxBusy ? 'Loading live rate' : fxError || 'Live rate unavailable'}`
                  : `≈ ${formatPocketDisplayAmount(globalBalance)} USDC`}
              </p>
            ) : null}
            <div className="mt-2 inline-flex items-center rounded-full border border-gray-200 bg-white/75 p-0.5 text-[10px] font-black text-gray-600 shadow-sm dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-300">
              <button
                type="button"
                onClick={() => moveBalanceCurrency(-1)}
                className="flex h-6 w-6 items-center justify-center rounded-full transition hover:bg-gray-100 hover:text-gray-950 dark:hover:bg-white/[0.08] dark:hover:text-white"
                aria-label="Previous balance currency"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-10 px-1 text-center">{balanceCurrency}</span>
              <button
                type="button"
                onClick={() => moveBalanceCurrency(1)}
                className="flex h-6 w-6 items-center justify-center rounded-full transition hover:bg-gray-100 hover:text-gray-950 dark:hover:bg-white/[0.08] dark:hover:text-white"
                aria-label="Next balance currency"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {controls}

      {showNetworks && <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-[#111216]">
        <div className="border-b border-gray-100 px-4 py-3 dark:border-white/[0.07]">
          <div>
            <p className="text-sm font-black text-gray-950 dark:text-white">Wallet networks</p>
            <p className="mt-0.5 text-[11px] text-gray-400">Your USDC across supported networks</p>
          </div>
        </div>
        <div className="space-y-1 p-2">
          {networks.map(network => {
            const row = rows.find(item => item.key === network.key)
            const wallet = wallets[network.key]
            const canOpenWallet = !wallet?.address && authenticated && !walletBusy
            const statusLabel = row?.status === 'error' && wallet?.address
              ? 'Balance unavailable'
              : 'Open wallet'
            const showStatus = authenticated && (!wallet?.address || row?.status === 'error' || (walletBusy && selectedNetwork === network.key))
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
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100 dark:bg-white/[0.06]">
                    <img
                      src={network.logo}
                      alt=""
                      aria-hidden="true"
                      className={cn(
                        'h-6 w-6 object-cover grayscale contrast-200 mix-blend-multiply dark:mix-blend-screen',
                        network.logoCanvas === 'dark' ? 'invert dark:invert-0' : 'dark:invert',
                      )}
                    />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-gray-950 dark:text-white">{network.label}</p>
                      {network.key === 'arc' ? (
                        <span className="rounded-full border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-gray-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-400">
                          Testnet
                        </span>
                      ) : null}
                    </div>
                    {wallet?.address ? <p className="mt-0.5 truncate text-[11px] text-gray-400">{truncateAddress(wallet.address)}</p> : null}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums tracking-[-0.02em] text-gray-950 dark:text-white">{formatPocketDisplayAmount(row?.balance ?? 0)} <span className="text-[10px] font-semibold tracking-normal text-gray-400">USDC</span></p>
                  {showStatus ? (
                    <p className={cn('mt-0.5 text-[9px] font-black uppercase tracking-wider', row?.status === 'error' && wallet?.address ? 'text-amber-500' : 'text-blue-500')}>
                      {walletBusy && selectedNetwork === network.key ? 'Opening' : statusLabel}
                    </p>
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>
      </div>}
    </>
  )
}
