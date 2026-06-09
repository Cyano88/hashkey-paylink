import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  Coins,
  ExternalLink,
  LineChart,
  Loader2,
  MessageCircle,
  Pencil,
  Radio,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  Wallet,
  Zap,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { EVM_TREASURY } from '../lib/chains'

const TELEGRAM_BOT_URL = import.meta.env.VITE_TELEGRAM_AGENT_URL || 'https://t.me/HashPayLinkBot'
const PUBLIC_PAYLINK_ORIGIN = (import.meta.env.VITE_PUBLIC_PAYLINK_ORIGIN || 'https://hashpaylink.com').replace(/\/+$/, '')
const POLYMARKET_LOGO = '/brand/polymarket-logo.png'
const MAX_USER_AGENTS = 3

function displayTelegramName(rawName: string | null, fallback = 'there') {
  const clean = (rawName ?? '').replace(/^@+/, '').trim()
  if (!clean) return fallback
  if (/\s/.test(clean)) return clean
  return `@${clean}`
}

function shortAddress(value: string) {
  return value.length > 14 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value
}

type TelegramSectionId = 'payment-links' | 'agent-wallets' | 'market-tools' | 'streampay'
type TelegramServiceId =
  | 'request-usdc'
  | 'fund-polymarket'
  | 'hashpaylink-agent'
  | 'create-your-agent'
  | 'hashpaylink-helper'
  | 'agent-marketplace'
  | 'agent-dashboard'
  | 'fund-agent-wallet'
  | 'lp-scout'
  | 'agentic-lp-research'
  | 'create-streampay'
  | 'agentic-streampay'

type TelegramService = {
  id: TelegramServiceId
  title: string
  body: string
  icon: typeof Coins
  status: 'Open' | 'Soon' | 'Next' | '0.5 USDC'
  active: boolean
  brand?: 'polymarket'
}

const sectionServices: Record<TelegramSectionId, TelegramService[]> = {
  'payment-links': [
    {
      id: 'request-usdc',
      title: 'Request USDC',
      body: 'Request one payer or collect from a group.',
      icon: Coins,
      status: 'Open',
      active: true,
    },
  ],
  'agent-wallets': [
    {
      id: 'hashpaylink-agent',
      title: 'Hash PayLink Agent',
      body: 'Platform agent with paid helper access for Hash PayLink services.',
      icon: Bot,
      status: 'Open',
      active: true,
    },
    {
      id: 'create-your-agent',
      title: 'Agent Setup',
      body: 'Create a profile, sign in, then link a Circle agent wallet.',
      icon: Wallet,
      status: 'Open',
      active: true,
    },
    {
      id: 'agent-dashboard',
      title: 'Agent Dashboard',
      body: 'Manage balances, fund treasury, activate x402, and view receipts.',
      icon: Wallet,
      status: 'Open',
      active: true,
    },
    {
      id: 'agent-marketplace',
      title: 'Agent Marketplace',
      body: 'Discover public agents, paid services, and agent-to-agent workflows.',
      icon: Radio,
      status: 'Soon',
      active: false,
    },
  ],
  'market-tools': [
    {
      id: 'fund-polymarket',
      title: 'Fund Polymarket',
      body: 'Fund your account or share a funding request.',
      icon: Building2,
      status: 'Open',
      active: true,
      brand: 'polymarket',
    },
    {
      id: 'lp-scout',
      title: 'LP Scout',
      body: 'Launch paid Polymarket LP research from Telegram.',
      icon: LineChart,
      status: 'Soon',
      active: false,
    },
    {
      id: 'agentic-lp-research',
      title: 'Agentic LP Research',
      body: 'Daily Polymarket reports delivered by email.',
      icon: Sparkles,
      status: 'Soon',
      active: false,
    },
  ],
  streampay: [
    {
      id: 'create-streampay',
      title: 'Create StreamPay',
      body: 'Open Arc USDC streaming from Telegram.',
      icon: Radio,
      status: 'Open',
      active: true,
    },
    {
      id: 'agentic-streampay',
      title: 'Agentic StreamPay',
      body: 'Stream USDC for ongoing agent work.',
      icon: Sparkles,
      status: 'Soon',
      active: false,
    },
  ],
}

const sectionDescriptions: Record<TelegramSectionId, string> = {
  'payment-links': 'Create normal USDC requests and share them into Telegram.',
  'agent-wallets': 'Manage agent wallets, balances, paid helpers, and x402 prep.',
  'market-tools': 'Launch Polymarket funding and market intelligence workflows.',
  streampay: 'Launch Arc StreamPay retainers and recipient workflows.',
}

const telegramSections: Array<{ id: TelegramSectionId; title: string; icon: typeof Coins }> = [
  { id: 'payment-links', title: 'Payment Links', icon: Coins },
  { id: 'agent-wallets', title: 'Agent Wallets', icon: Bot },
  { id: 'market-tools', title: 'Polymarket Tools', icon: LineChart },
  { id: 'streampay', title: 'StreamPay', icon: Radio },
]

type RequestMode = 'person' | 'group'
type RequestNetwork = 'base' | 'arc' | 'solana' | 'arbitrum' | 'all'

const requestNetworks: Array<{ key: RequestNetwork; label: string; badge?: string }> = [
  { key: 'base', label: 'Base' },
  { key: 'arc', label: 'Arc', badge: 'Testnet' },
  { key: 'solana', label: 'Solana' },
  { key: 'arbitrum', label: 'Arbitrum' },
  { key: 'all', label: 'All' },
]

const polymarketBridgeNetworks: Array<{ key: RequestNetwork; label: string; badge?: string }> = [
  { key: 'base', label: 'Base' },
  { key: 'solana', label: 'Solana' },
  { key: 'arbitrum', label: 'Arbitrum' },
]

const requestNetworkLabels: Record<RequestNetwork, string> = {
  base: 'Base',
  arc: 'Arc',
  solana: 'Solana',
  arbitrum: 'Arbitrum',
  all: 'All networks',
}

type SavedRequest = {
  kind?: 'payment-request' | 'polymarket-funding'
  mode: RequestMode
  wallet: string
  network?: RequestNetwork
  evmWallet?: string
  solanaWallet?: string
  polymarketWallet?: string
  label: string
  target: string
  amount: string
}

type PolymarketMode = 'self' | 'friends' | ''

type HelperVerifyResult = {
  verified: boolean
  payment?: { payer: string; chain: string; amount: string; ts: number }
  proof?: { ogTxHash: string; ogExplorer: string; network: string }
  error?: string
}

type HelperMessage = {
  question: string
  answer: string
  proof: { ogTxHash: string; ogExplorer: string }
}

type HelperProfile = {
  id: string
  payer: string
  displayName: string
  ownerKey?: string
  accessPayer?: string
  telegramHandle?: string
  accessEventId?: string
  preferences?: string[]
  memorySummary?: string
  memoryProof?: {
    rootHash: string
    ogTxHash: string
    ogExplorer: string
    archivedAt: number
  }
}

type AgentProfile = {
  slug: string
  name: string
  purpose: string
  walletAddress?: string
  profileImage?: {
    initials: string
    hue: number
    accentHue: number
  }
  createdAt: number
  updatedAt: number
}

type TelegramWebAppUser = {
  id?: number | string
  username?: string
  first_name?: string
  last_name?: string
}

function telegramWebAppUser(): TelegramWebAppUser | null {
  const telegram = (window as unknown as {
    Telegram?: {
      WebApp?: {
        initDataUnsafe?: {
          user?: TelegramWebAppUser
        }
      }
    }
  }).Telegram
  return telegram?.WebApp?.initDataUnsafe?.user ?? null
}

function telegramOwnerFromContext(searchParams: URLSearchParams, displayName: string) {
  const webAppUser = telegramWebAppUser()
  const urlUserId = searchParams.get('telegramId') ?? searchParams.get('tgid') ?? searchParams.get('tid') ?? searchParams.get('userId')
  const stableId = String(webAppUser?.id ?? urlUserId ?? '').trim()
  const username = String(webAppUser?.username ?? searchParams.get('u') ?? searchParams.get('username') ?? '').replace(/^@+/, '').trim()
  const legacyOwner = displayName === 'there' ? 'telegram-user' : displayName
  const owner = stableId ? `telegram:${stableId}` : legacyOwner
  return {
    owner,
    legacyOwner: legacyOwner !== owner ? legacyOwner : '',
    isStable: Boolean(stableId),
    username,
  }
}

function shortAgentWallet(value?: string) {
  if (!value) return ''
  return value.length > 14 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value
}

function agentWalletStatus(agent: AgentProfile, ready = false) {
  if (!agent.walletAddress) {
    return {
      label: 'No wallet',
      detail: 'Link Circle wallet',
      className: 'bg-gray-100 text-gray-500 dark:bg-white/[0.08] dark:text-gray-400',
    }
  }
  return {
    label: ready ? 'Ready to fund' : 'Wallet linked',
    detail: shortAgentWallet(agent.walletAddress),
    className: ready
      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300'
      : 'bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300',
  }
}

function fallbackAgentImage(agent: AgentProfile) {
  const seed = `${agent.slug}:${agent.name}`
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  const hues = [216, 266, 188, 336, 28, 201, 292, 156, 232]
  const hue = hues[hash % hues.length]
  const parts = agent.name.replace(/[^a-z0-9\s-]/gi, ' ').trim().split(/\s+/).filter(Boolean)
  return {
    initials: parts.slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'AG',
    hue,
    accentHue: (hue + 34) % 360,
  }
}

function AgentProfileAvatar({ agent, className = 'h-8 w-8 rounded-lg text-[11px]' }: { agent: AgentProfile; className?: string }) {
  const image = { ...fallbackAgentImage(agent), initials: agent.profileImage?.initials ?? fallbackAgentImage(agent).initials }
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center font-black text-white shadow-sm', className)}
      style={{
        background: `linear-gradient(135deg, hsl(${image.hue} 72% 42%), hsl(${image.accentHue} 72% 34%))`,
      }}
    >
      {image.initials}
    </span>
  )
}

export default function TelegramPaymentLinks() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialMode: RequestMode | '' = searchParams.get('mode') === 'group' ? 'group' : searchParams.get('mode') === 'person' ? 'person' : ''
  const initialSectionParam = searchParams.get('section')
  const initialSection: TelegramSectionId =
    initialSectionParam === 'agent-wallets' || initialSectionParam === 'market-tools' || initialSectionParam === 'streampay'
      ? initialSectionParam
      : 'payment-links'
  const initialServiceParam = searchParams.get('service')
  const initialService: TelegramServiceId | '' =
    initialServiceParam === 'hashpaylink-agent' || initialServiceParam === 'hashpaylink-helper'
      ? 'hashpaylink-helper'
      : initialServiceParam === 'create-your-agent'
      ? 'create-your-agent'
      : initialServiceParam === 'fund-agent-wallet' || initialServiceParam === 'agent-dashboard'
      ? 'agent-dashboard'
      : initialMode
      ? 'request-usdc'
      : ''
  const initialAgentService = initialService === 'hashpaylink-helper' || initialService === 'create-your-agent' || initialService === 'agent-dashboard'
  const initialPersonTarget = displayTelegramName(searchParams.get('target') ?? searchParams.get('payer') ?? searchParams.get('p'), '')
  const initialGroupTarget = displayTelegramName(searchParams.get('target') ?? searchParams.get('group') ?? searchParams.get('g') ?? searchParams.get('chat'), '')
  const [opened, setOpened] = useState(searchParams.get('open') === '1')
  const [activeSection, setActiveSection] = useState<TelegramSectionId>(initialAgentService ? 'agent-wallets' : initialSection)
  const [activeService, setActiveService] = useState<TelegramServiceId | ''>(initialService)
  const [requestMode, setRequestMode] = useState<RequestMode | ''>(initialMode)
  const [savedRequest, setSavedRequest] = useState<SavedRequest | null>(null)
  const [polymarketMode, setPolymarketMode] = useState<PolymarketMode>('')
  const [savedPolymarketRequest, setSavedPolymarketRequest] = useState<SavedRequest | null>(null)
  const [requestNetwork, setRequestNetwork] = useState<RequestNetwork>('base')
  const [wallet, setWallet] = useState('')
  const [evmWallet, setEvmWallet] = useState('')
  const [solanaWallet, setSolanaWallet] = useState('')
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [target, setTarget] = useState(initialMode === 'group' ? initialGroupTarget : initialPersonTarget)
  const [polymarketWallet, setPolymarketWallet] = useState('')
  const [polymarketAmount, setPolymarketAmount] = useState('')
  const [polymarketFunder, setPolymarketFunder] = useState('')
  const [polymarketNetwork, setPolymarketNetwork] = useState<RequestNetwork>('base')
  const [polymarketBridgeBusy, setPolymarketBridgeBusy] = useState(false)
  const [polymarketBridgeError, setPolymarketBridgeError] = useState('')
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([])
  const [agentProfilesError, setAgentProfilesError] = useState('')
  const telegramName = useMemo(
    () => displayTelegramName(searchParams.get('u') ?? searchParams.get('username'), 'there'),
    [searchParams],
  )
  const telegramIdentity = useMemo(() => telegramOwnerFromContext(searchParams, telegramName), [searchParams, telegramName])
  const agentOwner = telegramIdentity.isStable ? telegramIdentity.owner : ''
  const needsTelegramIdentity = activeSection === 'agent-wallets' && !telegramIdentity.isStable

  const requestFormTarget = target.trim()
  const requestWalletReady = requestNetwork === 'all'
    ? evmWallet.trim().length > 5 && solanaWallet.trim().length > 5
    : wallet.trim().length > 5
  const canSaveRequest = requestWalletReady && label.trim().length > 1 && requestFormTarget.length > 1 && !!requestMode
  const polymarketAmountNumber = Number(polymarketAmount)
  const polymarketWalletReady = /^0x[a-fA-F0-9]{40}$/.test(polymarketWallet.trim())
  const polymarketBridgeMinimum = 3
  const polymarketAmountReady = Number.isFinite(polymarketAmountNumber) && polymarketAmountNumber >= polymarketBridgeMinimum
  const polymarketFunderReady = polymarketMode !== 'friends' || polymarketFunder.trim().length > 1
  const canUsePolymarketFunding = polymarketWalletReady && polymarketAmountReady && polymarketFunderReady && !polymarketBridgeBusy

  async function loadAgentProfiles() {
    if (!agentOwner) {
      setAgentProfiles([])
      setAgentProfilesError('')
      return
    }
    setAgentProfilesError('')
    try {
      const profileParams = new URLSearchParams({ owner: agentOwner })
      if (telegramIdentity.legacyOwner) profileParams.set('fallbackOwner', telegramIdentity.legacyOwner)
      const res = await fetch(`/api/agent-profile?${profileParams.toString()}`)
      const data = await res.json() as { ok?: boolean; agents?: AgentProfile[]; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not load agents.')
      setAgentProfiles(data.agents ?? [])
    } catch (err) {
      setAgentProfilesError(err instanceof Error ? err.message : 'Could not load agents.')
    }
  }

  useEffect(() => {
    if (activeSection === 'agent-wallets') void loadAgentProfiles()
  }, [activeSection, agentOwner, telegramIdentity.legacyOwner]) // eslint-disable-line react-hooks/exhaustive-deps

  function openRequestService() {
    setActiveService('request-usdc')
    if (savedRequest) {
      restoreRequestDraft(savedRequest)
    }
  }

  function restoreRequestDraft(request: SavedRequest) {
    const network = request.network ?? inferRequestNetwork(request)
    setRequestMode(request.mode)
    setRequestNetwork(network)
    setWallet(request.wallet)
    setEvmWallet(request.evmWallet ?? (request.wallet.startsWith('0x') ? request.wallet : ''))
    setSolanaWallet(request.solanaWallet ?? (!request.wallet.startsWith('0x') ? request.wallet : ''))
    setLabel(request.label)
    setAmount(request.amount)
    setTarget(request.target)
  }

  function resetRequestForm(mode: RequestMode) {
    setRequestMode(mode)
    if (!savedRequest || savedRequest.mode !== mode) {
      setRequestNetwork('base')
      setWallet('')
      setEvmWallet('')
      setSolanaWallet('')
      setLabel('')
      setAmount('')
      setTarget(mode === 'group' ? initialGroupTarget : initialPersonTarget)
    } else {
      restoreRequestDraft(savedRequest)
    }
  }

  function saveRequest() {
    if (!requestMode || !canSaveRequest) return
    const primaryWallet = requestNetwork === 'all'
      ? evmWallet.trim()
      : wallet.trim()
    setSavedRequest({
      mode: requestMode,
      network: requestNetwork,
      wallet: primaryWallet,
      evmWallet: requestNetwork === 'all' ? evmWallet.trim() : requestNetwork === 'solana' ? '' : wallet.trim(),
      solanaWallet: requestNetwork === 'all' ? solanaWallet.trim() : requestNetwork === 'solana' ? wallet.trim() : '',
      label: label.trim(),
      target: requestFormTarget,
      amount: amount.trim(),
    })
    setRequestMode('')
  }

  function openPolymarketService() {
    setActiveService('fund-polymarket')
    setPolymarketMode('')
  }

  function selectSection(section: TelegramSectionId) {
    setActiveSection(section)
    setActiveService('')
    setRequestMode('')
    setPolymarketMode('')
  }

  function openService(service: TelegramService) {
    if (!service.active) return
    if (service.id === 'request-usdc') {
      openRequestService()
      return
    }
    if (service.id === 'fund-polymarket') {
      openPolymarketService()
      return
    }
    if (service.id === 'hashpaylink-agent') {
      setActiveService('hashpaylink-helper')
      return
    }
    if (service.id === 'hashpaylink-helper') {
      setActiveService('hashpaylink-helper')
      return
    }
    if (service.id === 'create-your-agent') {
      setActiveService('create-your-agent')
      return
    }
    if (service.id === 'agent-dashboard' || service.id === 'fund-agent-wallet') {
      setActiveService('agent-dashboard')
      return
    }
    if (service.id === 'create-streampay') {
      window.location.href = '/?app=streampay&src=telegram'
    }
  }

  async function preparePolymarketBridge(funding: string) {
    if (!canUsePolymarketFunding) return
    setPolymarketBridgeBusy(true)
    setPolymarketBridgeError('')
    try {
      const response = await fetch('/api/polymarket-bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          polymarketWallet: polymarketWallet.trim(),
          network: polymarketNetwork,
        }),
      })
      const data = await response.json() as {
        ok?: boolean
        network?: RequestNetwork
        depositAddress?: string
        addressType?: 'evm' | 'svm'
        minimumUsdc?: number
        error?: string
      }
      if (!response.ok || !data.ok || !data.depositAddress || !data.network) {
        throw new Error(data.error || 'Could not prepare Polymarket bridge address.')
      }
      return {
        network: data.network,
        depositAddress: data.depositAddress,
        payUrl: buildPolymarketPayLink({
          wallet: data.depositAddress,
          amount: polymarketAmount.trim(),
          funding,
          network: data.network,
          polymarketWallet: polymarketWallet.trim(),
        }),
      }
    } catch (err) {
      setPolymarketBridgeError(err instanceof Error ? err.message : 'Could not prepare Polymarket bridge address.')
      return null
    } finally {
      setPolymarketBridgeBusy(false)
    }
  }

  async function openPolymarketCheckout() {
    const bridge = await preparePolymarketBridge('Self funding')
    if (!bridge) return
    window.location.href = bridge.payUrl
  }

  async function savePolymarketRequest() {
    const bridge = await preparePolymarketBridge(polymarketFunder.trim())
    if (!bridge) return
    setSavedPolymarketRequest({
      kind: 'polymarket-funding',
      mode: 'person',
      network: bridge.network,
      wallet: bridge.depositAddress,
      evmWallet: bridge.network === 'solana' ? '' : bridge.depositAddress,
      solanaWallet: bridge.network === 'solana' ? bridge.depositAddress : '',
      polymarketWallet: polymarketWallet.trim(),
      label: 'Polymarket',
      target: polymarketFunder.trim(),
      amount: polymarketAmount.trim(),
    })
    setPolymarketMode('')
  }

  function goBackFromTelegramDashboard() {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate('/')
  }

  return (
    <div className="mx-auto max-w-md animate-slide-up space-y-5">
      <button
        type="button"
        onClick={goBackFromTelegramDashboard}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
      </button>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card dark:border-white/10 dark:bg-[#111114]">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-gray-400">
          <MessageCircle className="h-4 w-4" />
          <span>Telegram</span>
        </div>

        <div className="mt-4 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-white/[0.08]">
            <Bot className="h-[18px] w-[18px] text-gray-700 dark:text-gray-200" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="rounded-2xl rounded-tl-md bg-gray-100 px-4 py-3 dark:bg-white/[0.07]">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Hello {telegramName}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                What do you want to fund or request today?
              </p>
            </div>

            {!opened && (
              <button
                type="button"
                onClick={() => setOpened(true)}
                className="mt-1 flex w-full items-center justify-between rounded-b-xl rounded-tr-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition-all hover:bg-gray-50 active:scale-[0.99] dark:border-white/10 dark:bg-white/[0.05] dark:text-white dark:hover:bg-white/[0.08]"
              >
                <span>Open Hash PayLink</span>
                <ExternalLink className="h-4 w-4 text-gray-400" />
              </button>
            )}
          </div>
        </div>
      </div>

      {opened && (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card dark:border-white/10 dark:bg-[#111114]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Hash PayLink</p>
              <h1 className="mt-1 text-lg font-semibold tracking-tight text-gray-900 dark:text-white">Telegram Dashboard</h1>
              <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                Create payment actions and share them back into Telegram.
              </p>
            </div>
            <img src="/hash-logo-transparent.png" alt="" className="h-9 w-9 rounded-lg border border-gray-100 bg-white object-contain p-1 dark:border-white/10 dark:bg-white/[0.06]" />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {telegramSections.map(({ id, title, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => selectSection(id)}
                className={cn(
                  'flex min-h-[44px] items-center gap-2 rounded-xl border px-3 text-left text-xs font-semibold transition-all',
                  id === activeSection
                    ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-950'
                    : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200 hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400 dark:hover:bg-white/[0.07]',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{title}</span>
              </button>
            ))}
          </div>

          {needsTelegramIdentity ? (
            <ConnectTelegramPanel onBack={() => setActiveSection('payment-links')} />
          ) : activeService === 'request-usdc' ? (
            <RequestUsdcPanel
              requestMode={requestMode}
              savedRequest={savedRequest}
              requestFormTarget={requestFormTarget}
              canSaveRequest={canSaveRequest}
              requestNetwork={requestNetwork}
              wallet={wallet}
              evmWallet={evmWallet}
              solanaWallet={solanaWallet}
              label={label}
              amount={amount}
              target={target}
              setRequestNetwork={setRequestNetwork}
              setWallet={setWallet}
              setEvmWallet={setEvmWallet}
              setSolanaWallet={setSolanaWallet}
              setLabel={setLabel}
              setAmount={setAmount}
              setTarget={setTarget}
              resetRequestForm={resetRequestForm}
              saveRequest={saveRequest}
              onBack={() => {
                setActiveService('')
                setRequestMode('')
              }}
              onBackToModes={() => setRequestMode('')}
              onEditSaved={() => {
                if (!savedRequest) return
                restoreRequestDraft(savedRequest)
              }}
            />
          ) : activeService === 'fund-polymarket' ? (
            <PolymarketFundingPanel
              mode={polymarketMode}
              network={polymarketNetwork}
              wallet={polymarketWallet}
              amount={polymarketAmount}
              funder={polymarketFunder}
              savedRequest={savedPolymarketRequest}
              canContinue={canUsePolymarketFunding}
              amountReady={polymarketAmountReady}
              walletReady={polymarketWalletReady}
              funderReady={polymarketFunderReady}
              minimumAmount={polymarketBridgeMinimum}
              busy={polymarketBridgeBusy}
              error={polymarketBridgeError}
              setMode={setPolymarketMode}
              setNetwork={setPolymarketNetwork}
              setWallet={setPolymarketWallet}
              setAmount={setPolymarketAmount}
              setFunder={setPolymarketFunder}
              onBack={() => {
                setActiveService('')
                setPolymarketMode('')
              }}
              onBackToOptions={() => setPolymarketMode('')}
              onFundSelf={openPolymarketCheckout}
              onSaveRequest={savePolymarketRequest}
              onEditSaved={() => {
                if (!savedPolymarketRequest) return
                setPolymarketWallet(savedPolymarketRequest.polymarketWallet ?? savedPolymarketRequest.wallet)
                setPolymarketNetwork(savedPolymarketRequest.network ?? 'base')
                setPolymarketAmount(savedPolymarketRequest.amount)
                setPolymarketFunder(savedPolymarketRequest.target)
                setPolymarketMode('friends')
              }}
            />
          ) : activeService === 'hashpaylink-helper' ? (
            <TelegramHelperPanel
              telegramName={telegramName}
              ownerKey={telegramIdentity.isStable ? telegramIdentity.owner : ''}
              telegramId={telegramIdentity.isStable ? telegramIdentity.owner.replace(/^telegram:/, '') : ''}
              initialEventId={searchParams.get('eventId') ?? ''}
              initialPayer={searchParams.get('payer') ?? ''}
              onBack={() => setActiveService('')}
            />
          ) : activeService === 'create-your-agent' ? (
            <CreateAgentPanel
              owner={agentOwner}
              agents={agentProfiles}
              setAgents={setAgentProfiles}
              onBack={() => setActiveService('')}
            />
          ) : activeService === 'agent-dashboard' || activeService === 'fund-agent-wallet' ? (
            <AgentDashboardPanel
              owner={agentOwner}
              fallbackOwner={telegramIdentity.legacyOwner}
              agents={agentProfiles}
              setAgents={setAgentProfiles}
              loadError={agentProfilesError}
              setLoadError={setAgentProfilesError}
              onCreateAgent={() => setActiveService('create-your-agent')}
              onBack={() => setActiveService('')}
            />
          ) : (
            <div className="mt-4 space-y-2">
              <p className="pb-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                {sectionDescriptions[activeSection]}
              </p>
              {sectionServices[activeSection].map(service => (
                <TelegramServiceCard
                  key={service.id}
                  service={service}
                  onClick={() => openService(service)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TelegramServiceCard({
  service,
  onClick,
}: {
  service: TelegramService
  onClick: () => void
}) {
  const Icon = service.icon
  return (
    <button
      type="button"
      onClick={service.active ? onClick : undefined}
      disabled={!service.active}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all',
        service.active
          ? 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-white active:scale-[0.99] dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]'
          : 'cursor-not-allowed border-gray-100 bg-gray-50/60 opacity-70 dark:border-white/10 dark:bg-white/[0.03]',
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-gray-700 shadow-sm dark:bg-white/[0.08] dark:text-gray-200">
        {service.brand === 'polymarket'
          ? <img src={POLYMARKET_LOGO} alt="" className="h-4 w-4 invert dark:invert-0" />
          : <Icon className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">{service.title}</span>
          <span className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
            service.active ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300' : 'bg-gray-100 text-gray-400 dark:bg-white/[0.06]',
          )}>
            {service.status}
          </span>
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">{service.body}</span>
      </span>
      {service.active ? <ArrowRight className="h-4 w-4 text-gray-400" /> : <CheckCircle2 className="h-4 w-4 text-gray-300" />}
    </button>
  )
}

function ConnectTelegramPanel({ onBack }: { onBack: () => void }) {
  return (
    <div className="mt-4 space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 transition-colors hover:text-gray-700 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Payment Links
      </button>

      <div className="rounded-xl border border-gray-100 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-800 dark:bg-white/[0.08] dark:text-gray-100">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-gray-900 dark:text-white">Connect Telegram to continue</p>
            <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              Open Hash PayLink from Telegram to load your saved agents, helper access, and funding tools.
            </p>
          </div>
        </div>
        <a
          href={TELEGRAM_BOT_URL}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
        >
          <MessageCircle className="h-4 w-4" />
          Open in Telegram
        </a>
      </div>
    </div>
  )
}

function TelegramHelperPanel({
  telegramName,
  ownerKey,
  telegramId,
  initialEventId,
  initialPayer,
  onBack,
}: {
  telegramName: string
  ownerKey: string
  telegramId: string
  initialEventId: string
  initialPayer: string
  onBack: () => void
}) {
  const cleanTelegramName = telegramName === 'there' ? '' : telegramName
  const [started, setStarted] = useState(Boolean(initialEventId && initialPayer))
  const [helperName, setHelperName] = useState(() => window.localStorage.getItem('hashpaylink-helper-name') ?? (initialPayer || cleanTelegramName))
  const [helperNameDraft, setHelperNameDraft] = useState(() => window.localStorage.getItem('hashpaylink-helper-name') ?? (initialPayer || cleanTelegramName))
  const [eventId, setEventId] = useState(initialEventId)
  const [payer, setPayer] = useState(initialPayer || cleanTelegramName)
  const [verified, setVerified] = useState<HelperVerifyResult | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [messages, setMessages] = useState<HelperMessage[]>([])
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [askError, setAskError] = useState('')
  const [profile, setProfile] = useState<HelperProfile | null>(null)
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [memoryDraft, setMemoryDraft] = useState('')
  const [checkpointBusy, setCheckpointBusy] = useState(false)
  const returningFromPayment = Boolean(initialEventId && initialPayer && !verified?.verified)

  useEffect(() => {
    if (!initialEventId || !initialPayer || verified?.verified) return
    let cancelled = false
    let attempts = 0

    const run = async () => {
      attempts += 1
      await verifyAccess(initialEventId, initialPayer)
      if (!cancelled && attempts < 8) {
        window.setTimeout(run, attempts < 3 ? 4000 : 8000)
      }
    }

    void run()
    return () => { cancelled = true }
  }, [initialEventId, initialPayer, verified?.verified]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const lookupPayer = payer.trim()
    if (!lookupPayer && !ownerKey) return
    let cancelled = false
    setProfileBusy(true)
    setProfileError('')
    const profileParams = new URLSearchParams()
    if (ownerKey) profileParams.set('owner', ownerKey)
    if (lookupPayer) profileParams.set('payer', lookupPayer)
    fetch(`/api/helper-profile?${profileParams.toString()}`)
      .then(res => res.json() as Promise<{ ok?: boolean; profile?: HelperProfile | null; error?: string }>)
      .then(data => {
        if (cancelled) return
        if (!data.ok) throw new Error(data.error || 'Could not load helper profile.')
        setProfile(data.profile ?? null)
        if (data.profile?.accessEventId && data.profile?.accessPayer && !verified?.verified) {
          setEventId(current => current || data.profile?.accessEventId || '')
          setPayer(current => current || data.profile?.accessPayer || '')
          void verifyAccess(data.profile.accessEventId, data.profile.accessPayer)
        }
        if (data.profile?.displayName) {
          setHelperName(current => current || data.profile?.displayName || '')
          setHelperNameDraft(current => current || data.profile?.displayName || '')
        }
        if (data.profile?.memorySummary) setMemoryDraft(data.profile.memorySummary)
      })
      .catch(err => {
        if (!cancelled) setProfileError(err instanceof Error ? err.message : 'Could not load helper profile.')
      })
      .finally(() => {
        if (!cancelled) setProfileBusy(false)
      })
    return () => { cancelled = true }
  }, [payer, ownerKey]) // eslint-disable-line react-hooks/exhaustive-deps

  function startHelper() {
    setStarted(true)
    if (helperName && !payer.trim()) setPayer(helperName)
  }

  function saveName() {
    const clean = helperNameDraft.trim().slice(0, 48)
    if (!clean) return
    window.localStorage.setItem('hashpaylink-helper-name', clean)
    setHelperName(clean)
    if (!payer.trim()) setPayer(clean)
    void saveProfile({ displayName: clean })
  }

  async function saveProfile(extra: Partial<HelperProfile> = {}) {
    const cleanPayer = (payer || helperName || helperNameDraft || cleanTelegramName).trim()
    if (!cleanPayer) return
    setProfileBusy(true)
    setProfileError('')
    try {
      const res = await fetch('/api/helper-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          payer: cleanPayer,
          owner: ownerKey || undefined,
          displayName: extra.displayName ?? (helperName || helperNameDraft || cleanPayer),
          accessPayer: extra.accessPayer ?? (payer || cleanPayer),
          telegramHandle: cleanTelegramName,
          accessEventId: extra.accessEventId ?? eventId,
          memorySummary: extra.memorySummary ?? memoryDraft,
          preferences: extra.preferences ?? profile?.preferences ?? [],
        }),
      })
      const data = await res.json() as { ok?: boolean; profile?: HelperProfile; error?: string }
      if (!res.ok || !data.ok || !data.profile) throw new Error(data.error || 'Could not save helper profile.')
      setProfile(data.profile)
      if (data.profile.memorySummary) setMemoryDraft(data.profile.memorySummary)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not save helper profile.')
    } finally {
      setProfileBusy(false)
    }
  }

  async function checkpointMemory() {
    const cleanPayer = (payer || helperName || helperNameDraft || cleanTelegramName).trim()
    const summary = memoryDraft.trim()
    if (!cleanPayer || !summary) return
    setCheckpointBusy(true)
    setProfileError('')
    try {
      const res = await fetch('/api/helper-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'checkpoint',
          payer: cleanPayer,
          owner: ownerKey || undefined,
          displayName: helperName || helperNameDraft || cleanPayer,
          accessPayer: profile?.accessPayer || payer || cleanPayer,
          telegramHandle: cleanTelegramName,
          accessEventId: eventId,
          memorySummary: summary,
          preferences: profile?.preferences ?? [],
        }),
      })
      const data = await res.json() as { ok?: boolean; profile?: HelperProfile; error?: string }
      if (!res.ok || !data.ok || !data.profile) throw new Error(data.error || 'Could not checkpoint memory.')
      setProfile(data.profile)
      if (data.profile.memorySummary) setMemoryDraft(data.profile.memorySummary)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not checkpoint memory.')
    } finally {
      setCheckpointBusy(false)
    }
  }

  async function verifyAccess(nextEventId = eventId, nextPayer = payer) {
    if (!nextEventId.trim() || !nextPayer.trim()) return
    setVerifying(true)
    setVerified(null)
    try {
      const res = await fetch(`/api/agent-verify?eventId=${encodeURIComponent(nextEventId.trim())}&payer=${encodeURIComponent(nextPayer.trim())}`)
      const data = await res.json() as HelperVerifyResult
      setVerified(data)
      if (data.verified) {
        setStarted(true)
        setMessages([])
        void saveProfile({ displayName: helperName || helperNameDraft || nextPayer, accessEventId: nextEventId, accessPayer: nextPayer })
      }
    } catch {
      setVerified({ verified: false, error: 'Verification service unreachable.' })
    } finally {
      setVerifying(false)
    }
  }

  async function askHelper() {
    if (!question.trim() || asking || !verified?.verified) return
    const nextQuestion = question.trim()
    setQuestion('')
    setAskError('')
    setAsking(true)
    try {
      const res = await fetch('/api/agent-ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: eventId.trim(),
          payer: payer.trim(),
          question: nextQuestion,
          memorySummary: memoryDraft.trim() || profile?.memorySummary || '',
        }),
      })
      const data = await res.json() as {
        answer?: string
        proof?: { ogTxHash: string; ogExplorer: string }
        error?: string
      }
      if (!data.answer || !data.proof) throw new Error(data.error ?? 'No helper response returned.')
      setMessages(prev => [...prev, { question: nextQuestion, answer: data.answer!, proof: data.proof! }])
      if (!memoryDraft.trim()) {
        setMemoryDraft(`User is known as ${helperName || payer}. They use Hash PayLink Agent Helper from Telegram and may ask about payments, Polymarket, StreamPay, agents, research, planning, and daily questions.`)
      }
    } catch (err) {
      setAskError(err instanceof Error ? err.message : 'Helper request failed.')
    } finally {
      setAsking(false)
    }
  }

  function openHelperCheckout() {
    const cleanPayer = (helperName || helperNameDraft || payer || cleanTelegramName || 'Helper user').trim()
    const helperEventId = `helper-${Date.now().toString(36)}`
    const returnUrl = new URL('/telegram/payment-links', window.location.origin)
    returnUrl.searchParams.set('open', '1')
    returnUrl.searchParams.set('section', 'agent-wallets')
    returnUrl.searchParams.set('service', 'hashpaylink-helper')
    returnUrl.searchParams.set('agent', 'hashpaylink-agent')
    if (telegramId) returnUrl.searchParams.set('telegramId', telegramId)
    if (cleanTelegramName) returnUrl.searchParams.set('u', cleanTelegramName)

    const params = new URLSearchParams()
    params.set('e', EVM_TREASURY)
    params.set('a', '0.5')
    params.set('m', 'Hash PayLink Agent Helper Access')
    params.set('n', 'base')
    params.set('v', '1')
    params.set('id', helperEventId)
    params.set('src', 'telegram-helper')
    params.set('g', returnUrl.toString())
    params.set('ad', '1')
    if (cleanPayer) params.set('payer', cleanPayer)
    window.location.href = `/pay?${params.toString()}`
  }

  return (
    <div className="mt-4 space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 transition-colors hover:text-gray-700 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Agent Wallets
      </button>

      <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3 dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-gray-800 shadow-sm dark:bg-white/[0.08] dark:text-gray-100">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Hash PayLink Agent Helper</p>
              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold uppercase text-purple-600 dark:bg-purple-300/15 dark:text-purple-200">0.5 USDC</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Pocket help for payments, Polymarket funding, StreamPay, agent setup, research, and daily questions.
            </p>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {['0G access', profile?.memoryProof ? '0G memory' : profile?.memorySummary || memoryDraft ? 'Memory local' : 'Memory next', 'Telegram live'].map(label => (
            <span
              key={label}
              className="rounded-full border border-gray-100 bg-white px-2 py-1 text-[10px] font-semibold text-gray-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-400"
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      {!started ? (
        <div className="space-y-3 rounded-xl border border-purple-100 bg-purple-50/70 p-3 dark:border-purple-400/20 dark:bg-purple-400/10">
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-purple-100 bg-white px-1.5 py-0.5 text-[10px] font-black text-purple-600 dark:border-purple-300/20 dark:bg-white/[0.08] dark:text-purple-200">0G</span>
            <p className="text-xs font-semibold text-gray-900 dark:text-white">Verifiable access first</p>
          </div>
          <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
            The helper opens from Telegram, verifies paid access with 0G receipts, and can checkpoint approved profile memory to 0G.
          </p>
          <button
            type="button"
            onClick={startHelper}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
          >
            {helperName ? <><ArrowRight className="h-4 w-4" /> Continue as {helperName}</> : 'Start helper'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {!helperName && (
            <div className="rounded-xl border border-gray-100 bg-white p-3 dark:border-white/10 dark:bg-white/[0.03]">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">What should I call you?</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                This keeps the helper personal when you come back.
              </p>
              <div className="mt-3 space-y-2">
                <input
                  value={helperNameDraft}
                  onChange={event => setHelperNameDraft(event.target.value)}
                  onKeyDown={event => {
                    if (event.key !== 'Enter' || !helperNameDraft.trim()) return
                    saveName()
                    window.setTimeout(openHelperCheckout, 0)
                  }}
                  placeholder="Name or Telegram handle"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-white/10 dark:bg-white/[0.05] dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    saveName()
                    window.setTimeout(openHelperCheckout, 0)
                  }}
                  disabled={!helperNameDraft.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-gray-950"
                >
                  Continue to payment
                </button>
              </div>
            </div>
          )}

          {!helperName && verified?.verified !== true ? null : !verified?.verified && (
                <div className="space-y-3 rounded-xl border border-gray-100 bg-white p-3 dark:border-white/10 dark:bg-white/[0.03]">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Unlock helper access</p>
                    <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                      {returningFromPayment
                        ? 'Payment received. Verifying your 0G access receipt now.'
                        : 'Pay 0.5 USDC once to unlock the helper from Telegram.'}
                    </p>
                  </div>
                  {returningFromPayment && (
                    <div className="flex items-center gap-2 rounded-xl border border-purple-100 bg-purple-50 px-3 py-2.5 text-xs font-medium text-purple-700 dark:border-purple-300/20 dark:bg-purple-300/10 dark:text-purple-200">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Redirecting shortly while 0G verifies access
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={openHelperCheckout}
                    disabled={returningFromPayment || (!helperName && !helperNameDraft.trim())}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                  >
                    Continue to payment
                  </button>
              {verified?.verified === false && (
                <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">
                  {returningFromPayment
                    ? 'Still confirming the 0G receipt. This usually clears shortly.'
                    : verified.error ?? 'Access is not active yet.'}
                </p>
              )}
            </div>
          )}

          {verified?.verified && (
            <div className="overflow-hidden rounded-xl border border-gray-100 bg-white dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2.5 dark:border-white/10">
                <div>
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">
                    {helperName ? `Hi ${helperName}` : 'Helper is live'}
                  </p>
                  <p className="text-[11px] text-gray-400">Access verified with 0G proof</p>
                </div>
                <a
                  href={verified.proof?.ogExplorer}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-purple-100 bg-purple-50 px-2 py-1 text-[10px] font-bold text-purple-600 dark:border-purple-300/20 dark:bg-purple-300/10 dark:text-purple-200"
                >
                  0G <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>

              <div className="space-y-2 border-b border-gray-100 p-3 dark:border-white/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      {profile?.memoryProof ? '0G memory active' : memoryDraft.trim() || profile?.memorySummary ? 'Memory local' : 'Memory setup'}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                      {profile?.memoryProof
                        ? 'Latest profile checkpoint is archived.'
                        : memoryDraft.trim() || profile?.memorySummary
                        ? 'Profile summary will personalize replies.'
                        : 'Add what the helper should remember.'}
                    </p>
                  </div>
                  {profile?.memoryProof && (
                    <a
                      href={profile.memoryProof.ogExplorer}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-purple-100 bg-purple-50 px-2 py-1 text-[10px] font-bold text-purple-600 dark:border-purple-300/20 dark:bg-purple-300/10 dark:text-purple-200"
                    >
                      0G memory <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
                <textarea
                  value={memoryDraft}
                  onChange={event => setMemoryDraft(event.target.value.slice(0, 1200))}
                  onBlur={() => void saveProfile({ memorySummary: memoryDraft })}
                  placeholder="Example: Call me Ada. I like concise answers and I am building with Hash PayLink, Polymarket, StreamPay, and 0G."
                  className="min-h-[58px] w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-white/10 dark:bg-white/[0.05] dark:text-white"
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-gray-400">
                    {profileBusy ? 'Saving...' : profileError || 'Only approved summary memory is saved.'}
                  </p>
                  <button
                    type="button"
                    onClick={checkpointMemory}
                    disabled={checkpointBusy || !memoryDraft.trim()}
                    className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-all hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-950"
                  >
                    {checkpointBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                    Checkpoint
                  </button>
                </div>
              </div>

              <div className="max-h-[360px] min-h-[220px] space-y-4 overflow-y-auto p-3">
                {messages.length === 0 && !asking && (
                  <div className="rounded-2xl rounded-tl-md bg-gray-50 px-3 py-2.5 dark:bg-white/[0.05]">
                    <p className="text-sm text-gray-700 dark:text-gray-200">
                      {helperName ? `Welcome back, ${helperName}.` : 'Welcome.'} Ask me about payments, Polymarket funding, StreamPay, agent setup, research, planning, or daily questions.
                    </p>
                    <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-gray-400">
                      <span className="rounded border border-purple-100 px-1 text-[8px] font-black text-purple-500 dark:border-purple-300/20 dark:text-purple-200">0G</span>
                      access proof active
                    </div>
                  </div>
                )}

                {messages.map((message, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex justify-end">
                      <div className="max-w-[86%] rounded-2xl rounded-tr-md bg-gray-900 px-3 py-2 text-sm text-white dark:bg-white dark:text-gray-950">
                        {message.question}
                      </div>
                    </div>
                    <div>
                      <div className="max-w-[86%] whitespace-pre-wrap rounded-2xl rounded-tl-md border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-200">
                        {message.answer}
                      </div>
                      <a
                        href={message.proof.ogExplorer}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-200"
                      >
                        <span className="rounded border border-purple-100 px-1 text-[8px] font-black text-purple-500 dark:border-purple-300/20 dark:text-purple-200">0G</span>
                        response proof
                      </a>
                    </div>
                  </div>
                ))}

                {asking && (
                  <div className="inline-flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-400 dark:bg-white/[0.05]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Thinking...
                  </div>
                )}
                {askError && (
                  <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">{askError}</p>
                )}
              </div>

              <div className="border-t border-gray-100 p-3 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <input
                    value={question}
                    onChange={event => setQuestion(event.target.value)}
                    onKeyDown={event => event.key === 'Enter' && !event.shiftKey && askHelper()}
                    placeholder="Ask your helper..."
                    disabled={asking}
                    className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.05] dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={askHelper}
                    disabled={asking || !question.trim()}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black text-white transition-all hover:bg-gray-800 active:scale-95 disabled:opacity-40 dark:bg-white dark:text-gray-950"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CreateAgentPanel({
  owner,
  agents,
  setAgents,
  onBack,
}: {
  owner: string
  agents: AgentProfile[]
  setAgents: (agents: AgentProfile[]) => void
  onBack: () => void
}) {
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [savedAgent, setSavedAgent] = useState<AgentProfile | null>(null)
  const [editingAgent, setEditingAgent] = useState<AgentProfile | null>(null)
  const [showProfileForm, setShowProfileForm] = useState(true)
  const [showExistingProfiles, setShowExistingProfiles] = useState(false)

  async function saveAgent() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/agent-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, slug: editingAgent?.slug, name, purpose }),
      })
      const data = await res.json() as { ok?: boolean; agent?: AgentProfile; agents?: AgentProfile[]; error?: string }
      if (!res.ok || !data.ok || !data.agent) throw new Error(data.error || 'Could not save agent.')
      setSavedAgent(data.agent)
      setAgents(data.agents ?? [data.agent])
      setName('')
      setPurpose('')
      setEditingAgent(null)
      setShowProfileForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save agent.')
    } finally {
      setBusy(false)
    }
  }

  function editAgent(agent: AgentProfile) {
    setSavedAgent(null)
    setEditingAgent(agent)
    setName(agent.name)
    setPurpose(agent.purpose)
    setError('')
    setShowProfileForm(true)
  }

  async function deleteAgent(agent: AgentProfile) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/agent-profile', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, slug: agent.slug }),
      })
      const data = await res.json() as { ok?: boolean; agents?: AgentProfile[]; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not delete agent.')
      setAgents(data.agents ?? [])
      if (editingAgent?.slug === agent.slug) {
        setEditingAgent(null)
        setName('')
        setPurpose('')
      }
      if (savedAgent?.slug === agent.slug) setSavedAgent(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete agent.')
    } finally {
      setBusy(false)
    }
  }

  const connectedAgents = agents.filter(agent => Boolean(agent.walletAddress))
  const draftAgents = agents.filter(agent => !agent.walletAddress)
  const atAgentLimit = !editingAgent && agents.length >= MAX_USER_AGENTS
  const canSave = name.trim().length >= 2 && purpose.trim().length >= 6 && !busy && !atAgentLimit

  return (
    <div className="mt-4 space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 transition-colors hover:text-gray-700 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Agent Wallets
      </button>

      <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3 dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-gray-800 shadow-sm dark:bg-white/[0.08] dark:text-gray-100">
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Agent Setup</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Create, sign in, edit, log out, or delete agent profiles. Funding and x402 live in Agent Dashboard.
            </p>
          </div>
        </div>
      </div>

      {agents.length > 0 && !showExistingProfiles && (
        <div className="rounded-xl border border-gray-100 bg-white p-3 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Existing profiles</p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Sign in to restore saved agents.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowExistingProfiles(true)}
              className="shrink-0 rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950"
            >
              Sign in
            </button>
          </div>
        </div>
      )}

      {(showProfileForm || savedAgent) && (
        <div className="space-y-3 rounded-xl border border-gray-100 bg-white p-3 dark:border-white/10 dark:bg-white/[0.03]">
          {showProfileForm ? (
            <>
              {editingAgent && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                  <p className="min-w-0 truncate text-xs font-semibold text-gray-700 dark:text-gray-200">
                    Editing {editingAgent.name}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAgent(null)
                      setName('')
                      setPurpose('')
                      setShowProfileForm(false)
                    }}
                    className="text-xs font-semibold text-gray-400 transition-colors hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              )}
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Agent name</span>
                <input
                  value={name}
                  onChange={event => setName(event.target.value)}
                  placeholder="e.g. PayLink Scout"
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-white/10 dark:bg-white/[0.05] dark:text-white"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Purpose</span>
                <textarea
                  value={purpose}
                  onChange={event => setPurpose(event.target.value.slice(0, 260))}
                  placeholder="What should this agent do for you?"
                  className="mt-1 min-h-[82px] w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm leading-relaxed text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-white/10 dark:bg-white/[0.05] dark:text-white"
                />
              </label>
              {atAgentLimit && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">Profile limit reached</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                    You can keep up to {MAX_USER_AGENTS} agent profiles. Sign in to an existing profile or delete an unfinished one to create another.
                  </p>
                </div>
              )}
              <button
                type="button"
                onClick={saveAgent}
                disabled={!canSave}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {editingAgent ? 'Save changes' : 'Save profile'}
              </button>
              {error && <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">{error}</p>}
            </>
          ) : savedAgent ? (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 p-3 dark:border-emerald-400/20 dark:bg-emerald-400/10">
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">{savedAgent.name} saved</p>
            <p className="mt-1 text-xs leading-relaxed text-emerald-700/80 dark:text-emerald-200/80">
              Next: sign in and link a Circle agent wallet to this profile.
            </p>
            <a
              href={`/agent?profile=agent&agent=${encodeURIComponent(savedAgent.slug)}&src=telegram`}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950"
            >
              <Wallet className="h-4 w-4" />
              Sign in
            </a>
          </div>
          ) : null}
        </div>
      )}

      {showExistingProfiles && draftAgents.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Profiles to finish</p>
          {draftAgents.map(agent => (
            <div
              key={agent.slug}
              className="flex w-full items-center gap-2 rounded-xl border border-gray-100 bg-white p-2 text-left dark:border-white/10 dark:bg-white/[0.03]"
            >
              <button
                type="button"
                onClick={() => editAgent(agent)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.06]"
              >
                <AgentProfileAvatar agent={agent} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">{agent.name}</span>
                <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">Needs wallet - {agent.purpose}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => deleteAgent(agent)}
                disabled={busy}
                className="shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:border-red-400/30 dark:hover:bg-red-400/10 dark:hover:text-red-200"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {showExistingProfiles && (
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Existing profiles</p>
        {connectedAgents.length ? connectedAgents.map(agent => {
          const status = agentWalletStatus(agent)
          const dashboardUrl = `/agent?profile=agent&agent=${encodeURIComponent(agent.slug)}&src=telegram`
          return (
            <div
              key={agent.slug}
              className="flex w-full items-center gap-2 rounded-xl border border-gray-100 bg-white p-2 text-left transition-all hover:border-gray-200 hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
            >
              <a
                href={dashboardUrl}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1.5 active:scale-[0.99]"
              >
              <AgentProfileAvatar agent={agent} />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">{agent.name}</span>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', status.className)}>
                    {status.label}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">{status.detail} - {agent.purpose}</span>
              </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
              </a>
              <button
                type="button"
                onClick={() => editAgent(agent)}
                className="shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]"
              >
                Edit
              </button>
            </div>
          )
        }) : (
          <p className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 text-xs text-gray-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-gray-400">
            No linked agents yet. Sign in after creating a profile to link a Circle wallet.
          </p>
        )}
      </div>
      )}
    </div>
  )
}

function AgentDashboardPanel({
  owner,
  fallbackOwner,
  agents,
  setAgents,
  loadError,
  setLoadError,
  onCreateAgent,
  onBack,
}: {
  owner: string
  fallbackOwner: string
  agents: AgentProfile[]
  setAgents: (agents: AgentProfile[]) => void
  loadError: string
  setLoadError: (value: string) => void
  onCreateAgent: () => void
  onBack: () => void
}) {
  const connectedAgents = useMemo(() => agents.filter(agent => Boolean(agent.walletAddress)), [agents])

  async function refreshAgents() {
    setLoadError('')
    try {
      const profileParams = new URLSearchParams({ owner })
      if (fallbackOwner) profileParams.set('fallbackOwner', fallbackOwner)
      const res = await fetch(`/api/agent-profile?${profileParams.toString()}`)
      const data = await res.json() as { ok?: boolean; agents?: AgentProfile[]; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not load agents.')
      setAgents(data.agents ?? [])
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load agents.')
    }
  }

  useEffect(() => {
    if (!agents.length) void refreshAgents()
  }, [owner, fallbackOwner]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mt-4 space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 transition-colors hover:text-gray-700 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Agent Wallets
      </button>

      <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3 dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-gray-800 shadow-sm dark:bg-white/[0.08] dark:text-gray-100">
            <Wallet className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Agent Dashboard</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Pick an agent, fund treasury, activate x402, and review receipts from one place.
            </p>
          </div>
        </div>
      </div>

      {loadError && <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">{loadError}</p>}

      {!connectedAgents.length ? (
        <div className="rounded-xl border border-gray-100 bg-white p-3 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Set up an agent first</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            Dashboard actions unlock after a profile has a Circle wallet linked.
          </p>
          <button
            type="button"
            onClick={onCreateAgent}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950"
          >
            <Bot className="h-4 w-4" />
            Agent Setup
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {connectedAgents.map(agent => {
            const status = agentWalletStatus(agent, true)
            return (
              <a
                key={agent.slug}
                href={`/agent?profile=agent&agent=${encodeURIComponent(agent.slug)}&src=telegram`}
                className="flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 text-left transition-all hover:border-gray-200 hover:bg-gray-50 active:scale-[0.99] dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
              >
                <AgentProfileAvatar agent={agent} className="h-10 w-10 rounded-xl text-xs" />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">{agent.name}</span>
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', status.className)}>
                      Connected
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                    {agent.purpose || 'Agent profile'}
                  </span>
                  {agent.walletAddress && (
                    <span className="mt-1 block font-mono text-[11px] text-gray-400">
                      {shortAgentWallet(agent.walletAddress)}
                    </span>
                  )}
                </span>
                <ExternalLink className="h-4 w-4 shrink-0 text-gray-400" />
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PolymarketFundingPanel({
  mode,
  network,
  wallet,
  amount,
  funder,
  savedRequest,
  canContinue,
  amountReady,
  walletReady,
  funderReady,
  minimumAmount,
  busy,
  error,
  setMode,
  setNetwork,
  setWallet,
  setAmount,
  setFunder,
  onBack,
  onBackToOptions,
  onFundSelf,
  onSaveRequest,
  onEditSaved,
}: {
  mode: PolymarketMode
  network: RequestNetwork
  wallet: string
  amount: string
  funder: string
  savedRequest: SavedRequest | null
  canContinue: boolean
  amountReady: boolean
  walletReady: boolean
  funderReady: boolean
  minimumAmount: number
  busy: boolean
  error: string
  setMode: (mode: PolymarketMode) => void
  setNetwork: (network: RequestNetwork) => void
  setWallet: (value: string) => void
  setAmount: (value: string) => void
  setFunder: (value: string) => void
  onBack: () => void
  onBackToOptions: () => void
  onFundSelf: () => void
  onSaveRequest: () => void
  onEditSaved: () => void
}) {
  return (
    <div className="mt-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={mode ? onBackToOptions : onBack}
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
              <img src={POLYMARKET_LOGO} alt="" className="h-4 w-4 invert dark:invert-0" />
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Polymarket</p>
          </div>
          <h2 className="mt-2 text-lg font-semibold tracking-tight text-gray-900 dark:text-white">Fund Polymarket</h2>
          <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            Fund a Polymarket profile through the official bridge, or share a funding request in Telegram.
          </p>
        </div>
        {savedRequest && (
          <button
            type="button"
            onClick={onEditSaved}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/[0.06]"
            aria-label="Edit Polymarket funding request"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>

      {savedRequest && !mode ? (
        <SavedRequestCard request={savedRequest} onEdit={onEditSaved} />
      ) : (
        <>
          {!mode && (
            <div className="mt-4 space-y-2">
              <RequestModeButton
                icon={Wallet}
                title="Fund my account"
                body="Pay into your Polymarket profile through Bridge."
                onClick={() => setMode('self')}
              />
              <RequestModeButton
                icon={UsersRound}
                title="Get funded"
                body="Share a Polymarket funding request in Telegram."
                onClick={() => setMode('friends')}
              />
            </div>
          )}

          {mode && (
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                  {mode === 'self' ? 'Bridge checkout' : 'Bridge request'}
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                  {mode === 'self' ? 'Fund through Polymarket Bridge' : 'Share a bridge-backed funding card'}
                </p>
              </div>

              <NetworkChipGroup value={network} onChange={setNetwork} options={polymarketBridgeNetworks} />

              <InputBlock
                label="Profile address"
                value={wallet}
                onChange={setWallet}
                placeholder="0x... profile address"
              />
              <p className="px-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                Paste the 0x address from the profile/account panel. Do not paste a manual deposit address.
              </p>
              {mode === 'friends' && (
                <InputBlock
                  label="Payer"
                  value={funder}
                  onChange={setFunder}
                  placeholder="Drea, Alex, sponsor name..."
                />
              )}
              <InputBlock
                label="Amount USDC"
                value={amount}
                onChange={setAmount}
                placeholder="0.00"
              />

              {wallet && !walletReady && (
                <p className="px-1 text-xs text-red-500 dark:text-red-300">Enter a valid 0x profile address.</p>
              )}
              {mode === 'friends' && funder && !funderReady && (
                <p className="px-1 text-xs text-red-500 dark:text-red-300">Enter the payer name.</p>
              )}
              {amount && !amountReady && (
                <p className="px-1 text-xs text-red-500 dark:text-red-300">Minimum bridge amount is {minimumAmount} USDC.</p>
              )}
              {error && <p className="px-1 text-xs text-red-500 dark:text-red-300">{error}</p>}

              <button
                type="button"
                onClick={mode === 'self' ? onFundSelf : onSaveRequest}
                disabled={!canContinue}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
              >
                <Send className="h-4 w-4" />
                {busy ? 'Preparing bridge...' : mode === 'self' ? 'Continue to checkout' : 'Save funding request'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function RequestUsdcPanel({
  requestMode,
  savedRequest,
  requestFormTarget,
  canSaveRequest,
  requestNetwork,
  wallet,
  evmWallet,
  solanaWallet,
  label,
  amount,
  target,
  setRequestNetwork,
  setWallet,
  setEvmWallet,
  setSolanaWallet,
  setLabel,
  setAmount,
  setTarget,
  resetRequestForm,
  saveRequest,
  onBack,
  onBackToModes,
  onEditSaved,
}: {
  requestMode: RequestMode | ''
  savedRequest: SavedRequest | null
  requestFormTarget: string
  canSaveRequest: boolean
  requestNetwork: RequestNetwork
  wallet: string
  evmWallet: string
  solanaWallet: string
  label: string
  amount: string
  target: string
  setRequestNetwork: (value: RequestNetwork) => void
  setWallet: (value: string) => void
  setEvmWallet: (value: string) => void
  setSolanaWallet: (value: string) => void
  setLabel: (value: string) => void
  setAmount: (value: string) => void
  setTarget: (value: string) => void
  resetRequestForm: (mode: RequestMode) => void
  saveRequest: () => void
  onBack: () => void
  onBackToModes: () => void
  onEditSaved: () => void
}) {
  function updateRequestNetwork(network: RequestNetwork) {
    setRequestNetwork(network)
    if (network === 'all') return
    if (network === 'solana') {
      setWallet(solanaWallet)
      return
    }
    setWallet(evmWallet)
  }

  function updateSingleWallet(value: string) {
    setWallet(value)
    if (requestNetwork === 'solana') {
      setSolanaWallet(value)
    } else {
      setEvmWallet(value)
    }
  }

  return (
    <div className="mt-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={requestMode ? onBackToModes : onBack}
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Request USDC</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-gray-900 dark:text-white">Create a payment request</h2>
          <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            Save it, then share a clean payment card in Telegram.
          </p>
        </div>
        {savedRequest && (
          <button
            type="button"
            onClick={onEditSaved}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/[0.06]"
            aria-label="Edit request"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>

      {savedRequest && !requestMode ? (
        <SavedRequestCard request={savedRequest} onEdit={() => resetRequestForm(savedRequest.mode)} />
      ) : (
        <>
          {!requestMode && (
            <div className="mt-4 space-y-2">
              <RequestModeButton
                icon={UserRound}
                title="Share to one chat"
                body="One payer. Share to any DM or chat."
                onClick={() => resetRequestForm('person')}
              />
              <RequestModeButton
                icon={UsersRound}
                title="Share to a group"
                body="One collection link for donations, dues, splits, or registrations."
                onClick={() => resetRequestForm('group')}
              />
            </div>
          )}

          {requestMode && (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                  {requestMode === 'group' ? 'Group collection' : 'One-chat request'}
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                  {requestMode === 'group' ? 'Group collection' : 'One payer'}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  {requestMode === 'group'
                    ? 'Everyone opens the same collection link.'
                    : 'Create one payment request and share it in Telegram.'}
                </p>
              </div>

              <InputBlock
                label={requestMode === 'group' ? 'Group name' : 'Payer'}
                value={target}
                onChange={setTarget}
                placeholder={requestMode === 'group' ? 'Pizza DAO, class dues...' : 'Drea, Alex, customer name...'}
              />
              <NetworkChipGroup value={requestNetwork} onChange={updateRequestNetwork} />
              {requestNetwork === 'all' ? (
                <div className="grid gap-2">
                  <InputBlock
                    label="EVM wallet"
                    value={evmWallet}
                    onChange={setEvmWallet}
                    placeholder="0x... wallet address"
                  />
                  <InputBlock
                    label="Solana wallet"
                    value={solanaWallet}
                    onChange={setSolanaWallet}
                    placeholder="Solana wallet address"
                  />
                </div>
              ) : (
                <InputBlock
                  label="Receive wallet"
                  value={wallet}
                  onChange={updateSingleWallet}
                  placeholder={requestNetwork === 'solana' ? 'Solana wallet address' : '0x... wallet address'}
                />
              )}
              <InputBlock
                label={requestMode === 'group' ? 'Collection name' : 'For'}
                value={label}
                onChange={setLabel}
                placeholder={requestMode === 'group' ? 'Pizza DAO, donations, dues...' : 'Dinner, invoice, Shy...'}
              />
              <InputBlock
                label="Amount"
                value={amount}
                onChange={setAmount}
                placeholder="Optional"
              />

              <button
                type="button"
                onClick={saveRequest}
                disabled={!canSaveRequest}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
              >
                <Send className="h-4 w-4" />
                {requestMode === 'group' ? 'Save collection' : 'Save request'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function RequestModeButton({
  icon: Icon,
  title,
  body,
  onClick,
}: {
  icon: typeof UserRound
  title: string
  body: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-left transition-all hover:border-gray-300 hover:bg-white active:scale-[0.99] dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-gray-700 shadow-sm dark:bg-white/[0.08] dark:text-gray-200">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">{body}</span>
      </span>
      <ArrowRight className="h-4 w-4 text-gray-400" />
    </button>
  )
}

function NetworkChipGroup({
  value,
  onChange,
  options = requestNetworks,
}: {
  value: RequestNetwork
  onChange: (value: RequestNetwork) => void
  options?: Array<{ key: RequestNetwork; label: string; badge?: string }>
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.05]">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Network</p>
      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
        {options.map(network => (
          <button
            key={network.key}
            type="button"
            onClick={() => onChange(network.key)}
            className={cn(
              'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors',
              value === network.key
                ? 'bg-gray-950 text-white dark:bg-white dark:text-gray-950'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/[0.07] dark:text-gray-300 dark:hover:bg-white/[0.12]',
            )}
          >
            <span>{network.label}</span>
            {network.badge && (
              <span className={cn(
                'ml-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase',
                value === network.key
                  ? 'bg-white/15 text-white dark:bg-gray-950/10 dark:text-gray-700'
                  : 'bg-gray-200 text-gray-500 dark:bg-white/[0.08] dark:text-gray-400',
              )}>
                {network.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

function InputBlock({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <label className="block rounded-xl border border-gray-100 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.05]">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{label}</span>
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full bg-transparent text-sm font-medium text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-500"
      />
    </label>
  )
}

function SavedRequestCard({
  request,
  onEdit,
}: {
  request: SavedRequest
  onEdit: () => void
}) {
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState('')
  const amountLine = request.amount ? `${request.amount} USDC` : 'Flexible amount'
  const isPolymarket = request.kind === 'polymarket-funding'
  const network = request.network ?? inferRequestNetwork(request)
  const networkLabel = requestNetworkLabels[network]

  async function shareInTelegram() {
    if (sharing) return
    setSharing(true)
    setShareError('')

    try {
      if (isLocalhost()) {
        window.location.href = buildTelegramShareUrl(request)
        return
      }

      const res = await fetch('/api/telegram-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      const data = await res.json() as { ok?: boolean; botPayload?: string; error?: string }
      if (!res.ok || !data.ok || !data.botPayload) {
        throw new Error(data.error || 'Could not prepare Telegram request.')
      }

      const botUrl = buildTelegramBotStartUrl(data.botPayload)
      const telegramWebApp = (window as Window & {
        Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void } }
      }).Telegram?.WebApp

      if (telegramWebApp?.openTelegramLink) {
        telegramWebApp.openTelegramLink(botUrl)
      } else {
        window.location.href = botUrl
      }
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Could not open Telegram.')
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 dark:border-emerald-400/20 dark:bg-emerald-400/10">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
            {isPolymarket ? 'Funding request saved' : 'Request saved'}
          </p>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-emerald-700/80 dark:text-emerald-200/80">
          {isPolymarket ? 'Ready to share as a Polymarket funding card.' : 'Ready to share in Telegram.'}
        </p>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-3 dark:border-white/10 dark:bg-white/[0.05]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
              {isPolymarket ? 'Polymarket funding' : 'Current request'}
            </p>
            <p className="mt-1 flex items-center gap-1.5 truncate text-sm font-semibold text-gray-900 dark:text-white">
              {isPolymarket && <img src={POLYMARKET_LOGO} alt="" className="h-4 w-4 shrink-0 invert dark:invert-0" />}
              <span className="truncate">{isPolymarket ? 'Profile address' : request.label}</span>
            </p>
            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
              {isPolymarket
                ? `${shortAddress(request.polymarketWallet ?? request.wallet)} - ${amountLine}`
                : `${networkLabel} - ${request.target} ${request.amount ? `- ${request.amount} USDC` : '- flexible amount'}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/[0.08]"
            aria-label="Edit request"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={shareInTelegram}
        disabled={sharing}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
      >
        <Send className="h-4 w-4" />
        {sharing ? 'Preparing request...' : isPolymarket ? 'Share funding card' : 'Share in Telegram'}
      </button>
      {shareError && <p className="text-center text-xs text-red-500 dark:text-red-300">{shareError}</p>}
    </div>
  )
}

function buildPolymarketPayLink({
  wallet,
  amount,
  funding,
  network,
  polymarketWallet,
}: {
  wallet: string
  amount: string
  funding?: string
  network: RequestNetwork
  polymarketWallet: string
}) {
  const params = new URLSearchParams()
  params.set('a', amount)
  params.set('src', 't')
  params.set('n', network)
  if (network === 'solana') params.set('s', wallet)
  else params.set('e', wallet)
  params.set('m', 'Polymarket')
  params.set('brand', 'polymarket')
  params.set('pm', '1')
  params.set('bridge', 'polymarket')
  params.set('pmw', polymarketWallet)
  if (funding) params.set('funding', funding)
  return `${window.location.origin}/pay?${params.toString()}`
}

function buildRequestPayLink(request: SavedRequest) {
  const params = new URLSearchParams()
  const wallet = request.wallet.trim()
  const amount = request.amount.trim()
  const network = request.network ?? inferRequestNetwork(request)

  if (amount) params.set('a', amount)
  else params.set('f', '1')

  params.set('src', 't')
  if (network === 'all') {
    params.set('x', '1')
    if (request.evmWallet?.trim()) params.set('e', request.evmWallet.trim())
    if (request.solanaWallet?.trim()) params.set('s', request.solanaWallet.trim())
  } else if (network === 'solana') {
    params.set('n', 'solana')
    params.set('s', request.solanaWallet?.trim() || wallet)
  } else {
    params.set('n', network)
    params.set('e', request.evmWallet?.trim() || wallet)
  }

  params.set('m', request.label)
  if (request.mode === 'group') {
    params.set('v', '1')
    params.set('id', request.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'telegram-request')
  }

  return `${shareOrigin()}/pay?${params.toString()}`
}

function buildShortRequestPayLink(request: SavedRequest) {
  const wallet = request.wallet.trim()
  const amount = request.amount.trim() || '-'
  const memo = request.label.trim() || '-'
  const network = request.network ?? inferRequestNetwork(request)
  if (network === 'all') return buildRequestPayLink(request)
  const params = new URLSearchParams()
  if (request.mode === 'group') {
    params.set('v', '1')
    params.set('id', request.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'telegram-request')
  }
  const suffix = params.toString() ? `?${params.toString()}` : ''
  return `${shareOrigin()}/p/${encodeURIComponent(network)}/${encodeURIComponent(amount)}/${encodeURIComponent(wallet)}/${encodeURIComponent(memo)}${suffix}`
}

function inferRequestNetwork(request: Pick<SavedRequest, 'wallet'>): RequestNetwork {
  return request.wallet.trim().startsWith('0x') ? 'base' : 'solana'
}

function isLocalhost() {
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
}

function shareOrigin() {
  return isLocalhost() ? PUBLIC_PAYLINK_ORIGIN : window.location.origin
}

function buildTelegramShareUrl(request: SavedRequest) {
  const amountLine = request.amount ? `${request.amount} USDC` : 'USDC'
  const targetLine = request.mode === 'group' ? `Group: ${request.target}` : `Payer: ${request.target}`
  const text = [
    request.mode === 'group' ? 'Hash PayLink collection' : 'Hash PayLink payment request',
    '',
    `${request.label} requested ${amountLine}.`,
    targetLine,
    '',
    'Tap to pay securely:',
  ].join('\n')
  const url = buildShortRequestPayLink(request)
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
}

function buildTelegramBotStartUrl(payload: string) {
  const base = TELEGRAM_BOT_URL.trim().replace(/\/+$/, '') || 'https://t.me/HashPayLinkBot'
  const cleanPayload = payload.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
  if (base.includes('?')) return `${base}&start=${encodeURIComponent(cleanPayload)}`
  return `${base}?start=${encodeURIComponent(cleanPayload)}`
}
