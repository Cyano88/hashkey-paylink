import { useRef, useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Loader2, LogOut, MessageCircle, X, Send, ExternalLink, Search } from 'lucide-react'
import { useStarknet } from './lib/StarknetContext'
import { truncateAddress } from './lib/utils'

// ─── Input detection ─────────────────────────────────────────────────────────
const TX_HASH_RE = /^0x[0-9a-fA-F]{1,64}$/
const EVM_ADDR_RE = /^0x[0-9a-fA-F]{40}$/

function detectInput(raw: string): 'tx_hash' | 'evm_addr' | 'unknown' {
  const v = raw.trim()
  if (EVM_ADDR_RE.test(v)) return 'evm_addr'
  if (TX_HASH_RE.test(v))  return 'tx_hash'
  return 'unknown'
}

// ─── Chat types ───────────────────────────────────────────────────────────────
type ChatMsg = {
  from: 'bot' | 'user'
  text: string
  link?: { label: string; href: string }
}

const WELCOME: ChatMsg = {
  from: 'bot',
  text: 'Hello. I am your Hash PayLink support agent. I can track live transaction status across Base, HashKey, Starknet, and Arc.\n\nShare a transaction hash or wallet address to begin, or tap "Track Payment" below.',
}

function keywordReply(input: string): ChatMsg | null {
  const low = input.toLowerCase()
  if (low.includes('pending') || low.includes('stuck'))
    return { from: 'bot', text: 'A transaction in pending state has been broadcast to the network but not yet included in a block. This is typically caused by insufficient gas pricing. On Base and Arc, you can resubmit with a higher priority fee to accelerate inclusion. On HashKey, pending transactions usually resolve within seconds. Share your transaction hash for a precise status check.' }
  if (low.includes('fee') || low.includes('gas'))
    return { from: 'bot', text: 'Hash PayLink applies a 0.5% platform fee at the point of settlement. Network gas fees are independent and deducted by the respective chain from your wallet. Arc uses USDC as its native gas token. Starknet gas is denominated in STRK.' }
  if (low.includes('refund') || low.includes('cancel') || low.includes('reverse'))
    return { from: 'bot', text: 'Confirmed on-chain transactions are irreversible by design. Hash PayLink does not have custody over funds at any point and cannot initiate reversals. If a payment was sent to an incorrect address, you will need to coordinate directly with the receiving party.' }
  if (low.includes('starknet') || low.includes('argent') || low.includes('braavos'))
    return { from: 'bot', text: 'Starknet payments require a compatible wallet such as ArgentX or Braavos. Connect your wallet on the payment page and authorise the USDC transfer. The recipient can spend the funds as soon as the transaction status reads ACCEPTED_ON_L2. Full L1 settlement occurs within 2–4 hours and is not required for the payment to be final.' }
  if (low.includes('track') || low.includes('status') || low.includes('check'))
    return { from: 'bot', text: 'To track a specific transaction, paste the hash directly into this chat. A transaction hash starts with 0x and is typically 66 characters long on EVM networks.' }
  return null
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Layout() {
  const { pathname } = useLocation()
  const isPayPage = pathname === '/pay'
  const { address: starkAddress, isConnecting: isStarkConnecting, connect: connectStarknet, disconnect: disconnectStarknet } = useStarknet()
  const [starkDropdownOpen, setStarkDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [chatOpen,     setChatOpen]     = useState(false)
  const [chatInput,    setChatInput]    = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([WELCOME])
  const [isTyping,     setIsTyping]     = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  function scrollToBottom() {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
  }

  function pushBot(msgs: ChatMsg[]) {
    setChatMessages(m => [...m, ...msgs])
    setIsTyping(false)
    scrollToBottom()
  }

  async function handleSend(text = chatInput) {
    const trimmed = text.trim()
    if (!trimmed) return
    setChatMessages(m => [...m, { from: 'user', text: trimmed }])
    setChatInput('')
    scrollToBottom()

    const type = detectInput(trimmed)

    if (type === 'tx_hash') {
      // Show investigating state immediately, then probe live
      setIsTyping(true)
      setChatMessages(m => [...m, {
        from: 'bot',
        text: 'Investigating transaction across Base, HashKey, Arc, and Starknet. Please wait.',
      }])
      scrollToBottom()

      try {
        const res  = await fetch('/api/tx-status', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ hash: trimmed }),
        })
        const data = await res.json() as {
          found: boolean
          network?: string
          status?: 'confirmed' | 'pending'
          explorerName?: string
          explorerUrl?: string
          estimatedSeconds?: number
        }

        if (data.found && data.network && data.status) {
          const body = data.status === 'confirmed'
            ? `Transaction identified on ${data.network}. Current status: Confirmed.\n\nThis transaction has been successfully finalized on-chain.`
            : `Transaction identified on ${data.network}. Current status: Pending.\n\nThis transaction is currently in the mempool. It is expected to settle in approximately ${data.estimatedSeconds ?? '—'} seconds.`
          pushBot([{ from: 'bot', text: body, link: { label: `View on ${data.explorerName}`, href: data.explorerUrl! } }])
        } else {
          pushBot([{ from: 'bot', text: 'This transaction hash could not be located on our supported networks. Please verify the hash and confirm the originating network.' }])
        }
      } catch {
        pushBot([{ from: 'bot', text: 'Unable to reach network nodes at this time. Please try again shortly, or verify the transaction directly on the relevant block explorer.' }])
      }
      return
    }

    if (type === 'evm_addr') {
      pushBot([
        {
          from: 'bot',
          text: 'Wallet address received. To verify a specific payment, share the transaction hash from your wallet history. It begins with 0x and is 66 characters long on EVM networks.',
          link: { label: 'View address on Basescan', href: `https://basescan.org/address/${trimmed}` },
        },
      ])
      return
    }

    // Keyword matching
    const kwReply = keywordReply(trimmed)
    if (kwReply) { pushBot([kwReply]); return }

    pushBot([{
      from: 'bot',
      text: 'I can track live transaction status, explain payment finality, and answer questions about fees or network behaviour. Share a transaction hash or describe your issue.',
    }])
  }

  function handleTrackPayment() {
    setChatMessages(m => [...m, {
      from: 'bot',
      text: 'Please paste your transaction hash below. It begins with 0x and is typically 66 characters long on EVM networks.',
    }])
    scrollToBottom()
  }

  return (
    <div className="min-h-screen bg-[#F5F5F7] font-inter flex flex-col">
      {/* ── Sticky frosted-glass header ─────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/60 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          {/* Wordmark */}
          <Link to="/" className="group flex items-center gap-2.5 focus:outline-none">
            <img
              src="/hash-logo.png"
              alt="Hash PayLink"
              className="w-8 h-8 object-contain transition-transform group-hover:scale-105"
            />
            <span className="text-[15px] font-semibold tracking-tight text-gray-900">
              Hash{' '}
              <span className="text-[#0071E3]">PayLink</span>
            </span>
          </Link>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              🟢 Mainnet
            </span>

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
                {isStarkConnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="h-1.5 w-1.5 rounded-full bg-purple-300" />}
                Starknet
              </button>
            )}

            {/* X (Twitter) link */}
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
              {[
                { label: 'HashKey Chain', href: 'https://explorer.hsk.xyz' },
                { label: 'Base',          href: 'https://basescan.org' },
                { label: 'Starknet',      href: 'https://starkscan.co' },
                { label: 'Arc',           href: 'https://testnet.arcscan.app' },
              ].map((item, i, arr) => (
                <span key={item.label}>
                  <a href={item.href} target="_blank" rel="noopener noreferrer"
                    className="font-medium text-gray-500 underline-offset-2 hover:underline transition-colors">
                    {item.label}
                  </a>
                  {i < arr.length - 1 && ' · '}
                </span>
              ))}
            </p>
          </div>
        </footer>
      )}

      {/* ── Hash Assistant chat window ────────────────────────────────────── */}
      {chatOpen && (
        <div className="fixed bottom-20 right-4 sm:right-6 z-50 w-80 sm:w-96 rounded-2xl overflow-hidden shadow-2xl animate-slide-up"
          style={{ background: '#16181d', border: '1px solid rgba(255,255,255,0.08)' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3"
            style={{ background: '#1e2028', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full"
                style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)' }}>
                <MessageCircle className="h-3.5 w-3.5 text-blue-400" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-white leading-none">Hash Assistant</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Payment Support · On-Chain</p>
              </div>
            </div>
            <button onClick={() => setChatOpen(false)}
              className="flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Messages */}
          <div className="h-64 overflow-y-auto px-4 py-3 space-y-3"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#2d3039 transparent' }}>
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[85%] space-y-1.5">
                  <div
                    className="rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-line"
                    style={msg.from === 'user'
                      ? { background: '#2563eb', color: '#fff', borderBottomRightRadius: 6 }
                      : { background: '#252830', color: '#cbd5e1', borderBottomLeftRadius: 6 }
                    }
                  >
                    {msg.text}
                  </div>
                  {msg.link && (
                    <a href={msg.link.href} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[11px] font-medium text-blue-400 hover:text-blue-300 transition-colors px-1">
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      {msg.link.label}
                    </a>
                  )}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-4 py-3" style={{ background: '#252830', borderBottomLeftRadius: 6 }}>
                  <div className="flex gap-1 items-center h-3">
                    {[0, 1, 2].map(i => (
                      <span key={i} className="h-1.5 w-1.5 rounded-full bg-slate-500"
                        style={{ animation: `bounce 1s ${i * 0.15}s infinite` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick actions */}
          <div className="flex gap-2 px-4 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <button
              onClick={handleTrackPayment}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-slate-300 hover:text-white hover:bg-white/8 transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <Search className="h-3 w-3" />
              Track Payment
            </button>
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 px-4 py-3"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: '#1a1c22' }}>
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Paste a tx hash or ask a question…"
              className="flex-1 bg-transparent text-[13px] text-slate-200 placeholder-slate-600 focus:outline-none"
            />
            <button
              onClick={() => handleSend()}
              disabled={!chatInput.trim()}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white transition-all hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setChatOpen(v => !v)}
        className="fixed bottom-6 right-4 sm:right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full transition-all duration-200 active:scale-95 hover:shadow-lg"
        style={{
          background: chatOpen ? '#1e2028' : '#16181d',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: chatOpen
            ? '0 0 0 3px rgba(59,130,246,0.15), 0 8px 24px rgba(0,0,0,0.4)'
            : '0 4px 20px rgba(0,0,0,0.35)',
        }}
        title="Hash Assistant"
      >
        {chatOpen
          ? <X className="h-5 w-5 text-slate-400" />
          : <MessageCircle className="h-5 w-5 text-slate-300" />
        }
      </button>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); opacity: .4; }
          50%       { transform: translateY(-3px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
