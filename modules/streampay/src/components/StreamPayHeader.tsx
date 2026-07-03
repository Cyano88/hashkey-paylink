import { Link, useLocation } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../../../../src/lib/ThemeContext'
import { EVM_TREASURY } from '../../../../src/lib/chains'

function useAppPath(path: string): string {
  const { search } = useLocation()
  const params = new URLSearchParams(search)
  const app = params.get('app')
  return app ? `${path}?app=${app}` : path
}

function useModePath(path: string, extras?: Record<string, string>): string {
  const { search } = useLocation()
  const params = new URLSearchParams(search)
  const app = params.get('app')
  const next = new URLSearchParams()
  if (app) next.set('app', app)
  if (extras) {
    Object.entries(extras).forEach(([key, value]) => {
      if (value) next.set(key, value)
    })
  }
  const qs = next.toString()
  return `${path}${qs ? `?${qs}` : ''}`
}

function isTelegramStreamPay(search: string) {
  const params = new URLSearchParams(search)
  const source = (params.get('src') ?? '').toLowerCase()
  return source === 'telegram'
}

export function StreamPayHeader() {
  const { pathname, search } = useLocation()
  const { theme, toggle } = useTheme()

  const isCreatorMode = pathname.startsWith('/creator') || pathname.startsWith('/gate')
  const isAgenticMode = pathname.startsWith('/agentic') || (new URLSearchParams(search).get('mode') ?? '') === 'agentic-streaming'
  const isArenaMode = pathname.startsWith('/arena')
  const telegramMode = isTelegramStreamPay(search)

  const payrollTo = useAppPath('/')
  const creatorTo = useModePath('/creator')
  const agenticTo = useModePath('/agentic', {
    mode: 'agentic-streaming',
    service: 'polymarket-lp',
    recipient: EVM_TREASURY,
    amountPerDay: '0.01',
    duration: '1h',
    wallet: 'circle',
  })
  const arenaTo = useModePath('/arena')
  const navItems = [
    { label: 'Payroll', to: payrollTo, active: !isCreatorMode && !isAgenticMode && !isArenaMode },
    { label: 'Creator', to: creatorTo, active: isCreatorMode },
    { label: 'x402', to: agenticTo, active: isAgenticMode },
    { label: 'Arena', to: arenaTo, active: isArenaMode },
  ] as const

  return (
    <header className="sticky top-0 z-50 border-b border-white/60 dark:border-white/5 bg-white/80 dark:bg-[#111113]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 pt-3 pb-2 sm:px-6">
        <Link to={payrollTo} className="group flex items-center gap-2.5 focus:outline-none">
          <GeometricO />
          <span className="text-[15px] font-semibold tracking-tight">
            <span className="text-gray-900 dark:text-white">Hashpay</span><span style={{ color: '#3b82f6' }}>Stream</span>
          </span>
        </Link>

        <div className="flex items-center gap-x-2">
          {!telegramMode && (
            <div className="hidden sm:flex items-center rounded-full border border-gray-200 dark:border-white/10 bg-gray-50/80 dark:bg-[#1c1c20] p-0.5">
              {navItems.map(item => (
                <Link
                  key={item.label}
                  to={item.to}
                  className="rounded-full px-3 py-1 text-[11px] font-semibold transition-all"
                  style={item.active
                    ? { background: '#ffffff', color: '#111827', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
                    : { color: '#9ca3af' }}
                >
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={toggle}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1c1c20] text-gray-500 dark:text-gray-400 shadow-sm hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {!telegramMode && (
        <div className="mx-auto flex max-w-5xl px-4 pb-3 sm:hidden">
          <div className="grid w-full grid-cols-4 gap-1 rounded-full border border-gray-200 dark:border-white/10 bg-gray-50/80 dark:bg-[#1c1c20] p-0.5">
            {navItems.map(item => (
              <Link
                key={item.label}
                to={item.to}
                className={[
                  'rounded-full px-2 py-1.5 text-center text-[10px] font-semibold transition-all',
                  item.active
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-white dark:text-gray-950'
                    : 'text-gray-400',
                ].join(' ')}
              >
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  )
}

function GeometricO() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="transition-transform group-hover:scale-105">
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="2.5" className="text-gray-900 dark:text-white" />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" className="text-gray-900 dark:text-white" />
    </svg>
  )
}
