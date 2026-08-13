import { Link, useLocation } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../../../../src/lib/ThemeContext'
import { useStreamPayPath } from '../lib/useStreamPayPath'

function isTelegramStreamPay(search: string) {
  const params = new URLSearchParams(search)
  const source = (params.get('src') ?? '').toLowerCase()
  return source === 'telegram'
}

export function StreamPayHeader() {
  const { search } = useLocation()
  const { theme, toggle } = useTheme()

  const agreementsTo = useStreamPayPath('/')
  const workspaceTo = useStreamPayPath('/agreements')
  const docsTo = useStreamPayPath('/docs')
  const newAgreementTo = useStreamPayPath('/agreements/new')
  const telegramMode = isTelegramStreamPay(search)

  return (
    <header className="sticky top-0 z-50 border-b border-white/60 dark:border-white/5 bg-white/80 dark:bg-[#111113]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 pt-3 pb-2 sm:px-6">
        <Link to={agreementsTo} className="group flex items-center gap-2.5 focus:outline-none" aria-label="HashPayStream home">
          <GeometricO />
          <span className="text-[15px] font-semibold tracking-tight">
            <span className="text-gray-900 dark:text-white">Hashpay</span><span style={{ color: '#3b82f6' }}>Stream</span>
          </span>
        </Link>

        <div className="flex items-center gap-x-1.5 sm:gap-x-2">
          {!telegramMode && (
            <nav className="hidden items-center gap-1 md:flex" aria-label="Primary navigation">
              <Link to={workspaceTo} className="rounded-full px-3 py-2 text-xs font-medium text-gray-500 transition-colors hover:text-gray-950 dark:text-gray-400 dark:hover:text-white">
                Agreements
              </Link>
              <Link to={docsTo} className="rounded-full px-3 py-2 text-xs font-medium text-gray-500 transition-colors hover:text-gray-950 dark:text-gray-400 dark:hover:text-white">
                How it works
              </Link>
            </nav>
          )}
          {!telegramMode && (
            <Link
              to={newAgreementTo}
              className="hidden rounded-full bg-gray-950 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100 sm:inline-flex"
            >
              New agreement
            </Link>
          )}
          {!telegramMode && (
            <Link to={workspaceTo} className="rounded-full px-2.5 py-2 text-[11px] font-semibold text-gray-600 dark:text-gray-300 md:hidden">
              Agreements
            </Link>
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
