import { ArrowUpDown, Banknote, House, TrendingUp } from 'lucide-react'
import { cn } from '../../lib/utils'

export type PocketNavTab = 'home' | 'move' | 'bills' | 'activity'

type PocketBottomNavProps = {
  active: PocketNavTab
  keyboardOpen?: boolean
  onSelect: (tab: PocketNavTab) => void
}

const items = [
  { key: 'home', label: 'Home', icon: House },
  { key: 'move', label: 'Move', icon: ArrowUpDown },
  { key: 'bills', label: 'Bills', icon: Banknote },
  { key: 'activity', label: 'Activity', icon: TrendingUp },
] as const

export default function PocketBottomNav({ active, keyboardOpen = false, onSelect }: PocketBottomNavProps) {
  return (
    <nav
      aria-label="Circle Pocket navigation"
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-0 z-40 bg-transparent px-4 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2.5 transition-transform duration-200',
        keyboardOpen && 'translate-y-full',
      )}
    >
      <div className="pointer-events-auto mx-auto grid w-full max-w-[430px] grid-cols-4 rounded-full border border-gray-200 bg-[#F5F5F7]/95 p-1.5 shadow-[0_12px_36px_rgba(15,23,42,0.16)] backdrop-blur-2xl dark:border-white/[0.1] dark:bg-[#151518]/95 dark:shadow-[0_16px_50px_rgba(0,0,0,0.4)]">
        {items.map(({ key, label, icon: Icon }) => {
          const selected = active === key
          return (
            <button
              key={key}
              type="button"
              aria-current={selected ? 'page' : undefined}
              onClick={() => onSelect(key)}
              className={cn(
                'flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-full px-2 text-[10px] font-bold transition-all duration-200 active:scale-95',
                selected
                  ? 'bg-gray-950 text-white shadow-sm dark:bg-white/[0.12] dark:text-white dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-white/40 dark:hover:bg-white/[0.05] dark:hover:text-white/70',
              )}
            >
              <Icon className={cn('h-[19px] w-[19px]', selected && 'stroke-[2.5]')} />
              <span>{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
