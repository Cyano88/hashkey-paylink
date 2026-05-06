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
  const has = (...words: string[]) => words.some(w => low.includes(w))

  // ── Phishing / scam (safety — always first) ──────────────────────────────────
  if (has('phish', 'scam', 'fake', 'suspicious', 'seed phrase', 'private key', 'mnemonic', 'fraud', 'hack', 'stolen', 'impostor'))
    return { from: 'bot', text: 'Warning: Hash PayLink will NEVER ask for your private key, seed phrase, or wallet password. We will never DM you first on any platform. Only interact with links from hashpaylink.com. If you receive a suspicious message claiming to be from Hash PayLink, ignore it and report it to support@hashpaylink.com. Stay safe.' }

  // ── Multi-payer / event / collection / dashboard ─────────────────────────────
  if (has('multi', 'multi-payer', 'collection', 'collect', 'event', 'group payment', 'organis', 'organiz', 'dashboard', 'attendee', 'fundrais', 'contributor', 'many payers', 'multiple payers', 'multiple people', 'many people', 'group order', 'split'))
    return { from: 'bot', text: 'Multi-Payer Collection mode lets you collect payments from many people with a single link — ideal for events, group orders, or fundraises.\n\nHow it works:\n1. Enable "Multi-Payer Collection" when creating your link.\n2. Share the link or QR code with participants.\n3. Each payer enters their name or handle before paying — this is logged automatically.\n4. The organizer dashboard shows every payment in real time: name, amount, chain, and timestamp.\n5. Export the full payment list as CSV anytime.\n\nThe dashboard auto-refreshes every 5 seconds. Payments across Base, HashKey, Arc, Starknet, and Solana all appear in one unified view.' }

  // ── Flexible amount ──────────────────────────────────────────────────────────
  if (has('flex', 'flexible', 'any amount', 'payer choose', 'custom amount', 'tip', 'tips', 'pay what', 'open amount', 'variable'))
    return { from: 'bot', text: 'Flexible Amount lets the payer enter any amount they choose rather than a fixed figure. On the payment page they type in the amount before paying. Useful for tips, donations, or pay-what-you-want scenarios. Enable it during link creation by toggling "Flexible Amount".' }

  // ── Send via Address / Direct Send ──────────────────────────────────────────
  if (has('send via', 'send via address', 'direct send', 'no wallet', 'without wallet', 'without connecting', 'cex', 'cold wallet', 'vault address', 'copy address', 'binance', 'coinbase send', 'bybit', 'kraken', 'from exchange', 'from cex'))
    return { from: 'bot', text: '"Send via Address" lets you pay from anywhere — Binance, Coinbase, a hardware wallet, or any other source — without connecting a browser extension. You simply copy the unique vault address shown on the payment page and send the exact amount to it. The payment is detected on-chain automatically and settled within seconds. No wallet connection, no approvals needed.' }

  // ── How to pay ───────────────────────────────────────────────────────────────
  if (has('how to pay', 'paying', 'make a payment', 'i want to pay', 'send payment', 'as a payer', 'payer', 'buyer') || (has('how') && has('pay')))
    return { from: 'bot', text: 'To pay via a Hash PayLink:\n1. Open the payment link shared with you.\n2. Choose "Send via Address" (recommended — works from any exchange or cold wallet without connecting anything), or "Connect Wallet" for browser wallet signing.\n3. Send via Address: copy the vault address shown and send the exact amount. Detected automatically within seconds.\n4. Connect Wallet: approve the transaction in your wallet. Gas is sponsored on Base and Arc.\n\nA success screen with your transaction hash confirms delivery.' }

  // ── Creating a link ──────────────────────────────────────────────────────────
  if (has('create', 'generate', 'make', 'build', 'new link', 'payment link', 'share link', 'set up', 'setup', 'get started', 'merchant', 'seller', 'receive payment', 'start accepting'))
    return { from: 'bot', text: 'To create a payment link:\n1. Go to the home page and connect your wallet.\n2. Enter the amount (or enable Flexible Amount so the payer chooses).\n3. Select your chain — Base, HashKey, Arc, Starknet, or Solana.\n4. Optionally enable Multi-Payer Collection or add a memo.\n5. Click Generate Link — share the URL or QR code.\n\nYour wallet address is embedded in the link. No account or KYC required.' }

  // ── FX / local currency ──────────────────────────────────────────────────────
  if (has('naira', 'ngn', 'ghana', 'ghs', 'kenya', 'kes', 'singapore', 'sgd', 'fx', 'local currency', 'exchange rate', 'fixer', 'black market rate', 'street rate', 'local price', 'currency display', 'local equivalent'))
    return { from: 'bot', text: 'Hash PayLink supports local currency display for Multi-Payer Collection links. Organisers can enable FX display for NGN (Nigerian Naira), GHS (Ghanaian Cedi), KES (Kenyan Shilling), or SGD (Singapore Dollar). Payers see the equivalent in their local currency and can type in either local currency or USDC — the platform always settles in USDC. Rates are live from Fixer.io or a custom/street rate set by the organiser.' }

  // ── QR code ──────────────────────────────────────────────────────────────────
  if (has('qr', 'qr code', 'barcode', 'print', 'download qr', 'scan qr'))
    return { from: 'bot', text: 'Every payment link includes a downloadable QR code on the link generation screen. Payers scan it with any camera app to open the payment page directly. High-resolution QR codes are available for print materials. The QR code encodes the full payment link including amount, recipient, and chain.' }

  // ── SDK / integration ────────────────────────────────────────────────────────
  if (has('sdk', 'api', 'integrate', 'integration', 'developer', 'embed', 'widget', 'button', 'checkout', 'react', 'javascript', 'npm', 'package', 'build on'))
    return { from: 'bot', text: 'Hash PayLink offers an SDK for developers. You can embed a payment button, use a hosted checkout, or integrate via URL parameters. The SDK supports React and vanilla JS. Contact support@hashpaylink.com for integration support.' }

  // ── Fees ─────────────────────────────────────────────────────────────────────
  if (has('fee', 'fees', 'cost', 'charge', '0.2', 'platform fee', 'how much', 'percentage', 'deduction', 'cut', 'commission', 'pricing', 'free'))
    return { from: 'bot', text: 'Hash PayLink charges a flat 0.2% platform fee, deducted automatically at settlement. For example, a 100 USDC payment results in 99.8 USDC delivered. No subscription fees, no hidden charges. Gas is sponsored on Base and Arc — payers pay nothing extra.' }

  // ── Gas / gasless ────────────────────────────────────────────────────────────
  if (has('gas', 'gasless', 'free gas', 'sponsored', 'network fee', 'transaction fee', 'avnu', 'paymaster'))
    return { from: 'bot', text: 'Gas is fully sponsored on Base (EIP-2612 permit + Multicall3), Arc (native USDC gas covered by relayer), Starknet (AVNU Paymaster — no STRK needed), HashKey (relayer pays HSK gas), and Solana (relayer pays SOL fee). Payers only send the payment amount — nothing extra.' }

  // ── Confirmation time ────────────────────────────────────────────────────────
  if (has('how long', 'how fast', 'speed', 'instant', 'confirmation time', 'finality', 'settlement time', 'how quick'))
    return { from: 'bot', text: 'Confirmation times:\n• Base: 2–5 seconds\n• HashKey: 2–5 seconds\n• Arc: 2–5 seconds\n• Starknet: seconds for ACCEPTED_ON_L2 (final); L1 settlement 2–4 hours (not needed for payment)\n• Solana: under 1 second\n\nAll chains provide near-instant finality for practical purposes.' }

  // ── Wrong chain / network ────────────────────────────────────────────────────
  if (has('wrong chain', 'wrong network', 'different chain', 'incorrect chain', 'sent to wrong', 'sent on wrong', 'recover funds', 'recovery'))
    return { from: 'bot', text: 'If funds were sent on the wrong chain, contact the team immediately via support@hashpaylink.com with your transaction hash. Hash PayLink uses a universal deterministic vault system — in most cases funds can be recovered by deploying the vault on the receiving chain.' }

  // ── Pending / stuck ──────────────────────────────────────────────────────────
  if (has('pending', 'stuck', 'not arrived', 'not received', 'not confirmed', 'delayed', 'taking long', 'waiting', 'not showing', 'missing payment', 'where is my'))
    return { from: 'bot', text: 'If a payment is pending:\n• Base/Arc: paste the tx hash here for a live status check.\n• HashKey: confirms in 2–5 seconds normally.\n• Starknet: wait for ACCEPTED_ON_L2 status.\n• Solana: under 1 second — if stuck 30+ seconds, the tx may have dropped, retry.\n\nPaste your transaction hash and I will check it now.' }

  // ── Refund / cancel ──────────────────────────────────────────────────────────
  if (has('refund', 'cancel', 'reverse', 'undo', 'wrong amount', 'sent wrong', 'mistake', 'accidentally', 'chargeback'))
    return { from: 'bot', text: 'Blockchain transactions are irreversible once confirmed. Hash PayLink is fully non-custodial and cannot initiate reversals. Coordinate refunds directly with the recipient. For technical errors, contact support@hashpaylink.com with your transaction hash.' }

  // ── Track / status ───────────────────────────────────────────────────────────
  if (has('track', 'status', 'check', 'verify', 'look up', 'tx hash', 'txhash', 'transaction hash', 'confirmed'))
    return { from: 'bot', text: 'Paste your transaction hash directly into this chat and I will query it live across Base, HashKey, Arc, and Starknet. An EVM transaction hash starts with 0x and is 66 characters long.' }

  // ── Chains — Base ────────────────────────────────────────────────────────────
  if ((has('base') && !has('database')) || has('basescan', 'metamask', 'rainbow wallet', 'layer 2', 'ethereum l2'))
    return { from: 'bot', text: 'Base is an Ethereum L2 by Coinbase. Hash PayLink supports USDC payments on Base Mainnet. Gas is sponsored — zero extra cost to payers. Wallets: MetaMask, Coinbase Smart Wallet, Rainbow, or any WalletConnect wallet. Explorer: basescan.org' }

  // ── Chains — HashKey ─────────────────────────────────────────────────────────
  if (has('hashkey', 'hsk', 'hash key', 'hashkey chain'))
    return { from: 'bot', text: 'HashKey Chain is EVM-compatible and uses HSK as its native token. Payments are made in HSK via "Send via Address" — no wallet connection needed. The platform collects a 0.2% fee at settlement. Explorer: explorer.hsk.xyz' }

  // ── Chains — Arc ─────────────────────────────────────────────────────────────
  if (has('arc', 'arcscan', 'arc testnet', 'arc chain', 'testnet'))
    return { from: 'bot', text: 'Arc is an EVM chain using USDC as its native gas token. Hash PayLink is live on Arc Testnet (Chain ID 5042002) — great for testing without real funds. Explorer: testnet.arcscan.app' }

  // ── Chains — Starknet ────────────────────────────────────────────────────────
  if (has('starknet', 'argent', 'argentx', 'braavos', 'starkscan', 'l2 stark'))
    return { from: 'bot', text: 'Starknet payments use Circle native USDC. Compatible wallets: ArgentX and Braavos. Gas is sponsored by AVNU Paymaster — no STRK needed. Final when ACCEPTED_ON_L2. Explorer: starkscan.co' }

  // ── Chains — Solana ──────────────────────────────────────────────────────────
  if (has('solana', 'phantom', 'solflare', 'solscan'))
    return { from: 'bot', text: 'Solana payments use native USDC. Wallets: Phantom and Solflare. Gas is relayer-sponsored — payers only sign the USDC transfer. "Send via Address" also works on Solana. Confirms in under 1 second. Explorer: solscan.io' }

  // ── Wallet setup / connect ───────────────────────────────────────────────────
  if (has('wallet', 'connect wallet', 'which wallet', 'walletconnect', 'install wallet', 'coinbase wallet', 'rainbow'))
    return { from: 'bot', text: 'Supported wallets:\n• Base / Arc / HashKey: MetaMask, Coinbase Smart Wallet, Rainbow, any WalletConnect wallet.\n• Starknet: ArgentX or Braavos.\n• Solana: Phantom or Solflare.\n\nOr skip wallets entirely — use "Send via Address" to pay from any exchange or cold wallet.' }

  // ── Security / non-custodial ─────────────────────────────────────────────────
  if (has('safe', 'secure', 'trust', 'custody', 'custodial', 'non-custodial', 'open source', 'trustless', 'audit', 'smart contract'))
    return { from: 'bot', text: 'Hash PayLink is fully non-custodial. Funds flow directly from payer to recipient via on-chain smart contracts — the platform never holds funds. Links are stateless, parameters encoded in the URL. Smart contracts are open source and verifiable on-chain. The only deduction is the 0.2% platform fee, enforced on-chain.' }

  // ── USDC ─────────────────────────────────────────────────────────────────────
  if (has('usdc', 'usd coin', 'stablecoin', 'stable coin'))
    return { from: 'bot', text: 'Hash PayLink settles in USDC on Base, Arc, and Starknet; native HSK on HashKey; and native USDC on Solana. All USDC is Circle-issued — not bridged or wrapped. The 0.2% fee is deducted at settlement.' }

  // ── Memo / label / tag ───────────────────────────────────────────────────────
  if (has('memo', 'label', 'tag', 'note', 'reference', 'description'))
    return { from: 'bot', text: 'You can add a memo or label when creating a link (e.g. "Invoice #42"). In Multi-Payer Collection mode, each payer enters their own name or handle — logged on the organizer dashboard with their payment details.' }

  // ── Contact / escalate ───────────────────────────────────────────────────────
  if (has('contact', 'support', 'help', 'human', 'agent', 'email', 'team', 'speak to', 'talk to', 'reach out', 'report', 'issue', 'problem', 'complaint', 'inquiry', 'twitter', 'x.com', '@hash'))
    return CONTACT_MSG

  // ── Platform overview — true catch-all for generic questions ─────────────────
  if (has('what is', 'overview', 'hash paylink', 'introduction', 'intro', 'about') || (has('how') && has('work')) || (has('tell') && has('me')) || (has('explain') && !has('multi', 'flex', 'fee', 'gas', 'chain', 'wallet', 'pay', 'send', 'qr', 'sdk')))
    return { from: 'bot', text: 'Hash PayLink is a non-custodial, multi-chain payment platform. Merchants create a shareable payment link in seconds — no account or KYC required. Payers pay by connecting a wallet OR sending directly from any exchange or CEX using "Send via Address". Supported chains: Base, HashKey, Arc, Starknet, and Solana. A flat 0.2% fee is deducted at settlement.' }

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
