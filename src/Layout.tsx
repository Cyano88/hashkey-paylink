import { useRef, useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Loader2, LogOut, Sparkles, X, Send } from 'lucide-react'
import { useStarknet } from './lib/StarknetContext'
import { truncateAddress } from './lib/utils'

type ChatMsg = { from: 'bot' | 'user'; text: string }

const INITIAL_MESSAGES: ChatMsg[] = [
  { from: 'bot', text: 'Hash Assistant: How can I help you settle this payment?' },
]

const BOT_REPLIES: Record<string, string> = {
  default: 'For further support, reach us at x.com/Hash_PayLink or check the payment link details above.',
}

export default function Layout() {
  const { pathname } = useLocation()
  const isPayPage = pathname === '/pay'
  const { address: starkAddress, isConnecting: isStarkConnecting, connect: connectStarknet, disconnect: disconnectStarknet } = useStarknet()
  const [starkDropdownOpen, setStarkDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // ── Chat state ────────────────────────────────────────────────────────────
  const [chatOpen,    setChatOpen]    = useState(false)
  const [chatInput,   setChatInput]   = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>(INITIAL_MESSAGES)
  const chatEndRef = useRef<HTMLDivElement>(null)

  function handleChatSend() {
    const text = chatInput.trim()
    if (!text) return
    setChatMessages(m => [...m, { from: 'user', text }])
    setChatInput('')
    setTimeout(() => {
      setChatMessages(m => [...m, { from: 'bot', text: BOT_REPLIES.default }])
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 600)
  }

  return (
    <div className="min-h-screen bg-[#F5F5F7] font-inter flex flex-col">
      {/* ── Sticky frosted-glass header ─────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/60 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          {/* Wordmark */}
          <Link to="/" className="group flex items-center gap-2.5 focus:outline-none">
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
                    <div className="fixed inset-0 z-40" onClick={() => setStarkDropdownOpen(false)} />
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

            {/* ── X (Twitter) link ──────────────────────────────────── */}
            <a
              href="https://x.com/Hash_PayLink"
              target="_blank"
              rel="noopener noreferrer"
              title="Follow Hash PayLink on X"
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 opacity-60 hover:opacity-100 transition-opacity"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.213 5.567L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
              </svg>
            </a>

            {/* RainbowKit EVM connect button */}
            <ConnectButton
              showBalance={false}
              chainStatus="icon"
              accountStatus={{ smallScreen: 'avatar', largeScreen: 'full' }}
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
              <a href="https://explorer.hsk.xyz" target="_blank" rel="noopener noreferrer"
                className="font-medium text-gray-500 underline-offset-2 hover:underline transition-colors">
                HashKey Chain
              </a>
              {' · '}
              <a href="https://basescan.org" target="_blank" rel="noopener noreferrer"
                className="font-medium text-gray-500 underline-offset-2 hover:underline transition-colors">
                Base
              </a>
              {' · '}
              <a href="https://starkscan.co" target="_blank" rel="noopener noreferrer"
                className="font-medium text-gray-500 underline-offset-2 hover:underline transition-colors">
                Starknet
              </a>
              {' · '}
              <a href="https://testnet.arcscan.app" target="_blank" rel="noopener noreferrer"
                className="font-medium text-gray-500 underline-offset-2 hover:underline transition-colors">
                Arc
              </a>
            </p>
          </div>
        </footer>
      )}

      {/* ── Chat FAB ─────────────────────────────────────────────────────── */}
      {/* Terminal window */}
      {chatOpen && (
        <div
          className="fixed bottom-20 right-4 sm:right-6 z-50 w-72 sm:w-80 rounded-2xl overflow-hidden shadow-2xl animate-slide-up"
          style={{ border: '1px solid rgba(0,255,65,0.25)', background: '#0d0d0d' }}
        >
          {/* Title bar */}
          <div className="flex items-center justify-between px-4 py-2.5"
            style={{ background: '#111', borderBottom: '1px solid rgba(0,255,65,0.15)' }}>
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5" style={{ color: '#00FF41' }} />
              <span className="text-xs font-semibold tracking-wide" style={{ color: '#00FF41' }}>
                Hash Assistant
              </span>
            </div>
            <button
              onClick={() => setChatOpen(false)}
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Messages */}
          <div className="h-48 overflow-y-auto px-4 py-3 space-y-2 font-mono text-xs"
            style={{ scrollbarWidth: 'none' }}>
            {chatMessages.map((msg, i) => (
              <div key={i} className={msg.from === 'bot' ? 'text-left' : 'text-right'}>
                <span
                  className="inline-block rounded-lg px-3 py-1.5 leading-relaxed"
                  style={msg.from === 'bot'
                    ? { background: '#1a1a1a', color: '#00FF41', border: '1px solid rgba(0,255,65,0.2)' }
                    : { background: '#1e3a5f', color: '#7dd3fc' }
                  }
                >
                  {msg.text}
                </span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 px-3 py-2.5"
            style={{ borderTop: '1px solid rgba(0,255,65,0.15)', background: '#111' }}>
            <span className="font-mono text-xs" style={{ color: '#00FF41' }}>{'>'}</span>
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleChatSend()}
              placeholder="Type a message…"
              className="flex-1 bg-transparent font-mono text-xs text-gray-200 placeholder-gray-600 focus:outline-none"
            />
            <button
              onClick={handleChatSend}
              disabled={!chatInput.trim()}
              className="shrink-0 disabled:opacity-30 transition-opacity"
              style={{ color: '#00FF41' }}
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* FAB button */}
      <button
        onClick={() => setChatOpen(v => !v)}
        className="fixed bottom-6 right-4 sm:right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full transition-all duration-200 active:scale-95"
        style={{
          background: '#0d0d0d',
          border: '1px solid rgba(0,255,65,0.35)',
          boxShadow: chatOpen
            ? '0 0 0 3px rgba(0,255,65,0.15), 0 0 20px rgba(0,255,65,0.35)'
            : '0 0 16px rgba(0,255,65,0.25)',
        }}
        title="Hash Assistant"
      >
        <Sparkles className="h-5 w-5" style={{ color: '#00FF41' }} />
      </button>
    </div>
  )
}
