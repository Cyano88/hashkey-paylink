import { useAccount, useDisconnect } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'

function shortAddr(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}` }

export function StreamPayHeader() {
  const { address, isConnected } = useAccount()
  const { openConnectModal }     = useConnectModal()
  const { disconnect }           = useDisconnect()

  return (
    <header className="w-full bg-white border-b border-gray-100 sticky top-0 z-40">
      <div className="w-full max-w-screen-xl mx-auto px-4 md:px-8 h-14 flex items-center justify-between">

        {/* ── Left: Geometric O + StreamPay ── */}
        <a href="/" className="flex items-center gap-2.5" style={{ textDecoration: 'none' }}>
          <GeometricO />
          <span className="text-[16px] font-bold tracking-tight leading-none select-none">
            <span style={{ color: '#111827' }}>Stream</span>
            <span style={{ color: '#3b82f6' }}>Pay</span>
          </span>
        </a>

        {/* ── Right: X + Wallet ── */}
        <div className="flex items-center gap-2.5">
          <a
            href="https://x.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="X (Twitter)"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <XLogo />
          </a>

          {isConnected && address ? (
            <div className="flex items-center gap-1.5">
              <span className="hidden sm:flex items-center font-mono text-[12px] text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 h-8 leading-none select-none">
                {shortAddr(address)}
              </span>
              <button
                onClick={() => disconnect()}
                title="Disconnect wallet"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-red-200 hover:text-red-500 transition-colors"
              >
                <PowerIcon />
              </button>
            </div>
          ) : (
            <button
              onClick={() => openConnectModal?.()}
              className="flex items-center gap-1.5 rounded-lg px-3.5 h-8 text-[13px] font-semibold text-white transition-colors active:scale-[0.97]"
              style={{ background: '#111827' }}
            >
              Connect Wallet
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
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="11" cy="11" r="9"   stroke="#111827" strokeWidth="2.5" />
      <circle cx="11" cy="11" r="3.5" fill="#111827" />
    </svg>
  )
}

function XLogo() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.841L1.254 2.25H8.08l4.261 5.632L18.244 2.25z" />
    </svg>
  )
}

function PowerIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
      <line x1="12" y1="2" x2="12" y2="12" />
    </svg>
  )
}
