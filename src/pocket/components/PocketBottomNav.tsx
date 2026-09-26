import { Home, Receipt, History, CreditCard, UserRound, TrendingUp, Wallet } from './PocketIcons'
import { useLocation, useNavigate } from 'react-router-dom'
import { isXStocksPath, xStockNavPath } from '../lib/pocketRail'
import { POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'
import { cn } from '../../lib/utils'

export type PocketNavTab = 'home' | 'bills' | 'cards' | 'activity' | 'profile'

type PocketBottomNavProps = {
  active: PocketNavTab
  disabled?: boolean
  keyboardOpen?: boolean
  onSelect: (tab: PocketNavTab) => void
}

const items = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'bills', label: 'Bills', icon: Receipt },
  { key: 'cards', label: 'Cards', icon: CreditCard },
  { key: 'profile', label: 'Profile', icon: UserRound },
] as const

export default function PocketBottomNav({ active, disabled = false, keyboardOpen = false, onSelect }: PocketBottomNavProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const stocks = isXStocksPath(pathname)
  const visibleItems = stocks ? [items[0], { key: 'bills' as const, label: 'XStocks', icon: TrendingUp }, { key: 'activity' as const, label: 'Activity', icon: History }, { key: 'profile' as const, label: 'Portfolio', icon: Wallet }] : items
  return (
    <nav
      aria-label="Pocket navigation"
      style={{ display: keyboardOpen ? 'none' : undefined }}
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white px-4 pb-[max(0.35rem,var(--pocket-safe-bottom))] pt-1.5 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] dark:border-[#262626] dark:bg-[#0b0b0b] dark:shadow-[0_-10px_30px_rgba(0,0,0,0.24)]',
        keyboardOpen && 'translate-y-full',
      )}
    >
      <div className="pointer-events-auto mx-auto grid w-full max-w-[430px] grid-cols-4 gap-1">
        {visibleItems.map(({ key, label, icon: Icon }) => {
          const selected = active === key
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              aria-disabled={disabled || undefined}
              aria-current={selected ? 'page' : undefined}
              aria-label={key === 'cards' ? 'Cards coming soon' : undefined}
              onClick={() => stocks ? navigate(xStockNavPath(key)) : key === 'cards' ? navigate(POCKET_BASE_PATH + POCKET_ROUTES.cards) : onSelect(key)}
              className={cn(
                'flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-xl px-2 text-[10px] font-bold transition-[background-color,color,transform] duration-150 enabled:active:scale-[0.97] disabled:cursor-default',
                selected
                  ? 'text-zinc-950 dark:text-white'
                  : 'text-zinc-400 hover:text-zinc-950 dark:text-zinc-600 dark:hover:text-white',
              )}
            >
              <span className="relative inline-flex">
              <Icon
                aria-hidden="true"
                className={cn(
                  'h-[22px] w-[22px] shrink-0 stroke-current',
                  selected ? 'stroke-[2.5]' : 'stroke-[1.8]',
                )}
              />
              {key === 'cards' && <span aria-hidden="true" className="absolute -right-6 -top-1 rounded-full bg-gray-100 px-1 py-0.5 text-[7px] font-medium leading-none text-gray-500 dark:bg-white/10 dark:text-gray-400">Soon</span>}
              </span>
              <span>{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
