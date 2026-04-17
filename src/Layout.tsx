import { Outlet, Link, useLocation } from 'react-router-dom'
import { ConnectButton } from '@rainbow-me/rainbowkit'

export default function Layout() {
  const { pathname } = useLocation()
  const isPayPage = pathname === '/pay'

  return (
    <div className="min-h-screen bg-[#F5F5F7] font-inter flex flex-col">
      {/* ── Sticky frosted-glass header ─────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/60 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          {/* Wordmark */}
          <Link
            to="/"
            className="group flex items-center gap-2.5 focus:outline-none"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-black text-white text-sm select-none shadow-sm transition-transform group-hover:scale-105">
              ⬡
            </div>
            <span className="text-[15px] font-semibold tracking-tight text-gray-900">
              Hash{' '}
              <span className="text-[#0071E3]">PayLink</span>
            </span>
          </Link>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Mainnet badge */}
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              🟢 Mainnet
            </span>

            {/* RainbowKit connect button */}
            <ConnectButton
              showBalance={false}
              chainStatus="icon"
              accountStatus={{
                smallScreen: 'avatar',
                largeScreen: 'full',
              }}
            />
          </div>
        </div>
      </header>

      {/* ── Page content ─────────────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <Outlet />
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      {!isPayPage && (
        <footer className="border-t border-gray-100 bg-white/50 py-5">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <p className="text-center text-xs text-gray-400">
              Built on{' '}
              <a
                href="https://explorer.hsk.xyz"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-gray-500 underline-offset-2 hover:underline transition-colors"
              >
                HashKey Chain
              </a>
              {' · '}
              <a
                href="https://basescan.org"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-gray-500 underline-offset-2 hover:underline transition-colors"
              >
                Base
              </a>
              {' · '}
              <a
                href="https://starkscan.co"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-gray-500 underline-offset-2 hover:underline transition-colors"
              >
                Starknet
              </a>
            </p>
          </div>
        </footer>
      )}
    </div>
  )
}
