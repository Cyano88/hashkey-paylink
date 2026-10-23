import { Link, Outlet } from 'react-router-dom'
import '../developer/developer.css'

export default function DeveloperLayout() {
  return <div className="developer-surface min-h-screen bg-[#f5f5f7] font-sans text-gray-950 dark:bg-[#0a0a0a] dark:text-white">
    <a href="#developer-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-3 focus:text-gray-950">Skip to content</a>
    <header className="border-b border-gray-200 bg-white dark:border-white/10 dark:bg-[#0a0a0a]">
      <nav aria-label="Developer portal" className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" aria-label="Hash PayLink developer home" className="flex min-h-11 items-center gap-2.5">
          <img src="/hash-logo-transparent.png" alt="" className="h-7 w-7 object-contain dark:invert" />
          <span className="text-sm font-semibold tracking-normal sm:text-base">Hash PayLink</span>
        </Link>
        <a href="mailto:support@hashpaylink.com" className="inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-gray-600 transition hover:text-gray-950 dark:text-gray-300 dark:hover:text-white">Need help?</a>
      </nav>
    </header>
    <Outlet />
  </div>
}
