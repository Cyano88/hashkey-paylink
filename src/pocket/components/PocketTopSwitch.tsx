import { Banknote, Coins, History, Landmark, Lightbulb, Phone, Radio, Store, Tv, Wallet, Wifi } from 'lucide-react'

export type PocketHeaderMode = 'wallet' | 'move' | 'bills' | 'activity'
export type PocketWalletSwitchView = 'smart' | 'x402'
export type PocketMoveSwitchView = 'usdc' | 'bank' | 'pos'
export type PocketBillSwitchView = 'airtime' | 'data' | 'tv' | 'electricity'
export type PocketActivitySwitchView = 'all' | 'bank' | 'pos' | 'bills' | 'app-pay'

type PocketTopSwitchProps = {
  mode: PocketHeaderMode
  walletView: PocketWalletSwitchView
  moveView: PocketMoveSwitchView | ''
  billView: PocketBillSwitchView
  activityView: PocketActivitySwitchView
  onWalletChange: (view: PocketWalletSwitchView) => void
  onMoveChange: (view: PocketMoveSwitchView) => void
  onBillChange: (view: PocketBillSwitchView) => void
  onActivityChange: (view: PocketActivitySwitchView) => void
}

const walletItems = [
  { key: 'smart', label: 'Smart Wallet', icon: Wallet },
  { key: 'x402', label: 'App Pay', icon: Radio },
] as const

const moveItems = [
  { key: 'usdc', label: 'USDC', icon: Coins },
  { key: 'bank', label: 'Bank', icon: Landmark },
  { key: 'pos', label: 'POS', icon: Store },
] as const

const billItems = [
  { key: 'airtime', label: 'Airtime', icon: Phone },
  { key: 'data', label: 'Data', icon: Wifi },
  { key: 'tv', label: 'TV', icon: Tv },
  { key: 'electricity', label: 'Electricity', icon: Lightbulb },
] as const

const activityItems = [
  { key: 'all', label: 'All', icon: History },
  { key: 'bank', label: 'Bank receive', icon: Landmark },
  { key: 'pos', label: 'POS', icon: Store },
  { key: 'bills', label: 'Bills', icon: Banknote },
  { key: 'app-pay', label: 'App Pay', icon: Radio },
] as const

export default function PocketTopSwitch({
  mode,
  walletView,
  moveView,
  billView,
  activityView,
  onWalletChange,
  onMoveChange,
  onBillChange,
  onActivityChange,
}: PocketTopSwitchProps) {
  const compact = mode === 'bills' || mode === 'activity'
  const items = mode === 'move'
    ? moveItems
    : mode === 'bills'
      ? billItems
      : mode === 'activity'
        ? activityItems
        : walletItems

  return (
    <div className={`pointer-events-auto grid w-full max-w-[430px] gap-1 rounded-full border border-gray-200 bg-gray-100/95 p-1 shadow-[0_10px_30px_rgba(15,23,42,0.12)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#151518]/95 dark:shadow-[0_12px_36px_rgba(0,0,0,0.35)] ${mode === 'move' ? 'grid-cols-3' : mode === 'activity' ? 'grid-cols-5' : compact ? 'grid-cols-4' : 'grid-cols-2'}`}>
      {items.map(({ key, label, icon: Icon }) => {
        const active = mode === 'move'
          ? moveView === key
          : mode === 'bills'
            ? billView === key
            : mode === 'activity'
              ? activityView === key
              : walletView === key
        return (
          <button
            key={key}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => {
              if (mode === 'move') onMoveChange(key as PocketMoveSwitchView)
              else if (mode === 'bills') onBillChange(key as PocketBillSwitchView)
              else if (mode === 'activity') onActivityChange(key as PocketActivitySwitchView)
              else onWalletChange(key as PocketWalletSwitchView)
            }}
            className={[
              'flex min-h-9 min-w-0 items-center justify-center rounded-full font-black transition-all',
              compact ? 'gap-1 px-1 text-[9px]' : 'gap-2 px-3 text-xs',
              active
                ? 'bg-[#ffffff] text-gray-950 shadow-sm dark:text-gray-950'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white',
            ].join(' ')}
          >
            <Icon className={compact ? 'h-3.5 w-3.5 shrink-0' : 'h-4 w-4'} />
            <span className="truncate">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
