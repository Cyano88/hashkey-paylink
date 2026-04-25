import { useRef, useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Loader2, LogOut } from 'lucide-react'
import { useStarknet } from './lib/StarknetContext'
import { truncateAddress } from './lib/utils'

export default function Layout() {
  const { pathname } = useLocation()
  const isPayPage = pathname === '/pay'
  const { address: starkAddress, isConnecting: isStarkConnecting, connect: connectStarknet, disconnect: disconnectStarknet } = useStarknet()
  const [starkDropdownOpen, setStarkDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

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
          <div className="flex items-center gap-2">
            {/* Mainnet badge */}
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              🟢 Mainnet
            </span>

            {/* ── Starknet connection indicator / button ─────────────── */}
            {starkAddress ? (
              /* Connected: address chip with glassmorphism dropdown */
              <div className="relative hidden sm:block" ref={dropdownRef}>
                <button
                  onClick={() => setStarkDropdownOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-700 hover:bg-purple-100 transition-colors"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                  {truncateAddress(starkAddress, 4)}
                </button>
                {starkDropdownOpen && (
                  <>
                    {/* Backdrop */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setStarkDropdownOpen(false)}
                    />
                    {/* Dropdown panel */}
                    <div className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border border-white/60 bg-white/80 shadow-lg backdrop-blur-xl">
                      <div className="border-b border-gray-100 px-3.5 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Starknet</p>
                        <p className="mt-0.5 font-mono text-xs text-gray-700">{truncateAddress(starkAddress, 6)}</p>
                      </div>
                      <button
                        onClick={() => { disconnectStarknet(); setStarkDropdownOpen(false) }}
                        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Disconnect Wallet
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* Not connected: compact connect button */
              <button
                onClick={connectStarknet}
                disabled={isStarkConnecting}
                title="Connect Starknet wallet (ArgentX / Braavos)"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-white px-2.5 py-1 text-xs font-medium text-purple-600 hover:bg-purple-50 transition-colors disabled:opacity-60"
              >
                {isStarkConnecting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-purple-300" />
                )}
                Starknet
              </button>
            )}

            {/* RainbowKit EVM connect button */}
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
              {' · '}
              <a
                href="https://testnet.arcscan.app"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-gray-500 underline-offset-2 hover:underline transition-colors"
              >
                Arc
              </a>
            </p>
          </div>
        </footer>
      )}
    </div>
  )
}
