import { Coins, History, Landmark, Lightbulb, Phone, Store, Tv, Users, Wallet, Wifi } from './PocketIcons'

export type PocketHeaderMode = 'move' | 'bills' | 'activity'
export type PocketMoveSwitchView = 'usdc' | 'bank' | 'pos'
export type PocketBillSwitchView = 'airtime' | 'data' | 'tv' | 'electricity'
export type PocketActivitySwitchView = 'all' | 'purchases' | 'bank' | 'pos' | 'collections'

type PocketTopSwitchProps = {
  mode: PocketHeaderMode
  moveView: PocketMoveSwitchView | ''
  billView: PocketBillSwitchView
  activityView: PocketActivitySwitchView
  onMoveChange: (view: PocketMoveSwitchView) => void
  onBillChange: (view: PocketBillSwitchView) => void
  onActivityChange: (view: PocketActivitySwitchView) => void
}

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
  { key: 'purchases', label: 'Purchases', icon: Wallet },
  { key: 'bank', label: 'Bank receive', icon: Landmark },
  { key: 'pos', label: 'POS', icon: Store },
  { key: 'collections', label: 'Requests', icon: Users },
] as const

export default function PocketTopSwitch({
  mode,
  moveView,
  billView,
  activityView,
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
        : activityItems

  return (
    <div className={`pointer-events-auto grid w-full max-w-[430px] gap-1 rounded-full bg-white/95 p-1 shadow-sm backdrop-blur-2xl dark:bg-white/[0.05] ${mode === 'move' ? 'grid-cols-3' : mode === 'activity' ? 'grid-cols-5' : compact ? 'grid-cols-4' : 'grid-cols-2'}`}>
      {items.map(({ key, label, icon: Icon }) => {
        const active = mode === 'move'
          ? moveView === key
          : mode === 'bills'
            ? billView === key
            : mode === 'activity'
              ? activityView === key
              : activityView === key
        return (
          <button
            key={key}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => {
              if (mode === 'move') onMoveChange(key as PocketMoveSwitchView)
              else if (mode === 'bills') onBillChange(key as PocketBillSwitchView)
              else if (mode === 'activity') onActivityChange(key as PocketActivitySwitchView)
              else onActivityChange(key as PocketActivitySwitchView)
            }}
            className={[
              'flex min-h-9 min-w-0 items-center justify-center rounded-full font-black transition-all',
              compact ? 'gap-1 px-1 text-[9px]' : 'gap-2 px-3 text-xs',
              active
                ? 'bg-gray-950 text-white shadow-sm dark:bg-white dark:text-gray-950'
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
