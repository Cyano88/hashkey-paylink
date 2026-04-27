import { useAccount, useDisconnect } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'

function fmtAddr(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}` }

export function StreamPayHeader() {
  const { address, isConnected } = useAccount()
  const { openConnectModal }     = useConnectModal()
  const { disconnect }           = useDisconnect()

  return (
    // Matches hashkey-paylink.onrender.com exactly:
    // frosted-glass bg, max-w-5xl container, px-4 sm:px-6 py-3 sizing
    <header className="sticky top-0 z-50 border-b border-white/60 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">

        {/* ── Left: Geometric O + StreamPay ── */}
        <a href="/" className="group flex items-center gap-2.5 focus:outline-none">
          <GeometricO />
          {/* text-[15px] font-semibold matches Hash PayLink weight exactly */}
          <span className="text-[15px] font-semibold tracking-tight text-gray-900">
            Stream<span style={{ color: '#3b82f6' }}>Pay</span>
          </span>
        </a>

        {/* ── Right: X · Connect Wallet / Address + Power ── */}
        {/* gap-x-2 matches hashkey-paylink right-side item spacing */}
        <div className="flex items-center gap-x-2">

          {/* X (Twitter) — h-9 w-9 rounded-full, matches reference */}
          <a
            href="https://x.com"
            target="_blank"
            rel="noopener noreferrer"
            title="Follow StreamPay on X"
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 opacity-60 hover:opacity-100 transition-opacity"
          >
            <XLogo />
          </a>

          {/* Address pill — plain mono text, hidden on mobile (matches reference) */}
          {isConnected && address && (
            <span className="hidden sm:block select-none font-mono text-[13px] text-gray-500 pointer-events-none">
              {fmtAddr(address)}
            </span>
          )}

          {/* Connect Wallet — Deep Ash/Black, rounded-full h-9, matches reference shape */}
          {!isConnected && (
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
          {isConnected && (
            <button
              onClick={() => disconnect()}
              title="Disconnect wallet"
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:text-red-500 hover:bg-red-50"
            >
              <PowerIcon />
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
      <circle cx="12" cy="12" r="9.5" stroke="#111827" strokeWidth="2.5" />
      <circle cx="12" cy="12" r="3.5" fill="#111827" />
    </svg>
  )
}

function XLogo() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.213 5.567L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
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
