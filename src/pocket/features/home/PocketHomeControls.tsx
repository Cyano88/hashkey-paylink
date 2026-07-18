import { useState } from 'react'
import { Activity, ArrowDownToLine, ArrowLeftRight, ArrowRight, ArrowUpFromLine, CheckCheck, Copy, Download, LayoutDashboard, Loader2, Mail, Send, Wallet } from 'lucide-react'
import { PrivyConnectButton } from '../../../lib/PrivyConnectButton'
import { cn, formatAmount } from '../../../lib/utils'
import type { PocketHomeNetwork, PocketHomeNetworkKey } from './PocketHomeOverview'
import PocketSlideAction, { type PocketSlideActionStatus } from '../../components/PocketSlideAction'
import type { PocketActivityRow } from '../../models/pocketActivity'

export type PocketHomeTab = 'balance' | 'fund' | 'move' | 'activity'

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
  activityRows: PocketActivityRow[]
  activityBusy: boolean
  activityError: string
  bridgeDestinations: Array<'base' | 'arbitrum' | 'solana'>
  bridgeDestination: 'base' | 'arbitrum' | 'solana'
  bridgeAmount: string
  bridgeQuote: { fee: string; total: string; receive: string } | null
  bridgeStatus: 'idle' | 'quoting' | 'confirming' | 'bridging' | 'successful'
  bridgeNotice: string
  bridgeError: string
  error: string
  onTabChange: (tab: PocketHomeTab) => void
  onNetworkChange: (network: PocketHomeNetworkKey) => void
  onCopyAddress: () => void
  onOpenWallet: () => void
  onWithdrawAddressChange: (address: string) => void
  onWithdrawAmountChange: (amount: string) => void
  onWithdrawMax: () => void
  onWithdraw: () => void
  onBridgeDestinationChange: (network: 'base' | 'arbitrum' | 'solana') => void
  onBridgeAmountChange: (amount: string) => void
  onBridgeMax: () => void
  onBridge: () => void
}

const tabs = [
  { key: 'balance', label: 'Balance', icon: Activity },
  { key: 'fund', label: 'Fund', icon: Download },
  { key: 'move', label: 'Move', icon: ArrowLeftRight },
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
  activityRows,
  activityBusy,
  activityError,
  bridgeDestinations,
  bridgeDestination,
  bridgeAmount,
  bridgeQuote,
  bridgeStatus,
  bridgeNotice,
  bridgeError,
  error,
  onTabChange,
  onNetworkChange,
  onCopyAddress,
  onOpenWallet,
  onWithdrawAddressChange,
  onWithdrawAmountChange,
  onWithdrawMax,
  onWithdraw,
  onBridgeDestinationChange,
  onBridgeAmountChange,
  onBridgeMax,
  onBridge,
}: PocketHomeControlsProps) {
  const [moveMode, setMoveModeState] = useState<'send' | 'bridge'>(() => window.sessionStorage.getItem('pocket:home:move-mode') === 'bridge' ? 'bridge' : 'send')
  const setMoveMode = (next: 'send' | 'bridge') => {
    window.sessionStorage.setItem('pocket:home:move-mode', next)
    setMoveModeState(next)
  }
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

      {(tab === 'fund' || tab === 'move') && (
        <div className="grid grid-cols-4 gap-1.5">
          {networks.map(network => (
          <button
            key={network.key}
            type="button"
            onClick={() => onNetworkChange(network.key)}
            disabled={tab === 'move' && moveMode === 'bridge' && network.key === 'arc'}
            className={cn(
              'flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-[9px] font-bold transition-all',
              tab === 'move' && moveMode === 'bridge' && network.key === 'arc' && 'cursor-not-allowed opacity-35',
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

      {tab === 'move' && (
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-sm dark:border-white/10 dark:bg-[#17181d]">
          {([
            { key: 'send', label: 'Send USDC', icon: Send },
            { key: 'bridge', label: 'Bridge USDC', icon: ArrowLeftRight },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                if (key === 'bridge' && selectedNetwork === 'arc') onNetworkChange('base')
                if (moveMode !== key) setMoveMode(key)
              }}
              className={cn('flex min-h-11 items-center justify-center gap-2 rounded-xl border text-xs font-black transition-all', moveMode === key ? 'border-blue-500/30 bg-blue-500/10 text-blue-700 shadow-sm dark:text-blue-300' : 'border-transparent text-gray-500 hover:bg-blue-500/[0.06] hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-300')}
            >
              <Icon className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>
      )}

      {tab === 'move' && moveMode === 'send' && (
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

      {tab === 'move' && moveMode === 'bridge' && (
        <div className="space-y-3 rounded-[24px] border border-gray-100 bg-gradient-to-b from-white to-gray-50/80 p-4 shadow-[0_14px_38px_rgba(15,23,42,0.08)] dark:border-white/10 dark:from-[#15161a] dark:to-[#101115]">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-white/[0.04]">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">From {selectedNetworkLabel}</span>
            <span className="text-sm font-black tabular-nums text-gray-950 dark:text-white">${formatAmount(selectedBalance, 6)} USDC</span>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-semibold text-gray-500 dark:text-gray-400">To your Pocket wallet</p>
            <div className="grid grid-cols-2 gap-2">
              {bridgeDestinations.map(destination => {
                const meta = networks.find(item => item.key === destination)!
                return (
                  <button key={destination} type="button" onClick={() => onBridgeDestinationChange(destination)} className={cn('flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-black transition-all', bridgeDestination === destination ? 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300' : 'border-gray-200 bg-white text-gray-500 hover:border-blue-400/40 hover:bg-blue-500/[0.05] dark:border-white/10 dark:bg-white/[0.03] dark:text-gray-400')}>
                    <span className={cn('h-6 w-6 overflow-hidden rounded-lg', meta.logoCanvas === 'dark' ? 'bg-gray-950' : 'bg-white')}><img src={meta.logo} alt="" className="h-full w-full object-contain grayscale" /></span>
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </div>
          <label className="block">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Amount</span>
            <span className="mt-1 flex gap-2">
              <input type="text" inputMode="decimal" value={bridgeAmount} onChange={event => onBridgeAmountChange(event.target.value)} placeholder="0.00" className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-medium text-gray-900 outline-none transition focus:border-blue-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white" />
              <button type="button" onClick={onBridgeMax} className="rounded-xl border border-gray-200 px-3 text-xs font-black text-gray-700 dark:border-white/10 dark:text-gray-200">Max</button>
            </span>
          </label>
          {bridgeStatus === 'quoting' ? (
            <div className="flex items-center justify-center gap-2 rounded-xl bg-gray-50 px-3 py-3 text-xs font-semibold text-gray-500 dark:bg-white/[0.04]"><Loader2 className="h-3.5 w-3.5 animate-spin" />Getting a live Circle quote</div>
          ) : bridgeQuote ? (
            <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 text-[11px] dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex justify-between gap-3"><span className="text-gray-500">You receive</span><span className="font-black text-gray-900 dark:text-white">{bridgeQuote.receive} USDC</span></div>
              <div className="flex justify-between gap-3"><span className="text-gray-500">Circle + destination fee</span><span className="font-bold text-gray-700 dark:text-gray-200">{bridgeQuote.fee} USDC</span></div>
              <div className="flex justify-between gap-3 border-t border-gray-200 pt-2 dark:border-white/10"><span className="text-gray-500">Total from {selectedNetworkLabel}</span><span className="font-black text-gray-900 dark:text-white">{bridgeQuote.total} USDC</span></div>
            </div>
          ) : null}
          <PocketSlideAction
            status={bridgeStatus === 'successful' ? 'successful' : bridgeStatus === 'bridging' ? 'submitted' : bridgeStatus === 'confirming' ? 'pending' : 'idle'}
            disabled={!bridgeQuote || Number(bridgeQuote.total) > selectedBalance || bridgeStatus === 'quoting'}
            onConfirm={onBridge}
            labels={{ idle: 'Slide to bridge', pending: 'Confirm in Circle', submitted: 'Bridging', successful: 'Bridge complete' }}
          />
          <p className="text-center text-[10px] leading-4 text-gray-400">Native USDC via Circle CCTP. Destination gas is handled by Circle; source network gas may apply.</p>
          {bridgeNotice && <p className={cn('text-center text-xs font-semibold', bridgeStatus === 'successful' ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-300')}>{bridgeNotice}</p>}
          {bridgeError && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">{bridgeError}</p>}
        </div>
      )}

      {tab === 'activity' && (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111216]">
          {activityError ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">{activityError}</p>
          ) : activityRows.length ? (
            <div className="space-y-2">
              {activityRows.slice(0, 10).map((item, index) => {
                const deposit = String(item.source).toLowerCase() === 'wallet-deposit'
                const bridge = String(item.source).toLowerCase() === 'wallet-bridge'
                return (
                <div key={`${item.txHash || item.eventId}-${item.ts}-${index}`} className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-white/[0.04]">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-gray-500 shadow-sm dark:bg-white/[0.07] dark:text-gray-300">{deposit ? <ArrowDownToLine className="h-3.5 w-3.5" /> : bridge ? <ArrowLeftRight className="h-3.5 w-3.5" /> : <ArrowUpFromLine className="h-3.5 w-3.5" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-gray-700 dark:text-gray-200">{deposit ? 'USDC deposit' : bridge ? 'USDC bridge' : 'USDC sent'}</span>
                    <span className="mt-0.5 block truncate text-[10px] font-medium capitalize text-gray-400">{item.chain}{item.contextLabel ? ` · ${item.contextLabel}` : ''}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-xs font-black tabular-nums text-gray-900 dark:text-gray-100">{deposit ? '+' : bridge ? '' : '-'}{formatAmount(Number(item.amount), 6)} USDC</span>
                    <span className="mt-0.5 block text-[9px] font-semibold text-gray-400">{new Date(item.ts).toLocaleDateString()}</span>
                  </span>
                </div>
              )})}
            </div>
          ) : !activityBusy ? (
            <div className="flex min-h-36 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/70 px-4 text-center dark:border-white/10 dark:bg-white/[0.025]">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-gray-400 shadow-sm dark:bg-white/[0.07]"><Activity className="h-[18px] w-[18px]" /></span>
              <p className="mt-3 text-sm font-bold text-gray-700 dark:text-gray-200">No wallet activity yet</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-400">Confirmed USDC deposits and sends will appear here and remain after refresh.</p>
            </div>
          ) : <div className="flex min-h-36 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>}
        </div>
      )}

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">{error}</p>}
    </div>
  )
}
