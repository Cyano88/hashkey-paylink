import { Link, Outlet, useLocation } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../lib/ThemeContext'
import '../developer/developer.css'

export default function DeveloperLayout() {
  const operations = useLocation().pathname.startsWith('/admin')
  const { theme, toggle } = useTheme()
  return <div className="developer-surface min-h-screen bg-[#f5f5f7] font-sans text-gray-950 dark:bg-[#0a0a0a] dark:text-white">
    <a href="#developer-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-3 focus:text-gray-950">Skip to content</a>
    <header className="border-b border-gray-200 bg-white dark:border-white/10 dark:bg-[#0a0a0a]">
      <nav aria-label={operations ? 'Hash PayLink Operations' : 'Developer portal'} className={`mx-auto flex h-16 ${operations ? '' : 'max-w-7xl'} items-center justify-between gap-4 px-4 sm:px-6`}>
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
        {operations && <div id="operations-navigation-trigger" className="shrink-0" />}
        <Link to="/" aria-label="Hash PayLink developer home" className="flex min-h-11 shrink-0 items-center gap-2.5">
          <img src="/hash-logo-transparent.png" alt="" className="h-7 w-7 object-contain dark:invert" />
          <span className="text-sm font-semibold tracking-normal sm:text-base">Hash PayLink</span>
        </Link>
        {operations && <div id="operations-workspace-title" className="min-w-0 truncate border-l border-gray-200 pl-3 text-xs text-gray-500 dark:border-white/10 dark:text-gray-400" />}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {!operations && <a href="mailto:support@hashpaylink.com" className="inline-flex min-h-11 items-center text-sm font-medium text-gray-600 dark:text-gray-300">Need help?</a>}
          <button type="button" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10">{theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button>
        </div>
      </nav>
    </header>
    <Outlet />
  </div>
}
