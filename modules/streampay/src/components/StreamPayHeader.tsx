import { usePrivy } from '@privy-io/react-auth'
import { Link, useLocation } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../../../../src/lib/ThemeContext'
import { PrivyConnectButton } from '../../../../src/lib/PrivyConnectButton'
import { PrivyDisconnectButton } from '../../../../src/lib/PrivyDisconnectButton'
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
  const wallet = (params.get('wallet') ?? params.get('mode') ?? '').toLowerCase()
  return source === 'telegram' || wallet === 'circle'
}

function emailFromPrivyUser(user: unknown) {
  if (!user || typeof user !== 'object') return ''
  const record = user as Record<string, unknown>
  const directEmail = record.email
  if (directEmail && typeof directEmail === 'object') {
    const address = (directEmail as Record<string, unknown>).address
    if (typeof address === 'string') return address
  }
  for (const key of ['google', 'apple']) {
    const provider = record[key]
    if (provider && typeof provider === 'object') {
      const email = (provider as Record<string, unknown>).email
      if (typeof email === 'string') return email
    }
  }
  return ''
}

export function StreamPayHeader() {
  const { authenticated, user } = usePrivy()
  const { pathname, search } = useLocation()
  const { theme, toggle } = useTheme()
  const email = emailFromPrivyUser(user)

  const isCreatorMode = pathname.startsWith('/creator') || pathname.startsWith('/gate')
  const isAgenticMode = pathname.startsWith('/agentic') || (new URLSearchParams(search).get('mode') ?? '') === 'agentic-streaming'
  const isArenaMode = pathname.startsWith('/arena')
  const telegramMode = isTelegramStreamPay(search)

  const payrollTo = useAppPath('/')
  const agenticTo = useModePath('/agentic', {
    mode: 'agentic-streaming',
    service: 'polymarket-lp',
    recipient: EVM_TREASURY,
    amount: '5',
    duration: '7d',
    wallet: 'circle',
  })
  const arenaTo = useModePath('/arena')
  const navItems = [
    { label: 'Payroll', to: payrollTo, active: !isCreatorMode && !isAgenticMode && !isArenaMode },
    { label: 'Agentic', to: agenticTo, active: isAgenticMode },
    { label: 'Arena', to: arenaTo, active: isArenaMode },
  ] as const

  return (
    <header className="sticky top-0 z-50 border-b border-white/60 dark:border-white/5 bg-white/80 dark:bg-[#111113]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <Link to={payrollTo} className="group flex items-center gap-2.5 focus:outline-none">
          <GeometricO />
          <span className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">
            Stream<span style={{ color: '#3b82f6' }}>Pay</span>
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
                  {item.label}
                </Link>
              ))}
            </div>
          )}

          {authenticated && email && (
            <span className="hidden max-w-[180px] truncate sm:block select-none text-[13px] text-gray-500 pointer-events-none">
              {email}
            </span>
          )}

          {!telegramMode && !authenticated && (
            <PrivyConnectButton className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#111827] px-3 text-[13px] font-medium text-white transition-colors disabled:opacity-60">
              <span className="h-2 w-2 shrink-0 rounded-full bg-blue-400 animate-pulse" />
              <span>Sign in</span>
            </PrivyConnectButton>
          )}

          {!telegramMode && authenticated && (
            <PrivyDisconnectButton
              title="Sign out"
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:text-red-500 hover:bg-red-50 disabled:opacity-60"
            >
              <PowerIcon />
            </PrivyDisconnectButton>
          )}

          {telegramMode && (
            <button
              type="button"
              onClick={toggle}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1c1c20] text-gray-500 dark:text-gray-400 shadow-sm hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>
      {!telegramMode && (
        <div className="mx-auto flex max-w-5xl px-4 pb-3 sm:hidden">
          <div className="grid w-full grid-cols-3 gap-1 rounded-full border border-gray-200 dark:border-white/10 bg-gray-50/80 dark:bg-[#1c1c20] p-0.5">
            {navItems.map(item => (
              <Link
                key={item.label}
                to={item.to}
                className={[
                  'rounded-full px-2 py-1.5 text-center text-[11px] font-semibold transition-all',
                  item.active
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-white dark:text-gray-950'
                    : 'text-gray-400',
                ].join(' ')}
              >
                {item.label}
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

function PowerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
      <line x1="12" y1="2" x2="12" y2="12" />
    </svg>
  )
}
