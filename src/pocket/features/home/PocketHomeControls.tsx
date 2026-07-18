import { Activity, ArrowRight, CheckCheck, Copy, Download, LayoutDashboard, Loader2, Mail, Wallet } from 'lucide-react'
import { PrivyConnectButton } from '../../../lib/PrivyConnectButton'
import { cn, formatAmount } from '../../../lib/utils'
import type { PocketHomeNetwork, PocketHomeNetworkKey } from './PocketHomeOverview'
import PocketSlideAction, { type PocketSlideActionStatus } from '../../components/PocketSlideAction'

export type PocketHomeTab = 'balance' | 'fund' | 'withdraw' | 'activity'

type PocketHomeControlsProps = {
  tab: PocketHomeTab
  networks: PocketHomeNetwork[]
  selectedNetwork: PocketHomeNetworkKey
  selectedNetworkLabel: string
  selectedAddress: string
  selectedBalance: number
  copied: boolean
  walletBusy: boolean
  withdrawAddress: string
  withdrawAmount: string
  withdrawPending: boolean
  withdrawNotice: string
  withdrawStatus: PocketSlideActionStatus
  sessionActivity: string[]
  error: string
  onTabChange: (tab: PocketHomeTab) => void
  onNetworkChange: (network: PocketHomeNetworkKey) => void
  onCopyAddress: () => void
  onOpenWallet: () => void
  onWithdrawAddressChange: (address: string) => void
  onWithdrawAmountChange: (amount: string) => void
  onWithdrawMax: () => void
  onWithdraw: () => void
}

const tabs = [
  { key: 'balance', label: 'Balance', icon: Activity },
  { key: 'fund', label: 'Fund', icon: Download },
  { key: 'withdraw', label: 'Withdraw', icon: ArrowRight },
  { key: 'activity', label: 'Activity', icon: LayoutDashboard },
] as const

export function PocketHomeSignInCard() {
  return (
    <div className="overflow-hidden rounded-[26px] border border-gray-200 bg-[#F5F5F7]/95 p-2 shadow-[0_12px_36px_rgba(15,23,42,0.1)] dark:border-white/10 dark:bg-[#151518]/95 dark:shadow-[0_16px_44px_rgba(0,0,0,0.3)]">
      <PrivyConnectButton className="group relative flex min-h-14 w-full items-center justify-center rounded-full bg-gray-950 px-16 py-1.5 text-center text-sm font-semibold text-white shadow-sm transition-all hover:bg-black active:scale-[0.98] disabled:opacity-60 dark:bg-white/[0.12] dark:text-white dark:hover:bg-white/[0.16]">
        <Mail className="absolute left-5 h-4 w-4" />
        <span>Sign in to Smart Wallet</span>
        <span className="absolute right-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 transition-transform group-hover:translate-x-0.5">
          <ArrowRight className="h-4 w-4" />
        </span>
      </PrivyConnectButton>
      <p className="px-3 pb-1 pt-2 text-center text-[11px] font-medium text-gray-400 dark:text-gray-500">Secure access with email or your connected wallet.</p>
    </div>
  )
}

export default function PocketHomeControls({
  tab,
  networks,
  selectedNetwork,
  selectedNetworkLabel,
  selectedAddress,
  selectedBalance,
  copied,
  walletBusy,
  withdrawAddress,
  withdrawAmount,
  withdrawPending,
  withdrawNotice,
  withdrawStatus,
  sessionActivity,
  error,
  onTabChange,
  onNetworkChange,
  onCopyAddress,
  onOpenWallet,
  onWithdrawAddressChange,
  onWithdrawAmountChange,
  onWithdrawMax,
  onWithdraw,
}: PocketHomeControlsProps) {
  const withdrawalValue = Number(withdrawAmount)
  const withdrawalReady = Boolean(
    selectedAddress
    && withdrawAddress.trim()
    && /^\d+(?:\.\d{1,6})?$/.test(withdrawAmount.trim())
    && Number.isFinite(withdrawalValue)
    && withdrawalValue > 0
    && withdrawalValue <= selectedBalance,
  )

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-[#17181d]">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onTabChange(key)}
            className={cn(
              'flex min-h-[46px] flex-col items-center justify-center gap-1 rounded-lg border px-1.5 text-[10px] font-bold transition-all',
              tab === key
                ? 'border-gray-300 bg-gray-100 text-gray-950 shadow-sm dark:border-white/15 dark:bg-white/[0.12] dark:text-white'
                : 'border-transparent bg-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {(tab === 'fund' || tab === 'withdraw') && (
        <div className="grid grid-cols-4 gap-1.5">
          {networks.map(network => (
            <button
              key={network.key}
              type="button"
              onClick={() => onNetworkChange(network.key)}
              className={cn(
                'flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-[9px] font-bold transition-all',
                selectedNetwork === network.key
                  ? 'border-gray-950 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400 dark:hover:border-white/20 dark:hover:text-gray-200',
              )}
            >
              <span className={cn('flex h-6 w-6 items-center justify-center overflow-hidden rounded-lg', network.logoCanvas === 'dark' ? 'bg-gray-950' : 'bg-white')}>
                <img src={network.logo} alt="" className="h-full w-full object-contain grayscale" />
              </span>
              <span className="truncate">{network.label}</span>
              {network.key === 'arc' && <span className="rounded-full bg-blue-500/10 px-1.5 text-[7px] font-black uppercase tracking-wide text-blue-600 dark:text-blue-300">Test</span>}
            </button>
          ))}
        </div>
      )}

      {tab === 'fund' && (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111216]">
          <div className="flex items-center justify-between gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300">
              <Download className="h-[18px] w-[18px]" />
            </span>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-gray-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-400">
              {selectedNetworkLabel} only
            </span>
          </div>
          {selectedAddress ? (
            <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Your funding address</p>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 break-all text-xs font-semibold leading-5 text-gray-700 dark:text-gray-200">{selectedAddress}</p>
                <button
                  type="button"
                  onClick={onCopyAddress}
                  aria-label={copied ? 'Funding address copied' : 'Copy funding address'}
                  title={copied ? 'Copied' : 'Copy address'}
                  className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white px-2 text-[10px] font-bold text-gray-600 shadow-sm transition-all active:scale-95 dark:border-white/10 dark:bg-white/[0.07] dark:text-gray-200"
                >
                  {copied ? <CheckCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied && <span>Copied</span>}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenWallet}
              disabled={walletBusy}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950"
            >
              {walletBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              Open {selectedNetworkLabel} Circle wallet
            </button>
          )}
        </div>
      )}

      {tab === 'withdraw' && (
        <div className="space-y-3 rounded-[24px] border border-gray-100 bg-gradient-to-b from-white to-gray-50/80 p-4 shadow-[0_14px_38px_rgba(15,23,42,0.08)] dark:border-white/10 dark:from-[#15161a] dark:to-[#101115]">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-white/[0.04]">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Available on {selectedNetworkLabel}</span>
            <span className="text-sm font-black tabular-nums text-gray-950 dark:text-white">${formatAmount(selectedBalance, 6)} USDC</span>
          </div>
          {selectedAddress ? (
            <>
              <label className="block">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Destination wallet</span>
                <input
                  type="text"
                  value={withdrawAddress}
                  onChange={event => onWithdrawAddressChange(event.target.value.trim())}
                  placeholder={selectedNetwork === 'solana' ? 'Destination Solana address' : '0x destination address'}
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-medium text-gray-900 outline-none transition focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Amount</span>
                <span className="mt-1 flex gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={withdrawAmount}
                    onChange={event => onWithdrawAmountChange(event.target.value)}
                    placeholder="0.00"
                    className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-medium text-gray-900 outline-none transition focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                  />
                  <button type="button" onClick={onWithdrawMax} className="rounded-xl border border-gray-200 px-3 text-xs font-black text-gray-700 dark:border-white/10 dark:text-gray-200">Max</button>
                </span>
              </label>
              <PocketSlideAction
                status={withdrawPending ? 'pending' : withdrawStatus}
                disabled={!withdrawalReady}
                onConfirm={onWithdraw}
                labels={{
                  pending: 'Confirming transfer',
                  submitted: 'Still confirming',
                  successful: 'Sent',
                }}
              />
            </>
          ) : (
            <button
              type="button"
              onClick={onOpenWallet}
              disabled={walletBusy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950"
            >
              {walletBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              Open {selectedNetworkLabel} wallet first
            </button>
          )}
          {withdrawNotice && <p className={cn('text-center text-xs font-semibold', withdrawStatus === 'successful' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-300')}>{withdrawNotice}</p>}
        </div>
      )}

      {tab === 'activity' && (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111216]">
          {sessionActivity.length ? (
            <div className="space-y-2">
              {sessionActivity.map((item, index) => (
                <div key={`${item}-${index}`} className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-white/[0.04]">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-gray-500 shadow-sm dark:bg-white/[0.07] dark:text-gray-300"><Activity className="h-3.5 w-3.5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-gray-700 dark:text-gray-200">{item}</span>
                    <span className="mt-0.5 block text-[10px] font-medium text-gray-400">This session</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-36 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/70 px-4 text-center dark:border-white/10 dark:bg-white/[0.025]">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-gray-400 shadow-sm dark:bg-white/[0.07]"><Activity className="h-[18px] w-[18px]" /></span>
              <p className="mt-3 text-sm font-bold text-gray-700 dark:text-gray-200">No wallet activity yet</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-400">Funding, address copies, and withdrawals from this session will appear here.</p>
            </div>
          )}
        </div>
      )}

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">{error}</p>}
    </div>
  )
}
