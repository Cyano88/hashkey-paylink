import { useEffect, useRef, useState } from 'react'
import { Outlet, Link, useLocation, useSearchParams } from 'react-router-dom'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { useAccount, useDisconnect, useSwitchChain } from 'wagmi'
import { ChevronDown, MessageCircle, Power, X, Send, ExternalLink, Search, Sun, Moon } from 'lucide-react'
import { useStarknet } from './lib/StarknetContext'
import { useSolana }   from './lib/SolanaContext'
import { useTheme }    from './lib/ThemeContext'
import { CHAIN_META } from './lib/chains'
import type { ChainKey } from './lib/chains'

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
  text: 'Hello! I am the Hash PayLink support assistant.\n\nI can help you create payment links, understand how to pay, track transactions, explain fees, and answer questions about Base, HashKey, Arc, Starknet, and Solana.\n\nPaste a transaction hash to track it instantly, or describe what you need help with.',
}

const CONTACT_MSG: ChatMsg = {
  from: 'bot',
  text: 'For issues beyond my scope, the Hash PayLink team is available via:\n\n• Email: support@hashpaylink.com\n• X (Twitter): @Hash_PayLink\n\nPlease note — only reach out through those official channels. Hash PayLink will never DM you first or ask for your private key or seed phrase. Any unsolicited message offering help or asking for wallet access is a phishing attempt.',
}

function keywordReply(input: string): ChatMsg | null {
  const low = input.toLowerCase()

  // ── Platform overview ────────────────────────────────────────────────────────
  if (low.includes('what is') || low.includes('how does') || low.includes('overview') || low.includes('about') || (low.includes('how') && low.includes('work')))
    return { from: 'bot', text: 'Hash PayLink is a non-custodial, multi-chain payment platform. Merchants create a shareable payment link in seconds — no account or KYC required. Payers can pay by connecting a wallet OR by sending directly from any exchange, cold wallet, or CEX using the "Send via Address" option. Supported chains: Base, HashKey, Arc, Starknet, and Solana. The platform charges a flat 0.2% fee at settlement, deducted automatically on-chain.' }

  // ── Creating a link ──────────────────────────────────────────────────────────
  if (low.includes('create') || low.includes('generate') || low.includes('make') || low.includes('build') || low.includes('new link'))
    return { from: 'bot', text: 'To create a payment link:\n1. Go to the home page and connect your wallet.\n2. Enter the amount (or enable Flexible Amount so the payer chooses).\n3. Select your preferred chain — Base, HashKey, Arc, Starknet, or Solana.\n4. Optionally enable Multi-Payer Collection or add a memo.\n5. Click Generate Link — share the URL or QR code with your payer.\n\nYour wallet address is embedded in the link. You never need to share it separately.' }

  // ── How to pay ───────────────────────────────────────────────────────────────
  if ((low.includes('how') && low.includes('pay')) || low.includes('paying') || low.includes('make a payment') || low.includes('as a payer'))
    return { from: 'bot', text: 'To pay via a Hash PayLink:\n1. Open the payment link shared with you.\n2. Choose "Send via Address" (recommended — works from any exchange or cold wallet without connecting anything), or "Connect Wallet" if you prefer browser wallet signing.\n3. For Send via Address: copy the displayed vault address and send the exact amount to it. Payment is detected automatically within seconds.\n4. For Connect Wallet: approve the transaction in your wallet. Gas is sponsored on Base and Arc — you pay nothing extra.\n\nA success screen confirms delivery.' }

  // ── Send via Address / Direct Send ──────────────────────────────────────────
  if (low.includes('send via') || low.includes('direct') || low.includes('no wallet') || low.includes('without wallet') || low.includes('cex') || low.includes('exchange') || low.includes('cold wallet') || low.includes('copy address'))
    return { from: 'bot', text: '"Send via Address" lets you pay from anywhere — Binance, Coinbase, a hardware wallet, or any other source — without connecting a browser extension. You simply copy the unique vault address shown on the payment page and send the exact amount to it. The payment is detected on-chain automatically and settled within seconds. No wallet connection, no approvals needed.' }

  // ── Multi-payer / event / collection mode ────────────────────────────────────
  if (low.includes('multi') || low.includes('event') || low.includes('collection') || low.includes('group') || low.includes('organis') || low.includes('organiz') || low.includes('dashboard') || low.includes('attendee'))
    return { from: 'bot', text: 'Multi-Payer Collection mode lets you collect payments from many people using a single link — ideal for events, group orders, or community fundraises. Each payer enters their name before paying, which gets logged on the organizer dashboard with their amount, chain, and timestamp. The dashboard auto-refreshes every 5 seconds. You can export all payments as a CSV. Enable it by toggling "Multi-Payer Collection" when creating a link.' }

  // ── Flexible amount ──────────────────────────────────────────────────────────
  if (low.includes('flex') || low.includes('any amount') || low.includes('payer choose') || low.includes('custom amount'))
    return { from: 'bot', text: 'Flexible Amount lets the payer enter any amount they choose rather than a fixed figure. On the payment page they type in the amount before paying. Useful for tips, donations, or pay-what-you-want scenarios. Enable it during link creation by toggling "Flexible Amount".' }

  // ── Fees ────────────────────────────────────────────────────────────────────
  if (low.includes('fee') || low.includes('cost') || low.includes('charge') || low.includes('0.2') || low.includes('platform fee') || low.includes('how much'))
    return { from: 'bot', text: 'Hash PayLink charges a flat 0.2% platform fee, deducted automatically at settlement from the payment amount before it reaches the recipient. For example, a 100 USDC payment results in 99.8 USDC delivered. There are no subscription fees, hidden charges, or monthly costs. Gas fees are sponsored by the platform on Base and Arc — payers pay nothing extra for gas.' }

  // ── Gas / gasless ────────────────────────────────────────────────────────────
  if (low.includes('gas') || low.includes('gasless') || low.includes('free gas') || low.includes('sponsored'))
    return { from: 'bot', text: 'Gas is fully sponsored on Base (via EIP-2612 permit + Multicall3) and Arc (native USDC gas, covered by the relayer). On Starknet, gas is sponsored by AVNU Paymaster — payers sign in USDC with no STRK required. On HashKey, native HSK gas costs are minimal and paid by the relayer. On Solana, the platform relayer pays the network fee. In all cases, payers only send the payment amount.' }

  // ── Chains — Base ────────────────────────────────────────────────────────────
  if ((low.includes('base') && !low.includes('database')) || low.includes('basescan') || low.includes('coinbase wallet'))
    return { from: 'bot', text: 'Base is an Ethereum L2 built by Coinbase. Hash PayLink supports Base Mainnet for USDC payments. Gas is sponsored — payers pay zero gas. Compatible wallets: MetaMask, Coinbase Smart Wallet, Rainbow, and any WalletConnect-supported wallet. Transactions confirm in seconds. Explorer: basescan.org' }

  // ── Chains — HashKey ─────────────────────────────────────────────────────────
  if (low.includes('hashkey') || low.includes('hsk'))
    return { from: 'bot', text: 'HashKey Chain is an EVM-compatible network using HSK as its native token. Hash PayLink supports HSK payments on HashKey Mainnet. Payers can send HSK directly via "Send via Address" from any source without connecting a wallet. The platform collects a 0.2% fee in HSK at settlement. Explorer: explorer.hsk.xyz' }

  // ── Chains — Arc ─────────────────────────────────────────────────────────────
  if (low.includes('arc') || low.includes('arcscan'))
    return { from: 'bot', text: 'Arc is an EVM chain that uses USDC as its native gas token — meaning gas is paid in USDC, not ETH. Hash PayLink is live on Arc Testnet (Chain ID 5042002). It is a great way to test the platform without using real funds. Faucet available at the Arc testnet faucet. Explorer: testnet.arcscan.app' }

  // ── Chains — Starknet ────────────────────────────────────────────────────────
  if (low.includes('starknet') || low.includes('argent') || low.includes('braavos') || low.includes('strk'))
    return { from: 'bot', text: 'Starknet payments use Circle native USDC on Starknet Mainnet. Compatible wallets: ArgentX and Braavos. Gas is sponsored by AVNU Paymaster — no STRK needed. Transactions are final when status shows ACCEPTED_ON_L2, which happens in seconds. Full L1 settlement takes 2–4 hours but is not required for the payment to be usable. Explorer: starkscan.co' }

  // ── Chains — Solana ──────────────────────────────────────────────────────────
  if (low.includes('solana') || low.includes('phantom') || low.includes('solflare') || low.includes('sol'))
    return { from: 'bot', text: 'Solana payments use native USDC on Solana Mainnet. Compatible wallets: Phantom and Solflare. Gas is sponsored by the platform relayer — payers only sign the USDC transfer. "Send via Address" is also supported on Solana. Transactions confirm in under a second. Explorer: solscan.io' }

  // ── QR code ──────────────────────────────────────────────────────────────────
  if (low.includes('qr') || low.includes('scan') || low.includes('qr code'))
    return { from: 'bot', text: 'Every payment link includes a downloadable QR code on the link generation screen. Payers can scan it with any camera app to open the payment page directly. High-resolution QR codes are available for print materials. The QR code encodes the full payment link including amount, recipient, and chain.' }

  // ── Wrong chain / network ────────────────────────────────────────────────────
  if (low.includes('wrong chain') || low.includes('wrong network') || low.includes('different chain') || low.includes('different network') || low.includes('wrong address') || low.includes('sent to wrong'))
    return { from: 'bot', text: 'If funds were sent to the correct address but on the wrong chain, recovery depends on whether the platform has infrastructure deployed on that chain. Hash PayLink uses a universal deterministic vault system — in most cases the operations team can deploy the vault on the receiving chain and recover funds. Contact the team immediately via support@hashpaylink.com with your transaction hash and we will investigate.' }

  // ── Pending / stuck ──────────────────────────────────────────────────────────
  if (low.includes('pending') || low.includes('stuck') || low.includes('not arrived') || low.includes('not received') || low.includes('not confirmed'))
    return { from: 'bot', text: 'If a payment shows pending:\n• On Base/Arc: the transaction is in the mempool. Paste the tx hash here for a live status check.\n• On HashKey: transactions typically confirm within 2–5 seconds.\n• On Starknet: wait for ACCEPTED_ON_L2 status — this confirms payment is final.\n• On Solana: confirmations happen in under a second. If pending for more than 30 seconds, the transaction may have been dropped — retry.\n\nPaste your transaction hash and I will check the status now.' }

  // ── Refund / cancel ──────────────────────────────────────────────────────────
  if (low.includes('refund') || low.includes('cancel') || low.includes('reverse') || low.includes('undo') || low.includes('wrong amount'))
    return { from: 'bot', text: 'Blockchain transactions are irreversible once confirmed. Hash PayLink is fully non-custodial — we do not hold funds at any point and cannot initiate reversals. If you sent the wrong amount, you will need to coordinate a refund directly with the recipient. If you believe there was a technical error, contact support@hashpaylink.com with your transaction hash.' }

  // ── Track / status ───────────────────────────────────────────────────────────
  if (low.includes('track') || low.includes('status') || low.includes('check') || low.includes('verify'))
    return { from: 'bot', text: 'Paste your transaction hash directly into this chat and I will query it live across Base, HashKey, Arc, and Starknet. A valid EVM transaction hash starts with 0x and is 66 characters long.' }

  // ── Security / non-custodial ─────────────────────────────────────────────────
  if (low.includes('safe') || low.includes('secure') || low.includes('trust') || low.includes('custody') || low.includes('custodial') || low.includes('open source'))
    return { from: 'bot', text: 'Hash PayLink is fully non-custodial and trustless. Funds flow directly from payer to recipient via auditable smart contracts — the platform never holds or controls any funds. Payment links are stateless; all parameters are encoded in the URL. Smart contracts are open source and verifiable on-chain. The 0.2% platform fee is the only deduction, enforced on-chain at settlement.' }

  // ── Phishing / scam ──────────────────────────────────────────────────────────
  if (low.includes('phish') || low.includes('scam') || low.includes('fake') || low.includes('suspicious') || low.includes('seed phrase') || low.includes('private key'))
    return { from: 'bot', text: 'Warning: Hash PayLink will NEVER ask for your private key, seed phrase, or wallet password. We will never DM you first on any platform. Only interact with links from hashpaylink.com. If you receive a suspicious message claiming to be from Hash PayLink, ignore it and report it to support@hashpaylink.com. Stay safe.' }

  // ── Contact / escalate ───────────────────────────────────────────────────────
  if (low.includes('contact') || low.includes('support') || low.includes('help') || low.includes('human') || low.includes('email') || low.includes('team') || low.includes('speak to') || low.includes('talk to'))
    return CONTACT_MSG

  // ── FX / local currency ──────────────────────────────────────────────────────
  if (low.includes('naira') || low.includes('ngn') || low.includes('ghana') || low.includes('ghs') || low.includes('kenya') || low.includes('kes') || low.includes('singapore') || low.includes('sgd') || low.includes('fx') || low.includes('local currency') || low.includes('exchange rate'))
    return { from: 'bot', text: 'Hash PayLink supports local currency display for Multi-Payer Collection links. Organisers can enable FX display for NGN (Nigerian Naira), GHS (Ghanaian Cedi), KES (Kenyan Shilling), or SGD (Singapore Dollar). Payers see the equivalent in their local currency and can type in either local currency or USDC — the platform always settles in USDC. Rates are live from Fixer.io or a custom rate set by the organiser.' }

  // ── SDK / integration ────────────────────────────────────────────────────────
  if (low.includes('sdk') || low.includes('api') || low.includes('integrate') || low.includes('developer') || low.includes('embed') || low.includes('widget'))
    return { from: 'bot', text: 'Hash PayLink offers an SDK for developers. You can embed a payment button, use a hosted checkout, or integrate via URL parameters. The SDK supports React and vanilla JS. For full documentation, visit hashpaylink.com or contact support@hashpaylink.com for integration support.' }

  return null
}

// ─── Shared outlet context (Layout → child pages) ────────────────────────────
export type LayoutOutletContext = {
  selectedNet:      ChainKey
  onNetworkSelect:  (key: ChainKey) => void
  onPayChainChange: (key: ChainKey) => void  // payer page → mirror current chain in header pill
}

// ─── Network Toolkit ─────────────────────────────────────────────────────────
const ALL_NETWORKS = [CHAIN_META.base, CHAIN_META.hashkey, CHAIN_META.arc, CHAIN_META.starknet, CHAIN_META.solana]

function StarknetIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2L14 10L22 12L14 14L12 22L10 14L2 12L10 10Z" />
    </svg>
  )
}

// Pure display component — all switching logic lives in Layout.
function NetworkToolkit({
  activeKey,
  locked,
  onSwitch,
}: {
  activeKey: ChainKey | null
  locked?: boolean
  onSwitch?: (key: ChainKey) => void
}) {
  const [open, setOpen] = useState(false)
  const displayNet = activeKey ? CHAIN_META[activeKey] : null
  const otherNets  = ALL_NETWORKS.filter(n => n.key !== activeKey)

  function handleSwitch(key: ChainKey) {
    setOpen(false)
    onSwitch?.(key)
  }

  return (
    <div className="relative">
      <button
        onClick={locked ? undefined : () => setOpen(v => !v)}
        className={[
          'inline-flex h-9 items-center gap-1.5 rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1c1c20] px-3',
          'text-[13px] font-medium text-gray-700 dark:text-gray-200 shadow-sm transition-colors',
          locked ? 'cursor-default' : 'hover:bg-gray-50 dark:hover:bg-white/5',
        ].join(' ')}
      >
        {displayNet?.key === 'starknet' ? (
          <StarknetIcon className="h-2.5 w-2.5 shrink-0 text-purple-500" />
        ) : (
          <span className={`h-2 w-2 shrink-0 rounded-full ${displayNet?.dotColor ?? 'bg-gray-400'}`} />
        )}
        <span className="hidden sm:inline">{displayNet?.label ?? 'Network'}</span>
        {!locked && <ChevronDown className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />}
      </button>

      {open && !locked && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-[#1c1c20] shadow-md">
            <div className="border-b border-gray-100 dark:border-white/6 px-3.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Switch to</p>
            </div>
            {otherNets.map(net => {
              const isTestnet = 'isTestnet' in net && !!(net as { isTestnet?: boolean }).isTestnet
              return (
                <button
                  key={net.key}
                  onClick={() => handleSwitch(net.key)}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  {net.key === 'starknet' ? (
                    <StarknetIcon className="h-3.5 w-3.5 shrink-0 text-purple-500" />
                  ) : (
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${net.dotColor}`} />
                  )}
                  <span className="flex-1 text-[13px] font-medium text-gray-800 dark:text-gray-100">{net.label}</span>
                  {isTestnet && (
                    <span className="rounded border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-600">
                      Testnet
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Layout() {
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const isPayPage  = pathname === '/pay'
  const isDashPage = pathname === '/event'
  // Both the pay page and the dashboard show a locked chain pill from the URL param
  const pageNetParam = (isPayPage || isDashPage) ? (searchParams.get('net') as ChainKey | null) : null
  const activeNet = (pageNetParam && pageNetParam in CHAIN_META) ? pageNetParam : null
  // Recipient address shown on dashboard header (evm or solana)
  const dashRecipient = isDashPage
    ? (searchParams.get('evm') || searchParams.get('sol') || '')
    : ''

  // ── Wallet connections ───────────────────────────────────────────────────────
  const { address: evmAddress, isConnected: evmConnected, chainId: evmChainId } = useAccount()
  const { disconnect: disconnectEvm } = useDisconnect()
  const { switchChain }               = useSwitchChain()
  const { openConnectModal }          = useConnectModal()
  const { address: starkAddress,  connect: connectStarknet,  disconnect: disconnectStarknet  } = useStarknet()
  const { address: solanaAddress, connect: connectSolana,   disconnect: disconnectSolana    } = useSolana()

  const anyConnected = evmConnected || !!starkAddress || !!solanaAddress
  const evmNetKey    = evmConnected
    ? ([CHAIN_META.base, CHAIN_META.hashkey, CHAIN_META.arc] as const).find(n => n.chainId === evmChainId)?.key ?? null
    : null
  const connectedNetKey: ChainKey | null = starkAddress ? 'starknet' : solanaAddress ? 'solana' : evmNetKey
  const displayAddress = starkAddress ?? solanaAddress ?? evmAddress ?? null
  const fmtAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

  // selectedNet = user's intent (which network they want); may lead connectedNetKey during transition
  const [selectedNet, setSelectedNet] = useState<ChainKey | null>(null)
  // Tracks the active chain on the payer page so the header pill mirrors it
  const [payChain,    setPayChain]    = useState<ChainKey | null>(null)

  // Sync selectedNet when a wallet actually connects / chain changes.
  // Guard: never override an explicit Solana selection — that would cause a
  // race where disconnectEvm() is async and the effect fires before it settles.
  useEffect(() => {
    if (evmConnected && evmNetKey && selectedNet !== 'solana') setSelectedNet(evmNetKey)
  }, [evmConnected, evmNetKey])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (starkAddress && selectedNet !== 'solana') setSelectedNet('starknet')
  }, [starkAddress])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Network-select handler (called by NetworkToolkit dropdown) ────────────
  function handleNetworkSelect(key: ChainKey) {
    setSelectedNet(key)

    if (key === 'solana') {
      // Switching to Solana: drop EVM/Starknet connections
      if (evmConnected) disconnectEvm()
      if (starkAddress) disconnectStarknet()
      return
    }
    // Switching away from Solana: drop Solana connection
    if (solanaAddress) disconnectSolana()
    if (evmConnected && key !== 'starknet') {
      // EVM → EVM: switch chain in-place, wallet stays connected
      const id = (CHAIN_META[key] as { chainId?: number }).chainId
      if (id) switchChain({ chainId: id })
    } else if (evmConnected && key === 'starknet') {
      // EVM → Starknet: drop EVM, user must click Connect Wallet for Starknet
      disconnectEvm()
    } else if (starkAddress && key !== 'starknet') {
      // Starknet → EVM: drop Starknet, user must click Connect Wallet for EVM
      disconnectStarknet()
    }
    // Fully disconnected: just update intent, Connect Wallet will act on it
  }

  // ── Connect Wallet handler (action depends on selectedNet intent) ─────────
  function handleConnectWallet() {
    if (selectedNet === 'starknet') {
      connectStarknet()
    } else if (selectedNet === 'solana') {
      connectSolana()
    } else {
      openConnectModal?.()
    }
  }

  function disconnectAll() {
    if (evmConnected)  disconnectEvm()
    if (starkAddress)  disconnectStarknet()
    if (solanaAddress) disconnectSolana()
    setSelectedNet(null)
  }

  const { theme, toggle: toggleTheme } = useTheme()

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
        text: 'Investigating transaction across Base, HashKey, Arc, and Starknet. Please wait…',
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
      text: 'I can help with creating links, how to pay, transaction tracking, fees, chain behaviour, and more. Try asking things like "how do I pay?", "what is the platform fee?", or paste a transaction hash for a live status check.\n\nIf you need to speak to someone, type "contact" and I will share our support channels.',
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
    <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#111113] font-inter flex flex-col">
      {/* ── Sticky frosted-glass header ─────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/60 dark:border-white/5 bg-white/80 dark:bg-[#111113]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          {/* Wordmark */}
          <Link to="/" className="group flex items-center gap-2.5 focus:outline-none">
            <img
              src="/hash-logo.png"
              alt="Hash PayLink"
              className="w-8 h-8 object-contain transition-transform group-hover:scale-105 dark:invert dark:mix-blend-screen"
            />
            <span className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">
              Hash{' '}
              <span className="text-[#0071E3]">PayLink</span>
            </span>
          </Link>

          {/* Right side — single horizontal baseline */}
          <div className="flex items-center gap-x-2">

            {/* 1. Network Toolkit — locked pill on pay/dashboard pages; interactive elsewhere */}
            {(isPayPage || isDashPage)
              ? <NetworkToolkit activeKey={isPayPage ? (payChain ?? activeNet) : activeNet} locked />
              : <NetworkToolkit activeKey={selectedNet ?? 'base'} onSwitch={handleNetworkSelect} />
            }

            {/* Recipient address — dashboard only, truncated, muted */}
            {isDashPage && dashRecipient && (
              <span className="hidden sm:block select-none font-mono text-[13px] text-gray-400 dark:text-gray-500 pointer-events-none">
                {fmtAddr(dashRecipient)}
              </span>
            )}

            {/* Wallet controls — hidden on pay page and organizer dashboard (read-only pages) */}
            {!isPayPage && !isDashPage && (
              <>
                {/* Identity — plain address text when connected */}
                {anyConnected && displayAddress && (
                  <span className="hidden sm:block select-none font-mono text-[13px] text-gray-500 dark:text-gray-400 pointer-events-none">
                    {fmtAddr(displayAddress)}
                  </span>
                )}

                {/* Connect Wallet — when disconnected */}
                {!anyConnected && (
                  <button
                    onClick={handleConnectWallet}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1c1c20] px-3 text-[13px] font-medium text-gray-700 dark:text-gray-200 shadow-sm hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="hidden sm:inline">Connect Wallet</span>
                  </button>
                )}

                {/* Power — disconnect all */}
                {anyConnected && (
                  <button
                    onClick={disconnectAll}
                    title="Disconnect all wallets"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 dark:text-gray-500 transition-colors hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                  >
                    <Power className="h-4 w-4" />
                  </button>
                )}
              </>
            )}

            {/* Theme toggle — always visible */}
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1c1c20] text-gray-500 dark:text-gray-400 shadow-sm hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

          </div>
        </div>
      </header>

      {/* ── Page content ─────────────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <Outlet context={{ selectedNet: selectedNet ?? 'base', onNetworkSelect: handleNetworkSelect, onPayChainChange: setPayChain } satisfies LayoutOutletContext} />
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      {!isPayPage && (
        <footer className="border-t border-gray-100 dark:border-white/5 bg-white/50 dark:bg-[#111113]/50 py-5">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <p className="text-center text-xs text-gray-400">
              Built on{' '}
              {[
                { label: 'HashKey Chain', href: 'https://explorer.hsk.xyz' },
                { label: 'Base',          href: 'https://basescan.org' },
                { label: 'Starknet',      href: 'https://starkscan.co' },
                { label: 'Arc',           href: 'https://testnet.arcscan.app' },
                { label: 'Solana',        href: 'https://solscan.io' },
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
