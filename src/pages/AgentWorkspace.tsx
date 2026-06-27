/**
 * /agent — Payment-Gated AI Demo
 *
 * Demonstrates the Hash PayLink agentic economy primitive:
 * 1. Enter an event ID + your payer name
 * 2. Verification checks 0G Mainnet for your payment proof
 * 3. If verified → chat with the AI, get on-chain proof per response
 * 4. If not verified → pay first via Hash PayLink, then retry
 */

import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { usePrivy }                     from '@privy-io/react-auth'
import { cn }                           from '../lib/utils'
import type { LayoutOutletContext }     from '../Layout'
import { CHAIN_META, EVM_TREASURY }     from '../lib/chains'
import type { ChainKey }                from '../lib/chains'
import { queryBalances }                from '../lib/unifiedBalance'
import { PRIVY_AUTH_ENABLED }           from '../lib/authMode'
import { resolvePrivyCircleLink, savePrivyCircleLink } from '../lib/privyCircleLink'
import { PrivyConnectButton }           from '../lib/PrivyConnectButton'
import ZeroScoutPowerBadge              from '../components/ZeroScoutPowerBadge'
import {
  CheckCircle2, AlertCircle, Loader2, Send,
  ExternalLink, ArrowLeft, ArrowRight, ShieldCheck, Zap,
  Wallet, Radio, Copy, Bot, Sparkles,
  RefreshCw,
} from 'lucide-react'

async function readAgentWalletJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? ''
  const text = await response.text()
  if (!contentType.includes('application/json')) {
    const looksLikeHtml = /^\s*</.test(text)
    throw new Error(looksLikeHtml
      ? 'Hash PayLink is still finishing the latest deploy. Wait a few seconds, then run LP Alpha again.'
      : text.slice(0, 180) || 'Agent wallet API returned an unexpected response.')
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('Agent wallet API returned invalid JSON. Refresh and try again.')
  }
}

function emailFromPrivyUser(user: unknown) {
  const linkedAccounts = (user as { linkedAccounts?: Array<Record<string, unknown>> } | null)?.linkedAccounts ?? []
  for (const account of linkedAccounts) {
    if (account?.type === 'email' && typeof account.address === 'string') return account.address
  }
  const email = (user as { email?: { address?: string } } | null)?.email?.address
  return typeof email === 'string' ? email : ''
}

function stableWalletSlugFromEmail(email: string) {
  const clean = email.trim().toLowerCase()
  if (!clean) return ''
  let hash = 5381
  for (let i = 0; i < clean.length; i += 1) {
    hash = ((hash << 5) + hash + clean.charCodeAt(i)) >>> 0
  }
  return `wallet-${hash.toString(36)}`
}

function isEvmAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim())
}

// ─── Types ───────────────────────────────────────────────────────────────────

type VerifyResult = {
  verified: boolean
  payment?: { payer: string; chain: string; amount: string; ts: number }
  proof?:   { ogTxHash: string; ogExplorer: string; network: string }
  error?:   string
  paymentLink?: string
}

type Message = {
  question: string
  answer:   string
  proof?:   { ogTxHash: string; ogExplorer: string }
  zeroscoutSponsorship?: ZeroScoutSponsorship
}

type AgentActivity = {
  id: string
  type: 'wallet_connected' | 'funded' | 'gateway_activated' | 'x402_spent' | 'x402_sold' | 'scout_returned' | 'governance'
  title: string
  amount?: string
  asset?: string
  direction?: 'in' | 'out' | 'result' | 'system'
  network?: string
  wallet?: string
  txHash?: string
  detail?: string
  result?: {
    zeroscout?: ZeroScoutIntelligenceResult
    summary?: string
    signals?: string[]
    highlights?: string[]
    opportunities?: Array<{
      title?: string
      marketUrl?: string
      bestBid?: number
      bestAsk?: number
      liveSpread?: number
      daysToResolve?: number
      dailyReward?: number
      depthAtTwoCents?: number
      suggestedYesBid?: number
      suggestedNoBid?: number
      lpExecutionRisk?: string
      scoutReason?: string
      executionPlan?: string[]
    }>
    nextAction?: string
    source?: string
  }
  proof?: {
    kind: 'circle_gateway_x402'
    provider?: string
    service?: string
    buyerAgent?: string
    sellerAgent?: string
    payer?: string
    seller?: string
    amount?: string
    network?: string
    transaction?: string
    serviceUrl?: string
    generatedAt?: string
    receiptHash?: string
    circleOutputHash?: string
    proofHash: string
  }
  og?: {
    rootHash: string
    ogTxHash: string
    ogExplorer: string
    archivedAt: number
  }
  createdAt: number
}

type ZeroScoutIntelligenceResult = {
  id?: string
  aiProvider?: string
  intelligenceScore?: number
  confidence?: number
  summary?: string
  signals?: string[]
  riskFlags?: string[]
  recommendedActions?: string[]
  dataGaps?: string[]
  disclaimer?: string
  claudeReview?: {
    provider?: string
    intelligenceRating?: number
    recommendation?: string
  }
  openAiReview?: {
    provider?: string
    intelligenceRating?: number
    recommendation?: string
  }
  proof?: {
    storageRoot?: string
    contentHash?: string
    storageTxHash?: string
  }
  network?: string
  storageMode?: string
}

type ZeroScoutSponsorship = {
  proofClass: 'zeroscout_sponsored_action'
  sponsor: 'ZeroScout'
  service: string
  action: string
  requestHash: string
  sponsoredAt: string
  sourceProofClass?: 'helper_access_receipt' | 'helper_free_access' | 'helper_memory_proof' | 'service_receipt'
  zeroscout?: ZeroScoutIntelligenceResult
}

type AgentProfileSummary = {
  slug: string
  name: string
  purpose: string
  walletAddress?: string
  profileImage?: {
    initials: string
    hue: number
    accentHue: number
  }
}

type HelperProfile = {
  id: string
  displayName: string
  preferences?: string[]
  memorySummary?: string
  memoryProof?: {
    ogExplorer: string
    archivedAt: number
  }
}

type WalletChoice = {
  address: string
  balance?: string
  balanceError?: string
}

type LpScoutServiceResponse = {
  service?: string
  scout?: {
    summary?: string
    signals?: string[]
    highlights?: string[]
    opportunities?: Array<{
      title?: string
      marketUrl?: string
      bestBid?: number
      bestAsk?: number
      liveSpread?: number
      daysToResolve?: number
      dailyReward?: number
      depthAtTwoCents?: number
      suggestedYesBid?: number
      suggestedNoBid?: number
      lpExecutionRisk?: string
      scoutReason?: string
      executionPlan?: string[]
    }>
    nextAction?: string
    source?: string
  }
  receipt?: {
    provider?: string
    price?: string
    seller?: string
  }
  payment?: {
    amount?: string
    network?: string
    transaction?: string
  }
}

type LpScoutRunResult = {
  response?: LpScoutServiceResponse
  maxAmount?: string
  serviceUrl?: string
}

type SavedLpScoutIntent = {
  agentSlug?: string
  href: string
  label: string
  savedAt: number
}

function agentAvatarHue(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return hash % 360
}

function agentProfileInitials(name: string) {
  const parts = name.replace(/[^a-z0-9\s-]/gi, ' ').trim().split(/\s+/).filter(Boolean)
  return parts.slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'AG'
}

function resolveAgentProfileImage(profile: AgentProfileSummary) {
  const hue = agentAvatarHue(`${profile.slug}:${profile.name}`)
  return profile.profileImage ?? {
    initials: agentProfileInitials(profile.name),
    hue,
    accentHue: (hue + 44) % 360,
  }
}

function compactAgentWallet(value: string) {
  return value.length > 10 ? `${value.slice(0, 4)}..${value.slice(-3)}` : value
}

function PulsingDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      <span className="h-1 w-1 animate-pulse rounded-full bg-current" />
      <span className="h-1 w-1 animate-pulse rounded-full bg-current [animation-delay:120ms]" />
      <span className="h-1 w-1 animate-pulse rounded-full bg-current [animation-delay:240ms]" />
    </span>
  )
}

// ─── Demo credentials (pre-filled for judges) ─────────────────────────────────
const PLATFORM_AGENT_SLUG = 'hashpaylink-agent'
const AGENT_WALLET_LOGIN_INTENT_KEY = 'hashpaylink-agent-wallet-login-intent'
const MIN_X402_ACTIVATION_USDC = 0.5
const LP_SCOUT_INTENT_KEY = 'hashpaylink:lp-scout-intent'
const LP_SCOUT_INTENT_TTL_MS = 30 * 60 * 1000
const PLATFORM_AGENT_PROFILE: AgentProfileSummary = {
  slug: PLATFORM_AGENT_SLUG,
  name: 'Hash PayLink Agent',
  purpose: 'Owner-managed platform agent for treasury, x402, LP Scout, and StreamPay services.',
  profileImage: {
    initials: 'HP',
    hue: agentAvatarHue(`${PLATFORM_AGENT_SLUG}:Hash PayLink Agent`),
    accentHue: (agentAvatarHue(`${PLATFORM_AGENT_SLUG}:Hash PayLink Agent`) + 44) % 360,
  },
}
type AgentTreasuryNetwork = Extract<ChainKey, 'base' | 'arbitrum' | 'arc'>
const AGENT_TREASURY_NETWORKS: Array<{ key: AgentTreasuryNetwork; label: string }> = [
  { key: 'base', label: 'Base' },
  { key: 'arbitrum', label: 'Arbitrum' },
  { key: 'arc', label: 'Arc Testnet' },
]

function isAgentTreasuryNetwork(value: string): value is AgentTreasuryNetwork {
  return value === 'base' || value === 'arbitrum' || value === 'arc'
}

function readableTreasuryBalanceError(error: unknown, networkLabel: string) {
  const message = error instanceof Error ? error.message : String(error || '')
  if (/timed out|failed to fetch|http request failed|rpc\.testnet\.arc\.network/i.test(message)) {
    return `${networkLabel} balance is temporarily unavailable. Try another network or refresh.`
  }
  if (/balance unavailable/i.test(message)) return `${networkLabel} balance unavailable.`
  return message.slice(0, 140) || `${networkLabel} balance unavailable.`
}

function scoutModeLabel(value: string) {
  if (value === 'theme') return 'Scout a theme'
  if (value === 'market') return 'Inspect one market'
  return 'Best reward markets'
}

function readSavedLpScoutIntent(agentSlug: string) {
  try {
    const raw = window.sessionStorage.getItem(LP_SCOUT_INTENT_KEY) || window.localStorage.getItem(LP_SCOUT_INTENT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SavedLpScoutIntent
    if (!parsed?.href || !parsed.savedAt) return null
    if (Date.now() - parsed.savedAt > LP_SCOUT_INTENT_TTL_MS) return null
    if (parsed.agentSlug && agentSlug && parsed.agentSlug !== agentSlug) return null
    return parsed
  } catch {
    return null
  }
}

function saveLpScoutIntent(intent: SavedLpScoutIntent) {
  try {
    const value = JSON.stringify(intent)
    window.sessionStorage.setItem(LP_SCOUT_INTENT_KEY, value)
    window.localStorage.setItem(LP_SCOUT_INTENT_KEY, value)
  } catch {
    // Storage may be unavailable in private contexts; the URL still carries the live request.
  }
}

function clearLpScoutIntent() {
  try {
    window.sessionStorage.removeItem(LP_SCOUT_INTENT_KEY)
    window.localStorage.removeItem(LP_SCOUT_INTENT_KEY)
  } catch {
    // Ignore storage cleanup failures.
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

function compactMemoryText(value: string, max = 180) {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function nextHelperMemorySummary(existing: string, displayName: string, question: string, answer: string) {
  const base = existing.trim()
    || `Prefers to be called ${displayName}. Uses Hash PayLink Agent Helper for payments, Polymarket funding, StreamPay, planning, and agent setup.`
  const lowerQuestion = question.toLowerCase()
  const topics = [
    lowerQuestion.includes('polymarket') && 'Polymarket',
    lowerQuestion.includes('stream') && 'StreamPay',
    lowerQuestion.includes('agent') && 'agent setup',
    lowerQuestion.includes('wallet') && 'wallets',
    lowerQuestion.includes('base') && 'Base',
    lowerQuestion.includes('arc') && 'Arc',
    lowerQuestion.includes('circle') && 'Circle',
    lowerQuestion.includes('0g') && '0G proofs',
    lowerQuestion.includes('payment') && 'payments',
  ].filter(Boolean).join(', ')
  const note = `Recent need: ${compactMemoryText(question, 120)}${topics ? ` (${topics})` : ''}.`
  const usefulAnswerHint = compactMemoryText(answer.split('\n').find(line => line.trim().length > 40) ?? '', 120)
  const updated = usefulAnswerHint ? `${base}\n${note} Helpful framing: ${usefulAnswerHint}` : `${base}\n${note}`
  const uniqueLines = Array.from(new Set(updated.split('\n').map(line => line.trim()).filter(Boolean)))
  return uniqueLines.slice(-8).join('\n').slice(-1600)
}

type AgentWorkspaceProps = {
  embedded?: boolean
  forceProfile?: boolean
}

export default function AgentWorkspace({ embedded = false, forceProfile = false }: AgentWorkspaceProps = {}) {
  const { onNetworkSelect } = useOutletContext<LayoutOutletContext>()
  const navigate = useNavigate()
  const { ready: privyReady, authenticated: privyAuthenticated, user: privyUser, logout: logoutPrivy, getAccessToken } = usePrivy()
  const privyEmail = emailFromPrivyUser(privyUser).trim().toLowerCase()
  const params = new URLSearchParams(window.location.search)
  const agentSlug = params.get('agent') ?? ''
  const agentStreamPrice = params.get('streamPrice') ?? ''
  const agentStreamDuration = params.get('streamDuration') ?? ''
  const shouldOpenWalletLinkPanel = params.get('linkWallet') === '1'
  const pendingRun = params.get('run') ?? ''
  const pendingScoutMode = params.get('scoutMode') ?? 'best'
  const pendingScoutContext = params.get('context') ?? ''
  const pendingScoutBudget = params.get('budget') ?? ''
  const pendingScoutMaxAmount = params.get('maxAmount') ?? '0.01'
  const hasPendingLpScoutRequest = pendingRun === 'polymarket-scout'
  const embeddedWalletManager = Boolean(!agentSlug && ((embedded && forceProfile) || params.get('walletManager') === 'service'))
  const privyManagedWalletSlug = embeddedWalletManager ? stableWalletSlugFromEmail(privyEmail) : ''
  const normalizedAgentSlug = agentSlug || privyManagedWalletSlug || (embeddedWalletManager ? '' : PLATFORM_AGENT_SLUG)
  const savedLpScoutIntent = readSavedLpScoutIntent(normalizedAgentSlug)
  const rawUrlAgentWallet = params.get('wallet') ?? params.get('e') ?? ''
  const rawExpectedAgentWallet = params.get('expectedWallet') ?? ''
  const urlAgentWallet = isEvmAddress(rawUrlAgentWallet) ? rawUrlAgentWallet : ''
  const expectedAgentWallet = isEvmAddress(rawExpectedAgentWallet) ? rawExpectedAgentWallet : ''
  const agentWallet = urlAgentWallet || (shouldOpenWalletLinkPanel ? expectedAgentWallet : '')
  const intendedAgentWallet = urlAgentWallet || expectedAgentWallet
  const [ignoreUrlAgentWallet, setIgnoreUrlAgentWallet] = useState(false)
  const urlAgentNetwork = params.get('n') ?? 'base'
  const initialAgentNetwork = isAgentTreasuryNetwork(urlAgentNetwork) ? urlAgentNetwork : 'base'
  const [agentNetwork, setAgentNetwork] = useState<AgentTreasuryNetwork>(initialAgentNetwork)
  const showHelperDemo = params.get('helper') === 'live' || params.get('helper') === 'demo' || params.get('demo') === 'ai'
  const showAgentProfile = !showHelperDemo && (forceProfile || embeddedWalletManager || params.get('profile') === 'agent' || Boolean(agentSlug || agentWallet))
  useEffect(() => {
    if (!showHelperDemo) return
    const next = new URLSearchParams({
      open: '1',
      section: 'agent-wallets',
      service: 'hashpaylink-agent',
    })
    const eventIdParam = params.get('eventId')
    const payerParam = params.get('payer')
    const telegramIdParam = params.get('telegramId') ?? params.get('tgid') ?? params.get('tid')
    const usernameParam = params.get('u') ?? params.get('username')
    if (eventIdParam) next.set('eventId', eventIdParam)
    if (payerParam) next.set('payer', payerParam)
    if (telegramIdParam) next.set('telegramId', telegramIdParam)
    if (usernameParam) next.set('u', usernameParam)
    navigate(`/telegram/payment-links?${next.toString()}`, { replace: true })
  }, [showHelperDemo, navigate]) // eslint-disable-line react-hooks/exhaustive-deps
  const sourceParam = params.get('src')
  const backHref = sourceParam === 'telegram'
    ? '/telegram/payment-links?section=agent-wallets'
    : sourceParam === 'lp-scout'
    ? '/telegram/payment-links?section=market-tools&service=lp-scout&open=1'
    : '/'
  const [eventId,    setEventId]    = useState(() => params.get('eventId') ?? '')
  const [payer,      setPayer]      = useState(() => params.get('payer')   ?? '')
  const [currentAgentWallet, setCurrentAgentWallet] = useState(agentWallet)
  const [agentWalletSessionConnected, setAgentWalletSessionConnected] = useState(false)
  const [agentWalletChain, setAgentWalletChain] = useState('')
  const [treasuryBalance, setTreasuryBalance] = useState<string | null>(null)
  const [treasuryBalanceChecked, setTreasuryBalanceChecked] = useState(false)
  const [treasuryBalanceError, setTreasuryBalanceError] = useState('')
  const [balanceRefreshNonce, setBalanceRefreshNonce] = useState(0)
  const [x402Balance, setX402Balance] = useState<string | null>(null)
  const [x402BalanceChecked, setX402BalanceChecked] = useState(false)
  const [x402BalanceError, setX402BalanceError] = useState('')
  const [x402Amount, setX402Amount] = useState('0.5')
  const [x402Busy, setX402Busy] = useState(false)
  const [x402Status, setX402Status] = useState('')
  const [x402ModalOpen, setX402ModalOpen] = useState(false)
  const [x402ActivationSuccess, setX402ActivationSuccess] = useState('')
  const [lpScoutBusy, setLpScoutBusy] = useState(false)
  const [lpScoutError, setLpScoutError] = useState('')
  const [lpScoutResult, setLpScoutResult] = useState<LpScoutRunResult | null>(null)
  const [zeroScoutBusy, setZeroScoutBusy] = useState(false)
  const [zeroScoutError, setZeroScoutError] = useState('')
  const [zeroScoutResult, setZeroScoutResult] = useState<ZeroScoutIntelligenceResult | null>(null)
  const [receiptsOpen, setReceiptsOpen] = useState(false)
  const [agentProfile, setAgentProfile] = useState<AgentProfileSummary | null>(agentSlug === PLATFORM_AGENT_SLUG || (!agentSlug && !embeddedWalletManager) ? PLATFORM_AGENT_PROFILE : null)
  const [agentProfileError, setAgentProfileError] = useState('')
  const [activity, setActivity] = useState<AgentActivity[]>([])
  const [copiedProofId, setCopiedProofId] = useState('')
  const [copiedWallet, setCopiedWallet] = useState(false)
  const [walletEmail, setWalletEmail] = useState('')
  const [walletOtp, setWalletOtp] = useState('')
  const [walletExpectedAddress, setWalletExpectedAddress] = useState('')
  const [walletChoices, setWalletChoices] = useState<WalletChoice[]>([])
  const [walletMode, setWalletMode] = useState<'choose' | 'create' | 'login'>(shouldOpenWalletLinkPanel ? 'login' : 'choose')
  const [walletStep, setWalletStep] = useState<'idle' | 'otp' | 'done'>('idle')
  const [walletOtpContext, setWalletOtpContext] = useState<{ email: string; network: AgentTreasuryNetwork } | null>(null)
  const [walletBusy, setWalletBusy] = useState(false)
  const [activityBusy, setActivityBusy] = useState(false)
  const [walletError, setWalletError] = useState<string | null>(null)
  const [showWalletAccessPanel, setShowWalletAccessPanel] = useState(shouldOpenWalletLinkPanel)

  useEffect(() => {
    if (!hasPendingLpScoutRequest) return
    const intentUrl = new URL(window.location.href)
    intentUrl.searchParams.set('profile', 'agent')
    if (embeddedWalletManager) {
      intentUrl.searchParams.delete('agent')
      intentUrl.searchParams.set('walletManager', 'service')
    } else if (normalizedAgentSlug) {
      intentUrl.searchParams.set('agent', normalizedAgentSlug)
    }
    const intent: SavedLpScoutIntent = {
      href: `${intentUrl.pathname}${intentUrl.search}${intentUrl.hash}`,
      label: scoutModeLabel(pendingScoutMode),
      savedAt: Date.now(),
    }
    if (!embeddedWalletManager && normalizedAgentSlug) intent.agentSlug = normalizedAgentSlug
    saveLpScoutIntent(intent)
  }, [hasPendingLpScoutRequest, normalizedAgentSlug, pendingScoutMode, embeddedWalletManager])

  useEffect(() => {
    if (!hasPendingLpScoutRequest || agentWalletSessionConnected) return
    setShowWalletAccessPanel(true)
    setWalletMode('login')
  }, [hasPendingLpScoutRequest, agentWalletSessionConnected])

  useEffect(() => {
    if (!privyAuthenticated) return
    let pendingMode = ''
    try { pendingMode = window.sessionStorage.getItem(AGENT_WALLET_LOGIN_INTENT_KEY) || '' } catch {}
    if (pendingMode !== 'create' && pendingMode !== 'login') return
    try { window.sessionStorage.removeItem(AGENT_WALLET_LOGIN_INTENT_KEY) } catch {}
    setShowWalletAccessPanel(true)
    setWalletMode(pendingMode)
    setWalletStep('idle')
    setWalletOtp('')
    setWalletOtpContext(null)
    setWalletError(null)
  }, [privyAuthenticated])
  const [verifying,  setVerifying]  = useState(false)
  const [verified,   setVerified]   = useState<VerifyResult | null>(null)
  const [question,   setQuestion]   = useState('')
  const [messages,   setMessages]   = useState<Message[]>([])
  const [isAsking,   setIsAsking]   = useState(false)
  const [askError,   setAskError]   = useState<string | null>(null)
  const [helperStarted, setHelperStarted] = useState(false)
  const [helperName, setHelperName] = useState(() => window.localStorage.getItem('hashpaylink-helper-name') ?? '')
  const [helperNameDraft, setHelperNameDraft] = useState(() => window.localStorage.getItem('hashpaylink-helper-name') ?? '')
  const [helperProfile, setHelperProfile] = useState<HelperProfile | null>(null)
  const [helperMemoryBusy, setHelperMemoryBusy] = useState(false)
  const helperVerifyRequestRef = useRef(0)
  const bottomRef    = useRef<HTMLDivElement>(null)
  const autoRan      = useRef(false)
  const agentPrivyRestoreKey = useRef('')
  const helperCheckpointKey = useRef('')
  useEffect(() => {
    if (!showHelperDemo) return
    setVerified(null)
    setMessages([])
    setAskError(null)
  }, [eventId, payer, showHelperDemo])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isAsking])

  async function loadHelperProfile(owner: string, fallbackOwner = '') {
    const cleanOwner = owner.trim()
    const fallback = fallbackOwner.trim()
    if (!cleanOwner && !fallback) return
    const query = new URLSearchParams()
    if (cleanOwner) query.set('owner', cleanOwner)
    if (cleanOwner) query.set('payer', cleanOwner)
    if (fallback) query.set('fallbackOwner', fallback)
    const res = await fetch(`/api/helper-profile?${query.toString()}`)
    const data = await res.json() as { ok?: boolean; profile?: HelperProfile | null }
    if (res.ok && data.ok) setHelperProfile(data.profile ?? null)
  }

  async function saveHelperProfile(action: 'save' | 'checkpoint' = 'save', memorySummaryOverride = '') {
    const displayName = (helperName || helperNameDraft || payer).trim().slice(0, 48)
    if (!displayName) return
    setHelperMemoryBusy(true)
    try {
      const memorySummary = memorySummaryOverride.trim()
        || helperProfile?.memorySummary
        || `Prefers to be called ${displayName}. Uses Hash PayLink Agent Helper for payments, Polymarket funding, StreamPay, planning, and agent setup.`
      const res = await fetch('/api/helper-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          owner: displayName,
          payer: payer || displayName,
          displayName,
          memorySummary,
        }),
      })
      const data = await res.json() as { ok?: boolean; profile?: HelperProfile | null }
      if (res.ok && data.ok) setHelperProfile(data.profile ?? null)
    } finally {
      setHelperMemoryBusy(false)
    }
  }

  useEffect(() => {
    if (!showHelperDemo) return
    const owner = helperName || payer
    if (!owner) return
    loadHelperProfile(owner, payer).catch(() => undefined)
  }, [showHelperDemo, helperName, payer])

  useEffect(() => {
    if (!showHelperDemo || !verified?.verified) return
    const owner = (helperName || payer).trim()
    if (!owner) return
    const key = `${eventId}:${owner}:${Boolean(helperProfile?.memoryProof)}`
    if (helperCheckpointKey.current === key || helperProfile?.memoryProof) return
    helperCheckpointKey.current = key
    saveHelperProfile('checkpoint').catch(() => undefined)
  }, [showHelperDemo, verified?.verified, helperName, payer, eventId, helperProfile?.memoryProof]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAgentWallet() {
    const slug = normalizedAgentSlug
    if (!slug) {
      setActivityBusy(false)
      return
    }
    setActivityBusy(true)
    try {
      const res = await fetch(`/api/agent-wallet?agent=${encodeURIComponent(slug)}`)
      if (!res.ok) return
      const data = await res.json() as { walletAddress?: string; chain?: string; connected?: boolean; activity?: AgentActivity[] }
      if (data.walletAddress) setCurrentAgentWallet(data.walletAddress)
      setAgentWalletSessionConnected(Boolean(data.connected))
      if (data.chain) setAgentWalletChain(data.chain)
      if (Array.isArray(data.activity)) setActivity(data.activity)
    } finally {
      setActivityBusy(false)
    }
  }

  useEffect(() => {
    if (!showAgentProfile) return
    loadAgentWallet()
      .catch(() => undefined)
  }, [agentSlug, normalizedAgentSlug, showAgentProfile]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false
    if (!showAgentProfile) return
    if (embeddedWalletManager) {
      setAgentProfile(null)
      setAgentProfileError('')
      return
    }
    const slug = normalizedAgentSlug || (embeddedWalletManager ? '' : PLATFORM_AGENT_SLUG)
    setAgentProfileError('')
    if (!slug) {
      setAgentProfile(null)
      return
    }
    if (slug === PLATFORM_AGENT_SLUG) {
      setAgentProfile(PLATFORM_AGENT_PROFILE)
      return
    }
    fetch(`/api/agent-profile?slug=${encodeURIComponent(slug)}`)
      .then(res => res.json() as Promise<{ ok?: boolean; agent?: AgentProfileSummary; error?: string }>)
      .then(data => {
        if (cancelled) return
        if (!data.ok || !data.agent) throw new Error(data.error || 'Agent profile unavailable.')
        setAgentProfile(data.agent)
        if (data.agent.walletAddress && !currentAgentWallet) setCurrentAgentWallet(data.agent.walletAddress)
      })
      .catch(err => {
        if (cancelled) return
        setAgentProfile(null)
        setAgentProfileError(err instanceof Error ? err.message : 'Agent profile unavailable.')
      })
    return () => { cancelled = true }
  }, [agentSlug, normalizedAgentSlug, embeddedWalletManager, showAgentProfile]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false
    if (!showAgentProfile || !PRIVY_AUTH_ENABLED || !privyAuthenticated || !privyEmail) return
    const runKey = `${agentNetwork}:${privyEmail}`
    agentPrivyRestoreKey.current = runKey
    setWalletEmail(current => current || privyEmail)
    ;(async () => {
      try {
        const token = await getAccessToken()
        if (!token || cancelled || agentPrivyRestoreKey.current !== runKey) return
        const existing = await resolvePrivyCircleLink({
          accessToken: token,
          chain: agentNetwork,
          purpose: 'agent',
        })
        if (cancelled || agentPrivyRestoreKey.current !== runKey) return
        if (existing.link?.circleWalletAddress) {
          setCurrentAgentWallet(existing.link.circleWalletAddress)
          setAgentWalletChain(existing.link.circleBlockchain)
          setWalletStep('done')
          setWalletError(null)
        }
      } catch (err) {
        console.warn('[Agent] Privy Circle agent wallet restore failed', err)
      }
    })()
    return () => { cancelled = true }
  }, [showAgentProfile, privyAuthenticated, privyEmail, agentNetwork, getAccessToken])

  useEffect(() => {
    let cancelled = false
    if (!showAgentProfile || !currentAgentWallet || !agentWalletSessionConnected) {
      setTreasuryBalance(null)
      setTreasuryBalanceChecked(true)
      setTreasuryBalanceError('')
      return
    }

    setTreasuryBalanceChecked(false)
    setTreasuryBalanceError('')
    const watchdog = window.setTimeout(() => {
      if (cancelled) return
      setTreasuryBalanceError(`${CHAIN_META[agentNetwork].label} balance is taking longer than expected. Switch network or try again.`)
      setTreasuryBalanceChecked(true)
    }, 22_000)
    queryBalances({
      evmAddress: currentAgentWallet,
      chains: [agentNetwork],
    })
      .then(result => {
        if (cancelled) return
        const row = result.rows.find(item => item.key === agentNetwork)
        if (!row || row.status === 'error') {
          setTreasuryBalanceError(readableTreasuryBalanceError(row?.error || 'Balance unavailable', row?.label || CHAIN_META[agentNetwork].label))
          return
        }
        setTreasuryBalance(String(row.balance))
      })
      .catch(error => {
        if (!cancelled) setTreasuryBalanceError(readableTreasuryBalanceError(error, CHAIN_META[agentNetwork].label))
      })
      .finally(() => {
        window.clearTimeout(watchdog)
        if (!cancelled) setTreasuryBalanceChecked(true)
      })

    return () => {
      cancelled = true
      window.clearTimeout(watchdog)
    }
  }, [agentNetwork, currentAgentWallet, showAgentProfile, balanceRefreshNonce, agentWalletSessionConnected])

  async function refreshX402Balance() {
    if (!showAgentProfile || !currentAgentWallet || !agentWalletSessionConnected) {
      setX402Balance(null)
      setX402BalanceChecked(true)
      setX402BalanceError('')
      return
    }
    setX402Balance(null)
    setX402BalanceChecked(false)
    setX402BalanceError('')
    try {
      const slug = normalizedAgentSlug
      if (!slug) throw new Error('Sign in with email before checking x402 balance.')
      const res = await fetch(`/api/agent-wallet?agent=${encodeURIComponent(slug)}&x402=1`)
      const data = await res.json() as {
        ok?: boolean
        gatewayBalance?: string
        gatewayBalanceError?: string
      }
      if (!res.ok || !data.ok) throw new Error(data.gatewayBalanceError ?? 'x402 balance unavailable')
      if (data.gatewayBalance !== undefined) setX402Balance(data.gatewayBalance)
      if (data.gatewayBalanceError) setX402BalanceError(data.gatewayBalanceError)
    } catch (err) {
      setX402BalanceError(err instanceof Error ? err.message : 'x402 balance unavailable')
    } finally {
      setX402BalanceChecked(true)
    }
  }

  async function refreshAgentBalances() {
    if (!agentWalletAccessConnected) return
    setBalanceRefreshNonce(current => current + 1)
    await Promise.all([
      refreshX402Balance(),
      loadAgentWallet(),
    ])
  }

  useEffect(() => {
    refreshX402Balance().catch(() => undefined)
  }, [normalizedAgentSlug, agentWalletSessionConnected, currentAgentWallet, showAgentProfile]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-verify when eventId + payer arrive via access link URL params
  useEffect(() => {
    if (autoRan.current) return
    const id   = params.get('eventId')
    const name = params.get('payer')
    if (id && name) {
      autoRan.current = true
      setVerifying(true)
      setVerified(null)
      fetch(`/api/agent-verify?eventId=${encodeURIComponent(id)}&payer=${encodeURIComponent(name)}`)
        .then(r => r.json() as Promise<VerifyResult>)
        .then(data => { setVerified(data); if (data.verified) setMessages([]) })
        .catch(() => setVerified({ verified: false, error: 'Verification service unreachable' }))
        .finally(() => setVerifying(false))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleVerify() {
    const cleanEventId = eventId.trim()
    const cleanPayer = payer.trim()
    if (!cleanEventId || !cleanPayer) return
    const requestId = helperVerifyRequestRef.current + 1
    helperVerifyRequestRef.current = requestId
    setVerifying(true)
    setVerified(null)
    try {
      const res  = await fetch(`/api/agent-verify?eventId=${encodeURIComponent(cleanEventId)}&payer=${encodeURIComponent(cleanPayer)}`)
      const data = await res.json() as VerifyResult
      if (requestId !== helperVerifyRequestRef.current) return
      setVerified(data)
      if (data.verified) setMessages([])
    } catch {
      if (requestId !== helperVerifyRequestRef.current) return
      setVerified({ verified: false, error: 'Verification service unreachable' })
    } finally {
      if (requestId === helperVerifyRequestRef.current) setVerifying(false)
    }
  }

  async function handleAsk() {
    if (!question.trim() || isAsking || !helperStarted) return
    const q = question.trim()
    setQuestion('')
    setAskError(null)
    setIsAsking(true)
    try {
      const res  = await fetch('/api/agent-ask', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          eventId: eventId.trim(),
          payer: payer.trim(),
          question: q,
          accessMode: 'helper-free',
          memorySummary: helperProfile?.memorySummary || undefined,
        }),
      })
      const data = await res.json() as {
        answer?: string; proof?: { ogTxHash: string; ogExplorer: string }; zeroscoutSponsorship?: ZeroScoutSponsorship; error?: string
      }
      if (!data.answer) throw new Error(data.error ?? 'No response')
      setMessages(prev => [...prev, { question: q, answer: data.answer!, proof: data.proof, zeroscoutSponsorship: data.zeroscoutSponsorship }])
      const displayName = (helperName || payer || 'Helper user').trim()
      const nextMemory = nextHelperMemorySummary(helperProfile?.memorySummary ?? '', displayName, q, data.answer)
      setHelperProfile(current => current
        ? { ...current, memorySummary: nextMemory }
        : { id: '', displayName, memorySummary: nextMemory })
      saveHelperProfile('save', nextMemory).catch(() => undefined)
    } catch (err) {
      setAskError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setIsAsking(false)
    }
  }

  function openHelperCheckout() {
    setHelperStarted(true)
  }

  function startHelper() {
    setHelperStarted(true)
    if (helperName) {
      setPayer(current => current || helperName)
    }
  }

  function saveHelperName() {
    const clean = helperNameDraft.trim().slice(0, 48)
    if (!clean) return
    window.localStorage.setItem('hashpaylink-helper-name', clean)
    setHelperName(clean)
    setPayer(current => current || clean)
    saveHelperProfile('save').catch(() => undefined)
  }

  async function copyAgentWallet() {
    if (!currentAgentWallet) return
    await navigator.clipboard.writeText(currentAgentWallet)
    setCopiedWallet(true)
    window.setTimeout(() => setCopiedWallet(false), 1600)
  }

  function handleAgentNetworkChange(next: AgentTreasuryNetwork) {
    if (next === agentNetwork) return
    if (walletStep === 'otp') {
      setWalletError('Finish this OTP login or resend OTP before changing network.')
      return
    }
    const nextParams = new URLSearchParams(window.location.search)
    nextParams.set('n', next)
    window.history.replaceState(null, '', `${window.location.pathname}?${nextParams.toString()}${window.location.hash}`)
    setAgentNetwork(next)
    setTreasuryBalance(null)
    setTreasuryBalanceChecked(false)
    setTreasuryBalanceError('')
    setBalanceRefreshNonce(current => current + 1)
    onNetworkSelect(next)
  }

  function buildAgentFundUrl() {
    const activeSlug = normalizedAgentSlug || 'x402-wallet'
    const displayName = agentProfile?.name || agentSlug || (embeddedWalletManager ? 'x402 wallet' : 'Hash PayLink Agent')
    const fundingId = `agent-${activeSlug}-fund-${Date.now().toString(36)}`
    const returnUrl = new URL('/agent', window.location.origin)
    returnUrl.searchParams.set('profile', 'agent')
    if (embeddedWalletManager) returnUrl.searchParams.set('walletManager', 'service')
    else if (activeSlug) returnUrl.searchParams.set('agent', activeSlug)
    returnUrl.searchParams.set('src', 'dashboard')
    returnUrl.searchParams.set('n', agentNetwork)
    if (currentAgentWallet) returnUrl.searchParams.set('expectedWallet', currentAgentWallet)
    const p = new URLSearchParams()
    p.set('id', fundingId)
    p.set('m', embeddedWalletManager ? `Fund Circle wallet: ${displayName}` : `Fund agent wallet: ${displayName}`)
    p.set('n', agentNetwork)
    p.set('f', '1')
    p.set('v', '1')
    p.set('x', '1')
    p.set('src', 'agent')
    if (embeddedWalletManager) {
      p.set('walletManager', 'service')
    } else {
      p.set('agent', activeSlug)
      p.set('agentSlug', activeSlug)
    }
    p.set('g', returnUrl.toString())
    p.set('ad', '1')
    if (currentAgentWallet) p.set('e', currentAgentWallet)
    return `/pay?${p.toString()}`
  }

  function handleFundAgent() {
    onNetworkSelect(agentNetwork)
  }

  function resumeSavedLpScoutIntent() {
    const intent = readSavedLpScoutIntent(normalizedAgentSlug)
    if (!intent) return false
    if (hasPendingLpScoutRequest) {
      setShowWalletAccessPanel(false)
      return true
    }
    navigate(intent.href, { replace: true })
    return true
  }

  function buildAgentStreamUrl() {
    if (!currentAgentWallet || !agentStreamPrice || !agentStreamDuration) return ''
    const displayName = agentProfile?.name || agentSlug || 'Hash PayLink Agent'
    const p = new URLSearchParams()
    p.set('app', 'streampay')
    p.set('amount', agentStreamPrice)
    p.set('recipient', currentAgentWallet)
    p.set('duration', agentStreamDuration)
    p.set('reason', `Agent retainer: ${displayName}`)
    p.set('src', 'agent')
    p.set('wallet', 'circle')
    return `/?${p.toString()}`
  }

  async function callAgentWallet(action: 'init' | 'complete', mode?: 'create' | 'login') {
    const selectedMode = mode ?? (walletMode === 'choose' ? 'login' : walletMode)
    const requiresPrivyWalletAuth = Boolean(PRIVY_AUTH_ENABLED && !currentAgentWallet)
    if (requiresPrivyWalletAuth && !privyAuthenticated) {
      try { window.sessionStorage.setItem(AGENT_WALLET_LOGIN_INTENT_KEY, selectedMode) } catch {}
      setShowWalletAccessPanel(true)
      setWalletMode(selectedMode)
      setWalletError('Sign in with Privy to continue.')
      return
    }
    setWalletMode(selectedMode)
    if (requiresPrivyWalletAuth && !privyEmail) {
      setWalletError(embeddedWalletManager ? 'Sign in with email to manage your Circle wallet.' : 'Sign in with email to manage your Circle agent wallet.')
      return
    }
    const email = (!currentAgentWallet && PRIVY_AUTH_ENABLED && privyAuthenticated && privyEmail ? privyEmail : walletEmail).trim().toLowerCase()
    if (!email) {
      setWalletError(embeddedWalletManager ? 'Enter the Circle email for this wallet.' : 'Enter the Circle email for this agent wallet.')
      return
    }
    const requestAgentSlug = agentSlug || (embeddedWalletManager ? stableWalletSlugFromEmail(email) : PLATFORM_AGENT_SLUG)
    if (!requestAgentSlug) {
      setWalletError('Enter the Circle email for this wallet.')
      return
    }
    if (email) setWalletEmail(email)
    if (action === 'complete') {
      if (!walletOtpContext) {
        setWalletError('Resend OTP and use the newest code.')
        return
      }
      if (walletOtpContext.email !== email || walletOtpContext.network !== agentNetwork) {
        setWalletOtp('')
        const contextChanged = walletOtpContext.email !== email
          ? `This code was requested for ${walletOtpContext.email}.`
          : `This code was requested for ${CHAIN_META[walletOtpContext.network].label}.`
        setWalletError(`${contextChanged} Resend OTP and use the newest code.`)
        return
      }
    }
    setWalletBusy(true)
    setWalletError(null)
    setWalletChoices([])
    try {
      const res = await fetch('/api/agent-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          agentSlug: requestAgentSlug,
          email,
          otp: walletOtp,
          testnet: agentNetwork === 'arc',
          expectedWallet: walletExpectedAddress.trim()
            || (embeddedWalletManager
              ? undefined
              : ignoreUrlAgentWallet ? currentAgentWallet || undefined : intendedAgentWallet || currentAgentWallet || undefined),
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; walletAddress?: string; chain?: string; code?: string; existingWallet?: string; newWallet?: string; availableWallets?: WalletChoice[] }
      if (data.code === 'wallet_mismatch') {
        throw new Error(`Circle returned a different wallet. Existing: ${data.existingWallet ?? 'saved wallet'}. New: ${data.newWallet ?? 'new wallet'}. Sign in with the email for the existing funded wallet, or replace it intentionally.`)
      }
      if (data.code === 'multiple_agent_wallets') {
        setWalletChoices(Array.isArray(data.availableWallets) ? data.availableWallets : [])
        throw new Error(embeddedWalletManager
          ? 'Circle found multiple wallets. Select the funded wallet below, then resend OTP and verify again.'
          : 'Circle found multiple agent wallets. Select the funded wallet below, then resend OTP and verify again.')
      }
      if (data.code === 'expected_wallet_not_found') {
        setWalletChoices(Array.isArray(data.availableWallets) ? data.availableWallets : [])
        throw new Error('That wallet was not found for this Circle email. Select one of the wallets below or sign in with the email that owns the funded wallet.')
      }
      if (data.code === 'otp_mismatch') {
        setWalletOtp('')
        throw new Error(data.error ?? 'Circle code was not accepted. Use the newest OTP from your email, or resend OTP and try again.')
      }
      if (data.code === 'otp_expired') {
        setWalletOtp('')
        throw new Error(data.error ?? 'OTP expired. Resend OTP and use the newest code.')
      }
      if (!res.ok || !data.ok) throw new Error(data.error ?? (embeddedWalletManager ? 'Circle wallet request failed' : 'Circle Agent Wallet request failed'))
      if (action === 'init') {
        setWalletOtp('')
        setWalletOtpContext({ email, network: agentNetwork })
        setWalletStep('otp')
      } else if (data.walletAddress) {
        setCurrentAgentWallet(data.walletAddress)
        if (data.chain) setAgentWalletChain(data.chain)
        setTreasuryBalance(null)
        setTreasuryBalanceChecked(false)
        setTreasuryBalanceError('')
        setWalletStep('done')
        setWalletOtpContext(null)
        setAgentWalletSessionConnected(true)
        if (hasPendingLpScoutRequest) setShowWalletAccessPanel(false)
        if (PRIVY_AUTH_ENABLED && privyAuthenticated) {
          const token = await getAccessToken()
          if (token) {
            await savePrivyCircleLink({
              accessToken: token,
              chain: agentNetwork,
              purpose: 'agent',
              email,
              wallet: {
                id: `agent:${requestAgentSlug}:${data.walletAddress.toLowerCase()}`,
                address: data.walletAddress as `0x${string}`,
                blockchain: data.chain ?? (agentNetwork === 'arc' ? 'ARC-TESTNET' : agentNetwork.toUpperCase()),
              },
            })
          }
        }
        void loadAgentWallet()
        window.setTimeout(() => {
          resumeSavedLpScoutIntent()
        }, 0)
      }
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : embeddedWalletManager ? 'Circle wallet request failed' : 'Circle Agent Wallet request failed')
    } finally {
      setWalletBusy(false)
    }
  }

  async function disconnectAgentWallet() {
    if (walletBusy) return
    setWalletBusy(true)
    setWalletError(null)
    try {
      if (currentAgentWallet || agentWalletSessionConnected) {
        const requestAgentSlug = normalizedAgentSlug || (embeddedWalletManager ? stableWalletSlugFromEmail(walletEmail || privyEmail) : PLATFORM_AGENT_SLUG)
        if (!requestAgentSlug) throw new Error('Sign in with email before disconnecting this wallet.')
        const res = await fetch('/api/agent-wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'disconnect',
            agentSlug: requestAgentSlug,
          }),
        })
        const data = await res.json() as { ok?: boolean; error?: string }
        if (!res.ok || !data.ok) throw new Error(data.error ?? 'Wallet disconnect failed')
      }
      if (PRIVY_AUTH_ENABLED && privyAuthenticated) {
        await logoutPrivy()
      }
      setIgnoreUrlAgentWallet(true)
      setCurrentAgentWallet('')
      setAgentWalletChain('')
      setTreasuryBalance(null)
      setTreasuryBalanceChecked(true)
      setTreasuryBalanceError('')
      setX402Balance(null)
      setX402BalanceChecked(true)
      setX402BalanceError('')
      setX402Status('')
      setAgentWalletSessionConnected(false)
      setWalletStep('idle')
      setWalletOtp('')
      setWalletOtpContext(null)
      setWalletMode('choose')
      setWalletEmail('')
      setWalletExpectedAddress('')
      setWalletChoices([])
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : 'Wallet disconnect failed')
    } finally {
      setWalletBusy(false)
    }
  }

  async function logoutAgentProfile() {
    if (walletBusy) return
    setWalletBusy(true)
    setWalletError(null)
    try {
      if (PRIVY_AUTH_ENABLED && privyAuthenticated) {
        await logoutPrivy()
      }
      setAgentWalletSessionConnected(false)
      setTreasuryBalance(null)
      setTreasuryBalanceChecked(true)
      setTreasuryBalanceError('')
      setX402Balance(null)
      setX402BalanceChecked(true)
      setX402BalanceError('')
      setX402Status('')
      setWalletStep('idle')
      setWalletOtp('')
      setWalletOtpContext(null)
      setWalletMode('choose')
      setWalletEmail('')
      setWalletExpectedAddress('')
      setWalletChoices([])
      setShowWalletAccessPanel(false)
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : 'Could not log out.')
    } finally {
      setWalletBusy(false)
    }
  }

  async function activateX402Balance() {
    if (!currentAgentWallet || x402Busy) return
    setX402Busy(true)
    setX402Status('')
    setX402BalanceError('')
    setX402ActivationSuccess('')
    try {
      if (agentNetwork === 'arc') throw new Error('x402 Gateway activation supports Base or Arbitrum funding. Open this agent dashboard on Base or Arbitrum to activate x402.')
      const payerAgentSlug = normalizedAgentSlug || (embeddedWalletManager ? '' : PLATFORM_AGENT_SLUG)
      if (!payerAgentSlug) throw new Error('Sign in with email before activating x402.')
      const amount = Number(x402Amount)
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid x402 amount.')
      if (amount < MIN_X402_ACTIVATION_USDC) throw new Error(`Minimum x402 top up is ${MIN_X402_ACTIVATION_USDC} USDC.`)
      const res = await fetch('/api/agent-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'gateway-deposit',
          agentSlug: payerAgentSlug,
          amount: String(amount),
          chain: agentNetwork === 'arbitrum' ? 'ARBITRUM' : 'BASE',
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; amount?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'x402 activation failed')
      const activatedAmount = data.amount ?? x402Amount
      setX402ActivationSuccess(`${activatedAmount} USDC moved into x402 service balance.`)
      setX402ModalOpen(false)
      await refreshX402Balance()
      await loadAgentWallet()
      window.setTimeout(() => {
        setX402ActivationSuccess('')
        refreshX402Balance().catch(() => undefined)
      }, 5000)
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : 'x402 activation failed'
      const friendlyMessage = /at least 0\.5|minimum|Invalid --amount/i.test(rawMessage)
        ? `Minimum x402 top up is ${MIN_X402_ACTIVATION_USDC} USDC.`
        : rawMessage.replace(/^Command failed:[\s\S]*?\n/i, '').replace(/^Error:\s*/i, '').slice(0, 180)
      setX402BalanceError(friendlyMessage)
    } finally {
      setX402Busy(false)
    }
  }

  async function runLpScoutRequest() {
    if (!agentWalletAccessConnected || lpScoutBusy) return
    setLpScoutBusy(true)
    setLpScoutError('')
    setLpScoutResult(null)
    try {
      const payerAgentSlug = normalizedAgentSlug || (embeddedWalletManager ? '' : PLATFORM_AGENT_SLUG)
      if (!payerAgentSlug) throw new Error('Sign in with email before running LP Scout.')
      const res = await fetch('/api/agent-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'pay-lp-scout',
          agentSlug: payerAgentSlug,
          sellerAgentSlug: PLATFORM_AGENT_SLUG,
          maxAmount: pendingScoutMaxAmount,
          scoutMode: pendingScoutMode,
          context: pendingScoutContext || undefined,
          budget: pendingScoutBudget || undefined,
        }),
      })
      const data = await readAgentWalletJson<LpScoutRunResult & { ok?: boolean; error?: string }>(res)
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'LP Scout x402 request failed')
      setLpScoutResult(data)
      setReceiptsOpen(true)
      clearLpScoutIntent()
      await refreshX402Balance()
      await loadAgentWallet()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'LP Scout x402 request failed'
      if (/insufficient|balance|fund|top up|deposit|gateway/i.test(message)) {
        setX402ModalOpen(true)
        refreshX402Balance().catch(() => undefined)
        setLpScoutError('x402 service balance is too low for LP Scout. Fund Circle wallet balance, activate x402 service balance, then continue.')
      } else {
        setLpScoutError(message)
      }
    } finally {
      setLpScoutBusy(false)
    }
  }

  async function generateZeroScoutBrief() {
    if (!latestScoutOutput || zeroScoutBusy) return
    setZeroScoutBusy(true)
    setZeroScoutError('')
    try {
      const payerAgentSlug = normalizedAgentSlug || (embeddedWalletManager ? '' : PLATFORM_AGENT_SLUG)
      if (!latestScoutActivity?.id) throw new Error('Refresh the agent record, then review the saved LP Scout result.')
      const res = await fetch('/api/zeroscout/polymarket-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentSlug: payerAgentSlug || undefined,
          activityId: latestScoutActivity.id,
          includeClaudeReview: true,
          includeOpenAiReview: true,
        }),
      })
      const data = await readAgentWalletJson<{ ok?: boolean; error?: string; zeroscout?: ZeroScoutIntelligenceResult }>(res)
      if (!res.ok || !data.ok || !data.zeroscout) throw new Error(data.error ?? 'ZeroScout operator signal failed')
      setZeroScoutResult(data.zeroscout)
      setReceiptsOpen(true)
      await loadAgentWallet()
    } catch (err) {
      setZeroScoutError(err instanceof Error ? err.message : 'ZeroScout operator signal failed')
    } finally {
      setZeroScoutBusy(false)
    }
  }

  const agentStreamUrl = buildAgentStreamUrl()
  const activityAmount = (item: AgentActivity) => {
    if (!item.amount) return item.direction === 'result' ? 'Result' : item.direction === 'system' ? 'Setup' : ''
    const prefix = item.direction === 'out' ? '-' : item.direction === 'in' ? '+' : ''
    return `${prefix}${item.amount} ${item.asset ?? 'USDC'}`
  }
  const activityProofTitle = (item: AgentActivity) => {
    if (!item.proof) return ''
    return JSON.stringify(item.proof, null, 2)
  }
  const copyActivityProof = async (item: AgentActivity) => {
    if (!item.proof) return
    const receiptUrl = `${window.location.origin}/receipt/${encodeURIComponent(item.id)}`
    await navigator.clipboard.writeText(JSON.stringify({
      type: 'circle_gateway_x402_receipt',
      activityId: item.id,
      receiptUrl,
      title: item.title,
      amount: item.amount ? `${item.direction === 'out' ? '-' : item.direction === 'in' ? '+' : ''}${item.amount} ${item.asset ?? 'USDC'}` : undefined,
      detail: item.detail,
      proof: item.proof,
    }, null, 2))
    setCopiedProofId(item.id)
    window.setTimeout(() => setCopiedProofId(''), 1400)
  }
  const latestZeroScoutActivity = activity.find(item => item.type === 'scout_returned' && item.result?.zeroscout)
  const latestScoutActivity = activity.find(item => item.type === 'scout_returned' && !item.result?.zeroscout)
  const latestX402Spend = activity.find(item => item.type === 'x402_spent' && item.proof?.proofHash)
  const latestScoutOutput = lpScoutResult?.response?.scout ?? latestScoutActivity?.result
  const latestZeroScout = zeroScoutResult ?? latestZeroScoutActivity?.result?.zeroscout
  const latestScoutSignals = latestScoutOutput?.signals ?? latestScoutOutput?.highlights ?? []
  const latestPrimaryOpportunity = latestScoutOutput?.opportunities?.[0]
  const lpScoutHasResult = Boolean(latestScoutOutput?.summary || latestScoutSignals.length)
  const scoutPrice = (value: number | undefined) => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : 'n/a'
  const scoutCents = (value: number | undefined) => typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(1)}c` : 'n/a'
  const selectedAgentNetworkLabel = AGENT_TREASURY_NETWORKS.find(network => network.key === agentNetwork)?.label ?? CHAIN_META[agentNetwork].label
  const treasuryBalanceNumber = treasuryBalance !== null ? Number(treasuryBalance) : null
  const x402AmountNumber = Number(x402Amount)
  const x402AmountInvalid = !Number.isFinite(x402AmountNumber) || x402AmountNumber <= 0
  const x402AmountBelowMinimum = Number.isFinite(x402AmountNumber) && x402AmountNumber > 0 && x402AmountNumber < MIN_X402_ACTIVATION_USDC
  const treasuryBalanceKnown = treasuryBalanceNumber !== null && Number.isFinite(treasuryBalanceNumber)
  const treasuryEmpty = treasuryBalanceKnown && treasuryBalanceNumber <= 0
  const x402AmountExceedsTreasury = treasuryBalanceKnown && Number.isFinite(x402AmountNumber) && x402AmountNumber > treasuryBalanceNumber
  const x402ValidationMessage = agentNetwork === 'arc'
    ? 'x402 activation currently supports Base or Arbitrum.'
    : treasuryEmpty
    ? embeddedWalletManager ? 'Fund wallet balance first, then activate x402.' : 'Fund treasury first, then activate x402.'
    : x402AmountInvalid
    ? 'Enter a valid x402 amount.'
    : x402AmountExceedsTreasury
    ? embeddedWalletManager ? 'Amount is higher than the current wallet balance.' : 'Amount is higher than the current treasury balance.'
    : x402AmountBelowMinimum
    ? `Minimum x402 top up is ${MIN_X402_ACTIVATION_USDC} USDC.`
    : ''
  const x402ActivationBlocked = Boolean(agentNetwork === 'arc' || !x402Amount || x402AmountInvalid || x402AmountBelowMinimum || treasuryEmpty || x402AmountExceedsTreasury)
  const displayAgentProfile = agentProfile ?? (agentSlug === PLATFORM_AGENT_SLUG || (!agentSlug && !embeddedWalletManager) ? PLATFORM_AGENT_PROFILE : null)
  const displayAgentName = embeddedWalletManager
    ? 'x402 Wallet Manager'
    : displayAgentProfile?.name || agentSlug || 'Your agent wallet'
  const displayAgentPurpose = hasPendingLpScoutRequest
    ? 'Selected wallet for LP Scout x402 access.'
    : embedded
    ? 'Fund USDC, activate x402, and use this wallet across Hash PayLink services.'
    : displayAgentProfile?.purpose || 'Sign in, link a Circle wallet, fund USDC, and activate x402 from the dashboard.'
  const displayAgentImage = displayAgentProfile ? resolveAgentProfileImage(displayAgentProfile) : null
  const agentEmailConnected = Boolean(PRIVY_AUTH_ENABLED && privyAuthenticated)
  const agentWalletAccessConnected = Boolean(currentAgentWallet && agentWalletSessionConnected)
  const connectedWalletNeedsAccess = Boolean(currentAgentWallet && !agentWalletAccessConnected)
  const showAgentWalletAccessPanel = Boolean(!agentWalletAccessConnected && (!currentAgentWallet || showWalletAccessPanel))
  const lpScoutAuthorizationOpen = Boolean(hasPendingLpScoutRequest && showAgentWalletAccessPanel && !agentWalletAccessConnected)
  const x402Refreshing = Boolean(agentWalletAccessConnected && !x402BalanceChecked)
  const balancesRefreshing = Boolean(agentWalletAccessConnected && (!treasuryBalanceChecked || x402Refreshing || activityBusy))
  const walletErrorMessage = walletError
    ? /invalid or expired request id/i.test(walletError)
      ? 'OTP expired. Resend OTP and use the newest code.'
      : /otp value is not matched|otp value.*not match|otp token match|invalid otp/i.test(walletError)
      ? 'Circle code was not accepted. Use the newest OTP from your email, or resend OTP and try again.'
      : walletError.replace(/^Command failed:[\s\S]*?\n/i, '').replace(/^Error:\s*/i, '').slice(0, 180)
    : ''

  useEffect(() => {
    if (!agentWalletAccessConnected) return
    setBalanceRefreshNonce(current => current + 1)
  }, [agentWalletAccessConnected])

  if (showHelperDemo) {
    return (
      <div className="mx-auto max-w-md animate-slide-up">
        <div className="rounded-xl border border-gray-100 bg-white p-4 text-sm text-gray-500 shadow-card dark:border-white/10 dark:bg-[#111114] dark:text-gray-400">
          Opening Hash PayLink Agent Helper in Telegram...
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      'mx-auto w-full min-w-0 space-y-6',
      !embedded && 'animate-slide-up',
      embedded ? 'max-w-none' : showAgentProfile ? 'max-w-[calc(100vw-2rem)] sm:max-w-md' : 'max-w-2xl',
    )}>

      {/* ── Back ──────────────────────────────────────────────────────────── */}
      {!embedded && <button
        type="button"
        onClick={() => {
          if (window.history.length > 1) navigate(-1)
          else navigate(backHref)
        }}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>}

      {showAgentProfile && (
        <div
          className="relative w-full min-w-0 overflow-hidden rounded-xl border border-gray-100 bg-white p-4 shadow-card transition-all dark:border-white/10 dark:bg-[#111114]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3 sm:gap-4">
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-black shadow-sm',
                  displayAgentImage ? 'text-white' : 'border border-gray-200 bg-gray-50 text-gray-700 dark:border-white/10 dark:bg-white/[0.08] dark:text-gray-200',
                )}
                style={{
                  background: displayAgentImage
                    ? `linear-gradient(135deg, hsl(${displayAgentImage.hue} 72% 42%), hsl(${displayAgentImage.accentHue} 72% 34%))`
                    : undefined,
                }}
              >
                {displayAgentImage?.initials ?? <Bot className="h-[18px] w-[18px]" />}
              </div>
              <div className="min-w-0 flex-1">
                {!embeddedWalletManager && (
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">x402 wallet</p>
                )}
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
                    {displayAgentName}
                  </h1>
                  <p className={cn(
                    'min-w-0 truncate text-xs text-gray-500 dark:text-gray-400',
                    currentAgentWallet && 'font-mono',
                  )}>
                    {currentAgentWallet ? compactAgentWallet(currentAgentWallet) : 'Not connected'}
                  </p>
                  {currentAgentWallet && (
                    <button
                      type="button"
                      onClick={copyAgentWallet}
                      className="relative inline-flex h-7 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 text-[11px] font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300"
                    >
                      <Copy className="h-3 w-3" />
                      Copy
                      {copiedWallet && (
                        <span className="absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[10px] font-semibold text-white shadow-lg">
                          Copied
                        </span>
                      )}
                    </button>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  {displayAgentPurpose}
                </p>
                {agentProfileError && !hasPendingLpScoutRequest && (
                  <p className="mt-1 text-[11px] font-medium text-amber-600 dark:text-amber-300">
                    {agentProfileError}
                  </p>
                )}
              </div>
            </div>
            {agentWalletAccessConnected && !hasPendingLpScoutRequest && (
              <button
                type="button"
                onClick={logoutAgentProfile}
                disabled={walletBusy}
                className="shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1] dark:hover:text-white"
              >
                {walletBusy ? 'Logging out' : 'Log out'}
              </button>
            )}
          </div>

          <div className={cn(
            'mt-4',
            !hasPendingLpScoutRequest && 'rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]',
          )}>
            {!hasPendingLpScoutRequest && savedLpScoutIntent && (
              <div className="mb-3 rounded-xl border border-emerald-100 bg-emerald-50/80 p-3 dark:border-emerald-400/20 dark:bg-emerald-400/10">
                <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">LP Scout request saved</p>
                <p className="mt-1 text-[11px] leading-relaxed text-emerald-700 dark:text-emerald-200/80">
                  Finish wallet access, then continue {savedLpScoutIntent.label.toLowerCase()} without starting over.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (agentWalletAccessConnected) {
                      resumeSavedLpScoutIntent()
                      return
                    }
                    setShowWalletAccessPanel(true)
                    setWalletMode('login')
                    setWalletStep('idle')
                    setWalletOtp('')
                    setWalletOtpContext(null)
                    setWalletError(null)
                  }}
                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-950 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-emerald-900 active:scale-[0.98] dark:bg-emerald-100 dark:text-emerald-950 dark:hover:bg-white"
                >
                  {agentWalletAccessConnected ? <ArrowRight className="h-3.5 w-3.5" /> : <Wallet className="h-3.5 w-3.5" />}
                  {agentWalletAccessConnected ? 'Continue LP Scout' : embeddedWalletManager ? 'Authorize wallet' : 'Authorize paying agent'}
                </button>
              </div>
            )}
            {!hasPendingLpScoutRequest && (
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Balance network</p>
                <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                  {agentWalletAccessConnected ? 'Balances and actions appear below.' : 'Connect wallet access to view balances.'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <select
                  value={agentNetwork}
                  onChange={event => {
                    const next = event.target.value
                    if (isAgentTreasuryNetwork(next)) handleAgentNetworkChange(next)
                  }}
                  disabled={walletStep === 'otp'}
                  className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-700 outline-none transition-colors hover:bg-gray-50 focus:border-gray-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]"
                >
                  {AGENT_TREASURY_NETWORKS.map(network => (
                    <option key={network.key} value={network.key}>
                      {network.label}
                    </option>
                  ))}
                </select>
                {agentWalletAccessConnected && (
                  <button
                    type="button"
                    onClick={() => refreshAgentBalances()}
                    disabled={balancesRefreshing || x402Busy}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]"
                    aria-label="Refresh balances"
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', balancesRefreshing && 'animate-spin')} />
                  </button>
                )}
              </div>
            </div>
            )}
            {!hasPendingLpScoutRequest && !agentWalletAccessConnected && (
              connectedWalletNeedsAccess ? (
                <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-100 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Wallet access</p>
                    <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Confirm this wallet to view balances.</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-500 dark:bg-white/[0.08] dark:text-gray-300">
                    Locked
                  </span>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-white/10">
                  <div className="flex items-center justify-between gap-4 py-1.5 first:pt-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{embeddedWalletManager ? 'Circle wallet balance' : 'Wallet treasury'}</p>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white" title={treasuryBalanceError || undefined}>
                        {currentAgentWallet
                          ? treasuryBalanceError || treasuryBalanceChecked ? 'Unavailable' : 'Checking...'
                          : 'No wallet'}
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold text-gray-400">{selectedAgentNetworkLabel}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-1.5 last:pb-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">x402 service balance</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Not connected</p>
                  </div>
                </div>
              )
            )}
            {!hasPendingLpScoutRequest && currentAgentWallet && !agentWalletAccessConnected && !connectedWalletNeedsAccess && (
              <p className="mt-3 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                Fund Circle wallet balance first. x402 activation moves part of that USDC into Circle Gateway.
              </p>
            )}
            {!hasPendingLpScoutRequest && connectedWalletNeedsAccess && !showWalletAccessPanel && (
              <div className="mt-3 rounded-lg border border-gray-100 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
                <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                  Sign in to view balances, receipts, and x402 actions.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowWalletAccessPanel(true)
                    setWalletMode('login')
                    setWalletStep('idle')
                    setWalletOtp('')
                    setWalletOtpContext(null)
                    setWalletError(null)
                  }}
                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 transition-all hover:bg-white active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]"
                >
                  <Wallet className="h-3.5 w-3.5" />
                  Sign in
                </button>
              </div>
            )}
            {!hasPendingLpScoutRequest && treasuryBalanceError && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                {treasuryBalanceError}
              </p>
            )}
            {!hasPendingLpScoutRequest && agentStreamPrice && agentStreamDuration && (
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                StreamPay retainer: {agentStreamPrice} USDC / {agentStreamDuration}
              </p>
            )}
            {hasPendingLpScoutRequest && (
              <div className="w-full min-w-0 space-y-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 dark:border-white/10 dark:bg-white/[0.05]">
                <div className="flex flex-col items-start gap-2 sm:flex-row sm:justify-between sm:gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">LP Scout</p>
                    <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{scoutModeLabel(pendingScoutMode)}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                      Pays Hash PayLink services with x402.
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-gray-500 shadow-sm dark:bg-white/[0.08] dark:text-gray-300">
                    Max {pendingScoutMaxAmount || '0.01'} USDC
                  </span>
                </div>
                {(pendingScoutContext || pendingScoutBudget) && (
                  <div className="grid gap-1 rounded-lg bg-white px-2.5 py-2 text-[11px] text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                    {pendingScoutContext && (
                      <p
                        className="overflow-hidden leading-snug"
                        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                      >
                        <span className="font-semibold">Context:</span> {pendingScoutContext}
                      </p>
                    )}
                    {pendingScoutBudget && <p className="truncate"><span className="font-semibold">Budget:</span> {pendingScoutBudget}</p>}
                  </div>
                )}

                {agentWalletAccessConnected && (
                  <div className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/[0.04] sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">x402 service balance</p>
                      <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white" title={x402BalanceError || undefined}>
                        {x402Balance !== null
                          ? `${Number(x402Balance).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`
                          : x402BalanceError || x402BalanceChecked
                          ? 'Unavailable'
                          : 'Checking...'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setX402BalanceError('')
                        setX402ActivationSuccess('')
                        setX402ModalOpen(open => !open)
                      }}
                      disabled={x402Busy || treasuryEmpty}
                      className="inline-flex w-full shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 sm:w-auto"
                    >
                      Activate x402
                    </button>
                  </div>
                )}

                {!lpScoutAuthorizationOpen && (
                  <div className="space-y-2">
                    <div className="ml-auto max-w-[88%] break-words rounded-2xl rounded-br-md bg-gray-900 px-3 py-2 text-xs leading-relaxed text-white dark:bg-white dark:text-gray-950">
                      {agentWalletAccessConnected
                        ? `Use x402 for ${scoutModeLabel(pendingScoutMode).toLowerCase()}.`
                        : `Authorize ${displayAgentProfile?.name ?? agentSlug ?? 'this agent'} for LP Scout.`}
                    </div>
                    {pendingScoutContext && (
                      <div className="ml-auto max-w-[88%] break-words rounded-2xl rounded-br-md border border-gray-200 bg-white px-3 py-2 text-xs leading-relaxed text-gray-600 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300">
                        <p
                          className="overflow-hidden"
                          style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}
                        >
                          <span className="font-semibold text-gray-900 dark:text-white">Context:</span> {pendingScoutContext}
                        </p>
                      </div>
                    )}
                    <div className="max-w-[92%] break-words rounded-2xl rounded-bl-md border border-gray-100 bg-white px-3 py-2 text-xs leading-relaxed text-gray-600 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300">
                      {!agentWalletAccessConnected
                        ? embeddedWalletManager ? 'One secure wallet session is needed. Then x402 pays and the LP result returns here.' : 'One secure agent session is needed. Then x402 pays and the LP result returns here.'
                        : lpScoutBusy
                        ? 'Working... LP Alpha paid for. Checking live rewards, spread, depth, time left, and volatility.'
                        : lpScoutHasResult
                        ? 'LP Alpha delivered.'
                        : 'Ready. I will pay with x402 and return one clear LP Scout result for human review.'}
                    </div>
                  {lpScoutHasResult && (
                    <div className="max-w-[96%] rounded-2xl rounded-bl-md border border-emerald-100 bg-white px-3 py-3 text-xs leading-relaxed text-gray-700 dark:border-emerald-400/20 dark:bg-white/[0.06] dark:text-gray-200">
                      <p className="font-semibold text-gray-900 dark:text-white">{latestScoutOutput?.summary ?? 'LP Scout returned live Polymarket data.'}</p>
                      {latestScoutSignals.length ? (
                        <div className="mt-2 space-y-1.5">
                          {latestScoutSignals.slice(0, 1).map((item, index) => (
                            <p key={`${item}-${index}`} className="rounded-lg bg-gray-50 px-2 py-1.5 text-[11px] leading-relaxed text-gray-600 dark:bg-black/10 dark:text-gray-300">{item}</p>
                          ))}
                        </div>
                      ) : null}
                      {latestPrimaryOpportunity && (
                        <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50/80 p-2.5 dark:border-white/10 dark:bg-black/10">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold text-gray-900 dark:text-white">{latestPrimaryOpportunity.title ?? 'Primary market'}</p>
                              <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                                Bid {scoutPrice(latestPrimaryOpportunity.bestBid)} / Ask {scoutPrice(latestPrimaryOpportunity.bestAsk)} / Spread {scoutCents(latestPrimaryOpportunity.liveSpread)}
                              </p>
                              {latestPrimaryOpportunity.scoutReason && (
                                <p className="mt-1 text-[10px] leading-relaxed text-gray-500 dark:text-gray-400">
                                  Why selected: {latestPrimaryOpportunity.scoutReason}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="mt-2 grid grid-cols-1 gap-1.5 text-[10px] sm:grid-cols-3">
                            <span className="rounded-lg bg-white px-2 py-1 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">YES guide {scoutPrice(latestPrimaryOpportunity.suggestedYesBid)}</span>
                            <span className="rounded-lg bg-white px-2 py-1 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">NO guide {scoutPrice(latestPrimaryOpportunity.suggestedNoBid)}</span>
                            <span className="rounded-lg bg-white px-2 py-1 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">Depth {latestPrimaryOpportunity.depthAtTwoCents ?? 'n/a'}</span>
                          </div>
                          {latestPrimaryOpportunity.marketUrl && (
                            <a
                              href={latestPrimaryOpportunity.marketUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 inline-flex w-fit items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Open market
                            </a>
                          )}
                          {latestPrimaryOpportunity.executionPlan?.length ? (
                            <div className="mt-2 space-y-1">
                              {latestPrimaryOpportunity.executionPlan.slice(0, 5).map((step, index) => (
                                <p key={`${step}-${index}`} className="text-[10px] leading-relaxed text-gray-500 dark:text-gray-400">{index + 1}. {step}</p>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )}
                      {latestScoutOutput?.nextAction && (
                        <p className="mt-2 text-[11px] font-medium text-gray-500 dark:text-gray-400">{latestScoutOutput.nextAction}</p>
                      )}
                      <p className="mt-2 text-[10px] leading-relaxed text-gray-400 dark:text-gray-500">
                        This is research for a human LP. Hash PayLink does not place, cancel, or manage Polymarket orders for you.
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                        {latestX402Spend?.proof?.proofHash && (
                          <Link
                            to={`/receipt/${encodeURIComponent(latestX402Spend.id)}`}
                            className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[10px] text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200"
                          >
                            View x402 receipt
                          </Link>
                        )}
                        {latestX402Spend?.og?.ogExplorer && (
                          <a
                            href={latestX402Spend.og.ogExplorer}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[10px] text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200"
                          >
                            0G proof
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={generateZeroScoutBrief}
                          disabled={zeroScoutBusy || !latestScoutActivity?.id}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-purple-100 bg-purple-50 px-2.5 py-1 text-[10px] text-purple-700 transition-all hover:bg-purple-100 active:scale-[0.98] disabled:opacity-50 dark:border-purple-400/20 dark:bg-purple-400/10 dark:text-purple-200"
                          title={latestScoutActivity?.id ? 'Generate a stored operator signal from this paid scout result.' : 'Refresh the agent record after LP Scout returns.'}
                        >
                          {zeroScoutBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                          ZeroScout signal
                        </button>
                      </div>
                      {zeroScoutError && (
                        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] font-medium text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                          {zeroScoutError}
                        </p>
                      )}
                      {latestZeroScout && (
                        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 rounded-xl border border-purple-100 bg-purple-50/70 px-2.5 py-2 text-[10px] font-semibold text-purple-800 dark:border-purple-400/20 dark:bg-purple-400/10 dark:text-purple-100">
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white text-purple-700 shadow-sm dark:bg-white/[0.08] dark:text-purple-100">
                            <Sparkles className="h-3 w-3" />
                          </span>
                          <span className="shrink-0">ZeroScout</span>
                          <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-purple-700 dark:bg-white/[0.08] dark:text-purple-100">
                            {latestZeroScout.intelligenceScore ?? 'n/a'}/100
                          </span>
                          {latestZeroScout.proof?.storageRoot && (
                            <span className="min-w-0 truncate rounded-full bg-white px-2 py-0.5 text-purple-700 dark:bg-white/[0.08] dark:text-purple-100">
                              {latestZeroScout.proof.storageRoot.slice(0, 10)}...
                            </span>
                          )}
                          {latestZeroScout.proof?.storageTxHash && (
                            <a
                              href={`https://chainscan.0g.ai/tx/${latestZeroScout.proof.storageTxHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 rounded-full bg-white px-2 py-0.5 text-purple-700 transition-colors hover:bg-purple-100 dark:bg-white/[0.08] dark:text-purple-100"
                            >
                              tx
                            </a>
                          )}
                          {latestZeroScout.claudeReview?.intelligenceRating && (
                            <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-purple-700 dark:bg-white/[0.08] dark:text-purple-100">
                              Claude {latestZeroScout.claudeReview.intelligenceRating}/10
                            </span>
                          )}
                          {latestZeroScout.openAiReview?.intelligenceRating && (
                            <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-purple-700 dark:bg-white/[0.08] dark:text-purple-100">
                              OpenAI {latestZeroScout.openAiReview.intelligenceRating}/10
                            </span>
                          )}
                          <details className="w-full min-w-0 pt-1">
                            <summary className="cursor-pointer text-[10px] text-purple-700/70 dark:text-purple-100/70">Details</summary>
                            <p className="mt-1 text-[10px] leading-relaxed font-medium text-purple-800/75 dark:text-purple-100/75">
                              {latestZeroScout.summary ?? 'Stored LP intelligence signal generated from supplied Hash PayLink data.'}
                            </p>
                            {latestZeroScout.riskFlags?.length ? (
                              <p className="mt-1 text-[10px] leading-relaxed font-medium text-purple-800/65 dark:text-purple-100/65">
                                Risk: {latestZeroScout.riskFlags[0]}
                              </p>
                            ) : null}
                            <p className="mt-1 text-[10px] leading-relaxed font-medium text-purple-800/55 dark:text-purple-100/55">
                              Operator signal only. Not financial advice.
                            </p>
                          </details>
                        </div>
                      )}
                    </div>
                  )}
                  </div>
                )}

                {x402ModalOpen && agentWalletAccessConnected && !x402ActivationSuccess && (
                  <div className="rounded-lg border border-gray-100 bg-white p-3 dark:border-white/10 dark:bg-white/[0.04]">
                    <p className="text-xs font-semibold text-gray-900 dark:text-white">Activate x402 service balance</p>
                    <div className="mt-2 flex h-10 max-w-[160px] min-w-0 items-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/[0.06]">
                      <input
                        value={x402Amount}
                        onChange={event => {
                          setX402BalanceError('')
                          setX402Amount(event.target.value.replace(/[^\d.]/g, ''))
                        }}
                        inputMode="decimal"
                        className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm font-semibold text-gray-900 outline-none dark:text-white"
                      />
                      <span className="border-l border-gray-200 px-2.5 text-[11px] font-semibold text-gray-400 dark:border-white/10">USDC</span>
                    </div>
                    {(x402ValidationMessage || x402BalanceError) && (
                      <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-200">{x402ValidationMessage || x402BalanceError}</p>
                    )}
                    <button
                      type="button"
                      onClick={activateX402Balance}
                      disabled={x402Busy || x402ActivationBlocked}
                      className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-gray-950"
                    >
                      {x402Busy ? <><span>Activating</span><PulsingDots /></> : 'Activate x402'}
                    </button>
                  </div>
                )}
                {x402ActivationSuccess && (
                  <p className="rounded-lg border border-emerald-100 bg-white px-3 py-2 text-xs font-medium text-emerald-700 dark:border-emerald-400/20 dark:bg-white/[0.04] dark:text-emerald-200">
                    {x402ActivationSuccess}
                  </p>
                )}
                {lpScoutError && (
                  <p className="rounded-lg border border-red-100 bg-white px-3 py-2 text-xs font-medium text-red-600 dark:border-red-400/20 dark:bg-black/10 dark:text-red-200">
                    {lpScoutError}
                  </p>
                )}
                {!lpScoutAuthorizationOpen && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (!agentWalletAccessConnected) {
                          setShowWalletAccessPanel(true)
                          setWalletMode('login')
                          setWalletStep('idle')
                          setWalletOtp('')
                          setWalletOtpContext(null)
                          setWalletError(null)
                          return
                        }
                        runLpScoutRequest()
                      }}
                      disabled={lpScoutBusy || x402Refreshing}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                    >
                      {lpScoutBusy ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Working</>
                      ) : agentWalletAccessConnected && lpScoutHasResult ? (
                        <><RefreshCw className="h-4 w-4" /> Refresh LP Alpha</>
                      ) : agentWalletAccessConnected ? (
                        <><Send className="h-4 w-4" /> Get LP Alpha</>
                      ) : (
                        <><Wallet className="h-4 w-4" /> {embeddedWalletManager ? 'Connect wallet access' : 'Connect agent session'}</>
                      )}
                    </button>
                    {agentWalletAccessConnected && lpScoutHasResult && (
                      <p className="text-center text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                        Fresh paid scout with live Polymarket data - {pendingScoutMaxAmount || '0.01'} USDC.
                      </p>
                    )}
                    {!agentWalletAccessConnected && (
                      <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                        {embeddedWalletManager
                          ? 'This only authorizes your Circle wallet for x402 service access. You are not signing into the Hash PayLink platform wallet.'
                          : 'This only authorizes the selected paying agent. You are not signing into the Hash PayLink platform wallet.'}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {showAgentWalletAccessPanel && (
            <div className="mt-4 w-full min-w-0 space-y-2 overflow-hidden rounded-xl border border-gray-200 bg-gray-50/70 p-3 transition-all dark:border-white/10 dark:bg-white/[0.04]">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {hasPendingLpScoutRequest
                    ? embeddedWalletManager ? 'Authorize wallet' : 'Authorize paying agent'
                    : currentAgentWallet
                    ? 'Wallet access'
                    : agentEmailConnected
                    ? 'Wallet access'
                    : 'Sign in'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {hasPendingLpScoutRequest
                    ? embeddedWalletManager ? 'Confirm this wallet before x402 services run.' : 'Confirm this agent before it tips Hash PayLink through x402.'
                    : currentAgentWallet
                    ? embeddedWalletManager ? 'Confirm the Circle email for this wallet to view balances and receipts.' : 'Confirm the Circle email for this agent to view balances and receipts.'
                    : agentEmailConnected
                    ? embeddedWalletManager ? 'Create or link a Circle wallet for x402 services.' : 'Create or link a Circle agent wallet.'
                    : 'Email sign-in is required before wallet setup.'}
                </p>
              </div>

              {PRIVY_AUTH_ENABLED && !currentAgentWallet && !privyAuthenticated ? (
                <>
                  <PrivyConnectButton
                    debugLabel="x402-wallet-email"
                    loginOptions={{ loginMethods: ['email'] }}
                    logoutOnAuthenticated={false}
                    onBeforeLogin={() => {
                      try { window.sessionStorage.setItem(AGENT_WALLET_LOGIN_INTENT_KEY, 'login') } catch {}
                    }}
                    disabled={walletBusy || !privyReady}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-6 py-3.5 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                  >
                    <img src="/hash-logo-transparent.png" alt="" className="h-5 w-5 object-contain invert mix-blend-screen dark:invert-0 dark:mix-blend-multiply" />
                    {currentAgentWallet ? 'Link wallet' : 'Sign in with email'}
                  </PrivyConnectButton>
                  <p className="text-center text-[11px] font-medium text-gray-400 dark:text-gray-500">
                    Privy email
                  </p>
                </>
              ) : walletMode === 'choose' ? (
                <>
                  <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.06]">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Wallet email</p>
                      <p className="mt-0.5 truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                        {PRIVY_AUTH_ENABLED ? privyEmail || 'Email session active' : 'Choose how to continue'}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setWalletMode('create')
                        setWalletStep('idle')
                        setWalletOtp('')
                        setWalletOtpContext(null)
                        setWalletError(null)
                      }}
                      disabled={walletBusy}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                    >
                      <Wallet className="h-4 w-4" />
                      Create wallet
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWalletMode('login')
                        setWalletStep('idle')
                        setWalletOtp('')
                        setWalletOtpContext(null)
                        setWalletError(null)
                      }}
                      disabled={walletBusy}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Link existing
                    </button>
                  </div>
                  <p className="text-center text-[11px] font-medium text-gray-400 dark:text-gray-500">
                    {embeddedWalletManager ? 'Circle wallet access' : 'Circle agent wallet access'}
                  </p>
                </>
              ) : (
                <div className="space-y-2">
                  {walletStep !== 'otp' && (
                    <>
                      {PRIVY_AUTH_ENABLED && !currentAgentWallet && privyAuthenticated ? (
                        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.06]">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700 dark:bg-white/[0.08] dark:text-gray-200">
                            <Wallet className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                              {walletMode === 'create' ? 'Create Circle wallet' : 'Link existing wallet'}
                            </p>
                            <p className="mt-0.5 truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                              {privyEmail || 'Email session active'}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.06]">
                          <input
                            type="email"
                            value={walletEmail}
                            onChange={e => setWalletEmail(e.target.value)}
                            placeholder="Circle email"
                            disabled={walletBusy || walletStep === 'done'}
                            className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 outline-none disabled:opacity-60 dark:text-white dark:placeholder:text-gray-500"
                          />
                        </div>
                      )}
                      {walletChoices.length > 0 && (
                        <div className="space-y-2 rounded-lg border border-amber-100 bg-amber-50/70 p-2 dark:border-amber-400/20 dark:bg-amber-400/10">
                          <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-200">Choose wallet</p>
                          {walletChoices.map(choice => (
                            <button
                              key={choice.address}
                              type="button"
                              onClick={() => {
                                setWalletExpectedAddress(choice.address)
                                setWalletError(null)
                              }}
                              className={cn(
                                'flex w-full items-center justify-between gap-3 rounded-lg border px-2.5 py-2 text-left transition-colors',
                                walletExpectedAddress.toLowerCase() === choice.address.toLowerCase()
                                  ? 'border-gray-900 bg-white text-gray-900 dark:border-white dark:bg-white/[0.12] dark:text-white'
                                  : 'border-amber-100 bg-white/80 text-gray-700 hover:bg-white dark:border-amber-400/20 dark:bg-black/10 dark:text-gray-200',
                              )}
                            >
                              <span className="min-w-0">
                                <span className="block truncate font-mono text-xs">{choice.address}</span>
                                <span className="mt-0.5 block text-[11px] text-gray-500 dark:text-gray-400">
                                  {choice.balance !== undefined ? `${Number(choice.balance).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC` : choice.balanceError || 'Balance unavailable'}
                                </span>
                              </span>
                              {walletExpectedAddress.toLowerCase() === choice.address.toLowerCase() && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                            </button>
                          ))}
                          <p className="px-1 text-[11px] leading-relaxed text-amber-700/80 dark:text-amber-200/80">
                            After choosing, resend OTP and verify again so Circle confirms this exact wallet.
                          </p>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => callAgentWallet('init')}
                        disabled={walletBusy || (!(!currentAgentWallet && PRIVY_AUTH_ENABLED && privyAuthenticated && privyEmail) && !walletEmail.trim()) || walletStep === 'done'}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-6 py-3.5 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                      >
                        {walletBusy && walletStep === 'idle'
                          ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening Circle wallet</>
                          : <><img src="/hash-logo-transparent.png" alt="" className="h-5 w-5 object-contain invert mix-blend-screen dark:invert-0 dark:mix-blend-multiply" /> {walletMode === 'create' ? 'Create wallet' : 'Send code'}</>}
                      </button>
                      <p className="text-center text-[11px] font-medium text-gray-400 dark:text-gray-500">
                        Circle will email a one-time code.
                      </p>
                    </>
                  )}

                  {walletStep === 'otp' && (
                    <div className="space-y-2">
                      <p className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] font-medium text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
                        Code sent to {walletOtpContext?.email || walletEmail || privyEmail || 'your email'} - {CHAIN_META[walletOtpContext?.network ?? agentNetwork].label} {embeddedWalletManager ? 'Circle wallet' : 'agent wallet'}
                      </p>
                      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.06]">
                        <input
                          value={walletOtp}
                          onChange={e => setWalletOtp(e.target.value.trim())}
                          placeholder="Enter Circle OTP"
                          disabled={walletBusy}
                          className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 outline-none disabled:opacity-60 dark:text-white dark:placeholder:text-gray-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => callAgentWallet('complete')}
                        disabled={walletBusy || !walletOtp.trim()}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-6 py-3.5 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                      >
                        {walletBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Verify latest code
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setWalletOtp('')
                          void callAgentWallet('init', walletMode)
                        }}
                        disabled={walletBusy || (!(!currentAgentWallet && PRIVY_AUTH_ENABLED && privyAuthenticated && privyEmail) && !walletEmail.trim())}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200"
                      >
                        Resend OTP
                      </button>
                    </div>
                  )}

                  {!currentAgentWallet && (
                    <button
                      type="button"
                      onClick={() => {
                        setWalletMode(walletMode === 'create' ? 'login' : 'create')
                        setWalletStep('idle')
                        setWalletOtp('')
                        setWalletOtpContext(null)
                        setWalletError(null)
                      }}
                      disabled={walletBusy}
                      className="text-xs font-semibold text-gray-500 transition-colors hover:text-gray-900 disabled:opacity-50 dark:text-gray-400 dark:hover:text-white"
                    >
                      {walletMode === 'create' ? 'Link existing instead' : 'Create wallet instead'}
                    </button>
                  )}
                </div>
              )}

              {walletErrorMessage && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:bg-red-950/20 dark:text-red-300">{walletErrorMessage}</p>}
              {walletStep === 'otp' && !walletError && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Use the newest email code. Resending replaces the previous code.
                </p>
              )}
            </div>
          )}

          {agentWalletAccessConnected && !hasPendingLpScoutRequest && (
            <div className="mt-4 space-y-3">
              <div className="overflow-hidden rounded-lg border border-gray-100 bg-white dark:border-white/10 dark:bg-white/[0.04]">
                <div className="flex items-center justify-between gap-3 px-3 py-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{embeddedWalletManager ? 'Circle wallet balance' : 'Treasury'}</p>
                    <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white" title={treasuryBalanceError || undefined}>
                      {treasuryBalance !== null
                        ? `${Number(treasuryBalance).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`
                        : treasuryBalanceError || treasuryBalanceChecked
                        ? 'Unavailable'
                        : 'Checking...'}
                    </p>
                  </div>
                  <Link
                    to={buildAgentFundUrl()}
                    onClick={handleFundAgent}
                    className="inline-flex h-8 min-w-[82px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-3 text-xs font-semibold text-white transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                  >
                    <ArrowRight className="h-3.5 w-3.5" /> Fund
                  </Link>
                </div>
                <div className="border-t border-gray-100 px-3 py-3 dark:border-white/10">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">x402 service balance</p>
                      <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white" title={x402BalanceError || undefined}>
                        {x402Balance !== null
                          ? `${Number(x402Balance).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`
                          : x402BalanceError || x402BalanceChecked
                          ? 'Unavailable'
                          : 'Checking...'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setX402BalanceError('')
                          setX402ActivationSuccess('')
                          setX402ModalOpen(open => !open)
                        }}
                        disabled={x402Busy || treasuryEmpty}
                        className="inline-flex h-8 min-w-[82px] items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-3 text-xs font-semibold text-white transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                      >
                        {x402Busy ? <><span>Activating</span><PulsingDots /></> : <><ArrowRight className="h-3.5 w-3.5" /> Activate</>}
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                    {embeddedWalletManager
                      ? treasuryEmpty ? 'Fund Circle wallet balance before activation.' : 'Move Circle wallet USDC into x402 service balance.'
                      : treasuryEmpty ? 'Fund treasury before activation.' : 'Activate from treasury when your agent needs API spend.'}
                  </p>
                </div>
                {(x402ModalOpen || x402ActivationSuccess) && (
                  <div className="border-t border-gray-100 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-black/10">
                    {x402ActivationSuccess ? (
                      <div className="py-2 text-center">
                        <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-200">
                          <CheckCircle2 className="h-5 w-5" />
                        </div>
                        <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">x402 activated</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{x402ActivationSuccess}</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold text-gray-900 dark:text-white">Activate x402</p>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                              {embeddedWalletManager ? 'Move USDC from Circle wallet balance into x402 service balance.' : 'Move USDC from treasury into x402 for API spend.'}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3">
                          <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-300">Amount</label>
                          <div className="flex h-10 max-w-[150px] min-w-0 items-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/[0.06]">
                            <input
                              value={x402Amount}
                              onChange={event => {
                                setX402BalanceError('')
                                setX402Amount(event.target.value.replace(/[^\d.]/g, ''))
                              }}
                              inputMode="decimal"
                              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm font-semibold text-gray-900 outline-none dark:text-white"
                            />
                            <span className="border-l border-gray-200 px-2.5 text-[11px] font-semibold text-gray-400 dark:border-white/10">USDC</span>
                          </div>
                        </div>
                        {(x402ValidationMessage || x402BalanceError) && (
                          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                            {x402ValidationMessage || x402BalanceError}
                          </p>
                        )}
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setX402ModalOpen(false)}
                            disabled={x402Busy}
                            className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={activateX402Balance}
                            disabled={x402Busy || x402ActivationBlocked}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-gray-950"
                          >
                            {x402Busy ? <><span>Activating</span><PulsingDots /></> : <><ArrowRight className="h-4 w-4" /> Activate</>}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {agentStreamUrl && (
                <a
                  href={agentStreamUrl}
                  className="inline-flex w-full items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-100"
                >
                  StreamPay
                </a>
              )}

              <div className="rounded-lg border border-gray-100 bg-white p-3 dark:border-white/10 dark:bg-white/[0.04]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-900 dark:text-white">Receipts</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {embeddedWalletManager ? 'Wallet funding, x402 activation, and Circle Gateway receipts' : 'Treasury funding, x402 activation, and Circle Gateway receipts'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setReceiptsOpen(open => !open)}
                      className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300"
                    >
                      {receiptsOpen ? 'Hide' : `View${activity.length ? ` ${Math.min(activity.length, 6)}` : ''}`}
                    </button>
                    {receiptsOpen && (
                      <button
                        type="button"
                        onClick={() => loadAgentWallet()}
                        disabled={activityBusy}
                        className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <RefreshCw className={cn('h-3 w-3', activityBusy && 'animate-spin')} />
                          {activityBusy ? 'Checking' : 'Refresh'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
                {receiptsOpen && <div className="mt-3 space-y-2">
                  {activity.length ? activity.slice(0, 6).map(item => (
                    <div key={item.id} className="grid grid-cols-[84px_1fr] gap-3 rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2 dark:border-white/10 dark:bg-black/10">
                      <div className={cn(
                        'text-xs font-semibold',
                        item.direction === 'out' ? 'text-red-500' : item.direction === 'result' ? 'text-blue-500' : item.direction === 'system' ? 'text-gray-500' : 'text-emerald-600',
                      )}>
                        {activityAmount(item)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <p className="truncate text-xs font-semibold text-gray-800 dark:text-gray-100">{item.title}</p>
                          <p className="shrink-0 text-[10px] text-gray-400">
                            {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                          {[item.network, item.detail].filter(Boolean).join(' - ')}
                        </p>
                        {(item.proof?.proofHash || item.og || item.txHash) && (
                          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                            <p
                              className="hidden"
                              title={activityProofTitle(item)}
                            >
                              Proof
                              {item.og ? ' 0G' : ''}
                              {item.proof?.provider ? ' · Circle' : ''}
                              {item.txHash || item.network?.toLowerCase().includes('arc') ? ' · Arc' : ''}
                              {item.proof?.proofHash ? ` ${item.proof.proofHash.slice(0, 12)}` : ''}
                            </p>
                            {item.proof?.proofHash && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200">
                                <ShieldCheck className="h-3 w-3" />
                                Circle x402 {item.proof.proofHash.slice(0, 10)}
                              </span>
                            )}
                            {item.proof?.proofHash && !item.og?.ogExplorer && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-gray-100 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-500">
                                <Loader2 className="h-3 w-3" />
                                0G pending
                              </span>
                            )}
                            {item.proof?.proofHash && (
                              <button
                                type="button"
                                onClick={() => copyActivityProof(item)}
                                className="shrink-0 text-[10px] font-semibold text-gray-400 transition-colors hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200"
                              >
                                {copiedProofId === item.id ? 'Copied' : 'Copy proof'}
                              </button>
                            )}
                            {item.og?.ogExplorer && (
                              <a
                                href={item.og.ogExplorer}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-purple-100 bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 transition-colors hover:bg-purple-100 dark:border-purple-400/20 dark:bg-purple-400/10 dark:text-purple-200"
                              >
                                <ShieldCheck className="h-3 w-3" />
                                0G archived
                              </a>
                            )}
                            {item.proof?.proofHash && (
                              <Link
                                to={`/receipt/${encodeURIComponent(item.id)}`}
                                className="shrink-0 text-[10px] font-semibold text-blue-600 transition-colors hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-100"
                              >
                                Receipt
                              </Link>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center dark:border-white/10">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-300">No receipts yet</p>
                      <p className="mt-1 text-xs leading-relaxed text-gray-400 dark:text-gray-500">
                        {embeddedWalletManager
                          ? 'x402 receipts appear here after your wallet pays a Circle Gateway service. Fund Circle wallet balance, activate x402 service balance, then run a paid action.'
                          : 'x402 receipts appear here after this agent pays a Circle Gateway service. Fund treasury, activate x402, then run LP Scout.'}
                      </p>
                    </div>
                  )}
                </div>}
              </div>
            </div>
          )}

          {!embedded && (
            <div className="mt-5 flex items-center justify-center gap-2 border-t border-gray-100 pt-3 text-[11px] font-semibold text-gray-400 dark:border-white/10 dark:text-gray-500">
              <img src="/brand/circle-logo.jpeg" alt="" className="h-4 w-4 rounded-full object-cover" />
              <span>
                Powered by Circle
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      {!showAgentProfile && !showHelperDemo && (
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">x402 Wallet Manager</p>
            <h1 className="mt-1 text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
              Fund wallet balance and activate x402.
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              Sign in with email, fund Circle wallet balance, activate x402 service balance, and use paid Hash PayLink services.
            </p>
          </div>
          <div className="space-y-2">
            <Link
              to="/telegram/payment-links?section=agent-wallets&service=create-your-agent&open=1"
              className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-left transition-all hover:border-gray-300 hover:bg-white active:scale-[0.99] dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-gray-700 shadow-sm dark:bg-white/[0.08] dark:text-gray-200">
                <Wallet className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">Wallet setup</span>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">Open</span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  Create or restore the email wallet used for x402 services.
                </span>
              </span>
              <ArrowRight className="h-4 w-4 text-gray-400" />
            </Link>

            <Link
              to="/telegram/payment-links?section=agent-wallets&service=agent-dashboard&open=1"
              className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-left transition-all hover:border-gray-300 hover:bg-white active:scale-[0.99] dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-gray-700 shadow-sm dark:bg-white/[0.08] dark:text-gray-200">
                <Wallet className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">Wallet dashboard</span>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">Open</span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  Open a linked wallet to fund USDC, activate x402, and view receipts.
                </span>
              </span>
              <ArrowRight className="h-4 w-4 text-gray-400" />
            </Link>

            <button
              type="button"
              disabled
              className="flex w-full cursor-not-allowed items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-3 text-left opacity-70 dark:border-white/10 dark:bg-white/[0.03]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-gray-700 shadow-sm dark:bg-white/[0.08] dark:text-gray-200">
                <Radio className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">Agent Marketplace</span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-400 dark:bg-white/[0.06]">Soon</span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  Discover public agents, paid services, and agent-to-agent workflows.
                </span>
              </span>
            </button>
          </div>
        </div>
      )}

      {!showAgentProfile && showHelperDemo && (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-card dark:border-white/10 dark:bg-[#111114]">
          <div className="border-b border-gray-100 p-4 dark:border-white/10">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-white/[0.08]">
                <Sparkles className="h-4 w-4 text-gray-800 dark:text-gray-100" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Ask Hash</p>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-600 dark:bg-emerald-300/15 dark:text-emerald-200">Open</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  A pocket AI helper for payments, Polymarket funding, StreamPay, research, planning, and daily questions.
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                ['ZeroScout', 'Sponsored'],
                ['Memory', helperMemoryBusy ? 'Saving...' : helperProfile?.memorySummary ? 'Profile saved' : 'Profile ready'],
                ['Telegram', 'Quick launch'],
              ].map(([label, body]) => (
                <div key={label} className="rounded-lg border border-gray-100 bg-gray-50 px-2 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                  <p className="text-[10px] font-bold uppercase text-gray-400">{label}</p>
                  <p className="mt-0.5 text-[11px] font-medium leading-snug text-gray-600 dark:text-gray-300">{body}</p>
                </div>
              ))}
            </div>
          </div>

          {!helperStarted ? (
            <div className="space-y-3 p-4">
              <div className="rounded-xl border border-purple-100 bg-purple-50/70 p-3 dark:border-purple-400/20 dark:bg-purple-400/10">
                <div className="flex items-center gap-2">
                  <ZeroScoutPowerBadge />
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">Open helper</p>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                  Ask Hash is open for platform help. Memory saves quietly.
                </p>
              </div>

              <button
                type="button"
                onClick={startHelper}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
              >
                {helperName ? <><ArrowRight className="h-4 w-4" /> Continue as {helperName}</> : 'Start helper'}
              </button>
            </div>
          ) : (
            <div className="space-y-3 p-4">
              {!helperName && (
                <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3 dark:border-white/10 dark:bg-white/[0.04]">
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
                        saveHelperName()
                        setHelperStarted(true)
                      }}
                      placeholder="Your name or Telegram handle"
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:focus:ring-white/10"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        saveHelperName()
                        setHelperStarted(true)
                      }}
                      disabled={!helperNameDraft.trim()}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-gray-950"
                    >
                      Continue to chat
                    </button>
                  </div>
                </div>
              )}

              {helperName && (
                <div className="overflow-hidden rounded-xl border border-gray-100 bg-white dark:border-white/10 dark:bg-white/[0.03]">
                  <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2.5 dark:border-white/10">
                    <div>
                      <p className="text-xs font-semibold text-gray-900 dark:text-white">
                        {helperName ? `Hi ${helperName}` : 'Helper is live'}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {helperMemoryBusy ? 'Saving helper memory' : helperProfile?.memorySummary ? 'Memory saved quietly' : 'Open helper'}
                      </p>
                    </div>
                    {verified?.proof?.ogExplorer && (
                      <a
                        href={verified?.proof?.ogExplorer}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-purple-100 bg-purple-50 px-2 py-1 text-[10px] font-bold text-purple-600 dark:border-purple-300/20 dark:bg-purple-300/10 dark:text-purple-200"
                      >
                        0G <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>

                  <div className="max-h-[380px] min-h-[220px] space-y-4 overflow-y-auto p-3">
                    {messages.length === 0 && !isAsking && (
                      <div className="rounded-2xl rounded-tl-md bg-gray-50 px-3 py-2.5 dark:bg-white/[0.05]">
                        <p className="text-sm text-gray-700 dark:text-gray-200">
                          {helperName ? `Welcome back, ${helperName}.` : 'Welcome.'} Ask me about payments, Polymarket funding, StreamPay, agent setup, research, planning, or daily questions.
                        </p>
                        <div className="mt-2">
                          <ZeroScoutPowerBadge compact />
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
                        </div>
                      </div>
                    ))}

                    {isAsking && (
                      <div className="inline-flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-400 dark:bg-white/[0.05]">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Thinking...
                      </div>
                    )}
                    {askError && (
                      <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">{askError}</p>
                    )}
                    <div ref={bottomRef} />
                  </div>

                  <div className="border-t border-gray-100 p-3 dark:border-white/10">
                    <div className="flex items-center gap-2">
                      <input
                        value={question}
                        onChange={event => setQuestion(event.target.value)}
                        onKeyDown={event => event.key === 'Enter' && !event.shiftKey && handleAsk()}
                        placeholder="Ask your helper..."
                        disabled={isAsking}
                        className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.05] dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={handleAsk}
                        disabled={isAsking || !question.trim()}
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
      )}

      {false && !showAgentProfile && showHelperDemo && (
        <>
      <div className="rounded-2xl border border-purple-100 bg-white p-6 shadow-sm dark:bg-[#1c1c20] dark:border-purple-900/30">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 dark:bg-purple-900/20">
            <ShieldCheck className="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-900 dark:text-white">
              Payment-Gated AI Assistant
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Access is granted only to verified payers. Payment proof is read directly
              from{' '}
              <a href="https://chainscan.0g.ai/address/0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a#events"
                target="_blank" rel="noopener noreferrer"
                className="font-medium text-purple-500 hover:underline underline-offset-2">
                0G Mainnet
              </a>
              {' '}— no central server involved.
            </p>
          </div>
        </div>

        {/* Demo shortcut */}
        <button
          onClick={() => undefined}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-purple-200 dark:border-purple-800 px-3 py-1.5 text-xs font-medium text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
        >
          <Zap className="h-3 w-3" /> Continue
        </button>
      </div>

      {/* ── Step 1 — Verify ───────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:bg-[#1c1c20] dark:border-white/10 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Step 1 — Verify your payment
        </p>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Event ID
            </label>
            <input
              value={eventId}
              onChange={e => setEventId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleVerify()}
              placeholder="e.g. test-0g-1778114523394"
              className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-3.5 py-2.5 font-mono text-xs text-gray-800 dark:text-gray-200 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-800"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Your name / payer handle
            </label>
            <input
              value={payer}
              onChange={e => setPayer(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleVerify()}
              placeholder="The name you entered when paying"
              className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-3.5 py-2.5 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-800"
            />
          </div>
        </div>

        <button
          onClick={handleVerify}
          disabled={verifying || !eventId.trim() || !payer.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-purple-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {verifying
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying on 0G…</>
            : <><ShieldCheck className="h-4 w-4" /> Verify Payment on 0G</>}
        </button>

        {/* Verification result */}
        {verified?.verified === false && (
          <div className="rounded-xl border border-red-100 bg-red-50 dark:bg-red-900/10 dark:border-red-900/20 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">No payment found</p>
            </div>
            <p className="text-xs text-red-600 dark:text-red-400">
              {verified?.error ?? 'No verified payment found on 0G Storage for this payer.'}
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 underline underline-offset-2"
            >
              Create a payment link →
            </Link>
          </div>
        )}

        {verified?.verified && verified?.payment && verified?.proof && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-900/20 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Payment verified on 0G</p>
            </div>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              {verified?.payment?.payer} · {verified?.payment?.amount} · {verified?.payment?.chain}
            </p>
            <a
              href={verified?.proof?.ogExplorer ?? '#'}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 underline underline-offset-2"
            >
              View on-chain proof <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>

      {/* ── Step 2 — Chat ─────────────────────────────────────────────────── */}
      {verified?.verified && (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm dark:bg-[#1c1c20] dark:border-white/10 overflow-hidden">
          <div className="border-b border-gray-100 dark:border-white/10 px-5 py-3.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Step 2 — Ask anything
            </p>
            <p className="mt-0.5 text-xs text-gray-400">
              Access granted · responses include verifiable 0G proof
            </p>
          </div>

          {/* Messages */}
          <div className="min-h-[200px] max-h-[400px] overflow-y-auto p-5 space-y-5">
            {messages.length === 0 && !isAsking && (
              <p className="text-center text-sm text-gray-300 dark:text-gray-600 pt-8">
                Your payment is verified. Ask anything below.
              </p>
            )}

            {messages.map((m, i) => (
              <div key={i} className="space-y-3">
                {/* Question */}
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-purple-600 px-4 py-2.5 text-sm text-white">
                    {m.question}
                  </div>
                </div>
                {/* Answer */}
                <div className="space-y-2">
                  <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-4 py-2.5 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                    {m.answer}
                  </div>
                  {/* 0G proof per message */}
                  <a
                    href={m.proof.ogExplorer}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <span className="px-1 py-0.5 rounded border bg-purple-50 text-purple-500 border-purple-100 dark:bg-purple-900/20 dark:border-purple-900/30 font-bold leading-none text-[8px]">
                      0G
                    </span>
                    Payment proof verified on 0G Mainnet <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
              </div>
            ))}

            {isAsking && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating response…
              </div>
            )}

            {askError && (
              <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 dark:bg-red-900/10 px-3 py-2">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                <p className="text-xs text-red-600">{askError}</p>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 dark:border-white/10 p-4">
            <div className="flex items-center gap-2">
              <input
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAsk()}
                placeholder="Ask anything…"
                disabled={isAsking}
                className="flex-1 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-3.5 py-2.5 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-800 disabled:opacity-50"
              />
              <button
                onClick={handleAsk}
                disabled={isAsking || !question.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white transition-all hover:bg-purple-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:bg-[#1c1c20] dark:border-white/10 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">How this works</p>
        <div className="space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
          {[
            'You pay via Hash PayLink — any chain, zero gas',
            'Payment record is uploaded to 0G decentralized storage',
            'Root hash anchored on PayLinkArchive contract (0G Mainnet)',
            'This page queries 0G Mainnet directly — no Hash PayLink server involved',
            'Payment verified → AI responds + returns on-chain proof per message',
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-purple-50 dark:bg-purple-900/20 text-[9px] font-bold text-purple-500">
                {i + 1}
              </span>
              <span>{step}</span>
            </div>
          ))}
        </div>
        <a
          href="https://chainscan.0g.ai/address/0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a#events"
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-purple-500 hover:underline underline-offset-2 pt-1"
        >
          View all archived payments on 0G Explorer <ExternalLink className="h-3 w-3" />
        </a>
      </div>

        </>
      )}

    </div>
  )
}
