import { Activity, Banknote, TrendingUp, UserRound } from './PocketIcons'
import { cn } from '../../lib/utils'

export type PocketNavTab = 'home' | 'bills' | 'activity' | 'profile'

type PocketBottomNavProps = {
  active: PocketNavTab
  disabled?: boolean
  keyboardOpen?: boolean
  onSelect: (tab: PocketNavTab) => void
}

const items = [
  { key: 'home', label: 'Home', icon: Activity },
  { key: 'bills', label: 'Bills', icon: Banknote },
  { key: 'activity', label: 'Activity', icon: TrendingUp },
  { key: 'profile', label: 'Profile', icon: UserRound },
] as const

export default function PocketBottomNav({ active, disabled = false, keyboardOpen = false, onSelect }: PocketBottomNavProps) {
  return (
    <nav
      aria-label="Circle Pocket navigation"
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white px-4 pb-[max(0.35rem,var(--pocket-safe-bottom))] pt-1.5 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] transition-transform duration-200 dark:border-white/[0.08] dark:bg-[#111114] dark:shadow-[0_-10px_30px_rgba(0,0,0,0.24)]',
        keyboardOpen && 'translate-y-full',
      )}
    >
      <div className="pointer-events-auto mx-auto grid w-full max-w-[430px] grid-cols-4 gap-1">
        {items.map(({ key, label, icon: Icon }) => {
          const selected = active === key
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              aria-disabled={disabled || undefined}
              aria-current={selected ? 'page' : undefined}
              onClick={() => onSelect(key)}
              className={cn(
                'flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-xl px-2 text-[10px] font-bold transition-[background-color,color,transform] duration-150 enabled:active:scale-[0.97] disabled:cursor-default',
                selected
                  ? 'bg-gray-950 text-white dark:bg-white dark:text-gray-950'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-white/40 dark:hover:bg-white/[0.05] dark:hover:text-white/70',
              )}
            >
              <Icon
                aria-hidden="true"
                className={cn(
                  'h-[19px] w-[19px] shrink-0 stroke-current',
                  selected ? 'text-white stroke-[2.5] dark:text-gray-950' : 'text-gray-500 dark:text-white/50',
                )}
              />
              <span>{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
