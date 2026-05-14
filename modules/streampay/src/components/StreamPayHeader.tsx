import { useAccount, useDisconnect } from 'wagmi'
import { useConnectModal }           from '@rainbow-me/rainbowkit'
import { Link, useLocation }         from 'react-router-dom'
import { Moon, Sun }                  from 'lucide-react'
import { useTheme }                   from '../../../../src/lib/ThemeContext'

function fmtAddr(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}` }

// Preserve ?app=streampay (and any other query params) across internal navigation
function useAppPath(path: string): string {
  const { search } = useLocation()
  const params = new URLSearchParams(search)
  const app = params.get('app')
  return app ? `${path}?app=${app}` : path
}

function isTelegramStreamPay(search: string) {
  const params = new URLSearchParams(search)
  const source = (params.get('src') ?? '').toLowerCase()
  const wallet = (params.get('wallet') ?? params.get('mode') ?? '').toLowerCase()
  return source === 'telegram' || wallet === 'circle'
}

export function StreamPayHeader() {
  const { address, isConnected } = useAccount()
  const { openConnectModal }     = useConnectModal()
  const { disconnect }           = useDisconnect()
  const { pathname, search }     = useLocation()
  const { theme, toggle }        = useTheme()

  const isCreatorMode = pathname.startsWith('/creator') || pathname.startsWith('/gate')
  const telegramMode = isTelegramStreamPay(search)

  const payrollTo = useAppPath('/')
  const creatorTo = useAppPath('/creator')

  return (
    <header className="sticky top-0 z-50 border-b border-white/60 dark:border-white/5 bg-white/80 dark:bg-[#111113]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">

        {/* ── Left: Geometric O + StreamPay ── */}
        <Link to={payrollTo} className="group flex items-center gap-2.5 focus:outline-none">
          <GeometricO />
          <span className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">
            Stream<span style={{ color: '#3b82f6' }}>Pay</span>
          </span>
        </Link>

        {/* ── Right: Mode toggle · X · Address · Connect / Power ── */}
        <div className="flex items-center gap-x-2">

          {/* Mode toggle: Payroll ↔ Creator — uses Link for SPA navigation (no reload) */}
          {!telegramMode && (
          <div className="hidden sm:flex items-center rounded-full border border-gray-200 dark:border-white/10 bg-gray-50/80 dark:bg-[#1c1c20] p-0.5">
            <Link
              to={payrollTo}
              className="rounded-full px-3 py-1 text-[11px] font-semibold transition-all"
              style={!isCreatorMode
                ? { background: '#ffffff', color: '#111827', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
                : { color: '#9ca3af' }}
            >
              Payroll
            </Link>
            <Link
              to={creatorTo}
              className="rounded-full px-3 py-1 text-[11px] font-semibold transition-all"
              style={isCreatorMode
                ? { background: '#ffffff', color: '#111827', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
                : { color: '#9ca3af' }}
            >
              Creator
            </Link>
          </div>
          )}

          {/* Address pill — plain mono text, hidden on mobile (matches reference) */}
          {isConnected && address && (
            <span className="hidden sm:block select-none font-mono text-[13px] text-gray-500 pointer-events-none">
              {fmtAddr(address)}
            </span>
          )}

          {/* Connect Wallet — Deep Ash/Black, rounded-full h-9, matches reference shape */}
          {!telegramMode && !isConnected && (
            <button
              onClick={() => openConnectModal?.()}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-white transition-colors"
              style={{ background: '#111827' }}
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-blue-400 animate-pulse" />
              <span className="hidden sm:inline">Connect Wallet</span>
              <span className="sm:hidden">Connect</span>
            </button>
          )}

          {/* Power / Disconnect — h-9 w-9 rounded-full, matches reference */}
          {!telegramMode && isConnected && (
            <button
              onClick={() => disconnect()}
              title="Disconnect wallet"
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:text-red-500 hover:bg-red-50"
            >
              <PowerIcon />
            </button>
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
    </header>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function GeometricO() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      className="transition-transform group-hover:scale-105">
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
