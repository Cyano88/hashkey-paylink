import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAccount, useDisconnect, useSwitchChain } from 'wagmi'
import { usePrivy } from '@privy-io/react-auth'
import { ChevronDown, LogOut, X, Send, ExternalLink, Sun, Moon, History } from 'lucide-react'
import { useSolana }   from './lib/SolanaContext'
import { useTheme }    from './lib/ThemeContext'
import { CHAIN_META } from './lib/chains'
import type { ChainKey } from './lib/chains'
import { getPaylinkParam, hasPaylinkFlag } from './lib/paylinkParams'
import { PRIVY_AUTH_ENABLED } from './lib/authMode'
import { PrivyConnectButton } from './lib/PrivyConnectButton'
import { PrivyDisconnectButton } from './lib/PrivyDisconnectButton'

// ─── Input detection ─────────────────────────────────────────────────────────
const TX_HASH_RE = /^0x[0-9a-fA-F]{1,64}$/
const EVM_ADDR_RE = /^0x[0-9a-fA-F]{40}$/
const SOLANA_ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const fmtAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

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

type AgentHashMode = 'support' | 'payments'

const AGENT_HASH_WELCOME: Record<AgentHashMode, ChatMsg> = {
  support: {
    from: 'bot',
    text: "Support mode is ready. Tell me what is stuck, confusing, or not working, and I'll help you fix it step by step.",
  },
  payments: {
    from: 'bot',
    text: 'Payments mode is ready. I can help you request money, create a PayLink, check a receipt, or clarify wallet and network details. What do you want to do?',
  },
}

const agentHashThinkingCopy: Record<AgentHashMode, string[]> = {
  support: ['Reading this...', 'Checking context...', 'Preparing reply...', 'Putting things in order...'],
  payments: ['Checking payment context...', 'Matching details...', 'Validating flow...', 'Preparing reply...'],
}

const agentHashSlowThinkingCopy = ['Putting things in order...', 'Almost ready...', 'Please be patient...']

function AgentHashCssIcon({ header = false, staticPose = false }: { header?: boolean; staticPose?: boolean }) {
  return (
    <div className={`ask-hash-live-agent shrink-0 ${staticPose ? 'ask-hash-live-agent--static' : ''} ${header ? 'ask-hash-live-agent--header' : ''}`} aria-hidden="true">
      <span className="ask-hash-live-agent__head">
        <span className="ask-hash-live-agent__eye ask-hash-live-agent__eye--left" />
        <span className="ask-hash-live-agent__eye ask-hash-live-agent__eye--right" />
        <span className="ask-hash-live-agent__mouth" />
      </span>
      <span className="ask-hash-live-agent__antenna" />
      <span className="ask-hash-live-agent__bubble">
        <span />
        <span />
        <span />
      </span>
    </div>
  )
}

function PolymarketMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
      <path
        d="M6.25 5.8 18.4 2.75a1 1 0 0 1 1.24.97v16.56a1 1 0 0 1-1.24.97L6.25 18.2a1 1 0 0 1-.75-.97V6.77a1 1 0 0 1 .75-.97Z"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <path
        d="M7.2 8.45 17.2 5.9v5.35L7.2 8.45ZM7.2 15.55l10-2.8v5.35l-10-2.55Z"
        fill="currentColor"
      />
    </svg>
  )
}

function AgentHashThinkingIndicator({ mode }: { mode: AgentHashMode }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [slowPhase, setSlowPhase] = useState(-1)
  const steps = agentHashThinkingCopy[mode]

  useEffect(() => {
    setSlowPhase(-1)
    setStepIndex(Math.floor(Math.random() * steps.length))
    const slowTimers = [6500, 10500, 15000].map((delay, index) => (
      window.setTimeout(() => setSlowPhase(index), delay)
    ))
    const timer = window.setInterval(() => {
      setStepIndex(index => (index + 1) % steps.length)
    }, 900)
    return () => {
      slowTimers.forEach(window.clearTimeout)
      window.clearInterval(timer)
    }
  }, [mode, steps.length])

  return (
    <div className="max-w-[82%]">
      <div className="inline-flex items-center rounded-[18px] rounded-bl-md bg-[#f0f0f0] px-3.5 py-2.5 text-sm shadow-sm dark:bg-white/[0.08]">
        <span className="inline-flex h-4 items-center gap-1">
          {[0, 1, 2].map(index => (
            <span
              key={index}
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 dark:bg-gray-500"
              style={{ animationDelay: `${index * 120}ms` }}
            />
          ))}
        </span>
      </div>
      <p className="ml-3 mt-1 text-[11px] italic text-gray-400">
        {slowPhase >= 0 ? agentHashSlowThinkingCopy[slowPhase] : steps[stepIndex]}
      </p>
    </div>
  )
}

const WELCOME: ChatMsg = {
  from: 'bot',
  text: 'Hello! I am the Hash PayLink support assistant.\n\nI can help you create payment links, understand how to pay, track transactions, explain fees, and answer questions about Base, Arc, Arbitrum, and Solana.\n\nPaste a transaction hash to track it instantly, or describe what you need help with.',
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
    return { from: 'bot', text: 'Multi-Payer Collection mode lets you collect payments from many people with a single link — ideal for events, group orders, or fundraises.\n\nHow it works:\n1. Enable "Multi-Payer Collection" when creating your link.\n2. Share the link or QR code with participants.\n3. Each payer enters their name or handle before paying — this is logged automatically.\n4. The organizer dashboard shows every payment in real time: name, amount, chain, and timestamp.\n5. Export the full payment list as CSV anytime.\n\nThe dashboard auto-refreshes every 5 seconds. Payments across Base, Arc, Arbitrum, and Solana all appear in one unified view.' }

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
    return { from: 'bot', text: 'To create a payment link:\n1. Go to the home page and connect your wallet.\n2. Enter the amount (or enable Flexible Amount so the payer chooses).\n3. Select your network — Base, Arc, Arbitrum, or Solana.\n4. Optionally enable Multi-Payer Collection or add a memo.\n5. Click Generate Link — share the URL or QR code.\n\nYour wallet address is embedded in the link. No account or KYC required.' }

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
    return { from: 'bot', text: 'Hash PayLink charges a flat 0.2% platform fee, deducted automatically at settlement. Sponsored EVM payments can include a small configured gas recovery amount in the same treasury transfer. No subscription fees.' }

  // ── Gas / gasless ────────────────────────────────────────────────────────────
  if (has('gas', 'gasless', 'free gas', 'sponsored', 'network fee', 'transaction fee', 'avnu', 'paymaster'))
    return { from: 'bot', text: 'Gas is sponsored on Base and Arbitrum smart-wallet/paymaster flows, Arc, and Solana wallet-connect payments. Sponsored EVM payments can include a configured USDC recovery amount routed to treasury as part of settlement.' }

  // ── Confirmation time ────────────────────────────────────────────────────────
  if (has('how long', 'how fast', 'speed', 'instant', 'confirmation time', 'finality', 'settlement time', 'how quick'))
    return { from: 'bot', text: 'Confirmation times:\n• Base: 2–5 seconds\n• Arc: 2–5 seconds\n• Arbitrum: a few seconds once sequenced\n• Solana: under 1 second\n\nAll supported networks provide near-instant finality for practical payment UX.' }

  // ── Wrong chain / network ────────────────────────────────────────────────────
  if (has('wrong chain', 'wrong network', 'different chain', 'incorrect chain', 'sent to wrong', 'sent on wrong', 'recover funds', 'recovery'))
    return { from: 'bot', text: 'If funds were sent on the wrong chain, contact the team immediately via support@hashpaylink.com with your transaction hash. Hash PayLink uses a universal deterministic vault system — in most cases funds can be recovered by deploying the vault on the receiving chain.' }

  // ── Pending / stuck ──────────────────────────────────────────────────────────
  if (has('pending', 'stuck', 'not arrived', 'not received', 'not confirmed', 'delayed', 'taking long', 'waiting', 'not showing', 'missing payment', 'where is my'))
    return { from: 'bot', text: 'If a payment is pending:\n• Base, Arc, or Arbitrum: paste the tx hash here for a live status check.\n• Solana: under 1 second — if stuck 30+ seconds, the tx may have dropped, retry.\n\nPaste your transaction hash and I will check it now.' }

  // ── Refund / cancel ──────────────────────────────────────────────────────────
  if (has('refund', 'cancel', 'reverse', 'undo', 'wrong amount', 'sent wrong', 'mistake', 'accidentally', 'chargeback'))
    return { from: 'bot', text: 'Blockchain transactions are irreversible once confirmed. Hash PayLink is fully non-custodial and cannot initiate reversals. Coordinate refunds directly with the recipient. For technical errors, contact support@hashpaylink.com with your transaction hash.' }

  // ── Track / status ───────────────────────────────────────────────────────────
  if (has('track', 'status', 'check', 'verify', 'look up', 'tx hash', 'txhash', 'transaction hash', 'confirmed'))
    return { from: 'bot', text: 'Paste your transaction hash directly into this chat and I will query it live across Base, Arc, and Arbitrum. An EVM transaction hash starts with 0x and is 66 characters long.' }

  // ── Chains — Base ────────────────────────────────────────────────────────────
  if ((has('base') && !has('database')) || has('basescan', 'metamask', 'layer 2', 'ethereum l2'))
    return { from: 'bot', text: 'Base is an Ethereum L2 by Coinbase. Hash PayLink supports USDC payments on Base Mainnet. Gas is sponsored — zero extra cost to payers. Wallets: MetaMask, Coinbase Smart Wallet, and other Privy-supported EVM wallets. Explorer: basescan.org' }

  // ── Chains — HashKey ─────────────────────────────────────────────────────────
  if (has('hashkey', 'hsk', 'hash key', 'hashkey chain'))
    return { from: 'bot', text: 'HashKey payments are no longer part of the active Hash PayLink checkout surface. Use Base, Arc, Arbitrum, or Solana for Circle-focused USDC payments.' }

  // ── Chains — Arc ─────────────────────────────────────────────────────────────
  if (has('arc', 'arcscan', 'arc testnet', 'arc chain', 'testnet'))
    return { from: 'bot', text: 'Arc is an EVM chain using USDC as its native gas token. Hash PayLink is live on Arc Testnet (Chain ID 5042002) — great for testing without real funds. Explorer: testnet.arcscan.app' }

  // ── Chains — Solana ──────────────────────────────────────────────────────────
  if (has('solana', 'phantom', 'solflare', 'solscan'))
    return { from: 'bot', text: 'Solana payments use native USDC. Wallets: Phantom and Solflare. Gas is relayer-sponsored — payers only sign the USDC transfer. "Send via Address" also works on Solana. Confirms in under 1 second. Explorer: solscan.io' }

  // ── Wallet setup / connect ───────────────────────────────────────────────────
  if (has('wallet', 'connect wallet', 'which wallet', 'walletconnect', 'install wallet', 'coinbase wallet'))
    return { from: 'bot', text: 'Supported wallets:\n• Base / Arc / Arbitrum: Privy-supported EVM wallets, including MetaMask and Coinbase Smart Wallet.\n• Solana: Phantom or Solflare.\n\nOr skip wallets entirely — use "Send via Address" to pay from any exchange or cold wallet.' }

  // ── Security / non-custodial ─────────────────────────────────────────────────
  if (has('safe', 'secure', 'trust', 'custody', 'custodial', 'non-custodial', 'open source', 'trustless', 'audit', 'smart contract'))
    return { from: 'bot', text: 'Hash PayLink is fully non-custodial. Funds flow directly from payer to recipient via on-chain smart contracts — the platform never holds funds. Links are stateless, parameters encoded in the URL. Smart contracts are open source and verifiable on-chain. The platform deducts a 0.2% fee at settlement.' }

  // ── USDC ─────────────────────────────────────────────────────────────────────
  if (has('usdc', 'usd coin', 'stablecoin', 'stable coin'))
    return { from: 'bot', text: 'Hash PayLink settles in Circle USDC on Base, Arc, Arbitrum, and Solana. The contract-backed flow deducts the platform fee at settlement.' }

  // ── Memo / label / tag ───────────────────────────────────────────────────────
  if (has('memo', 'label', 'tag', 'note', 'reference', 'description'))
    return { from: 'bot', text: 'You can add a memo or label when creating a link (e.g. "Invoice #42"). In Multi-Payer Collection mode, each payer enters their own name or handle — logged on the organizer dashboard with their payment details.' }

  // ── Contact / escalate ───────────────────────────────────────────────────────
  if (has('contact', 'support', 'help', 'human', 'agent', 'email', 'team', 'speak to', 'talk to', 'reach out', 'report', 'issue', 'problem', 'complaint', 'inquiry', 'twitter', 'x.com', '@hash'))
    return CONTACT_MSG

  // ── Platform overview — true catch-all for generic questions ─────────────────
  if (has('what is', 'overview', 'hash paylink', 'introduction', 'intro', 'about') || (has('how') && has('work')) || (has('tell') && has('me')) || (has('explain') && !has('multi', 'flex', 'fee', 'gas', 'chain', 'wallet', 'pay', 'send', 'qr', 'sdk')))
    return { from: 'bot', text: 'Hash PayLink is a non-custodial, Circle-focused payment platform. Merchants create a shareable payment link in seconds — no account or KYC required. Payers pay by connecting a wallet OR sending directly from any exchange or CEX using "Send via Address". Supported networks: Base, Arc, Arbitrum, and Solana. A platform fee is deducted at settlement.' }

  return null
}

// ─── Shared outlet context (Layout → child pages) ────────────────────────────
export type LayoutOutletContext = {
  selectedNet:      ChainKey
  onNetworkSelect:  (key: ChainKey) => void
  onPayChainChange: (key: ChainKey) => void  // payer page → mirror current chain in header pill
  onPayWalletStateChange: (state: { connected: boolean; disconnect?: () => void }) => void
  onPaySuccessVisibleChange: (visible: boolean) => void
}

// ─── Network Toolkit ─────────────────────────────────────────────────────────
const ALL_NETWORKS = [CHAIN_META.base, CHAIN_META.arc, CHAIN_META.arbitrum, CHAIN_META.solana]
const SUPPORTED_NETWORK_KEYS = new Set<ChainKey>(ALL_NETWORKS.map(network => network.key))

// Pure display component — all switching logic lives in Layout.
function NetworkToolkit({
  activeKey,
  label,
  locked,
  networks = ALL_NETWORKS,
  onSwitch,
}: {
  activeKey: ChainKey | null
  label?: string
  locked?: boolean
  networks?: readonly (typeof CHAIN_META)[ChainKey][]
  onSwitch?: (key: ChainKey) => void
}) {
  const [open, setOpen] = useState(false)
  const displayNet = activeKey ? CHAIN_META[activeKey] : null
  const displayLabel = label ?? displayNet?.label ?? 'Network'
  const otherNets  = networks.filter(n => n.key !== activeKey)

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
        <span className={`h-2 w-2 shrink-0 rounded-full ${displayNet?.dotColor ?? 'bg-gray-400'}`} />
        <span className="hidden sm:inline">{displayLabel}</span>
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
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${net.dotColor}`} />
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
type DashboardRecipient = {
  label: string
  address: string
}

function DashboardRecipientDropdown({ recipients }: { recipients: DashboardRecipient[] }) {
  const [open, setOpen] = useState(false)
  const first = recipients[0]
  if (!first) return null

  if (recipients.length === 1) {
    return (
      <span className="hidden sm:block select-none font-mono text-[13px] text-gray-400 dark:text-gray-500 pointer-events-none">
        {fmtAddr(first.address)}
      </span>
    )
  }

  return (
    <div className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1c1c20] px-3 font-mono text-[13px] text-gray-500 dark:text-gray-400 shadow-sm transition-colors hover:bg-gray-50 dark:hover:bg-white/5"
      >
        {fmtAddr(first.address)}
        <ChevronDown className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-[#1c1c20] shadow-md">
            <div className="border-b border-gray-100 dark:border-white/6 px-3.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Watching</p>
            </div>
            {recipients.map(item => (
              <div key={`${item.label}-${item.address}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <span className="text-[12px] font-medium text-gray-600 dark:text-gray-300">{item.label}</span>
                <span className="font-mono text-[12px] text-gray-500 dark:text-gray-400">{fmtAddr(item.address)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function Layout() {
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const isPolyDeskSurface = pathname === '/polydesk' || window.location.hostname.toLowerCase().includes('polydesk') || searchParams.get('app') === 'polydesk'
  const isCreatePage = pathname === '/' || pathname === '/app' || pathname === '/create' || pathname === '/polymarket'
  const isPayPage  = pathname === '/pay'
  const isNgPosPage = pathname === '/pos/ng'
  const isTelegramPaymentLinksPage = pathname === '/telegram/payment-links'
  const isReceiptPage = pathname.startsWith('/receipt/')
  const isDashPage = pathname === '/event' || pathname === '/dashboard'
  const isNgPosDashboard = pathname === '/dashboard' && (searchParams.get('src') === 'ngpos' || (searchParams.get('id') ?? '').startsWith('ngpos-'))
  const isAgentProfilePage = pathname === '/agent' && (
    searchParams.get('profile') === 'agent' ||
    !!searchParams.get('agent') ||
    !!searchParams.get('wallet') ||
    !!searchParams.get('e')
  )
  const polyDeskService = searchParams.get('service') ?? ''
  const polyDeskLane = searchParams.get('lane') ?? ''
  const polyDeskAgentOpen = searchParams.get('agent') === '1'
  const activePolyDeskNav = polyDeskAgentOpen || polyDeskLane || !polyDeskService
    ? 'agent'
    : polyDeskService === 'portfolio'
      ? 'portfolio'
      : polyDeskService === 'worldcup' || polyDeskService === 'worldcup-news' || polyDeskService === 'worldcup-scores'
        ? 'worldcup'
        : polyDeskService === 'lp-scout'
          ? 'lp-scout'
          : 'agent'
  const makePolyDeskNavTo = (id: 'agent' | 'portfolio' | 'worldcup' | 'lp-scout') => {
    const next = new URLSearchParams(searchParams)
    next.delete('lane')
    if (id === 'agent') {
      next.delete('agent')
      next.delete('service')
    } else {
      next.delete('agent')
      next.set('service', id)
    }
    const qs = next.toString()
    return `/polydesk${qs ? `?${qs}` : ''}`
  }
  const polyDeskNavItems = [
    { label: 'Desk Agent', id: 'agent', to: makePolyDeskNavTo('agent'), active: activePolyDeskNav === 'agent' },
    { label: 'Portfolio', id: 'portfolio', to: makePolyDeskNavTo('portfolio'), active: activePolyDeskNav === 'portfolio' },
    { label: 'World Cup', id: 'worldcup', to: makePolyDeskNavTo('worldcup'), active: activePolyDeskNav === 'worldcup' },
    { label: 'LP Scout', id: 'lp-scout', to: makePolyDeskNavTo('lp-scout'), active: activePolyDeskNav === 'lp-scout' },
  ] as const
  const agentNetworks = [CHAIN_META.base, CHAIN_META.arbitrum, { label: 'Arc Testnet', explorerUrl: CHAIN_META.arc.explorerUrl }] as const
  // Both the pay page and the dashboard show a locked chain pill from the URL param
  const pageNetParam = (isPayPage || isDashPage) ? (getPaylinkParam(searchParams, 'net', 'n') as ChainKey | '') : ''
  const activeNet = (pageNetParam && SUPPORTED_NETWORK_KEYS.has(pageNetParam)) ? pageNetParam : null
  const dashEvm = getPaylinkParam(searchParams, 'evm', 'e').trim()
  const dashSol = getPaylinkParam(searchParams, 'sol', 's').trim()
  const dashMulti = hasPaylinkFlag(searchParams, 'multi', 'x')
  const dashEvmValid = EVM_ADDR_RE.test(dashEvm)
  const dashSolValid = SOLANA_ADDR_RE.test(dashSol)
  const dashboardRecipients: DashboardRecipient[] = isDashPage
    ? [
        ...(dashEvmValid ? [{ label: dashMulti ? 'EVM networks' : activeNet ? CHAIN_META[activeNet].label : 'EVM', address: dashEvm }] : []),
        ...(dashSolValid ? [{ label: 'Solana', address: dashSol }] : []),
      ]
    : []
  const dashboardSingleNetwork =
    dashMulti && !dashEvmValid && dashSolValid ? 'solana' :
    null
  const dashboardActiveNet = isDashPage ? (dashboardSingleNetwork ?? activeNet) : activeNet
  const dashboardNetworkLabel = isDashPage && dashMulti
    ? dashboardSingleNetwork ? CHAIN_META[dashboardSingleNetwork].label : 'All Networks'
    : undefined
  const payRecipientNetworkCount =
    (dashEvmValid ? 1 : 0) +
    (dashSolValid ? 1 : 0)
  const showPayNetworkPill = isPayPage && dashMulti && payRecipientNetworkCount > 1

  // ── Wallet connections ───────────────────────────────────────────────────────
  const { isConnected: evmConnected, chainId: evmChainId } = useAccount()
  const { disconnect: disconnectEvm } = useDisconnect()
  const { switchChain }               = useSwitchChain()
  const { address: solanaAddress, connect: connectSolana,   disconnect: disconnectSolana    } = useSolana()
  const { authenticated: privyAuthenticated } = usePrivy()

  const anyConnected = evmConnected || !!solanaAddress
  const agentEmailConnected = Boolean(isAgentProfilePage && PRIVY_AUTH_ENABLED && privyAuthenticated)
  const headerControlConnected = anyConnected || agentEmailConnected
  const evmNetKey    = evmConnected
    ? ([CHAIN_META.base, CHAIN_META.arc, CHAIN_META.arbitrum] as const).find(n => n.chainId === evmChainId)?.key ?? null
    : null
  const connectedNetKey: ChainKey | null = solanaAddress ? 'solana' : evmNetKey

  // selectedNet = user's intent (which network they want); may lead connectedNetKey during transition
  const [selectedNet, setSelectedNet] = useState<ChainKey | null>(null)
  // Tracks the active chain on the payer page so the header pill mirrors it
  const [payChain,    setPayChain]    = useState<ChainKey | null>(null)
  const [payWalletConnected, setPayWalletConnected] = useState(false)
  const [payWalletDisconnect, setPayWalletDisconnect] = useState<(() => void) | null>(null)
  const [paySuccessVisible, setPaySuccessVisible] = useState(false)
  const headerWalletConnected = headerControlConnected || (isPayPage && payWalletConnected)

  // Sync selectedNet when a wallet actually connects / chain changes.
  // Guard: never override an explicit Solana selection — that would cause a
  // race where disconnectEvm() is async and the effect fires before it settles.
  useEffect(() => {
    if (evmConnected && evmNetKey && selectedNet !== 'solana') setSelectedNet(evmNetKey)
  }, [evmConnected, evmNetKey])  // eslint-disable-line react-hooks/exhaustive-deps
  // ── Network-select handler (called by NetworkToolkit dropdown) ────────────
  function handleNetworkSelect(key: ChainKey) {
    setSelectedNet(key)

    if (key === 'solana') {
      // Switching to Solana: drop EVM connections
      if (evmConnected) disconnectEvm()
      return
    }
    // Switching away from Solana: drop Solana connection
    if (solanaAddress) disconnectSolana()
    if (evmConnected) {
      // EVM → EVM: switch chain in-place, wallet stays connected
      const id = (CHAIN_META[key] as { chainId?: number }).chainId
      if (id) switchChain({ chainId: id })
    }
    // Fully disconnected: just update intent, Connect Wallet will act on it
  }

  // ── Connect Wallet handler (action depends on selectedNet intent) ─────────
  function handleConnectWallet() {
    if (selectedNet === 'solana') {
      connectSolana({ includeEmail: true })
    } else {
      // EVM wallet connection is handled by PrivyConnectButton in production.
    }
  }

  const handlePayWalletStateChange = useCallback((state: { connected: boolean; disconnect?: () => void }) => {
    setPayWalletConnected(state.connected)
    setPayWalletDisconnect(() => state.disconnect ?? null)
  }, [])

  const handlePaySuccessVisibleChange = useCallback((visible: boolean) => {
    setPaySuccessVisible(visible)
  }, [])

  function disconnectAll() {
    if (evmConnected)  disconnectEvm()
    if (solanaAddress) disconnectSolana()
    payWalletDisconnect?.()
    setPayWalletConnected(false)
    setPayWalletDisconnect(null)
    setSelectedNet(null)
  }

  const { theme, toggle: toggleTheme } = useTheme()
  const navigate = useNavigate()
  const openPaymentHistory = useCallback(() => {
    navigate('/dashboard?src=ngpos')
  }, [navigate])

  const [agentHashSurfaceMode, setAgentHashSurfaceMode] = useState<AgentHashMode>('support')
  const agentHashMode: AgentHashMode = isPayPage || (isCreatePage && searchParams.get('product') === 'payment') ? 'payments' : agentHashSurfaceMode
  const showAgentHashWidget = isCreatePage || isPayPage
  const agentHashStorageKey = `agent-hash-widget:${agentHashMode}`
  const [chatOpen,     setChatOpen]     = useState(false)
  const [chatMounted,  setChatMounted]  = useState(false)
  const [chatInput,    setChatInput]    = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([AGENT_HASH_WELCOME[agentHashMode]])
  const [isTyping,     setIsTyping]     = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const agentHashPanelRef = useRef<HTMLDivElement>(null)
  const agentHashFabRef = useRef<HTMLButtonElement>(null)
  const agentHashCloseTimerRef = useRef<number | null>(null)
  const previousAgentHashModeRef = useRef<AgentHashMode | null>(null)

  function openAgentHashWidget(mode?: AgentHashMode) {
    if (mode) setAgentHashSurfaceMode(mode)
    if (agentHashCloseTimerRef.current) window.clearTimeout(agentHashCloseTimerRef.current)
    setChatMounted(true)
    window.requestAnimationFrame(() => setChatOpen(true))
  }

  function closeAgentHashWidget() {
    setChatOpen(false)
    if (agentHashCloseTimerRef.current) window.clearTimeout(agentHashCloseTimerRef.current)
    agentHashCloseTimerRef.current = window.setTimeout(() => setChatMounted(false), 220)
  }

  function toggleAgentHashWidget() {
    if (chatOpen) closeAgentHashWidget()
    else openAgentHashWidget()
  }

  useEffect(() => {
    if (isPayPage) setAgentHashSurfaceMode('payments')
    else if (!isCreatePage || searchParams.get('product') !== 'payment') setAgentHashSurfaceMode('support')
  }, [isCreatePage, isPayPage, pathname, searchParams])

  useEffect(() => {
    function handleModeEvent(event: Event) {
      const detail = (event as CustomEvent<{ mode?: AgentHashMode; open?: boolean }>).detail
      const mode = detail?.mode === 'payments' ? 'payments' : 'support'
      setAgentHashSurfaceMode(mode)
      if (detail?.open) openAgentHashWidget(mode)
    }
    window.addEventListener('agent-hash-mode', handleModeEvent)
    return () => window.removeEventListener('agent-hash-mode', handleModeEvent)
  }, [])

  useEffect(() => {
    setIsTyping(false)
    setChatInput('')
    if (previousAgentHashModeRef.current && previousAgentHashModeRef.current !== agentHashMode) {
      previousAgentHashModeRef.current = agentHashMode
      window.localStorage.removeItem(agentHashStorageKey)
      setChatMessages([AGENT_HASH_WELCOME[agentHashMode]])
      return
    }
    previousAgentHashModeRef.current = agentHashMode
    try {
      const saved = window.localStorage.getItem(agentHashStorageKey)
      const parsed = saved ? JSON.parse(saved) as ChatMsg[] : null
      setChatMessages(Array.isArray(parsed) && parsed.length ? parsed.slice(-30) : [AGENT_HASH_WELCOME[agentHashMode]])
    } catch {
      setChatMessages([AGENT_HASH_WELCOME[agentHashMode]])
    }
  }, [agentHashMode, agentHashStorageKey])

  useEffect(() => {
    try {
      window.localStorage.setItem(agentHashStorageKey, JSON.stringify(chatMessages.slice(-30)))
    } catch {
      // Local session persistence is best-effort.
    }
  }, [agentHashStorageKey, chatMessages])

  useEffect(() => {
    if (!chatOpen) return
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node | null
      if (target && agentHashPanelRef.current?.contains(target)) return
      if (target && agentHashFabRef.current?.contains(target)) return
      closeAgentHashWidget()
    }
    window.addEventListener('mousedown', handleOutsideClick)
    return () => window.removeEventListener('mousedown', handleOutsideClick)
  }, [chatOpen])

  function scrollToBottom() {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
  }

  function pushBot(msgs: ChatMsg[]) {
    setChatMessages(m => [...m, ...msgs])
    setIsTyping(false)
    scrollToBottom()
  }

  function agentHashMemorySummary(nextQuestion: string) {
    const recent = chatMessages
      .slice(-8)
      .map(msg => `${msg.from === 'user' ? 'User' : 'Agent Hash'}: ${msg.text.replace(/\s+/g, ' ').slice(0, 180)}`)
      .join(' | ')
    const pageContext = isPayPage ? 'Current page context: payer payment page.' : 'Current page context: Hash PayLink main app support.'
    return `${pageContext} Agent Hash mode: ${agentHashMode}. Recent local widget context: ${recent || 'new session'}. Current message: ${nextQuestion}`.slice(0, 1600)
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
        text: 'Investigating transaction across Base, Arc, and Arbitrum. Please wait...',
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

    setIsTyping(true)
    try {
      const res = await fetch('/api/agent-ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: 'agent-hash-widget',
          payer: 'Hash PayLink user',
          question: trimmed,
          accessMode: 'helper-free',
          helperMode: agentHashMode,
          memorySummary: agentHashMemorySummary(trimmed),
        }),
      })
      const contentType = res.headers.get('content-type') || ''
      const data = contentType.includes('application/json')
        ? await res.json() as { answer?: string; error?: string }
        : { error: 'Agent Hash is temporarily receiving a service page instead of an API response. Please try again shortly.' }
      if (!res.ok || !data.answer) throw new Error(data.error || 'Agent Hash could not answer just now.')
      pushBot([{ from: 'bot', text: data.answer }])
    } catch (err) {
      pushBot([{
        from: 'bot',
        text: err instanceof Error && err.message
          ? err.message
          : 'Agent Hash could not reach its intelligence layer just now. Please try again shortly.',
      }])
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#111113] font-inter flex flex-col">
      {/* ── Sticky frosted-glass header ─────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/60 dark:border-white/5 bg-white/80 dark:bg-[#111113]/90 backdrop-blur-xl">
        <div className={`mx-auto flex max-w-5xl items-center justify-between px-4 sm:px-6 ${isPolyDeskSurface ? 'pt-3 pb-2' : 'py-3'}`}>
          {/* Wordmark */}
          <Link to={isPolyDeskSurface ? '/polydesk' : '/'} className="group flex items-center gap-2.5 focus:outline-none">
            {isPolyDeskSurface ? (
              <span className="flex h-8 w-8 items-center justify-center text-gray-900 transition-transform group-hover:scale-105 dark:text-white">
                <PolymarketMark className="h-5 w-5" />
              </span>
            ) : (
              <img
                src="/hash-logo-transparent.png"
                alt=""
                className="h-8 w-8 object-contain transition-transform group-hover:scale-105 dark:invert"
              />
            )}
            <span className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">
              {isPolyDeskSurface ? (
                'PolyDesk'
              ) : (
                <>
                  Hash <span className="text-[#0071E3]">PayLink</span>
                </>
              )}
            </span>
          </Link>

          {/* Right side — single horizontal baseline */}
          <div className="flex items-center gap-x-2">
            {isPolyDeskSurface && (
              <div className="hidden sm:flex items-center rounded-full border border-gray-200 bg-gray-50/80 p-0.5 dark:border-white/10 dark:bg-[#1c1c20]">
                {polyDeskNavItems.map(item => (
                  <Link
                    key={item.id}
                    to={item.to}
                    className="rounded-full px-3 py-1 text-[11px] font-semibold transition-all"
                    style={item.active
                      ? { background: '#ffffff', color: '#111827', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
                      : { color: '#9ca3af' }}
                  >
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            )}

            {/* Recipient address — dashboard only, truncated, muted */}
            {isDashPage && !isNgPosDashboard && dashboardRecipients.length > 0 && (
              <DashboardRecipientDropdown recipients={dashboardRecipients} />
            )}

            {/* Disconnect — pay page only, between network indicator and theme toggle */}
            {isPayPage && !paySuccessVisible && headerWalletConnected && (
              PRIVY_AUTH_ENABLED ? (
                <PrivyDisconnectButton
                  onDisconnectWallets={disconnectAll}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-zinc-900 transition-colors hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-100 dark:hover:bg-white/15 disabled:opacity-60"
                >
                  <LogOut className="h-4 w-4" />
                </PrivyDisconnectButton>
              ) : (
                <button
                  onClick={disconnectAll}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-zinc-900 transition-colors hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-100 dark:hover:bg-white/15"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              )
            )}

            {/* Wallet controls — hidden on pay page and organizer dashboard (read-only pages) */}
            {!isPolyDeskSurface && !isCreatePage && !isPayPage && !isDashPage && !isNgPosPage && !isTelegramPaymentLinksPage && !isReceiptPage && (
              <>
                {/* Connect Wallet — when disconnected */}
                {!headerControlConnected && !isAgentProfilePage && (
                  PRIVY_AUTH_ENABLED && selectedNet !== 'solana' ? (
                    <PrivyConnectButton className="inline-flex h-9 items-center gap-1.5 rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1c1c20] px-3 text-[13px] font-medium text-gray-700 dark:text-gray-200 shadow-sm hover:bg-gray-50 dark:hover:bg-white/5 transition-colors disabled:opacity-60">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="hidden sm:inline">Sign in</span>
                    </PrivyConnectButton>
                  ) : (
                    <button
                      onClick={handleConnectWallet}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1c1c20] px-3 text-[13px] font-medium text-gray-700 dark:text-gray-200 shadow-sm hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="hidden sm:inline">
                        Sign in
                      </span>
                    </button>
                  )
                )}

                {/* Disconnect all */}
                {headerControlConnected && !isAgentProfilePage && (
                  PRIVY_AUTH_ENABLED ? (
                    <PrivyDisconnectButton
                      onDisconnectWallets={disconnectAll}
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-zinc-900 transition-colors hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-100 dark:hover:bg-white/15 disabled:opacity-60"
                    >
                      <LogOut className="h-4 w-4" />
                    </PrivyDisconnectButton>
                  ) : (
                    <button
                      onClick={disconnectAll}
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-zinc-900 transition-colors hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-100 dark:hover:bg-white/15"
                    >
                      <LogOut className="h-4 w-4" />
                    </button>
                  )
                )}
              </>
            )}

            {!isDashPage && (
              <button
                type="button"
                onClick={openPaymentHistory}
                aria-label="Open payment history"
                title="History"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900 dark:border-white/10 dark:bg-[#1c1c20] dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-100"
              >
                <History className="h-4 w-4" />
              </button>
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
        {isPolyDeskSurface && (
          <div className="mx-auto flex max-w-5xl px-4 pb-3 sm:hidden">
            <div className="grid w-full grid-cols-4 gap-1 rounded-full border border-gray-200 bg-gray-50/80 p-0.5 dark:border-white/10 dark:bg-[#1c1c20]">
              {polyDeskNavItems.map(item => (
                <Link
                  key={item.id}
                  to={item.to}
                  className={[
                    'rounded-full px-2 py-1.5 text-center text-[10px] font-semibold transition-all',
                    item.active
                      ? 'bg-white text-gray-900 shadow-sm dark:bg-white dark:text-gray-950'
                      : 'text-gray-400',
                  ].join(' ')}
                >
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* ── Page content ─────────────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <Outlet context={{
          selectedNet: selectedNet ?? 'base',
          onNetworkSelect: handleNetworkSelect,
          onPayChainChange: setPayChain,
          onPayWalletStateChange: handlePayWalletStateChange,
          onPaySuccessVisibleChange: handlePaySuccessVisibleChange,
        } satisfies LayoutOutletContext} />
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="flex h-[60px] items-center border-t border-gray-100 bg-white/50 py-0 dark:border-white/5 dark:bg-[#111113]/50">
          <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
            <p className="text-center text-xs text-gray-400">
              {isPayPage ? (
                <span className="polydesk-powered-footer">
                  <span>Powered by</span>
                  <strong>Circle</strong>
                </span>
              ) : isPolyDeskSurface ? (
                <span className="polydesk-powered-footer">
                  <span>Powered by</span>
                  <strong>Hash PayLink</strong>
                </span>
              ) : isAgentProfilePage ? (
                <>
                  Agent payments on{' '}
                  {agentNetworks.map((item, i, arr) => (
                    <span key={item.label}>
                      <a href={item.explorerUrl} target="_blank" rel="noopener noreferrer"
                        className="font-medium text-gray-500 underline-offset-2 hover:underline transition-colors">
                        {item.label}
                      </a>
                      {i < arr.length - 1 && ' · '}
                    </span>
                  ))}
                </>
              ) : (
                <span className="polydesk-powered-footer">
                  <span>Powered by</span>
                  <strong>Circle USDC</strong>
                </span>
              )}
            </p>
          </div>
        </footer>

      {/* Agent Hash floating widget */}
      {showAgentHashWidget && chatMounted && (
        <div
          ref={agentHashPanelRef}
          className={[
            'fixed bottom-20 left-2 right-2 z-50 flex h-[min(680px,calc(100vh-7rem))] origin-bottom-right flex-col overflow-hidden rounded-[28px] border border-gray-100 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.22)] transition-all duration-200 ease-[cubic-bezier(.2,.9,.2,1.08)] dark:border-white/10 dark:bg-[#111114]',
            'sm:left-auto sm:right-6 sm:w-[430px]',
            chatOpen ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-4 scale-90 opacity-0',
          ].join(' ')}
        >
          <div className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3 dark:border-white/10 dark:bg-[#111114]">
            <div className="flex min-w-0 items-center gap-3">
              <AgentHashCssIcon header staticPose={!chatOpen} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">Agent Hash</p>
                <p className="mt-0.5 truncate text-[11px] font-medium text-gray-400">
                  {agentHashMode === 'payments' ? 'Payments mode' : 'Support mode'} · Powered by ZeroScout
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeAgentHashWidget}
              aria-label="Close Agent Hash"
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.08] dark:hover:text-gray-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto bg-[#fbfbfc] px-3 py-4 scroll-smooth dark:bg-[#0f0f12]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d8d8dd transparent' }}>
            <div className="flex justify-center">
              <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-semibold text-gray-600 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200">
                {agentHashMode === 'payments' ? 'Payments mode' : 'Support mode'}
              </span>
            </div>

            {chatMessages.map((msg, i) => (
              <div key={i} className={`space-y-1.5 ${msg.from === 'user' ? 'flex justify-end' : ''}`}>
                <div className={`max-w-[82%] break-words whitespace-pre-line rounded-[18px] px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${msg.from === 'user' ? 'rounded-br-md bg-black text-white dark:bg-white dark:text-gray-950' : 'rounded-bl-md bg-[#f0f0f0] text-gray-900 dark:bg-white/[0.08] dark:text-gray-100'}`}>
                  {msg.text}
                </div>
                {msg.link && (
                  <a href={msg.link.href} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    {msg.link.label}
                  </a>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <AgentHashThinkingIndicator mode={agentHashMode} />
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="border-t border-gray-100 bg-white p-3 dark:border-white/10 dark:bg-[#111114]">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder={agentHashMode === 'payments' ? 'Ask about this payment...' : 'Ask Agent Hash...'}
                className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-white/10 dark:bg-white/[0.05] dark:text-white"
              />
              <button type="button" onClick={() => handleSend()} disabled={!chatInput.trim()} aria-label="Send message" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black text-white transition-all hover:bg-gray-800 active:scale-95 disabled:opacity-40 dark:bg-white dark:text-gray-950">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB */}
      {showAgentHashWidget && (
        <button
          ref={agentHashFabRef}
          type="button"
          onClick={toggleAgentHashWidget}
          className="fixed bottom-5 right-4 z-50 flex h-14 w-14 items-center justify-center transition-all duration-200 hover:-translate-y-0.5 active:scale-95 sm:right-6"
          title="Agent Hash"
        >
          {chatOpen
            ? <X className="h-5 w-5 text-gray-500 dark:text-gray-300" />
            : <AgentHashCssIcon staticPose />
          }
        </button>
      )}

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); opacity: .4; }
          50%       { transform: translateY(-3px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
