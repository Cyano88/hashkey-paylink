import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAccount, useDisconnect, useSwitchChain } from 'wagmi'
import { usePrivy } from '@privy-io/react-auth'
import { ChevronDown, LogOut, X, Sun, Moon, History, Wallet, Radio, Coins, Landmark, Store, Phone, Wifi, Tv, Lightbulb, Banknote } from 'lucide-react'
import { useSolana }   from './lib/SolanaContext'
import { useTheme }    from './lib/ThemeContext'
import { CHAIN_META } from './lib/chains'
import type { ChainKey } from './lib/chains'
import { getPaylinkParam, hasPaylinkFlag } from './lib/paylinkParams'
import { PRIVY_AUTH_ENABLED } from './lib/authMode'
import { PrivyConnectButton } from './lib/PrivyConnectButton'
import { PrivyDisconnectButton } from './lib/PrivyDisconnectButton'
import { TelegramHelperPanel } from './pages/TelegramPaymentLinks'

// ─── Input detection ─────────────────────────────────────────────────────────
const EVM_ADDR_RE = /^0x[0-9a-fA-F]{40}$/
const SOLANA_ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const TELEGRAM_CHAT_URL = (() => {
  const base = String(import.meta.env.VITE_TELEGRAM_AGENT_URL || 'https://t.me/HashPayLinkBot').trim().replace(/\/+$/, '')
  return base.includes('?') ? `${base}&start=payment_links` : `${base}?start=payment_links`
})()
const fmtAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

type AgentHashMode = 'support' | 'circle-pocket'

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

function TelegramMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
      <path
        d="M20.7 3.45 3.9 9.93c-1.15.46-1.14 1.1-.21 1.38l4.31 1.35 1.66 5.08c.2.57.1.8.7.8.46 0 .66-.21.91-.46l2.07-2.01 4.3 3.18c.79.44 1.36.21 1.56-.73l2.83-13.34c.29-1.16-.44-1.69-1.33-1.33Z"
        fill="currentColor"
      />
      <path d="m9.13 12.35 8.4-5.3c.42-.26.8-.12.49.16l-6.93 6.25-.27 2.84-1.69-3.95Z" fill="white" fillOpacity=".92" />
    </svg>
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
  const [showTelegramHomeFab, setShowTelegramHomeFab] = useState(false)
  const [showPaymentHistoryShortcut, setShowPaymentHistoryShortcut] = useState(false)
  const [agentHashComposerFocused, setAgentHashComposerFocused] = useState(false)
  const [agentHashViewportTop, setAgentHashViewportTop] = useState(0)
  const [circlePocketSurface, setCirclePocketSurface] = useState(false)
  const [circlePocketWalletView, setCirclePocketWalletView] = useState<'smart' | 'x402'>('smart')
  const [circlePocketHeaderMode, setCirclePocketHeaderMode] = useState<'wallet' | 'move' | 'bills' | 'activity'>('wallet')
  const [circlePocketMoveView, setCirclePocketMoveView] = useState<'usdc' | 'bank' | 'pos' | ''>('')
  const [circlePocketBillView, setCirclePocketBillView] = useState<'airtime' | 'data' | 'tv' | 'electricity'>('airtime')
  const [circlePocketActivityView, setCirclePocketActivityView] = useState<'all' | 'bank' | 'pos' | 'bills'>('all')

  useEffect(() => {
    const handleHomeSurfaceChange = (event: Event) => {
      const detail = (event as CustomEvent<{ visible?: boolean }>).detail
      setShowTelegramHomeFab(Boolean(detail?.visible))
    }
    const handleHistoryVisibilityChange = (event: Event) => {
      const detail = (event as CustomEvent<{ visible?: boolean }>).detail
      setShowPaymentHistoryShortcut(Boolean(detail?.visible))
    }
    const handleAgentHashComposerFocus = (event: Event) => {
      const detail = (event as CustomEvent<{ focused?: boolean }>).detail
      setAgentHashComposerFocused(Boolean(detail?.focused))
    }
    const handleCirclePocketSurface = (event: Event) => {
      const detail = (event as CustomEvent<{ visible?: boolean }>).detail
      setCirclePocketSurface(Boolean(detail?.visible))
    }
    const handleCirclePocketWalletView = (event: Event) => {
      const detail = (event as CustomEvent<{ view?: 'smart' | 'x402'; mode?: 'wallet' | 'move' | 'bills' | 'activity' }>).detail
      if (detail?.mode === 'wallet' || detail?.mode === 'move' || detail?.mode === 'bills' || detail?.mode === 'activity') {
        setCirclePocketHeaderMode(detail.mode)
        if (detail.mode === 'move') setCirclePocketMoveView('usdc')
        if (detail.mode === 'bills') setCirclePocketBillView('airtime')
        if (detail.mode === 'activity') setCirclePocketActivityView('all')
      }
      if (detail?.view === 'smart' || detail?.view === 'x402') setCirclePocketWalletView(detail.view)
    }
    window.addEventListener('hashpaylink-home-surface', handleHomeSurfaceChange)
    window.addEventListener('hashpaylink-history-visibility', handleHistoryVisibilityChange)
    window.addEventListener('hashpaylink-agent-composer-focus', handleAgentHashComposerFocus)
    window.addEventListener('hashpaylink-circle-pocket-surface', handleCirclePocketSurface)
    window.addEventListener('hashpaylink-circle-pocket-wallet-view', handleCirclePocketWalletView)
    return () => {
      window.removeEventListener('hashpaylink-home-surface', handleHomeSurfaceChange)
      window.removeEventListener('hashpaylink-history-visibility', handleHistoryVisibilityChange)
      window.removeEventListener('hashpaylink-agent-composer-focus', handleAgentHashComposerFocus)
      window.removeEventListener('hashpaylink-circle-pocket-surface', handleCirclePocketSurface)
      window.removeEventListener('hashpaylink-circle-pocket-wallet-view', handleCirclePocketWalletView)
      setShowTelegramHomeFab(false)
      setShowPaymentHistoryShortcut(false)
      setAgentHashComposerFocused(false)
      setCirclePocketSurface(false)
      setCirclePocketWalletView('smart')
      setCirclePocketHeaderMode('wallet')
      setCirclePocketMoveView('')
      setCirclePocketBillView('airtime')
      setCirclePocketActivityView('all')
    }
  }, [])

  useEffect(() => {
    if (!agentHashComposerFocused || !window.matchMedia('(max-width: 767px)').matches) {
      setAgentHashViewportTop(0)
      return
    }
    const viewport = window.visualViewport
    const updateViewportTop = () => setAgentHashViewportTop(Math.max(0, viewport?.offsetTop ?? 0))
    updateViewportTop()
    viewport?.addEventListener('resize', updateViewportTop)
    viewport?.addEventListener('scroll', updateViewportTop)
    window.addEventListener('resize', updateViewportTop)
    return () => {
      viewport?.removeEventListener('resize', updateViewportTop)
      viewport?.removeEventListener('scroll', updateViewportTop)
      window.removeEventListener('resize', updateViewportTop)
    }
  }, [agentHashComposerFocused])
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
  const agentHashMode: AgentHashMode = isPayPage || (isCreatePage && searchParams.get('product') === 'payment') ? 'circle-pocket' : agentHashSurfaceMode
  const showAgentHashWidget = isCreatePage || isPayPage
  const [chatOpen,     setChatOpen]     = useState(false)
  const [chatMounted,  setChatMounted]  = useState(false)
  const agentHashPanelRef = useRef<HTMLDivElement>(null)
  const agentHashFabRef = useRef<HTMLAnchorElement>(null)
  const agentHashCloseTimerRef = useRef<number | null>(null)

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
    if (isPayPage) setAgentHashSurfaceMode('circle-pocket')
    else if (!isCreatePage || searchParams.get('product') !== 'payment') setAgentHashSurfaceMode('support')
  }, [isCreatePage, isPayPage, pathname, searchParams])

  useEffect(() => {
    function handleModeEvent(event: Event) {
      const detail = (event as CustomEvent<{ mode?: AgentHashMode; open?: boolean }>).detail
      const rawMode = String(detail?.mode ?? '')
      const mode: AgentHashMode = rawMode === 'circle-pocket' || rawMode === 'payments' ? 'circle-pocket' : 'support'
      setAgentHashSurfaceMode(mode)
      if (detail?.open) openAgentHashWidget(mode)
    }
    window.addEventListener('agent-hash-mode', handleModeEvent)
    return () => window.removeEventListener('agent-hash-mode', handleModeEvent)
  }, [])

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

  return (
    <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#111113] font-inter flex flex-col">
      {/* ── Sticky frosted-glass header ─────────────────────────────────── */}
      <header
        data-hashpaylink-top-nav
        style={agentHashComposerFocused && agentHashViewportTop > 0
          ? { transform: `translate3d(0, ${agentHashViewportTop}px, 0)` }
          : undefined}
        className={circlePocketSurface
          ? 'pointer-events-none fixed inset-x-0 top-0 z-50 bg-transparent'
          : 'sticky top-0 z-50 border-b border-white/60 bg-white/80 backdrop-blur-xl transition-transform duration-100 dark:border-white/5 dark:bg-[#111113]/90'}
      >
        <div className={`relative mx-auto flex max-w-5xl items-center px-4 sm:px-6 ${circlePocketSurface ? 'justify-center' : 'justify-between'} ${isPolyDeskSurface ? 'pt-3 pb-2' : 'py-3'}`}>
          {circlePocketSurface ? (
            <div className={`pointer-events-auto grid w-full max-w-[430px] gap-1 rounded-full border border-gray-200 bg-gray-100/95 p-1 shadow-[0_10px_30px_rgba(15,23,42,0.12)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#151518]/95 dark:shadow-[0_12px_36px_rgba(0,0,0,0.35)] ${circlePocketHeaderMode === 'move' ? 'grid-cols-3' : circlePocketHeaderMode === 'bills' || circlePocketHeaderMode === 'activity' ? 'grid-cols-4' : 'grid-cols-2'}`}>
              {(circlePocketHeaderMode === 'move'
                ? [
                    { key: 'usdc', label: 'USDC', icon: Coins },
                    { key: 'bank', label: 'Bank', icon: Landmark },
                    { key: 'pos', label: 'POS', icon: Store },
                  ]
                : circlePocketHeaderMode === 'bills'
                  ? [
                      { key: 'airtime', label: 'Airtime', icon: Phone },
                      { key: 'data', label: 'Data', icon: Wifi },
                      { key: 'tv', label: 'TV', icon: Tv },
                      { key: 'electricity', label: 'Electricity', icon: Lightbulb },
                    ]
                : circlePocketHeaderMode === 'activity'
                  ? [
                      { key: 'all', label: 'All', icon: History },
                      { key: 'bank', label: 'Bank receive', icon: Landmark },
                      { key: 'pos', label: 'POS', icon: Store },
                      { key: 'bills', label: 'Bills', icon: Banknote },
                    ]
                : [
                    { key: 'smart', label: 'Smart Wallet', icon: Wallet },
                    { key: 'x402', label: 'x402', icon: Radio },
                  ]
              ).map(({ key, label, icon: Icon }) => {
                const active = circlePocketHeaderMode === 'move'
                  ? circlePocketMoveView === key
                  : circlePocketHeaderMode === 'bills'
                    ? circlePocketBillView === key
                  : circlePocketHeaderMode === 'activity'
                    ? circlePocketActivityView === key
                  : circlePocketWalletView === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      if (circlePocketHeaderMode === 'move') {
                        const view = key as 'usdc' | 'bank' | 'pos'
                        setCirclePocketMoveView(view)
                        window.dispatchEvent(new CustomEvent('hashpaylink-circle-pocket-move-select', { detail: { view } }))
                        return
                      }
                      if (circlePocketHeaderMode === 'bills') {
                        const view = key as 'airtime' | 'data' | 'tv' | 'electricity'
                        setCirclePocketBillView(view)
                        window.dispatchEvent(new CustomEvent('hashpaylink-circle-pocket-bills-select', { detail: { view } }))
                        return
                      }
                      if (circlePocketHeaderMode === 'activity') {
                        const view = key as 'all' | 'bank' | 'pos' | 'bills'
                        setCirclePocketActivityView(view)
                        window.dispatchEvent(new CustomEvent('hashpaylink-circle-pocket-activity-select', { detail: { view } }))
                        return
                      }
                      window.dispatchEvent(new CustomEvent('hashpaylink-circle-pocket-wallet-select', { detail: { view: key } }))
                    }}
                    className={[
                      'flex min-h-9 min-w-0 items-center justify-center rounded-full font-black transition-all',
                      circlePocketHeaderMode === 'bills' || circlePocketHeaderMode === 'activity' ? 'gap-1 px-1 text-[9px]' : 'gap-2 px-3 text-xs',
                      active
                        ? 'bg-white text-gray-950 shadow-sm dark:bg-white dark:text-gray-950'
                        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white',
                    ].join(' ')}
                  >
                    <Icon className={circlePocketHeaderMode === 'bills' || circlePocketHeaderMode === 'activity' ? 'h-3.5 w-3.5 shrink-0' : 'h-4 w-4'} />
                    <span className="truncate">{label}</span>
                  </button>
                )
              })}
            </div>
          ) : (
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
          )}

          {/* Right side — single horizontal baseline */}
          <div className={circlePocketSurface ? 'hidden' : 'flex items-center gap-x-2'}>
            {!circlePocketSurface && (
              <>
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

            {showPaymentHistoryShortcut && !isPayPage && !isDashPage && (
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
              </>
            )}
            {!circlePocketSurface && <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1c1c20] text-gray-500 dark:text-gray-400 shadow-sm hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>}

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
      <main className={circlePocketSurface
        ? 'w-full flex-1 px-4 py-10 sm:px-6'
        : 'mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6'}>
        <Outlet context={{
          selectedNet: selectedNet ?? 'base',
          onNetworkSelect: handleNetworkSelect,
          onPayChainChange: setPayChain,
          onPayWalletStateChange: handlePayWalletStateChange,
          onPaySuccessVisibleChange: handlePaySuccessVisibleChange,
        } satisfies LayoutOutletContext} />
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer
        data-hashpaylink-bottom-bar
        className={`h-[60px] shrink-0 items-center border-t border-gray-100 bg-white/90 py-0 dark:border-white/5 dark:bg-[#111113]/90 ${agentHashComposerFocused || circlePocketSurface ? 'hidden' : 'flex'}`}
      >
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
                  {agentHashMode === 'circle-pocket' ? 'Circle Pocket' : 'Support mode'} · Powered by ZeroScout
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

          <TelegramHelperPanel
            telegramName="there"
            ownerKey=""
            telegramId=""
            fallbackOwner=""
            initialEventId=""
            initialPayer=""
            initialHelperMode={agentHashMode}
            lockedHelperMode={agentHashMode}
            onRecoverTelegramName={() => undefined}
            onBack={closeAgentHashWidget}
            welcomeText={agentHashMode === 'circle-pocket'
              ? 'Circle Pocket is ready. Ask me to receive USDC, settle to bank, create a POS terminal, manage wallets, fund x402, pay bills, or find a receipt.'
              : 'Support mode is ready. Tell me what is stuck, confusing, or not working.'}
            inputPlaceholder={agentHashMode === 'circle-pocket' ? 'Ask about Circle Pocket...' : 'Ask Agent Hash...'}
            fillAvailableHeight
            onComposerFocusChange={setAgentHashComposerFocused}
          />
        </div>
      )}

      {/* Telegram FAB */}
      {showTelegramHomeFab && (
        <a
          ref={agentHashFabRef}
          href={TELEGRAM_CHAT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-5 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#229ED9] text-white shadow-[0_12px_30px_rgba(34,158,217,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#178dcc] active:scale-95 sm:right-6"
          title="Open Telegram chat"
          aria-label="Open Hash PayLink in Telegram"
        >
          <TelegramMark className="h-7 w-7" />
        </a>
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
