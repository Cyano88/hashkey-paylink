import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BellRing,
  Bot,
  Building2,
  CheckCircle2,
  Coins,
  Copy,
  ExternalLink,
  LineChart,
  Loader2,
  LogOut,
  Mail,
  MessageCircle,
  Newspaper,
  Pencil,
  PlusCircle,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  UserRound,
  UsersRound,
  Wallet,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { EVM_TREASURY } from '../lib/chains'
import AgentDemo from './AgentDemo'

const TELEGRAM_BOT_URL = import.meta.env.VITE_TELEGRAM_AGENT_URL || 'https://t.me/HashPayLinkBot'
const PUBLIC_PAYLINK_ORIGIN = (import.meta.env.VITE_PUBLIC_PAYLINK_ORIGIN || 'https://hashpaylink.com').replace(/\/+$/, '')
const POLYMARKET_LOGO = '/brand/polymarket-logo.png'

function displayTelegramName(rawName: string | null, fallback = 'there') {
  const clean = (rawName ?? '').replace(/^@+/, '').trim()
  if (!clean) return fallback
  if (/\s/.test(clean)) return clean
  return `@${clean}`
}

function shortAddress(value: string) {
  return value.length > 14 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value
}

type TelegramSectionId = 'payment-links' | 'helper' | 'agent-wallets' | 'market-tools' | 'streampay'
type TelegramServiceId =
  | 'request-usdc'
  | 'fund-polymarket'
  | 'create-your-agent'
  | 'hashpaylink-helper'
  | 'agent-marketplace'
  | 'agent-dashboard'
  | 'fund-agent-wallet'
  | 'poly-portfolio'
  | 'poly-worldcup'
  | 'lp-scout'
  | 'poly-worldcup-news'
  | 'poly-stream'
  | 'agentic-lp-research'
  | 'streampay-payroll'
  | 'streampay-creator'
  | 'streampay-x402'
  | 'streampay-arena'

type TelegramService = {
  id: TelegramServiceId
  title: string
  body: string
  icon: typeof Coins
  status: 'Open' | 'Soon' | 'Next' | 'Telegram' | '0.5 USDC'
  active: boolean
  brand?: 'polymarket'
}

type LpScoutMode = 'best' | 'theme' | 'market'
type LpScoutPrefill = {
  mode: LpScoutMode
  query: string
  budget?: string
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
  helper: [
    {
      id: 'hashpaylink-helper',
      title: 'Ask Hash',
      body: 'Fast chat help for payments, PolyDesk, StreamPay, and LP services.',
      icon: Bot,
      status: 'Open',
      active: true,
    },
  ],
  'agent-wallets': [
    {
      id: 'agent-dashboard',
      title: 'x402 Wallet Manager',
      body: 'Sign in with email, fund Circle wallet balance, activate x402, and view receipts.',
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
      id: 'poly-portfolio',
      title: 'Portfolio',
      body: 'Track balances, open positions, claimables, and risk alerts.',
      icon: Wallet,
      status: 'Open',
      active: true,
      brand: 'polymarket',
    },
    {
      id: 'poly-worldcup',
      title: 'World Cup Markets',
      body: 'Live scores, market odds, and direct trade routes.',
      icon: Radio,
      status: 'Open',
      active: true,
    },
    {
      id: 'lp-scout',
      title: 'LP Scout',
      body: 'Paid x402 research for LP reward opportunities.',
      icon: LineChart,
      status: 'Open',
      active: true,
    },
  ],
  streampay: [
    {
      id: 'streampay-payroll',
      title: 'Payroll',
      body: 'Create Arc USDC streams for payroll and scheduled payouts.',
      icon: Radio,
      status: 'Open',
      active: true,
    },
    {
      id: 'streampay-creator',
      title: 'Creator',
      body: 'Publish creator drops and paid access flows on StreamPay.',
      icon: Pencil,
      status: 'Open',
      active: true,
    },
    {
      id: 'streampay-x402',
      title: 'x402 Stream',
      body: 'Open x402-backed agentic streams and service retainers.',
      icon: Sparkles,
      status: 'Open',
      active: true,
    },
    {
      id: 'streampay-arena',
      title: 'Arena',
      body: 'Launch StreamPay Arena rooms with Arc settlement.',
      icon: UsersRound,
      status: 'Open',
      active: true,
    },
  ],
}

const sectionDescriptions: Record<TelegramSectionId, string> = {
  'payment-links': 'Create normal USDC requests and share them into Telegram.',
  helper: 'Open the ZeroScout-sponsored helper for payments, PolyDesk, StreamPay, and setup questions.',
  'agent-wallets': 'Manage Circle wallet balance, x402 service balance, and receipts.',
  'market-tools': 'PolyDesk for Polymarket funding, portfolio alerts, LP Scout, and live market context.',
  streampay: 'Payroll, creator, x402 stream, and Arena flows on StreamPay.',
}

const telegramSections: Array<{ id: TelegramSectionId; title: string; icon: typeof Coins }> = [
  { id: 'payment-links', title: 'Payment Links', icon: Coins },
  { id: 'helper', title: 'Ask Hash', icon: Bot },
  { id: 'agent-wallets', title: 'Agent Wallets', icon: Bot },
  { id: 'market-tools', title: 'PolyDesk', icon: LineChart },
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
  id?: string
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
  payUrl?: string
}

type HelperPaylinkDraft = {
  mode: RequestMode
  target: string
  amount: string
  network: RequestNetwork | ''
  label: string
  wallet: string
  evmWallet: string
  solanaWallet: string
  offeredSavedWallet?: boolean
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
  proof?: { ogTxHash: string; ogExplorer: string }
  zeroscoutSponsorship?: ZeroScoutSponsorship
  paylink?: SavedRequest
}

type ZeroScoutSponsorship = {
  proofClass: 'zeroscout_sponsored_action'
  sponsor: 'ZeroScout'
  service: string
  action: string
  requestHash: string
  sponsoredAt: string
  sourceProofClass?: 'helper_access_receipt' | 'helper_memory_proof' | 'service_receipt'
  zeroscout?: {
    intelligenceScore?: number
    summary?: string
    proof?: {
      storageRoot?: string
      storageTxHash?: string
    }
  }
}

type HelperProfile = {
  id: string
  payer: string
  displayName: string
  ownerKey?: string
  accessPayer?: string
  telegramHandle?: string
  accessEventId?: string
  preferredPaymentWallet?: string
  preferredPaymentNetwork?: RequestNetwork
  preferredPaymentEvmWallet?: string
  preferredPaymentSolanaWallet?: string
  preferences?: string[]
  memorySummary?: string
  memoryProof?: {
    rootHash: string
    ogTxHash: string
    ogExplorer: string
    archivedAt: number
  }
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

function telegramWebAppStartParam() {
  const telegram = (window as unknown as {
    Telegram?: {
      WebApp?: {
        initDataUnsafe?: {
          start_param?: string
        }
      }
    }
  }).Telegram
  return telegram?.WebApp?.initDataUnsafe?.start_param ?? ''
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

function extractAmount(text: string) {
  const explicit = text.match(/(?:\$|usdc\s+)(\d+(?:\.\d{1,6})?)|(\d+(?:\.\d{1,6})?)\s*(?:usdc|usd)\b/i)
  if (explicit) return explicit[1] || explicit[2] || ''
  const loose = Array.from(text.matchAll(/(^|[^\w.])(\d+(?:\.\d{1,6})?)(?!x|\w)/gi))
  return loose.find(match => Number(match[2]) > 0)?.[2] ?? ''
}

function extractNetwork(text: string): RequestNetwork | '' {
  const lower = text.toLowerCase()
  if (/\barc\b/.test(lower)) return 'arc'
  if (/\bsolana\b|\bsol\b/.test(lower)) return 'solana'
  if (/\barbitrum\b|\barb\b/.test(lower)) return 'arbitrum'
  if (/\ball networks\b|\bany network\b|\bbase and solana\b/.test(lower)) return 'all'
  if (/\bbase\b|\bevm\b/.test(lower)) return 'base'
  return ''
}

function extractWallet(text: string) {
  const evm = text.match(/0x[a-fA-F0-9]{40}/)?.[0] ?? ''
  if (evm) return evm
  const solana = text.match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/)?.[0] ?? ''
  return solana
}

function extractTarget(text: string, mode: RequestMode) {
  const clean = text.replace(/\s+/g, ' ').trim()
  const person = clean.match(/\b(?:from|to|for)\s+(@?[a-zA-Z][\w.-]{1,40})\b/)?.[1] ?? ''
  if (person && !['base', 'arc', 'solana', 'arbitrum', 'dinner', 'invoice', 'payment'].includes(person.toLowerCase())) return person
  const group = clean.match(/\b(?:group|collection|collect from)\s+([^,.;]+)/i)?.[1]?.trim() ?? ''
  if (mode === 'group' && group) return group.slice(0, 48)
  return ''
}

function extractPurpose(text: string) {
  const clean = text.replace(/\s+/g, ' ').trim()
  const match = clean.match(/\b(?:for|purpose|memo|reason)\s+([^?.!,;]+)/i)?.[1]?.trim() ?? ''
  if (!match) return ''
  return match.replace(/^(base|arc|solana|arbitrum|usdc)\b/i, '').trim().slice(0, 80)
}

function isPaymentRequestIntent(text: string) {
  return /\b(request|collect|charge|invoice|paylink|payment link|ask .*pay|split|dues|donation|group collection)\b/i.test(text)
}

function isGroupRequestIntent(text: string) {
  return /\b(group|collection|multi payer|multi-payer|everyone|split|dues|donation|contributors|many people)\b/i.test(text)
}

function wantsSavedWallet(text: string) {
  return /\b(saved|same|continue|use it|use that|yes|ok|okay)\b/i.test(text)
}

function wantsNewWallet(text: string) {
  return /\b(new|replace|change|different|another)\b/i.test(text)
}

function describeMissingDraftFields(draft: HelperPaylinkDraft, savedWallet?: string) {
  const missing = [
    !draft.target && (draft.mode === 'group' ? 'group or collection name' : 'payer name'),
    !draft.amount && 'amount in USDC',
    !draft.network && 'network',
    !draft.label && 'purpose',
    !draft.wallet && !savedWallet && 'receive wallet',
  ].filter(Boolean)
  return missing as string[]
}

function compactSavedWallet(wallet: string) {
  return wallet ? shortAddress(wallet).replace('...', '..') : ''
}

export default function TelegramPaymentLinks() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const startPayload = (searchParams.get('start') ?? searchParams.get('tgWebAppStartParam') ?? telegramWebAppStartParam()).trim().toLowerCase()
  const initialMode: RequestMode | '' = searchParams.get('mode') === 'group' ? 'group' : searchParams.get('mode') === 'person' ? 'person' : ''
  const initialSectionParam = searchParams.get('section')
  const initialSection: TelegramSectionId =
    startPayload === 'polymarket' || startPayload === 'poly'
      ? 'market-tools'
      : initialSectionParam === 'helper' || initialSectionParam === 'agent-wallets' || initialSectionParam === 'market-tools' || initialSectionParam === 'streampay'
      ? initialSectionParam
      : 'payment-links'
  const initialServiceParam = searchParams.get('service')
  const initialService: TelegramServiceId | '' =
    startPayload === 'polymarket' || startPayload === 'poly'
      ? 'poly-portfolio'
      : startPayload === 'poly_fund'
      ? 'fund-polymarket'
      : startPayload === 'poly_worldcup'
      ? 'poly-worldcup'
      : startPayload === 'poly_alerts'
      ? 'poly-portfolio'
      : startPayload === 'lp_scout'
      ? 'lp-scout'
      : initialServiceParam === 'hashpaylink-helper'
      ? 'hashpaylink-helper'
      : initialServiceParam === 'create-your-agent'
      ? 'agent-dashboard'
      : initialServiceParam === 'fund-agent-wallet' || initialServiceParam === 'agent-dashboard'
      ? 'agent-dashboard'
      : initialServiceParam === 'fund-polymarket' || initialServiceParam === 'poly-portfolio'
      ? 'poly-portfolio'
      : initialServiceParam === 'lp-scout'
      ? 'lp-scout'
      : initialServiceParam === 'poly-worldcup-news'
      ? 'poly-worldcup-news'
      : initialServiceParam === 'poly-stream'
      ? 'poly-stream'
      : initialServiceParam === 'poly-worldcup'
      ? 'poly-worldcup'
      : initialServiceParam === 'agentic-lp-research'
      ? 'agentic-lp-research'
      : ''
  const initialAgentService = initialService === 'create-your-agent' || initialService === 'agent-dashboard'
  const initialHelperService = initialService === 'hashpaylink-helper'
  const initialMarketService = initialService === 'poly-portfolio' || initialService === 'lp-scout' || initialService === 'poly-worldcup' || initialService === 'poly-worldcup-news' || initialService === 'poly-stream' || initialService === 'agentic-lp-research'
  const initialPersonTarget = displayTelegramName(searchParams.get('target') ?? searchParams.get('payer') ?? searchParams.get('p'), '')
  const initialGroupTarget = displayTelegramName(searchParams.get('target') ?? searchParams.get('group') ?? searchParams.get('g') ?? searchParams.get('chat'), '')
  const [opened, setOpened] = useState(searchParams.get('open') !== '0')
  const [activeSection, setActiveSection] = useState<TelegramSectionId>(initialAgentService ? 'agent-wallets' : initialHelperService ? 'helper' : initialMarketService ? 'market-tools' : initialSection)
  const [activeService, setActiveService] = useState<TelegramServiceId | ''>(initialService)
  const [requestMode, setRequestMode] = useState<RequestMode | ''>(initialServiceParam === 'request-usdc' ? initialMode : '')
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
  const [lpScoutPrefill, setLpScoutPrefill] = useState<LpScoutPrefill | null>(null)
  const [recoveredTelegramName, setRecoveredTelegramName] = useState('')
  const telegramName = useMemo(() => {
    const webAppUser = telegramWebAppUser()
    return displayTelegramName(
      searchParams.get('u')
        ?? searchParams.get('username')
        ?? webAppUser?.username
        ?? webAppUser?.first_name
        ?? recoveredTelegramName,
      'there',
    )
  }, [searchParams, recoveredTelegramName])
  const telegramIdentity = useMemo(() => telegramOwnerFromContext(searchParams, telegramName), [searchParams, telegramName])
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

  function openRequestService() {
    setActiveService('request-usdc')
    if (!savedRequest && initialMode) {
      resetRequestForm(initialMode)
      return
    }
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
    if (service.id === 'hashpaylink-helper') {
      setActiveService('hashpaylink-helper')
      return
    }
    if (service.id === 'create-your-agent') {
      setActiveService('agent-dashboard')
      return
    }
    if (service.id === 'agent-dashboard' || service.id === 'fund-agent-wallet') {
      setActiveService('agent-dashboard')
      return
    }
    if (service.id === 'streampay-payroll') {
      window.location.href = '/?app=streampay&src=telegram'
      return
    }
    if (service.id === 'streampay-creator') {
      window.location.href = '/creator?app=streampay&src=telegram'
      return
    }
    if (service.id === 'streampay-x402') {
      window.location.href = '/agentic?app=streampay&mode=agentic-streaming&src=telegram'
      return
    }
    if (service.id === 'streampay-arena') {
      window.location.href = '/arena?app=streampay&game=trivia&src=telegram'
      return
    }
    if (service.id === 'poly-portfolio') {
      setActiveService('poly-portfolio')
      return
    }
    if (service.id === 'poly-worldcup') {
      setActiveService('poly-worldcup')
      return
    }
    if (service.id === 'lp-scout') {
      setActiveService('lp-scout')
      return
    }
    if (service.id === 'poly-worldcup-news') {
      setActiveService('poly-worldcup-news')
      return
    }
    if (service.id === 'poly-stream') {
      setActiveService('poly-stream')
      return
    }
    if (service.id === 'agentic-lp-research') {
      setActiveService('agentic-lp-research')
      return
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
    navigate('/app')
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-[calc(100vw-2rem)] animate-slide-up space-y-5 sm:max-w-md">
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
              <h1 className="mt-1 text-lg font-semibold tracking-tight text-gray-900 dark:text-white">Telegram Services</h1>
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
          ) : activeService === 'poly-portfolio' ? (
            <PolyPortfolioPanel
              onBack={() => setActiveService('')}
              onOpenLpScout={() => setActiveService('lp-scout')}
              onOpenWorldCup={() => setActiveService('poly-worldcup')}
              telegramOwner={telegramIdentity.isStable ? telegramIdentity.owner : ''}
              telegramId={telegramIdentity.isStable ? telegramIdentity.owner.replace(/^telegram:/, '') : ''}
            />
          ) : activeService === 'poly-worldcup' ? (
            <PolyWorldCupHubPanel
              onBack={() => setActiveService('')}
              onOpenNews={() => setActiveService('poly-worldcup-news')}
              onOpenScores={() => setActiveService('poly-stream')}
              onOpenPortfolio={() => setActiveService('poly-portfolio')}
            />
          ) : activeService === 'lp-scout' ? (
            <LpScoutPanel
              prefill={lpScoutPrefill}
              onPrefillConsumed={() => setLpScoutPrefill(null)}
              onOpenWalletManager={() => {
                setActiveSection('agent-wallets')
                setActiveService('agent-dashboard')
              }}
              onBack={() => setActiveService('')}
            />
          ) : activeService === 'poly-worldcup-news' ? (
            <PolyWorldCupNewsPanel
              onBack={() => setActiveService('poly-worldcup')}
              onOpenScores={() => setActiveService('poly-stream')}
              onOpenLpScout={prefill => {
                setLpScoutPrefill(prefill)
                setActiveService('lp-scout')
              }}
            />
          ) : activeService === 'poly-stream' ? (
            <PolyStreamPanel
              onBack={() => setActiveService('poly-worldcup')}
              onOpenNews={() => setActiveService('poly-worldcup-news')}
            />
          ) : activeService === 'agentic-lp-research' ? (
            <AgenticLpResearchPanel onBack={() => setActiveService('')} />
          ) : activeService === 'hashpaylink-helper' ? (
            <TelegramHelperPanel
              telegramName={telegramName}
              ownerKey={telegramIdentity.isStable ? telegramIdentity.owner : ''}
              telegramId={telegramIdentity.isStable ? telegramIdentity.owner.replace(/^telegram:/, '') : ''}
              fallbackOwner={telegramIdentity.legacyOwner}
              initialEventId={searchParams.get('eventId') ?? ''}
              initialPayer={searchParams.get('payer') ?? ''}
              onRecoverTelegramName={setRecoveredTelegramName}
              onBack={() => setActiveService('')}
            />
          ) : activeService === 'agent-dashboard' || activeService === 'fund-agent-wallet' || activeService === 'create-your-agent' ? (
            <TelegramX402WalletPanel
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
            <p className="text-base font-semibold text-gray-900 dark:text-white">Open PolyDesk in Telegram</p>
            <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              Fund Polymarket, track positions, get alerts, and ask LP Scout from chat.
            </p>
          </div>
        </div>
        <a
          href={TELEGRAM_BOT_URL}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
        >
          <MessageCircle className="h-4 w-4" />
          Open PolyDesk in Telegram
        </a>
        <p className="mt-2 text-center text-[11px] font-medium text-gray-400 dark:text-gray-500">
          Best for saved alerts, portfolio tracking, quick funding, and LP Scout memory.
        </p>
      </div>
    </div>
  )
}

function TelegramHelperPanel({
  telegramName,
  ownerKey,
  telegramId,
  fallbackOwner,
  initialEventId,
  initialPayer,
  onRecoverTelegramName,
  onBack,
}: {
  telegramName: string
  ownerKey: string
  telegramId: string
  fallbackOwner: string
  initialEventId: string
  initialPayer: string
  onRecoverTelegramName: (name: string) => void
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
  const [agentStatus, setAgentStatus] = useState('Asking ZeroScout for guidance...')
  const [askError, setAskError] = useState('')
  const [profile, setProfile] = useState<HelperProfile | null>(null)
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [memoryDraft, setMemoryDraft] = useState('')
  const [paylinkDraft, setPaylinkDraft] = useState<HelperPaylinkDraft | null>(null)
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
    if (fallbackOwner) profileParams.set('fallbackOwner', fallbackOwner)
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
        const recoveredName = data.profile?.telegramHandle || data.profile?.displayName || ''
        if (recoveredName) onRecoverTelegramName(recoveredName)
        if (data.profile?.memorySummary) setMemoryDraft(data.profile.memorySummary)
      })
      .catch(err => {
        if (!cancelled) setProfileError(err instanceof Error ? err.message : 'Could not load helper profile.')
      })
      .finally(() => {
        if (!cancelled) setProfileBusy(false)
      })
    return () => { cancelled = true }
  }, [payer, ownerKey, fallbackOwner]) // eslint-disable-line react-hooks/exhaustive-deps

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
          fallbackOwner: fallbackOwner || undefined,
          displayName: extra.displayName ?? (helperName || helperNameDraft || cleanPayer),
          accessPayer: extra.accessPayer ?? (payer || cleanPayer),
          telegramHandle: cleanTelegramName,
          accessEventId: extra.accessEventId ?? eventId,
          memorySummary: extra.memorySummary ?? memoryDraft,
          question: (extra as { question?: string }).question,
          answer: (extra as { answer?: string }).answer,
          preferredPaymentWallet: extra.preferredPaymentWallet ?? profile?.preferredPaymentWallet,
          preferredPaymentNetwork: extra.preferredPaymentNetwork ?? profile?.preferredPaymentNetwork,
          preferredPaymentEvmWallet: extra.preferredPaymentEvmWallet ?? profile?.preferredPaymentEvmWallet,
          preferredPaymentSolanaWallet: extra.preferredPaymentSolanaWallet ?? profile?.preferredPaymentSolanaWallet,
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
          fallbackOwner: fallbackOwner || undefined,
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
      const data = await res.json().catch(() => null) as HelperVerifyResult | null
      if (!data) throw new Error('Verification service returned an unreadable response.')
      if (!res.ok && !data.verified) throw new Error(data.error || 'Access is not active yet.')
      setVerified(data)
      if (data.verified) {
        setStarted(true)
        setMessages([])
        void saveProfile({ displayName: helperName || helperNameDraft || nextPayer, accessEventId: nextEventId, accessPayer: nextPayer })
      }
    } catch (err) {
      const message = err instanceof Error && err.message
        ? err.message
        : 'Verification service unreachable.'
      setVerified({ verified: false, error: message })
    } finally {
      setVerifying(false)
    }
  }

  function preferredWalletFor(network: RequestNetwork | '') {
    if (!profile) return ''
    if (network === 'solana') return profile.preferredPaymentSolanaWallet || (!profile.preferredPaymentWallet?.startsWith('0x') ? profile.preferredPaymentWallet ?? '' : '')
    return profile.preferredPaymentEvmWallet || (profile.preferredPaymentWallet?.startsWith('0x') ? profile.preferredPaymentWallet : '')
  }

  function buildDraftFromText(text: string, existing?: HelperPaylinkDraft | null): HelperPaylinkDraft {
    const mode = existing?.mode ?? (isGroupRequestIntent(text) ? 'group' : 'person')
    const walletFromText = extractWallet(text)
    const networkFromText = extractNetwork(text)
    const nextNetwork = networkFromText || existing?.network || (walletFromText && !walletFromText.startsWith('0x') ? 'solana' : '')
    const targetFromText = extractTarget(text, mode)
    const purposeFromText = extractPurpose(text)
    const amountFromText = extractAmount(text)
    return {
      mode,
      target: targetFromText || existing?.target || '',
      amount: amountFromText || existing?.amount || '',
      network: nextNetwork,
      label: purposeFromText || existing?.label || '',
      wallet: walletFromText || existing?.wallet || '',
      evmWallet: walletFromText?.startsWith('0x') ? walletFromText : existing?.evmWallet || '',
      solanaWallet: walletFromText && !walletFromText.startsWith('0x') ? walletFromText : existing?.solanaWallet || '',
      offeredSavedWallet: existing?.offeredSavedWallet,
    }
  }

  async function createPaylinkFromDraft(draft: HelperPaylinkDraft) {
    const network = draft.network === 'all' ? 'base' : draft.network || 'base'
    const walletForNetwork = draft.wallet || preferredWalletFor(network)
    const request: SavedRequest = {
      mode: draft.mode,
      network,
      wallet: walletForNetwork,
      evmWallet: network === 'solana' ? '' : walletForNetwork,
      solanaWallet: network === 'solana' ? walletForNetwork : '',
      label: draft.label,
      target: draft.target,
      amount: draft.amount,
    }
    const res = await fetch('/api/telegram-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    const data = await res.json() as { ok?: boolean; request?: SavedRequest; error?: string }
    if (!res.ok || !data.ok || !data.request) throw new Error(data.error || 'Could not create PayLink.')
    const saved = data.request
    const savedWallet = saved.wallet || walletForNetwork
    const memoryLine = `Preferred payment receive wallet is ${shortAddress(savedWallet)} on ${requestNetworkLabels[network]}. For future PayLink requests, ask whether to continue with this wallet or replace it.`
    const nextMemory = [memoryDraft.trim() || profile?.memorySummary || '', memoryLine]
      .filter(Boolean)
      .join('\n')
      .slice(-1200)
    setMemoryDraft(nextMemory)
    void saveProfile({
      memorySummary: nextMemory,
      preferredPaymentWallet: savedWallet,
      preferredPaymentNetwork: network,
      preferredPaymentEvmWallet: network === 'solana' ? profile?.preferredPaymentEvmWallet : savedWallet,
      preferredPaymentSolanaWallet: network === 'solana' ? savedWallet : profile?.preferredPaymentSolanaWallet,
    })
    return saved
  }

  async function handlePaylinkConversation(nextQuestion: string) {
    if (!paylinkDraft && !isPaymentRequestIntent(nextQuestion)) return false
    let draft = buildDraftFromText(nextQuestion, paylinkDraft)
    const savedWallet = preferredWalletFor(draft.network)

    if (!draft.wallet && savedWallet && !draft.offeredSavedWallet) {
      draft = { ...draft, offeredSavedWallet: true }
      setPaylinkDraft(draft)
      setMessages(prev => [...prev, {
        question: nextQuestion,
        answer: `I can prepare that PayLink. Do you want to continue with your saved ${draft.network ? requestNetworkLabels[draft.network] : 'payment'} wallet ${compactSavedWallet(savedWallet)}, or use a new receive wallet?`,
      }])
      return true
    }

    if (!draft.wallet && savedWallet && draft.offeredSavedWallet && wantsSavedWallet(nextQuestion)) {
      draft = {
        ...draft,
        wallet: savedWallet,
        evmWallet: savedWallet.startsWith('0x') ? savedWallet : draft.evmWallet,
        solanaWallet: savedWallet.startsWith('0x') ? draft.solanaWallet : savedWallet,
      }
    }

    if (!draft.wallet && savedWallet && draft.offeredSavedWallet && wantsNewWallet(nextQuestion)) {
      setPaylinkDraft(draft)
      setMessages(prev => [...prev, {
        question: nextQuestion,
        answer: 'Send the new receive wallet. I will replace the saved wallet after this PayLink is ready.',
      }])
      return true
    }

    if (draft.network === 'all') {
      draft = { ...draft, network: '' }
    }

    const missing = describeMissingDraftFields(draft, draft.wallet ? '' : savedWallet)
    if (missing.length > 0) {
      setPaylinkDraft(draft)
      setMessages(prev => [...prev, {
        question: nextQuestion,
        answer: `I can create this. I still need: ${missing.join(', ')}. Reply in one line, for example: "25 Base for dinner to 0x..."`,
      }])
      return true
    }

    setAgentStatus('Preparing PayLink...')
    const saved = await createPaylinkFromDraft(draft)
    setPaylinkDraft(null)
    const network = saved.network ?? inferRequestNetwork(saved)
    setMessages(prev => [...prev, {
      question: nextQuestion,
      answer: `${saved.mode === 'group' ? 'Collection PayLink ready.' : 'PayLink ready.'}\n\n${saved.target} can pay ${saved.amount || 'a flexible amount'} USDC on ${requestNetworkLabels[network]} for ${saved.label}.\n\nAlways ask the payer to share the receipt with you after payment is confirmed.`,
      paylink: saved,
    }])
    return true
  }

  async function askHelper() {
    if (!question.trim() || asking || !verified?.verified) return
    const nextQuestion = question.trim()
    setQuestion('')
    setAskError('')
    setAsking(true)
    try {
      setAgentStatus(paylinkDraft || isPaymentRequestIntent(nextQuestion) ? 'Checking payment request details...' : 'Asking ZeroScout for guidance...')
      if (await handlePaylinkConversation(nextQuestion)) return
      setAgentStatus('Writing a direct answer...')
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
        zeroscoutSponsorship?: ZeroScoutSponsorship
        error?: string
      }
      if (!data.answer || !data.proof) throw new Error(data.error ?? 'No helper response returned.')
      setMessages(prev => [...prev, { question: nextQuestion, answer: data.answer!, proof: data.proof!, zeroscoutSponsorship: data.zeroscoutSponsorship }])
      void saveProfile({ question: nextQuestion, answer: data.answer } as Partial<HelperProfile>)
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
    returnUrl.searchParams.set('section', 'helper')
    returnUrl.searchParams.set('service', 'hashpaylink-helper')
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
        Ask Hash
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
            The helper opens from Telegram, verifies paid access with 0G receipts, and saves useful profile context quietly. 0G memory checkpointing is optional proof, not an approval step.
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
                    {profileBusy ? 'Saving...' : profileError || 'Profile context saves quietly to personalize future replies.'}
                  </p>
                  <button
                    type="button"
                    onClick={checkpointMemory}
                    disabled={checkpointBusy || !memoryDraft.trim()}
                    className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-all hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-950"
                  >
                    {checkpointBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                    Archive
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
                      {message.paylink && <HelperPaylinkCard request={message.paylink} />}
                      {message.proof && (
                        <a
                          href={message.proof.ogExplorer}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-200"
                        >
                          <span className="rounded border border-purple-100 px-1 text-[8px] font-black text-purple-500 dark:border-purple-300/20 dark:text-purple-200">0G</span>
                          response proof
                        </a>
                      )}
                      {message.zeroscoutSponsorship && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-gray-400">
                          <span className="rounded border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-black uppercase text-emerald-600 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-200">
                            ZeroScout-sponsored
                          </span>
                          <span title={message.zeroscoutSponsorship.requestHash}>
                            request {message.zeroscoutSponsorship.requestHash.slice(0, 10)}...
                          </span>
                          {message.zeroscoutSponsorship.zeroscout?.proof?.storageTxHash && (
                            <a
                              href={`https://chainscan.0g.ai/tx/${message.zeroscoutSponsorship.zeroscout.proof.storageTxHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 dark:text-emerald-200"
                            >
                              proof <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {asking && (
                  <div className="inline-flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-400 dark:bg-white/[0.05]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {agentStatus}
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

function HelperPaylinkCard({ request }: { request: SavedRequest }) {
  const [copied, setCopied] = useState(false)
  const network = request.network ?? inferRequestNetwork(request)
  const url = request.payUrl || buildRequestPayLink(request)
  const amountLine = request.amount ? `${request.amount} USDC` : 'Flexible amount'
  const shareText = [
    request.mode === 'group' ? 'Hash PayLink collection' : 'Hash PayLink payment request',
    `${request.label} - ${amountLine}`,
    request.mode === 'group' ? `Collection: ${request.target}` : `Payer: ${request.target}`,
    'Please share the receipt after payment is confirmed.',
  ].join('\n')

  async function nativeShare() {
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> }
    if (nav.share) {
      await nav.share({ title: 'Hash PayLink', text: shareText, url })
      return
    }
    await navigator.clipboard.writeText(`${shareText}\n${url}`)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  async function copyLink() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="mt-2 w-full max-w-[86%] rounded-2xl rounded-tl-md border border-emerald-100 bg-emerald-50/70 p-3 dark:border-emerald-300/20 dark:bg-emerald-300/10">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-200" />
        <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-100">
          {request.mode === 'group' ? 'Collection PayLink Ready' : 'PayLink Ready'}
        </p>
      </div>
      <div className="mt-2 rounded-xl border border-white/70 bg-white/80 p-2.5 text-xs dark:border-white/10 dark:bg-white/[0.06]">
        <p className="font-semibold text-gray-900 dark:text-white">{request.label}</p>
        <p className="mt-0.5 text-gray-500 dark:text-gray-300">{amountLine} on {requestNetworkLabels[network]}</p>
        <p className="mt-0.5 text-gray-500 dark:text-gray-300">
          {request.mode === 'group' ? 'Collection' : 'Payer'}: {request.target}
        </p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => void nativeShare()}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gray-950 px-2.5 py-2 text-xs font-semibold text-white dark:bg-white dark:text-gray-950"
        >
          <Send className="h-3.5 w-3.5" />
          Share
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-2.5 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-300/20 dark:bg-white/[0.06] dark:text-emerald-100"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {request.mode === 'group' ? 'Track' : 'Open'}
        </a>
      </div>
      <div className="mt-1.5 grid grid-cols-4 gap-1">
        <a className="rounded-md bg-white px-2 py-1.5 text-center text-[10px] font-bold text-gray-600 dark:bg-white/[0.08] dark:text-gray-200" href={buildTelegramShareUrl({ ...request, payUrl: url })} target="_blank" rel="noopener noreferrer">TG</a>
        <a className="rounded-md bg-white px-2 py-1.5 text-center text-[10px] font-bold text-gray-600 dark:bg-white/[0.08] dark:text-gray-200" href={`https://wa.me/?text=${encodeURIComponent(`${shareText}\n${url}`)}`} target="_blank" rel="noopener noreferrer">WA</a>
        <a className="rounded-md bg-white px-2 py-1.5 text-center text-[10px] font-bold text-gray-600 dark:bg-white/[0.08] dark:text-gray-200" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${shareText}\n${url}`)}`} target="_blank" rel="noopener noreferrer">X</a>
        <button type="button" onClick={() => void copyLink()} className="rounded-md bg-white px-2 py-1.5 text-center text-[10px] font-bold text-gray-600 dark:bg-white/[0.08] dark:text-gray-200">
          {copied ? 'OK' : 'Copy'}
        </button>
      </div>
      <p className="mt-2 text-[11px] font-medium text-emerald-700/80 dark:text-emerald-100/80">
        Ask the payer to share the receipt with you after payment is confirmed.
      </p>
    </div>
  )
}

function TelegramX402WalletPanel({
  onBack,
}: {
  onBack: () => void
}) {
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
            <p className="text-sm font-semibold text-gray-900 dark:text-white">x402 Wallet Manager</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Telegram uses the same wallet flow as Create Link: sign in with email, fund Circle wallet balance, activate x402 service balance, then use paid services.
            </p>
          </div>
        </div>
      </div>

      <AgentDemo embedded forceProfile />
    </div>
  )
}

type LpScoutPath = '' | 'access' | 'daily'
type LpScoutStep = 'service' | 'agent'

type LpScoutOption = {
  id: LpScoutMode
  title: string
  body: string
  amount: string
  icon: typeof LineChart
  inputLabel?: string
  inputPlaceholder?: string
}

const lpScoutOptions: LpScoutOption[] = [
  {
    id: 'best',
    title: 'Best reward markets',
    body: 'Use x402 to buy the LP Scout service and rank live reward markets by spread, liquidity, depth, rewards, and risk.',
    amount: '0.01',
    icon: LineChart,
  },
  {
    id: 'theme',
    title: 'Scout a theme',
    body: 'Focus the x402 scout on one sector, event, token, election, or sports category using live Gamma and CLOB data.',
    amount: '0.01',
    icon: Sparkles,
    inputLabel: 'Theme',
    inputPlaceholder: 'crypto, AI, election, football...',
  },
  {
    id: 'market',
    title: 'Inspect one market',
    body: 'Inspect one Polymarket URL or market slug for current book, maker quote, depth, and LP risk context.',
    amount: '0.01',
    icon: ExternalLink,
    inputLabel: 'Market URL or slug',
    inputPlaceholder: 'https://polymarket.com/event/...',
  },
]

function LpScoutPanel({
  prefill,
  onPrefillConsumed,
  onOpenWalletManager,
  onBack,
}: {
  prefill: LpScoutPrefill | null
  onPrefillConsumed: () => void
  onOpenWalletManager: () => void
  onBack: () => void
}) {
  const [path, setPath] = useState<LpScoutPath>('')
  const [step, setStep] = useState<LpScoutStep>('service')
  const [mode, setMode] = useState<LpScoutMode>('best')
  const [query, setQuery] = useState('')
  const [budget, setBudget] = useState('')
  const [maxSpend, setMaxSpend] = useState(lpScoutOptions[0].amount)
  const [prefillNotice, setPrefillNotice] = useState('')
  const selectedOption = lpScoutOptions.find(option => option.id === mode) ?? lpScoutOptions[0]
  const needsQuery = Boolean(selectedOption.inputLabel)
  const contextReady = !needsQuery || query.trim().length > 2
  const amountReady = Number(maxSpend) > 0
  const canChooseAgent = contextReady && amountReady

  useEffect(() => {
    if (!prefill) return
    const option = lpScoutOptions.find(item => item.id === prefill.mode) ?? lpScoutOptions[0]
    setPath('access')
    setStep('service')
    setMode(option.id)
    setQuery(prefill.query)
    setMaxSpend(option.amount)
    setPrefillNotice(prefill.query)
    if (prefill.budget) setBudget(prefill.budget)
    onPrefillConsumed()
  }, [prefill])

  function selectOption(option: LpScoutOption) {
    setMode(option.id)
    setMaxSpend(option.amount)
    setQuery('')
    setPrefillNotice('')
    setStep('service')
  }

  function startAccessFlow() {
    setPath('access')
    setStep('service')
  }

  function startDailyFlow() {
    setPath('daily')
  }

  function backFromPath() {
    if (path === 'daily') {
      setPath('')
      return
    }
    if (step === 'agent') {
      setStep('service')
      return
    }
    setPath('')
  }

  function buildWalletScoutUrl() {
    const params = new URLSearchParams()
    params.set('profile', 'agent')
    params.set('walletManager', 'service')
    params.set('src', 'lp-scout')
    params.set('run', 'polymarket-scout')
    params.set('scoutMode', selectedOption.id)
    params.set('maxAmount', maxSpend.trim())
    params.set('serviceUrl', '/api/x402/polymarket-scout')
    params.set('n', 'base')
    if (query.trim()) params.set('context', query.trim())
    if (budget.trim()) params.set('budget', budget.trim())
    return `/agent?${params.toString()}`
  }

  if (path === 'daily') {
    return <AgenticLpResearchPanel onBack={backFromPath} />
  }

  if (!path) {
    return (
      <div className="mt-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
                <img src={POLYMARKET_LOGO} alt="" className="h-4 w-4 invert dark:invert-0" />
              </span>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">PolyDesk LP Scout</p>
            </div>
            <h2 className="mt-2 text-lg font-semibold tracking-tight text-gray-900 dark:text-white">Choose how LP Scout should work</h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              Use the x402 wallet manager for one-time Polymarket scout access, or stream daily LP intelligence by email.
            </p>
          </div>
        </div>

        <div className="grid gap-2">
          <RequestModeButton
            icon={Bot}
            title="Tip for LP Scout access"
            body="Pick a Polymarket scout category, then use your x402 Wallet Manager to pay Hash PayLink through Circle Gateway."
            onClick={startAccessFlow}
          />
          <RequestModeButton
            icon={Radio}
            title="Stream daily LP intelligence"
            body="Stream USDC to Hash PayLink for daily Polymarket LP research delivered to your email."
            onClick={startDailyFlow}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={backFromPath}
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
              <img src={POLYMARKET_LOGO} alt="" className="h-4 w-4 invert dark:invert-0" />
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">LP Scout x402</p>
          </div>
          <h2 className="mt-2 text-lg font-semibold tracking-tight text-gray-900 dark:text-white">Run LP Scout with x402</h2>
          <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            Choose the Polymarket research category first. Next, sign in to the x402 Wallet Manager. If x402 balance is low, fund Circle wallet balance and activate x402 before checkout continues.
          </p>
        </div>
      </div>

      <div className="grid gap-2">
        {lpScoutOptions.map(option => {
          const Icon = option.icon
          const selected = option.id === mode
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => selectOption(option)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border bg-white px-3 py-3 text-left transition-all active:scale-[0.99] dark:bg-white/[0.05]',
                selected
                  ? 'border-gray-950 ring-2 ring-gray-950/10 dark:border-white dark:ring-white/15'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/[0.08]',
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-700 shadow-sm dark:bg-white/[0.08] dark:text-gray-200">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center justify-between gap-3">
                  <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">{option.title}</span>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">
                    max {option.amount} USDC
                  </span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">{option.body}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
        {prefillNotice && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 dark:border-emerald-400/20 dark:bg-emerald-400/10">
            <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-200">News context loaded</p>
            <p className="mt-0.5 truncate text-xs font-medium text-emerald-800/80 dark:text-emerald-100/80">{prefillNotice}</p>
          </div>
        )}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Selected service</p>
          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{selectedOption.title}</p>
        </div>
        {selectedOption.inputLabel && (
          <InputBlock
            label={selectedOption.inputLabel}
            value={query}
            onChange={value => {
              setQuery(value)
              if (prefillNotice) setPrefillNotice('')
            }}
            placeholder={selectedOption.inputPlaceholder ?? 'Add context'}
          />
        )}
        <InputBlock
          label="Max x402 spend"
          value={maxSpend}
          onChange={setMaxSpend}
          placeholder="1"
        />
        <InputBlock
          label="Optional budget"
          value={budget}
          onChange={setBudget}
          placeholder="Example: 100 USDC"
        />
        <button
          type="button"
          onClick={() => setStep('agent')}
          disabled={!canChooseAgent}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
        >
          <Wallet className="h-4 w-4" />
          Continue to x402 wallet
        </button>
      </div>

      {step === 'agent' && (
        <div className="space-y-3 rounded-xl border border-gray-100 bg-white p-3 dark:border-white/10 dark:bg-white/[0.05]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">x402 wallet</p>
            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">Use email session and Circle wallet</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Your email session opens the wallet manager, your 0x Circle wallet is confirmed, and LP Scout only runs after x402 payment succeeds.
            </p>
          </div>
          <a
            href={buildWalletScoutUrl()}
            className="flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3 text-left transition-all hover:border-gray-200 hover:bg-white active:scale-[0.99] dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-gray-800 shadow-sm dark:bg-white/[0.08] dark:text-gray-100">
              <Wallet className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">Open x402 Wallet Manager</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                Pay max {maxSpend || selectedOption.amount} USDC for {selectedOption.title}. Low balance prompts wallet funding and x402 activation.
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
          </a>

          <button
            type="button"
            onClick={onOpenWalletManager}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08]"
          >
            Manage wallet first
          </button>
        </div>
      )}
    </div>
  )
}

type PolyWorldCupArticle = {
  title: string
  description: string
  source: string
  image: string
  url: string
  publishedAt: string
  tag: string
}

type PolyWorldCupFeed = {
  ok?: boolean
  providerConfigured?: boolean
  source?: string
  updatedAt?: string
  articles?: PolyWorldCupArticle[]
}

const fallbackWorldCupArticles: PolyWorldCupArticle[] = [
  {
    title: 'World Cup market context is ready',
    description: 'Connect a provider feed to follow World Cup headlines, then use LP Scout before placing maker orders.',
    source: 'Hash PayLink desk',
    image: POLYMARKET_LOGO,
    url: '',
    publishedAt: new Date().toISOString(),
    tag: 'Markets',
  },
]

function relativeNewsTime(value?: string) {
  if (!value) return ''
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return ''
  const diff = Math.max(0, Date.now() - time)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function PolyWorldCupNewsPanel({
  onBack,
  onOpenScores,
  onOpenLpScout,
}: {
  onBack: () => void
  onOpenScores: () => void
  onOpenLpScout: (prefill: LpScoutPrefill) => void
}) {
  const [active, setActive] = useState(0)
  const [feed, setFeed] = useState<PolyWorldCupFeed | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({})

  const articles = feed?.articles?.length ? feed.articles : fallbackWorldCupArticles
  const lead = articles[active % articles.length] ?? articles[0]
  const hasProviderFeed = Boolean(feed?.providerConfigured && feed?.source && feed.source !== 'fallback' && !error)
  const statusText = loading
    ? 'Refreshing feed'
    : error
    ? 'Provider feed unavailable'
    : hasProviderFeed
    ? `Updated ${relativeNewsTime(feed?.updatedAt || '')}`
    : 'Hash PayLink desk feed'

  useEffect(() => {
    let cancelled = false
    async function loadNews() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch('/api/poly-worldcup-news')
        const text = await response.text()
        const data = JSON.parse(text) as PolyWorldCupFeed
        if (!response.ok || !data.ok) throw new Error('News feed is not available.')
        if (!cancelled) setFeed(data)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'News feed is not available.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadNews()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setActive(0)
  }, [feed?.updatedAt])

  useEffect(() => {
    if (articles.length <= 1) return undefined
    const timer = window.setInterval(() => {
      setActive(current => (current + 1) % articles.length)
    }, 6500)
    return () => window.clearInterval(timer)
  }, [articles.length])

  function askLpScout() {
    const headline = lead.title.replace(/\s+/g, ' ').trim()
    const source = lead.source ? ` (${lead.source})` : ''
    const query = `World Cup: ${headline}${source}`.slice(0, 170)
    onOpenLpScout({ mode: 'theme', query })
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-col items-start justify-between gap-2.5 sm:flex-row">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
              <Newspaper className="h-4 w-4 text-gray-800 dark:text-gray-100" />
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Polymarket News</p>
          </div>
          <h2 className="mt-2 text-base font-semibold tracking-tight text-gray-900 dark:text-white">World Cup market pulse</h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            Track World Cup headlines that can affect Polymarket prices, liquidity, and LP risk before asking the agent for an operator signal.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:mt-7">
          <span className={cn(
            'rounded-full px-2 py-1 text-[10px] font-bold leading-none',
            hasProviderFeed
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200'
              : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300',
          )}>
            {statusText}
          </span>
          <button
            type="button"
            onClick={onOpenScores}
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold leading-none text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200"
          >
            <Radio className="h-3 w-3" />
            Scores
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.05]">
        <div className="relative min-h-[176px]">
          <img
            src={brokenImages[lead.title] ? POLYMARKET_LOGO : lead.image || POLYMARKET_LOGO}
            alt=""
            onError={() => setBrokenImages(current => ({ ...current, [lead.title]: true }))}
            className={cn(
              'absolute inset-0 h-full w-full object-cover',
              brokenImages[lead.title] || !lead.image ? 'bg-gray-950 object-contain p-16 opacity-20' : '',
            )}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/10" />
          <div className="relative flex min-h-[176px] flex-col justify-end p-3 sm:p-4">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-gray-950">{lead.tag || 'World Cup'}</span>
              <span className="max-w-[180px] truncate rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white ring-1 ring-white/20">{lead.source}</span>
              {relativeNewsTime(lead.publishedAt) && (
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white ring-1 ring-white/20">{relativeNewsTime(lead.publishedAt)}</span>
              )}
            </div>
            <h3 className="max-w-2xl text-[15px] font-semibold leading-snug text-white sm:text-lg">{lead.title}</h3>
            <p
              className="mt-1 max-w-2xl overflow-hidden text-xs leading-relaxed text-white/75"
              style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
            >
              {lead.description}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {lead.url ? (
                <a
                  href={lead.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1 rounded-lg bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold leading-none text-gray-950 shadow-sm ring-1 ring-white/30 transition-all hover:bg-white active:scale-[0.98]"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open source
                </a>
              ) : (
                <span className="inline-flex items-center justify-center rounded-lg bg-white/15 px-2.5 py-1.5 text-[11px] font-semibold text-white ring-1 ring-white/20">
                  Source pending
                </span>
              )}
              <button
                type="button"
                onClick={askLpScout}
                className="inline-flex items-center justify-center gap-1 rounded-lg bg-white/15 px-2.5 py-1.5 text-[11px] font-semibold leading-none text-white ring-1 ring-white/25 transition-all hover:bg-white/25 active:scale-[0.98]"
              >
                <LineChart className="h-3 w-3" />
                Ask LP Scout
              </button>
            </div>
          </div>
        </div>

        <div className="max-h-[260px] space-y-1.5 overflow-y-auto border-t border-gray-100 p-2 [scrollbar-color:rgba(148,163,184,0.28)_transparent] [scrollbar-width:thin] dark:border-white/10 dark:[scrollbar-color:rgba(255,255,255,0.18)_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300/40 dark:[&::-webkit-scrollbar-thumb]:bg-white/20">
          {articles.map((article, index) => {
            const selected = index === active % articles.length
            const imageBroken = brokenImages[article.title]
            return (
              <button
                key={`${article.title}-${index}`}
                type="button"
                onClick={() => setActive(index)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-xl border p-2 text-left transition-all',
                  selected
                    ? 'border-gray-950 bg-gray-50 dark:border-white dark:bg-white/10'
                    : 'border-transparent hover:border-gray-200 hover:bg-gray-50 dark:hover:border-white/10 dark:hover:bg-white/[0.06]',
                )}
              >
                <span className="flex h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-white/10">
                  <img
                    src={imageBroken ? POLYMARKET_LOGO : article.image || POLYMARKET_LOGO}
                    alt=""
                    onError={() => setBrokenImages(current => ({ ...current, [article.title]: true }))}
                    className={cn('h-full w-full object-cover', imageBroken || !article.image ? 'object-contain p-2 opacity-60' : '')}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    <span className="shrink-0">{article.tag || 'World Cup'}</span>
                    <span className="truncate">{article.source}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs font-semibold text-gray-900 dark:text-white">{article.title}</span>
                  <span
                    className="mt-0.5 block overflow-hidden text-[11px] leading-snug text-gray-500 dark:text-gray-400"
                    style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}
                  >
                    {article.description}
                  </span>
                </span>
                <ArrowRight className={cn('h-3.5 w-3.5 shrink-0', selected ? 'text-gray-900 dark:text-white' : 'text-gray-300')} />
              </button>
            )
          })}
        </div>
      </div>

    </div>
  )
}

type PolyStreamMatch = {
  fixtureId?: string
  tag: string
  title: string
  time: string
  kickoffAt?: string
  venue: string
  status: string
  homeScore?: number | string
  awayScore?: number | string
  clock?: string
  homeCoach?: string
  awayCoach?: string
  probability?: string
  homeMarketPrice?: string
  awayMarketPrice?: string
  drawMarketPrice?: string
  polymarketTitle?: string
  polymarketLiquidity?: string
  polymarketVolume?: string
  marketStatus?: 'matched' | 'pending'
  goalScorers?: string[]
  weather?: string
  h2h?: string
  form?: string
  events?: string[]
  stats?: string[]
  marketContext: string
  sourceUrl: string
  polymarketUrl?: string
}

type PolyStreamFeed = {
  ok: boolean
  providerConfigured: boolean
  source: string
  providerStatus?: string
  updatedAt: string
  matches: PolyStreamMatch[]
}

type ScoreDetailItem =
  | { type: 'goals'; label: string; goals: string[] }
  | { type: 'events'; label: string; events: MatchEventDetail[] }
  | { type: 'text'; label: string; value: string }

type MatchEventDetail = {
  text: string
  kind: 'sub' | 'yellow' | 'red' | 'yellow-red' | 'event'
}

function hasMatchScore(match: PolyStreamMatch) {
  const home = String(match.homeScore ?? '').trim().toLowerCase()
  const away = String(match.awayScore ?? '').trim().toLowerCase()
  return Boolean(home && away && home !== 'undefined' && away !== 'undefined' && home !== 'null' && away !== 'null')
}

function splitFixtureTitle(title: string) {
  if (!title.includes(' vs ')) return [title, ''] as const
  const [home, away] = title.split(' vs ', 2)
  return [home.trim(), away.trim()] as const
}

const WORLD_CUP_TEAM_ISO: Record<string, string> = {
  algeria: 'dz',
  argentina: 'ar',
  australia: 'au',
  austria: 'at',
  belgium: 'be',
  bosnia: 'ba',
  'bosnia & herz': 'ba',
  'bosnia and herzegovina': 'ba',
  brazil: 'br',
  canada: 'ca',
  'cape verde': 'cv',
  'cape verde islands': 'cv',
  'cabo verde': 'cv',
  colombia: 'co',
  'congo dr': 'cd',
  'dr congo': 'cd',
  croatia: 'hr',
  curacao: 'cw',
  'cote divoire': 'ci',
  ecuador: 'ec',
  egypt: 'eg',
  england: 'gb-eng',
  france: 'fr',
  germany: 'de',
  ghana: 'gh',
  haiti: 'ht',
  iran: 'ir',
  'ir iran': 'ir',
  iraq: 'iq',
  'ivory coast': 'ci',
  japan: 'jp',
  jordan: 'jo',
  mexico: 'mx',
  morocco: 'ma',
  netherlands: 'nl',
  'new zealand': 'nz',
  norway: 'no',
  panama: 'pa',
  paraguay: 'py',
  portugal: 'pt',
  qatar: 'qa',
  'saudi arabia': 'sa',
  scotland: 'gb-sct',
  senegal: 'sn',
  'south africa': 'za',
  'south korea': 'kr',
  spain: 'es',
  sweden: 'se',
  switzerland: 'ch',
  tunisia: 'tn',
  turkey: 'tr',
  turkiye: 'tr',
  'united states': 'us',
  usa: 'us',
  uruguay: 'uy',
  uzbekistan: 'uz',
}
function teamIso(name: string) {
  const clean = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return WORLD_CUP_TEAM_ISO[clean] || ''
}

function flagUrlForTeam(name: string, size = 640) {
  const iso = teamIso(name)
  return iso ? `https://flagcdn.com/w${size}/${iso}.png` : ''
}

function flagEmojiForTeam(name: string) {
  const iso = teamIso(name)
  if (!iso || iso.includes('-')) return 'WC'
  return iso
    .toUpperCase()
    .replace(/./g, char => String.fromCodePoint(127397 + char.charCodeAt(0)))
}

function scoreTagClass(tag: string) {
  if (tag === 'Live') return 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-400/20'
  if (tag === 'Today') return 'bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-400/10 dark:text-blue-200 dark:ring-blue-400/20'
  if (tag === 'Result') return 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-white/[0.08] dark:text-gray-300 dark:ring-white/10'
  return 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/20'
}

function TeamFlagMark({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const flag = flagUrlForTeam(name, size === 'sm' ? 80 : 160)
  const fallback = flagEmojiForTeam(name)
  return flag ? (
    <img
      src={flag}
      alt=""
      className={cn(
        'shrink-0 rounded-[3px] object-cover ring-1 ring-white/20',
        size === 'sm' ? 'h-3.5 w-5' : 'h-6 w-9',
      )}
      loading="lazy"
    />
  ) : (
    <span className={cn('shrink-0 font-black', size === 'sm' ? 'text-[10px]' : 'text-xs')}>{fallback}</span>
  )
}

function matchDisplayState(match: PolyStreamMatch) {
  const status = `${match.status} ${match.tag}`.toLowerCase()
  const hasScore = hasMatchScore(match)
  const matchTime = Date.parse(match.kickoffAt || match.time)
  const isPast = Number.isFinite(matchTime) && matchTime < Date.now() - 90 * 60 * 1000
  const clock = readableMatchClock(match.clock)
  if (/(live|inplay|in play|1h|2h|1st|2nd|first half|second half|et)/.test(status)) {
    return {
      tag: 'LIVE',
      phase: match.status && !/^live$/i.test(match.status) ? match.status : '',
      center: hasScore ? `${match.homeScore}-${match.awayScore}` : 'Live',
      sub: clock || 'Live',
    }
  }
  if (/(half|ht)/.test(status)) {
    return { tag: 'HT', phase: 'Half time', center: hasScore ? `${match.homeScore}-${match.awayScore}` : 'HT', sub: clock || 'Half time' }
  }
  if ((hasScore && /(ft|full time|full-time|finished|result|complete|ended|after extra time|pen)/.test(status)) || (hasScore && isPast)) {
    return { tag: 'FT', phase: 'Full time', center: `${match.homeScore}-${match.awayScore}`, sub: clock || 'Full time' }
  }
  return { tag: 'NS', phase: '', center: 'vs', sub: matchCountdown(match) }
}

function readableMatchClock(value?: string) {
  const text = (value || '').trim()
  const stoppage = text.match(/^90\+(\d+)'$/)
  if (stoppage) return `90+${stoppage[1]} mins`
  const minute = text.match(/^(\d+)'$/)
  if (minute) {
    const count = Number(minute[1])
    if (Number.isFinite(count)) {
      if (count > 90) return `90+${Math.min(count - 90, 15)} mins`
      return `${count} ${count === 1 ? 'min' : 'mins'}`
    }
  }
  return text
}

function rowStateLabel(match: PolyStreamMatch) {
  const state = matchDisplayState(match)
  if (state.tag === 'FT' && hasMatchScore(match)) return `FT ${match.homeScore}-${match.awayScore}`
  if ((state.tag === 'LIVE' || state.tag === 'HT') && hasMatchScore(match)) return `${state.tag} ${match.homeScore}-${match.awayScore}`
  return state.tag
}

function matchKey(match: PolyStreamMatch) {
  return match.fixtureId || `${match.title}-${match.time}-${match.status}`
}

function compactMatchTime(match: PolyStreamMatch) {
  return match.time
}

function detailItems(match: PolyStreamMatch) {
  const items: ScoreDetailItem[] = []
  const [home, away] = splitFixtureTitle(match.title)
  if (match.venue && match.venue !== 'World Cup venue') items.push({ type: 'text', label: 'Stadium', value: match.venue })
  const goals = (match.goalScorers || []).map(goal => formatGoalScorer(goal, home, away)).filter(Boolean)
  if (goals.length) items.push({ type: 'goals', label: 'Goals', goals })
  if (match.homeCoach && match.awayCoach) items.push({ type: 'text', label: 'Coaches', value: [match.homeCoach, match.awayCoach].join(' vs ') })
  if (match.h2h) items.push({ type: 'text', label: 'H2H', value: match.h2h })
  if (match.probability) items.push({ type: 'text', label: 'Market price', value: match.probability })
  if (match.polymarketLiquidity) items.push({ type: 'text', label: 'Market liquidity', value: match.polymarketLiquidity })
  if (match.polymarketVolume) items.push({ type: 'text', label: 'Market volume', value: match.polymarketVolume })
  if (match.form) items.push({ type: 'text', label: 'Form', value: match.form })
  if (match.weather) items.push({ type: 'text', label: 'Weather', value: match.weather })
  const events = (match.events || []).filter(Boolean)
  const nonGoalEvents = goals.length ? events.filter(event => !/\b(goal|penalty)\b/i.test(event)) : events
  const keyEvents = nonGoalEvents.map(event => formatMatchEvent(event, home, away)).filter((event): event is MatchEventDetail => Boolean(event))
  if (keyEvents.length) items.push({ type: 'events', label: 'Events', events: keyEvents })
  const stats = (match.stats || []).filter(Boolean)
  if (stats.length) items.push({ type: 'text', label: 'Stats', value: stats.slice(0, 2).join(' | ') })
  return items
}

function formatGoalScorer(value: string, home: string, away: string) {
  let text = stripMatchTeams(value, home, away)
  text = text.replace(/\s+/g, ' ').trim()
  return text
}

function stripMatchTeams(value: string, home: string, away: string) {
  let text = value.trim()
  for (const team of [home, away].filter(Boolean)) {
    const escaped = team.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    text = text.replace(new RegExp(`\\s+${escaped}$`, 'i'), '')
  }
  return text
}

function formatMatchEvent(value: string, home: string, away: string): MatchEventDetail | null {
  let text = stripMatchTeams(value, home, away)
  const lower = text.toLowerCase()
  if (/\b(goal|penalty)\b/.test(lower)) return null

  let kind: MatchEventDetail['kind'] = 'event'
  if (/yellow\s+red/.test(lower)) kind = 'yellow-red'
  else if (/\bred\b/.test(lower)) kind = 'red'
  else if (/\byellow\b/.test(lower)) kind = 'yellow'
  else if (/\bsubstitution\b|\bsub\b/.test(lower)) kind = 'sub'

  text = text
    .replace(/\bSubstitution\b/i, 'Sub')
    .replace(/\bYellow Red Card\b/i, '2nd yellow')
    .replace(/\bYellow Card\b/i, '')
    .replace(/\bRed Card\b/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!text) return null
  return { text, kind }
}

function detailPages<T>(items: T[]) {
  const pages: T[][] = []
  for (let index = 0; index < items.length; index += 2) pages.push(items.slice(index, index + 2))
  return pages
}

function matchCountdown(match: PolyStreamMatch) {
  const source = match.kickoffAt || match.time
  const ts = Date.parse(source)
  if (!Number.isFinite(ts)) return 'Countdown'
  const diffMs = ts - Date.now()
  if (diffMs <= 0) return 'Starting'
  const totalSeconds = Math.ceil(diffMs / 1000)
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (days > 0) return `${days} ${days === 1 ? 'day' : 'days'} ${hours} ${hours === 1 ? 'hr' : 'hrs'}`
  if (hours > 0) return `${hours} ${hours === 1 ? 'hr' : 'hrs'} ${minutes} ${minutes === 1 ? 'min' : 'mins'}`
  if (minutes > 0) return `${minutes} ${minutes === 1 ? 'min' : 'mins'}`
  return `${seconds} ${seconds === 1 ? 'sec' : 'secs'}`
}

function MarketPricePill({ value }: { value?: string }) {
  if (!value) return null
  return (
    <span className="mt-1 inline-flex items-center justify-center rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] font-black tabular-nums text-white/85 shadow-sm backdrop-blur-sm">
      {value}
    </span>
  )
}

function EventMark({ kind }: { kind: MatchEventDetail['kind'] }) {
  if (kind === 'yellow') {
    return <span className="h-2.5 w-2 rounded-[2px] bg-yellow-300 shadow-sm ring-1 ring-black/20" aria-label="yellow card" />
  }
  if (kind === 'red') {
    return <span className="h-2.5 w-2 rounded-[2px] bg-red-500 shadow-sm ring-1 ring-black/20" aria-label="red card" />
  }
  if (kind === 'yellow-red') {
    return (
      <span className="relative inline-flex h-2.5 w-3" aria-label="second yellow red card">
        <span className="absolute left-0 top-0 h-2.5 w-2 rounded-[2px] bg-yellow-300 shadow-sm ring-1 ring-black/20" />
        <span className="absolute right-0 top-0 h-2.5 w-2 rounded-[2px] bg-red-500 shadow-sm ring-1 ring-black/20" />
      </span>
    )
  }
  return null
}

function HashLiveScoreWidget({
  matches,
  loading,
  providerReady,
  error,
  onRetry,
}: {
  matches: PolyStreamMatch[]
  loading: boolean
  providerReady: boolean
  error: string
  onRetry: () => void
}) {
  const [selectedMatchKey, setSelectedMatchKey] = useState('')
  const [detailIndex, setDetailIndex] = useState(0)
  const [detailPageIndex, setDetailPageIndex] = useState(0)
  const [, setCountdownTick] = useState(0)
  const featured = matches.find(match => matchKey(match) === selectedMatchKey) || matches[0]
  const rest = featured ? matches.filter(match => matchKey(match) !== matchKey(featured)) : []
  const [home, away] = featured ? splitFixtureTitle(featured.title) : ['World Cup', 'Scores']
  const featuredState = featured ? matchDisplayState(featured) : null
  const homeFlag = flagUrlForTeam(home)
  const awayFlag = flagUrlForTeam(away)
  const featuredDetails = useMemo(() => featured ? detailItems(featured) : [], [featured])
  const featuredMarketMatched = featured?.marketStatus === 'matched' && Boolean(featured.polymarketUrl)
  const activeDetail = featuredDetails.length ? featuredDetails[detailIndex % featuredDetails.length] : null
  const activePagedItems = activeDetail?.type === 'goals'
    ? detailPages(activeDetail.goals)
    : activeDetail?.type === 'events'
      ? detailPages(activeDetail.events)
      : []
  const activeDetailPage = activePagedItems[detailPageIndex % Math.max(activePagedItems.length, 1)] || []

  useEffect(() => {
    if (!matches.length) return
    setSelectedMatchKey(current => current || matchKey(matches[0]))
  }, [matches])

  useEffect(() => {
    setDetailIndex(0)
    setDetailPageIndex(0)
  }, [selectedMatchKey])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!featuredDetails.length) return
      const current = featuredDetails[detailIndex % featuredDetails.length]
      const pages = current?.type === 'goals'
        ? detailPages(current.goals)
        : current?.type === 'events'
          ? detailPages(current.events)
          : []
      if (pages.length > 1 && detailPageIndex < pages.length - 1) {
          setDetailPageIndex(currentPage => currentPage + 1)
          return
      }
      setDetailPageIndex(0)
      setDetailIndex(currentIndex => (currentIndex + 1) % featuredDetails.length)
    }, activeDetail?.type === 'goals' || activeDetail?.type === 'events' ? 5_500 : 9_000)
    return () => window.clearInterval(timer)
  }, [activeDetail?.type, detailIndex, featuredDetails, detailPageIndex, selectedMatchKey])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCountdownTick(current => current + 1)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4 dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-600 dark:text-gray-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading live board
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-100 bg-rose-50/70 p-4 text-center dark:border-rose-400/20 dark:bg-rose-400/10">
        <p className="text-sm font-semibold text-rose-700 dark:text-rose-200">Live scores temporarily unavailable</p>
        <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-rose-600/80 dark:text-rose-100/70">
          Refresh in a moment. We do not show stale World Cup rows.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 transition-all hover:bg-rose-50 active:scale-[0.98] dark:border-rose-300/20 dark:bg-white/10 dark:text-rose-100"
        >
          <Loader2 className={cn('h-3 w-3', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>
    )
  }

  if (!providerReady || matches.length === 0) {
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4 text-center dark:border-white/10 dark:bg-white/[0.04]">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Live board is waiting for match data</p>
        <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          Refresh shortly. Hash PayLink only shows current provider data here.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200"
        >
          <Loader2 className={cn('h-3 w-3', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white dark:border-white/10 dark:bg-white/[0.04]">
      {featured && (
        <div className="relative min-h-[184px] overflow-hidden border-b border-gray-100 bg-gray-950 p-3 text-white dark:border-white/10">
          {homeFlag && (
            <div
              className="absolute inset-0 bg-cover bg-center opacity-100 blur-[1px] transition-opacity duration-1000 [animation:hpFlagSwapA_10s_ease-in-out_infinite]"
              style={{ backgroundImage: `linear-gradient(rgba(0,0,0,.58), rgba(0,0,0,.84)), url(${homeFlag})` }}
            />
          )}
          {awayFlag && (
            <div
              className="absolute inset-0 bg-cover bg-center opacity-0 blur-[1px] transition-opacity duration-1000 [animation:hpFlagSwapB_10s_ease-in-out_infinite]"
              style={{ backgroundImage: `linear-gradient(rgba(0,0,0,.58), rgba(0,0,0,.84)), url(${awayFlag})` }}
            />
          )}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,.12),transparent_38%),linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.62))]" />
          <div className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
            <span className="truncate text-[10px] font-semibold text-white/65">{compactMatchTime(featured)}</span>
            {featuredMarketMatched ? (
              <a
                href={featured.polymarketUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1 rounded-full border border-white/15 bg-black/35 px-2 py-1 text-[10px] font-black leading-none text-white shadow-sm backdrop-blur-sm transition-all hover:bg-black/50 active:scale-[0.98]"
              >
                <img src={POLYMARKET_LOGO} alt="" className="h-3 w-3 invert-0" />
                Trade
              </a>
            ) : (
              <span className="inline-flex items-center justify-center rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-black text-white/55 backdrop-blur-sm">
                Pending
              </span>
            )}
            <span className={cn(
              'justify-self-end rounded-full px-2 py-0.5 text-[10px] font-bold uppercase leading-none ring-1',
              featuredState?.tag === 'LIVE'
                ? 'bg-emerald-400/15 text-emerald-100 ring-emerald-300/30'
                : 'bg-white/12 text-white/85 ring-white/15',
            )}>
              {featuredState?.phase ? `${featuredState.tag} - ${featuredState.phase}` : featuredState?.tag}
            </span>
          </div>
          <div className="relative z-10 mt-3.5 grid min-h-[106px] grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] items-center gap-1.5 sm:grid-cols-[minmax(0,1fr)_84px_minmax(0,1fr)] sm:gap-2">
            <div className="min-w-0 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-black/30 shadow-xl ring-1 ring-white/15 backdrop-blur-sm sm:h-12 sm:w-12">
                <TeamFlagMark name={home} />
              </div>
              <p className="mx-auto mt-1.5 max-w-[7.2rem] truncate text-[11px] font-black tracking-wide sm:max-w-[9rem] sm:text-xs">{home}</p>
              <MarketPricePill value={featured.homeMarketPrice} />
            </div>
            <div className="rounded-xl border border-white/12 bg-black/35 px-1.5 py-1.5 text-center shadow-2xl backdrop-blur-sm sm:px-2.5 sm:py-2">
              <p className="text-lg font-black tabular-nums sm:text-xl">
                {featuredState?.center}
              </p>
              <p className="mt-0.5 truncate text-[9px] font-bold uppercase text-white/55">
                {featuredState?.sub}
              </p>
              {featured.drawMarketPrice && (
                <p className="mt-1 text-[9px] font-black uppercase tabular-nums text-white/55">Draw {featured.drawMarketPrice}</p>
              )}
            </div>
            <div className="min-w-0 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-black/30 shadow-xl ring-1 ring-white/15 backdrop-blur-sm sm:h-12 sm:w-12">
                <TeamFlagMark name={away} />
              </div>
              <p className="mx-auto mt-1.5 max-w-[7.2rem] truncate text-[11px] font-black tracking-wide sm:max-w-[9rem] sm:text-xs">{away || 'Opponent'}</p>
              <MarketPricePill value={featured.awayMarketPrice} />
            </div>
          </div>
          {activeDetail && (
            <div className="relative z-10 mt-1.5 rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-center backdrop-blur-sm">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/45">{activeDetail.label}</p>
              {activeDetail.type === 'goals' ? (
                <div
                  key={`${selectedMatchKey}-${detailPageIndex}`}
                  className="mt-0.5 flex min-h-[18px] animate-[hpGoalRise_.28s_ease-out] items-center justify-center gap-1.5 overflow-hidden text-[10.5px] font-semibold leading-snug text-white/90 sm:text-[11px]"
                >
                  {(activeDetailPage as string[]).map((goal, index) => (
                    <span key={`${goal}-${index}`} className="inline-flex min-w-0 items-center gap-1">
                      <span className="truncate">{goal}</span>
                      <span className="shrink-0 text-[10px]" aria-hidden="true">&#9917;</span>
                      {index < activeDetailPage.length - 1 && <span className="ml-1 shrink-0 text-white/35">|</span>}
                    </span>
                  ))}
                </div>
              ) : activeDetail.type === 'events' ? (
                <div
                  key={`${selectedMatchKey}-${detailPageIndex}`}
                  className="mt-0.5 flex min-h-[18px] animate-[hpGoalRise_.28s_ease-out] items-center justify-center gap-1.5 overflow-hidden text-[10.5px] font-semibold leading-snug text-white/90 sm:text-[11px]"
                >
                  {(activeDetailPage as MatchEventDetail[]).map((event, index) => (
                    <span key={`${event.text}-${index}`} className="inline-flex min-w-0 items-center gap-1">
                      <span className="truncate">{event.text}</span>
                      <EventMark kind={event.kind} />
                      {index < activeDetailPage.length - 1 && <span className="ml-1 shrink-0 text-white/35">|</span>}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-0.5 text-[10.5px] font-semibold leading-snug text-white/90 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] sm:text-[11px]">{activeDetail.value}</p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="max-h-[268px] divide-y divide-gray-100 overflow-y-auto [scrollbar-color:rgba(148,163,184,0.25)_transparent] [scrollbar-width:thin] dark:divide-white/10 dark:[scrollbar-color:rgba(255,255,255,0.16)_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300/40 dark:[&::-webkit-scrollbar-thumb]:bg-white/20">
        {rest.map(match => {
          const [rowHome, rowAway] = splitFixtureTitle(match.title)
          return (
            <button
              type="button"
              key={matchKey(match)}
              onClick={() => setSelectedMatchKey(matchKey(match))}
              className="grid w-full grid-cols-[1fr_auto] items-center gap-2 p-2.5 text-left transition-colors hover:bg-gray-50 active:bg-gray-100 dark:hover:bg-white/[0.05] dark:active:bg-white/[0.08] sm:p-2"
            >
              <div className="min-w-0">
                <div className="truncate text-[11px] text-gray-500 dark:text-gray-400">{compactMatchTime(match)}</div>
                <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs font-semibold text-gray-900 dark:text-white">
                  <TeamFlagMark name={rowHome} size="sm" />
                  <span className="min-w-0 truncate">{rowHome}</span>
                  {rowAway && <span className="shrink-0 text-[10px] font-bold text-gray-400 dark:text-gray-500">vs</span>}
                  {rowAway && <TeamFlagMark name={rowAway} size="sm" />}
                  {rowAway && <span className="min-w-0 truncate">{rowAway}</span>}
                </div>
              </div>
              <div className="rounded-lg bg-gray-50 px-2 py-1 text-center text-[10.5px] font-black tabular-nums text-gray-900 dark:bg-white/[0.07] dark:text-white">
                {rowStateLabel(match)}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PolyStreamPanel({
  onBack,
  onOpenNews,
}: {
  onBack: () => void
  onOpenNews: () => void
}) {
  const [feed, setFeed] = useState<PolyStreamFeed | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const mountedRef = useRef(true)
  const matches = feed?.matches ?? []
  const providerReady = Boolean(feed?.providerConfigured && feed.providerStatus === 'connected' && !error)
  const statusText = loading
    ? 'Refreshing'
    : error
    ? 'Provider error'
    : providerReady
    ? `Updated ${relativeNewsTime(feed?.updatedAt || '')}`
    : feed?.providerConfigured
    ? 'No matches'
    : 'Provider needed'

  const loadStream = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    if (!silent) setError('')
    try {
      const response = await fetch('/api/poly-stream')
      const text = await response.text()
      const data = JSON.parse(text) as PolyStreamFeed
      if (!response.ok || !data.ok) throw new Error('Poly Stream feed is not available.')
      if (mountedRef.current) setFeed(data)
    } catch (err) {
      if (mountedRef.current && !silent) setError(err instanceof Error ? err.message : 'Poly Stream feed is not available.')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void loadStream()
    const timer = window.setInterval(() => {
      void loadStream(true)
    }, 60_000)
    return () => {
      mountedRef.current = false
      window.clearInterval(timer)
    }
  }, [loadStream])

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
              <Radio className="h-4 w-4 text-gray-800 dark:text-gray-100" />
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">World Cup Scores</p>
          </div>
          <h2 className="mt-2 text-base font-semibold tracking-tight text-gray-900 dark:text-white">Live World Cup board</h2>
        </div>
        <span className={cn(
          'shrink-0 rounded-full px-2 py-1 text-[10px] font-bold sm:mt-7',
          providerReady
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200'
            : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300',
        )}>
          {statusText}
        </span>
      </div>

      <div className="space-y-2 rounded-2xl border border-gray-100 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-white/[0.05]">
        <div className="flex items-center justify-between gap-2 px-1">
          <span className={cn(
            'inline-flex items-center justify-center rounded-lg px-2.5 py-1.5 text-[11px] font-semibold',
            providerReady
              ? 'bg-black text-white dark:bg-white dark:text-gray-950'
              : 'bg-gray-100 text-gray-600 dark:bg-white/[0.08] dark:text-gray-300',
          )}>
            {providerReady ? 'Live feed' : 'Widget'}
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => void loadStream()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200"
            >
              <Loader2 className={cn('h-3 w-3', loading && 'animate-spin')} />
              Refresh
            </button>
            <button
              type="button"
              onClick={onOpenNews}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200"
            >
              <Newspaper className="h-3 w-3" />
              News
            </button>
          </div>
        </div>

        <HashLiveScoreWidget
          matches={matches}
          loading={loading && !feed}
          providerReady={providerReady}
          error={error}
          onRetry={() => void loadStream()}
        />
        <p className="px-1 pb-1 text-[10px] font-medium leading-relaxed text-gray-400 dark:text-gray-500">
          Live markets move fast. Confirm the latest score and odds on Polymarket before trading.
        </p>
      </div>
    </div>
  )
}

function AgenticLpResearchPanel({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('')
  const [duration, setDuration] = useState('7d')
  const [focus, setFocus] = useState('Best Polymarket LP reward markets')
  const [budget, setBudget] = useState('')
  const [streamAmount, setStreamAmount] = useState('5')
  const emailReady = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const durationReady = /^\d+[dhw]$/.test(duration.trim())
  const amountReady = Number(streamAmount) > 0
  const canContinue = emailReady && durationReady && amountReady
  const streamHref = useMemo(() => {
    const params = new URLSearchParams()
    params.set('app', 'streampay')
    params.set('amount', streamAmount.trim() || '5')
    params.set('recipient', EVM_TREASURY)
    params.set('duration', duration.trim() || '7d')
    params.set('reason', `Agentic LP Research: ${focus.trim() || 'Best Polymarket LP reward markets'} for ${email.trim() || 'report recipient'}${budget.trim() ? `, budget ${budget.trim()}` : ''}`)
    params.set('src', 'agentic-lp-research')
    params.set('wallet', 'circle')
    return `/?${params.toString()}`
  }, [budget, duration, email, focus, streamAmount])

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-100 bg-white text-gray-700 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200">
              <Sparkles className="h-4 w-4" />
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Agentic LP Research</p>
          </div>
          <h2 className="mt-2 text-lg font-semibold tracking-tight text-gray-900 dark:text-white">Stream to Hash PayLink Agent for daily reports</h2>
          <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            Configure the recipient, stream amount, and research focus. StreamPay opens with the Hash PayLink Agent treasury already selected.
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
        <InputBlock label="Report email" value={email} onChange={setEmail} placeholder="you@example.com" />
        {email && !emailReady && <p className="px-1 text-xs text-red-500 dark:text-red-300">Enter a valid email address.</p>}
        <InputBlock label="Stream amount" value={streamAmount} onChange={setStreamAmount} placeholder="5" />
        <InputBlock label="Duration" value={duration} onChange={setDuration} placeholder="7d, 14d, 30d" />
        {duration && !durationReady && <p className="px-1 text-xs text-red-500 dark:text-red-300">Use a duration like 7d, 2w, or 24h.</p>}
        <InputBlock label="Research focus" value={focus} onChange={setFocus} placeholder="Best LP reward markets" />
        <InputBlock label="Optional budget" value={budget} onChange={setBudget} placeholder="Example: 250 USDC" />
        <a
          href={streamHref}
          aria-disabled={!canContinue}
          onClick={event => { if (!canContinue) event.preventDefault() }}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200',
            !canContinue && 'pointer-events-none opacity-50',
          )}
        >
          <Radio className="h-4 w-4" />
          Stream to Hash PayLink Agent
        </a>
        <p className="px-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          Recipient: Hash PayLink Agent treasury on Base, {shortAddress(EVM_TREASURY)}.
        </p>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-3 dark:border-white/10 dark:bg-white/[0.05]">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Service summary</p>
        <div className="mt-2 grid gap-2 text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center justify-between gap-3"><span>Email</span><span className="truncate font-semibold text-gray-800 dark:text-gray-200">{email || 'Not set'}</span></div>
          <div className="flex items-center justify-between gap-3"><span>Stream</span><span className="font-semibold text-gray-800 dark:text-gray-200">{streamAmount || '0'} USDC / {duration || 'Not set'}</span></div>
          <div className="flex items-center justify-between gap-3"><span>Focus</span><span className="truncate font-semibold text-gray-800 dark:text-gray-200">{focus || 'Default LP report'}</span></div>
        </div>
      </div>
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
  inputMode,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  inputMode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'search' | 'email' | 'url'
}) {
  return (
    <label className="block rounded-xl border border-gray-100 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.05]">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{label}</span>
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
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
  returnToPortfolio,
}: {
  wallet: string
  amount: string
  funding?: string
  network: RequestNetwork
  polymarketWallet: string
  returnToPortfolio?: boolean
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
  if (returnToPortfolio) params.set('return', 'poly-portfolio')
  if (funding) params.set('funding', funding)
  return `${window.location.origin}/pay?${params.toString()}`
}

function buildRequestPayLink(request: SavedRequest) {
  if (request.payUrl) return request.payUrl
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
  if (request.payUrl) return request.payUrl
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

// ── Polymarket Portfolio + World Cup hub ──────────────────────────────────────

type PolymarketBridgeNetwork = 'base' | 'arbitrum' | 'solana'

type PolymarketProfile = {
  polymarketAddress: string
  preferredFundingNetwork: string
  telegramOwner?: string | null
  telegramId?: string | null
  lastSyncedAt: string | null
}

type PolymarketAlertSettings = {
  lossThresholdPercent: number
  resolvedAlertsEnabled: boolean
  claimableAlertsEnabled: boolean
  movementAlertsEnabled: boolean
  alertEmail: string
}

type PolymarketAlertRecord = {
  id: number
  alertType: string
  marketId: string | null
  title: string
  body: string | null
  severity: string
  createdAt: string | null
  readAt: string | null
}

type PolymarketFundingAttempt = {
  id: number
  requestId: string | null
  network: string
  amount: string
  status: string
  txHash: string | null
  depositAddress: string | null
  createdAt: string | null
}

type PolymarketPortfolioBundle = {
  profile: PolymarketProfile | null
  settings: PolymarketAlertSettings | null
  watchlist: Array<{ id: number; marketId: string; marketSlug: string | null; marketUrl: string | null; label: string | null }>
  fundingAttempts: PolymarketFundingAttempt[]
  alerts: PolymarketAlertRecord[]
}

type PolymarketPosition = {
  conditionId?: string
  market?: string
  asset?: string
  title?: string
  slug?: string
  eventSlug?: string
  outcome?: string
  size?: number
  avgPrice?: number
  currentValue?: number
  cashPnl?: number
  percentPnl?: number
  redeemable?: boolean
  endDate?: string
  curPrice?: number
  icon?: string
  closed?: boolean
  archived?: boolean
  status?: string
  marketStatus?: string
}

function formatUsd(value: unknown, fallback = '—') {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  if (Math.abs(n) >= 10_000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function normalizePortfolioValue(value: unknown) {
  if (typeof value === 'number') return { value }
  if (Array.isArray(value)) {
    const total = value.reduce((sum, item) => {
      const row = item && typeof item === 'object' ? item as { value?: unknown } : null
      const n = Number(row?.value)
      return Number.isFinite(n) ? sum + n : sum
    }, 0)
    return { value: total }
  }
  if (value && typeof value === 'object') {
    const n = Number((value as { value?: unknown }).value)
    if (Number.isFinite(n)) return { value: n }
  }
  return null
}

function formatPercent(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

function polymarketEventUrl(position: PolymarketPosition) {
  const slug = (position.eventSlug ?? position.slug ?? '').trim()
  return slug ? `https://polymarket.com/event/${slug}` : 'https://polymarket.com'
}

function polymarketPositionKey(position: PolymarketPosition) {
  return position.conditionId ?? position.asset ?? position.slug ?? position.title ?? ''
}

function numberOrNull(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function isClaimablePosition(position: PolymarketPosition) {
  if (position.redeemable !== true) return false
  const value = numberOrNull(position.currentValue)
  if (value !== null) return value > 0
  const size = numberOrNull(position.size)
  return size === null ? true : size > 0
}

function isActiveOpenPosition(position: PolymarketPosition) {
  if (isClaimablePosition(position)) return false
  if (position.redeemable === true) return false
  if (position.closed === true || position.archived === true) return false
  const status = `${position.status ?? ''} ${position.marketStatus ?? ''}`.toLowerCase()
  if (/(resolved|closed|settled|final|ended|archived)/.test(status)) return false
  const value = numberOrNull(position.currentValue)
  const size = numberOrNull(position.size)
  if ((value ?? 0) > 0 || (size ?? 0) > 0) return true
  if (position.endDate) {
    const endedAt = new Date(position.endDate).getTime()
    if (Number.isFinite(endedAt) && endedAt < Date.now()) return false
  }
  if (value !== null || size !== null) return (value ?? 0) > 0 || (size ?? 0) > 0
  return true
}

function shortHex(value: string) {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value
}

function PolyPortfolioPanel({
  onBack,
  onOpenLpScout,
  onOpenWorldCup,
  telegramOwner,
  telegramId,
}: {
  onBack: () => void
  onOpenLpScout: () => void
  onOpenWorldCup: () => void
  telegramOwner?: string
  telegramId?: string
}) {
  const { ready: privyReady, authenticated, login, getAccessToken } = usePrivy()

  const [bundle, setBundle] = useState<PolymarketPortfolioBundle | null>(null)
  const [bundleLoading, setBundleLoading] = useState(false)
  const [bundleError, setBundleError] = useState('')

  const [addressInput, setAddressInput] = useState('')
  const [networkInput, setNetworkInput] = useState<PolymarketBridgeNetwork>('base')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState('')

  const [liveValue, setLiveValue] = useState<{ value?: number } | null>(null)
  const [livePositions, setLivePositions] = useState<PolymarketPosition[]>([])
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError, setLiveError] = useState('')

  const [fundOpen, setFundOpen] = useState(false)
  const [fundAmount, setFundAmount] = useState('')
  const [fundBusy, setFundBusy] = useState(false)
  const [fundError, setFundError] = useState('')
  const [fundResult, setFundResult] = useState<{
    depositAddress: string
    network: PolymarketBridgeNetwork
    minimumUsdc: number
    payUrl: string
    marketUrl: string
  } | null>(null)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState<PolymarketAlertSettings | null>(null)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [addressCopied, setAddressCopied] = useState(false)

  const profile = bundle?.profile ?? null
  const settings = bundle?.settings ?? null

  const claimablePositions = useMemo(
    () => livePositions.filter(isClaimablePosition),
    [livePositions],
  )

  const activeOpenPositions = useMemo(
    () => livePositions.filter(isActiveOpenPosition),
    [livePositions],
  )

  const losers = useMemo(() => {
    if (!settings) return []
    const threshold = -Math.abs(settings.lossThresholdPercent)
    return activeOpenPositions.filter(p =>
      typeof p.percentPnl === 'number' && p.percentPnl <= threshold,
    )
  }, [activeOpenPositions, settings])

  const fetchBundle = useCallback(async () => {
    if (!authenticated) return
    setBundleLoading(true)
    setBundleError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in required.')
      const res = await fetch('/api/polymarket-portfolio?action=profile', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json() as { ok?: boolean; error?: string } & PolymarketPortfolioBundle
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not load Polymarket portfolio.')
      setBundle({
        profile: data.profile,
        settings: data.settings,
        watchlist: data.watchlist ?? [],
        fundingAttempts: data.fundingAttempts ?? [],
        alerts: data.alerts ?? [],
      })
    } catch (err) {
      setBundleError(err instanceof Error ? err.message : 'Could not load Polymarket portfolio.')
    } finally {
      setBundleLoading(false)
    }
  }, [authenticated, getAccessToken])

  const fetchLiveData = useCallback(async (address: string) => {
    setLiveLoading(true)
    setLiveError('')
    try {
      const [valueRes, positionsRes] = await Promise.all([
        fetch(`/api/polymarket-portfolio?action=value&address=${encodeURIComponent(address)}`),
        fetch(`/api/polymarket-portfolio?action=positions&address=${encodeURIComponent(address)}&sizeThreshold=0&limit=100`),
      ])
      const valueData = await valueRes.json() as { ok?: boolean; value?: unknown; error?: string }
      const positionsData = await positionsRes.json() as { ok?: boolean; positions?: PolymarketPosition[]; error?: string }
      if (!valueRes.ok || !valueData.ok) throw new Error(valueData.error || 'Could not load portfolio value.')
      if (!positionsRes.ok || !positionsData.ok) throw new Error(positionsData.error || 'Could not load positions.')
      setLiveValue(normalizePortfolioValue(valueData.value))
      setLivePositions(Array.isArray(positionsData.positions) ? positionsData.positions : [])
    } catch (err) {
      setLiveError(err instanceof Error ? err.message : 'Could not load live portfolio data.')
    } finally {
      setLiveLoading(false)
    }
  }, [])

  const evaluateAlerts = useCallback(async () => {
    if (!authenticated) return
    try {
      const token = await getAccessToken()
      if (!token) return
      const res = await fetch('/api/polymarket-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'evaluate-alerts' }),
      })
      const data = await res.json() as { ok?: boolean; alerts?: PolymarketAlertRecord[] }
      if (res.ok && data.ok && Array.isArray(data.alerts)) {
        setBundle(prev => prev ? { ...prev, alerts: data.alerts ?? [] } : prev)
      }
    } catch {
      /* alert evaluation is best-effort */
    }
  }, [authenticated, getAccessToken])

  useEffect(() => {
    if (privyReady && authenticated) void fetchBundle()
  }, [privyReady, authenticated, fetchBundle])

  useEffect(() => {
    if (profile?.polymarketAddress) {
      void fetchLiveData(profile.polymarketAddress)
    }
  }, [profile?.polymarketAddress, fetchLiveData])

  useEffect(() => {
    if (!profile?.polymarketAddress) return
    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') {
        void fetchLiveData(profile.polymarketAddress)
        void fetchBundle()
      }
    }
    window.addEventListener('focus', refreshOnReturn)
    document.addEventListener('visibilitychange', refreshOnReturn)
    return () => {
      window.removeEventListener('focus', refreshOnReturn)
      document.removeEventListener('visibilitychange', refreshOnReturn)
    }
  }, [profile?.polymarketAddress, fetchLiveData, fetchBundle])

  useEffect(() => {
    if (profile?.polymarketAddress && livePositions.length >= 0 && !liveLoading) {
      void evaluateAlerts()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.polymarketAddress, livePositions.length])

  useEffect(() => {
    if (settings) setSettingsDraft(settings)
  }, [settings])

  async function saveProfile() {
    const address = addressInput.trim()
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      setProfileError('Enter a valid 0x Polymarket profile address.')
      return
    }
    setProfileError('')
    setSavingProfile(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in required.')
      const res = await fetch('/api/polymarket-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'save-profile',
          address,
          fundingNetwork: networkInput,
          telegramOwner,
          telegramId,
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string } & PolymarketPortfolioBundle
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not save profile.')
      setBundle({
        profile: data.profile,
        settings: data.settings,
        watchlist: data.watchlist ?? [],
        fundingAttempts: data.fundingAttempts ?? [],
        alerts: data.alerts ?? [],
      })
      setAddressInput('')
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not save profile.')
    } finally {
      setSavingProfile(false)
    }
  }

  async function disconnectProfile() {
    setSavingProfile(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in required.')
      const res = await fetch('/api/polymarket-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'disconnect' }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not disconnect.')
      setBundle({ profile: null, settings: null, watchlist: [], fundingAttempts: [], alerts: [] })
      setLiveValue(null)
      setLivePositions([])
      setLiveError('')
      setFundResult(null)
      setFundOpen(false)
      setFundAmount('')
      setFundError('')
      setAddressInput('')
      setSettingsOpen(false)
      setSettingsDraft(null)
      setBundleError('')
    } catch (err) {
      setBundleError(err instanceof Error ? err.message : 'Could not disconnect.')
    } finally {
      setSavingProfile(false)
    }
  }

  async function startFund(marketUrlForCta = '') {
    if (!profile) return
    setFundError('')
    const amt = fundAmount.trim()
    if (!/^\d+(?:\.\d{1,6})?$/.test(amt) || Number(amt) < 3) {
      setFundError('Enter at least 3 USDC.')
      return
    }
    setFundBusy(true)
    try {
      const network = (profile.preferredFundingNetwork as PolymarketBridgeNetwork) || 'base'
      const bridgeRes = await fetch('/api/polymarket-bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          polymarketWallet: profile.polymarketAddress,
          network,
        }),
      })
      const bridgeData = await bridgeRes.json() as {
        ok?: boolean
        depositAddress?: string
        network?: PolymarketBridgeNetwork
        minimumUsdc?: number
        error?: string
      }
      if (!bridgeRes.ok || !bridgeData.ok || !bridgeData.depositAddress) {
        throw new Error(bridgeData.error || 'Could not prepare bridge address.')
      }
      const token = await getAccessToken()
      if (token) {
        await fetch('/api/polymarket-portfolio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            action: 'log-funding',
            network: bridgeData.network ?? network,
            amount: amt,
            status: 'pending',
            depositAddress: bridgeData.depositAddress,
          }),
        }).catch(() => undefined)
      }
      const payUrl = buildPolymarketPayLink({
        wallet: bridgeData.depositAddress,
        amount: amt,
        funding: 'Polymarket portfolio',
        network: (bridgeData.network ?? network) as RequestNetwork,
        polymarketWallet: profile.polymarketAddress,
        returnToPortfolio: true,
      })
      setFundResult({
        depositAddress: bridgeData.depositAddress,
        network: (bridgeData.network ?? network) as PolymarketBridgeNetwork,
        minimumUsdc: bridgeData.minimumUsdc ?? 3,
        payUrl,
        marketUrl: marketUrlForCta || 'https://polymarket.com',
      })
      void fetchBundle()
    } catch (err) {
      setFundError(err instanceof Error ? err.message : 'Could not prepare funding.')
    } finally {
      setFundBusy(false)
    }
  }

  async function saveAlertSettings() {
    if (!settingsDraft) return
    setSettingsSaving(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in required.')
      const res = await fetch('/api/polymarket-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'save-alert-settings', ...settingsDraft }),
      })
      const data = await res.json() as { ok?: boolean; settings?: PolymarketAlertSettings; error?: string }
      if (!res.ok || !data.ok || !data.settings) throw new Error(data.error || 'Could not save alert settings.')
      setBundle(prev => prev ? { ...prev, settings: data.settings ?? null } : prev)
      setSettingsOpen(false)
      void evaluateAlerts()
    } catch (err) {
      setBundleError(err instanceof Error ? err.message : 'Could not save alert settings.')
    } finally {
      setSettingsSaving(false)
    }
  }

  async function markAlertRead(alertId: number) {
    try {
      const token = await getAccessToken()
      if (!token) return
      await fetch('/api/polymarket-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'mark-alert-read', alertId }),
      })
      setBundle(prev => prev ? {
        ...prev,
        alerts: prev.alerts.map(a => a.id === alertId ? { ...a, readAt: new Date().toISOString() } : a),
      } : prev)
    } catch {
      /* ignore */
    }
  }

  function copyAddress() {
    if (!profile) return
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    navigator.clipboard.writeText(profile.polymarketAddress).then(() => {
      setAddressCopied(true)
      window.setTimeout(() => setAddressCopied(false), 1500)
    }).catch(() => undefined)
  }

  // ── Render ────────────────────────────────────────────────────────────
  if (!privyReady) {
    return (
      <div className="mt-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="mt-4">
        <button type="button" onClick={onBack} className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
            <img src={POLYMARKET_LOGO} alt="" className="h-4 w-4 invert dark:invert-0" />
          </span>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">PolyDesk</p>
        </div>
        <h2 className="mt-2 text-lg font-semibold tracking-tight text-gray-900 dark:text-white">PolyDesk Portfolio</h2>
        <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          Sign in to bind a Polymarket profile address to your Hash PayLink session. Your live positions, claimables, and alerts stay tied to your sign-in across devices.
        </p>
        <button
          type="button"
          onClick={() => login()}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
        >
          <ShieldCheck className="h-4 w-4" /> Sign in to continue
        </button>
      </div>
    )
  }

  if (bundleLoading && !bundle) {
    return (
      <div className="mt-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading portfolio…
      </div>
    )
  }

  // Connect screen — no saved profile yet
  if (!profile) {
    return (
      <div className="mt-4">
        <button type="button" onClick={onBack} className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
            <img src={POLYMARKET_LOGO} alt="" className="h-4 w-4 invert dark:invert-0" />
          </span>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">PolyDesk</p>
        </div>
        <h2 className="mt-2 text-lg font-semibold tracking-tight text-gray-900 dark:text-white">Connect Polymarket profile</h2>
        <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          Paste your Polymarket profile address (the 0x address shown on your Polymarket account panel). We store the address against your Hash PayLink session — never a key, signature, or cookie.
        </p>
        <div className="mt-4 space-y-3">
          <InputBlock
            label="Profile address"
            value={addressInput}
            onChange={setAddressInput}
            placeholder="0x... profile address"
          />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Preferred funding network</p>
            <NetworkChipGroup
              value={networkInput}
              onChange={value => {
                if (value === 'base' || value === 'arbitrum' || value === 'solana') setNetworkInput(value)
              }}
              options={polymarketBridgeNetworks}
            />
          </div>
          {profileError && <p className="text-xs text-red-500 dark:text-red-300">{profileError}</p>}
          {bundleError && <p className="text-xs text-red-500 dark:text-red-300">{bundleError}</p>}
          <button
            type="button"
            onClick={saveProfile}
            disabled={savingProfile}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
          >
            {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Save profile
          </button>
        </div>
      </div>
    )
  }

  const totalValue = liveValue?.value
  const unreadAlerts = bundle?.alerts.filter(a => !a.readAt) ?? []
  const latestFunding = bundle?.fundingAttempts?.[0] ?? null

  return (
    <div className="mt-4 space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      {/* Profile / balance card */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0f1014]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
                <img src={POLYMARKET_LOGO} alt="" className="h-4 w-4 invert dark:invert-0" />
              </span>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">PolyDesk Portfolio</p>
            </div>
            <button
              type="button"
              onClick={copyAddress}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-100 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08]"
            >
              <span className="font-mono tabular-nums">{shortHex(profile.polymarketAddress)}</span>
              {addressCopied ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 opacity-60" />}
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => profile && void fetchLiveData(profile.polymarketAddress)}
              disabled={liveLoading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/[0.04]"
              aria-label="Refresh"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', liveLoading && 'animate-spin')} />
            </button>
            <button
              type="button"
              onClick={disconnectProfile}
              disabled={savingProfile}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/[0.04]"
              aria-label="Disconnect"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-white/[0.04]">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Position value</p>
            <p className="mt-1 text-base font-semibold tabular-nums text-gray-900 dark:text-white">
              {liveLoading ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : formatUsd(totalValue)}
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-white/[0.04]">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Open positions</p>
            <p className="mt-1 text-base font-semibold tabular-nums text-gray-900 dark:text-white">
              {liveLoading ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : activeOpenPositions.length}
            </p>
          </div>
        </div>

        {latestFunding && (
          <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Recent bridge funding</p>
              <p className="text-xs font-semibold tabular-nums text-gray-800 dark:text-gray-100">
                {latestFunding.amount} USDC
              </p>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Cash balance is confirmed inside Polymarket after Bridge credit. Hash PayLink shows live positions, claimables, alerts, and recent funding attempts from this profile.
            </p>
          </div>
        )}

        {liveError && <p className="mt-3 text-xs text-red-500 dark:text-red-300">{liveError}</p>}

        <button
          type="button"
          onClick={() => { setFundOpen(open => !open); setFundResult(null); setFundError('') }}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
        >
          <Send className="h-4 w-4" /> Fund Polymarket
        </button>

        {fundOpen && (
          <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
            {!fundResult ? (
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                  Bridge checkout · {profile.preferredFundingNetwork || 'base'}
                </p>
                <InputBlock
                  label="Amount USDC"
                  value={fundAmount}
                  onChange={setFundAmount}
                  placeholder="0.00"
                  inputMode="decimal"
                />
                <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  Funded address is your saved Polymarket profile. Minimum bridge amount is 3 USDC.
                </p>
                {fundError && <p className="text-xs text-red-500 dark:text-red-300">{fundError}</p>}
                <button
                  type="button"
                  onClick={() => startFund()}
                  disabled={fundBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                >
                  {fundBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  Open bridge checkout
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-300">Bridge prepared</p>
                <p className="text-sm text-gray-700 dark:text-gray-200">
                  Send <span className="font-semibold tabular-nums">{fundAmount} USDC</span> via {fundResult.network.toUpperCase()} to the bridge address. Min {fundResult.minimumUsdc} USDC.
                </p>
                <a
                  href={fundResult.payUrl}
                  className="block truncate rounded-lg bg-white px-3 py-2 font-mono text-xs text-gray-800 shadow-sm dark:bg-white/[0.06] dark:text-gray-200"
                  rel="noreferrer"
                >
                  {fundResult.depositAddress}
                </a>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <a
                    href={fundResult.payUrl}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                  >
                    <ExternalLink className="h-4 w-4" /> Open Hash PayLink checkout
                  </a>
                  <a
                    href={fundResult.marketUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/[0.04]"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {fundResult.marketUrl === 'https://polymarket.com' ? 'Sign in and trade on Polymarket' : 'Sign in and trade this market'}
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Alerts card */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0f1014]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Alerts</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">
              {unreadAlerts.length > 0 ? `${unreadAlerts.length} active` : 'No active alerts'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(open => !open)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/[0.04]"
          >
            <Bell className="h-3.5 w-3.5" /> Settings
          </button>
        </div>

        {settingsOpen && settingsDraft && (
          <div className="mt-3 space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Loss threshold</p>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={95}
                  step={1}
                  value={settingsDraft.lossThresholdPercent}
                  onChange={e => setSettingsDraft(d => d ? { ...d, lossThresholdPercent: Math.max(0, Math.min(95, Math.floor(Number(e.target.value) || 0))) } : d)}
                  className="w-20 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm tabular-nums dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                />
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {settingsDraft.lossThresholdPercent === 0 ? 'Loss alerts off — set above 0 to enable' : '% drop triggers an alert'}
                </span>
              </div>
            </div>
            <AlertToggle
              label="Resolved markets"
              hint="Notify when a market closes."
              value={settingsDraft.resolvedAlertsEnabled}
              onChange={v => setSettingsDraft(d => d ? { ...d, resolvedAlertsEnabled: v } : d)}
            />
            <AlertToggle
              label="Claimable balance"
              hint="Notify when a position is redeemable."
              value={settingsDraft.claimableAlertsEnabled}
              onChange={v => setSettingsDraft(d => d ? { ...d, claimableAlertsEnabled: v } : d)}
            />
            <AlertToggle
              label="Live market movement"
              hint="Notify on intraday price swings (coming online)."
              value={settingsDraft.movementAlertsEnabled}
              onChange={v => setSettingsDraft(d => d ? { ...d, movementAlertsEnabled: v } : d)}
            />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Delivery email</p>
              <div className="mt-1 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                <Mail className="h-3.5 w-3.5 text-gray-400" />
                <input
                  type="email"
                  value={settingsDraft.alertEmail ?? ''}
                  onChange={e => setSettingsDraft(d => d ? { ...d, alertEmail: e.target.value } : d)}
                  placeholder="you@example.com"
                  className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-white"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Saved for portfolio alert delivery.</p>
            </div>
            <button
              type="button"
              onClick={saveAlertSettings}
              disabled={settingsSaving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
            >
              {settingsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Save settings
            </button>
          </div>
        )}

        {unreadAlerts.length > 0 ? (
          <ul className="mt-3 max-h-[252px] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(156,163,175,0.35)_transparent]">
            {unreadAlerts.map(alert => (
              <li key={alert.id} className="flex items-start gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
                <span className={cn(
                  'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                  alert.severity === 'warning' ? 'bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300' :
                  alert.severity === 'success' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300' :
                  'bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300',
                )}>
                  {alert.alertType === 'claimable' ? <CheckCircle2 className="h-3.5 w-3.5" />
                    : alert.alertType === 'loss-threshold' ? <TrendingDown className="h-3.5 w-3.5" />
                    : <BellRing className="h-3.5 w-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{alert.title}</p>
                  {alert.body && <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{alert.body}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => void markAlertRead(alert.id)}
                  className="text-[11px] font-semibold text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  Mark read
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            No active alerts. We watch your saved positions against your alert settings each time you open Portfolio.
          </p>
        )}
      </div>

      {/* Claimables card */}
      {claimablePositions.length > 0 && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 shadow-sm dark:border-emerald-300/20 dark:bg-emerald-400/[0.04]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Claimable on Polymarket</p>
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{claimablePositions.length}</span>
          </div>
          <ul className="mt-2 max-h-[216px] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(16,185,129,0.35)_transparent]">
            {claimablePositions.map(position => (
              <li key={polymarketPositionKey(position)} className="flex items-center justify-between gap-3 rounded-xl bg-white/70 px-3 py-2 dark:bg-white/[0.04]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{position.title ?? 'Polymarket position'}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{formatUsd(position.currentValue)} redeemable</p>
                </div>
                <a
                  href={polymarketEventUrl(position)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    if (profile?.polymarketAddress) window.setTimeout(() => void fetchLiveData(profile.polymarketAddress), 4000)
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-black px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                >
                  Claim <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Open positions card */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0f1014]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Open positions</p>
          {activeOpenPositions.length > 0 && <p className="text-xs text-gray-500 dark:text-gray-400">{activeOpenPositions.length}</p>}
        </div>
        {liveLoading && livePositions.length === 0 ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Fetching positions…
          </div>
        ) : activeOpenPositions.length === 0 ? (
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">No open positions on this address.</p>
        ) : (
          <ul className="mt-3 max-h-[258px] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(156,163,175,0.35)_transparent]">
            {activeOpenPositions.map(position => {
              const pnl = position.percentPnl
              const tone = typeof pnl === 'number'
                ? pnl >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-500 dark:text-red-300'
                : 'text-gray-400'
              const isLoser = losers.some(p => polymarketPositionKey(p) === polymarketPositionKey(position))
              return (
                <li key={polymarketPositionKey(position)} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{position.title ?? 'Polymarket position'}</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        {position.outcome ?? '—'} · {formatUsd(position.currentValue)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={cn('text-sm font-semibold tabular-nums', tone)}>{formatPercent(pnl)}</p>
                      {isLoser && <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-300">Below threshold</p>}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-end">
                    <a
                      href={polymarketEventUrl(position)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white"
                    >
                      Open <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onOpenWorldCup}
          className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2.5 text-left text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:bg-[#0f1014] dark:text-gray-200 dark:hover:bg-white/[0.04]"
        >
          <Radio className="h-4 w-4 text-gray-400" /> World Cup
        </button>
        <button
          type="button"
          onClick={onOpenLpScout}
          className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2.5 text-left text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:bg-[#0f1014] dark:text-gray-200 dark:hover:bg-white/[0.04]"
        >
          <LineChart className="h-4 w-4 text-gray-400" /> LP Scout
        </button>
      </div>
    </div>
  )
}

function AlertToggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        checked={value}
        onChange={e => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 rounded border-gray-300 text-black focus:ring-black dark:border-white/20 dark:bg-white/[0.06] dark:checked:bg-white"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{label}</p>
        <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">{hint}</p>
      </div>
    </label>
  )
}

function PolyWorldCupHubPanel({
  onBack,
  onOpenNews,
  onOpenScores,
  onOpenPortfolio,
}: {
  onBack: () => void
  onOpenNews: () => void
  onOpenScores: () => void
  onOpenPortfolio: () => void
}) {
  const { authenticated, getAccessToken } = usePrivy()
  const [hasProfile, setHasProfile] = useState<boolean>(false)

  useEffect(() => {
    let cancelled = false
    async function probe() {
      if (!authenticated) return
      try {
        const token = await getAccessToken()
        if (!token) return
        const res = await fetch('/api/polymarket-portfolio?action=profile', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json() as { ok?: boolean; profile?: PolymarketProfile | null }
        if (!cancelled && res.ok && data.ok) setHasProfile(Boolean(data.profile?.polymarketAddress))
      } catch { /* silent */ }
    }
    void probe()
    return () => { cancelled = true }
  }, [authenticated, getAccessToken])

  return (
    <div className="mt-4">
      <button type="button" onClick={onBack} className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
          <Radio className="h-4 w-4 text-gray-500" />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">PolyDesk World Cup</p>
      </div>
      <h2 className="mt-2 text-lg font-semibold tracking-tight text-gray-900 dark:text-white">Live scores, market odds, direct trade routes.</h2>
      <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
        Live scores come from the matchday feed. Market odds and trade routes come from Polymarket. No stale fallbacks.
      </p>

      {hasProfile && (
        <button
          type="button"
          onClick={onOpenPortfolio}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-100 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08]"
        >
          <Wallet className="h-3 w-3" /> Check portfolio exposure
        </button>
      )}

      <div className="mt-4 space-y-2">
        <button
          type="button"
          onClick={onOpenScores}
          className="flex w-full items-start gap-3 rounded-xl border border-gray-100 bg-white p-3 text-left shadow-sm hover:bg-gray-50 dark:border-white/10 dark:bg-[#0f1014] dark:hover:bg-white/[0.04]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-200">
            <Radio className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Live Scores</p>
            <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">Live match centre with exact Polymarket fixture routing.</p>
          </div>
          <ArrowRight className="mt-1 h-4 w-4 text-gray-400" />
        </button>
        <button
          type="button"
          onClick={onOpenNews}
          className="flex w-full items-start gap-3 rounded-xl border border-gray-100 bg-white p-3 text-left shadow-sm hover:bg-gray-50 dark:border-white/10 dark:bg-[#0f1014] dark:hover:bg-white/[0.04]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-200">
            <Newspaper className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">News &amp; market signals</p>
            <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">Headlines that move Polymarket prices and LP risk.</p>
          </div>
          <ArrowRight className="mt-1 h-4 w-4 text-gray-400" />
        </button>
      </div>
    </div>
  )
}
