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
import {
  CheckCircle2, AlertCircle, Loader2, Send,
  ExternalLink, ArrowLeft, ArrowRight, ShieldCheck, Zap,
  Wallet, Radio, Copy, Bot, Sparkles,
  RefreshCw,
} from 'lucide-react'

function emailFromPrivyUser(user: unknown) {
  const linkedAccounts = (user as { linkedAccounts?: Array<Record<string, unknown>> } | null)?.linkedAccounts ?? []
  for (const account of linkedAccounts) {
    if (account?.type === 'email' && typeof account.address === 'string') return account.address
  }
  const email = (user as { email?: { address?: string } } | null)?.email?.address
  return typeof email === 'string' ? email : ''
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
  proof:    { ogTxHash: string; ogExplorer: string }
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

type WalletChoice = {
  address: string
  balance?: string
  balanceError?: string
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
const MIN_X402_ACTIVATION_USDC = 0.5
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function AgentDemo() {
  const { onNetworkSelect } = useOutletContext<LayoutOutletContext>()
  const navigate = useNavigate()
  const { authenticated: privyAuthenticated, user: privyUser, login: loginPrivy, logout: logoutPrivy, getAccessToken } = usePrivy()
  const privyEmail = emailFromPrivyUser(privyUser).trim().toLowerCase()
  const params = new URLSearchParams(window.location.search)
  const agentSlug = params.get('agent') ?? ''
  const agentStreamPrice = params.get('streamPrice') ?? ''
  const agentStreamDuration = params.get('streamDuration') ?? ''
  const fundingSubmitted = params.get('funding') === 'submitted' || params.get('agentFunding') === '1'
  const shouldOpenWalletLinkPanel = params.get('linkWallet') === '1'
  const urlAgentWallet = params.get('wallet') ?? params.get('e') ?? ''
  const expectedAgentWallet = params.get('expectedWallet') ?? ''
  const agentWallet = urlAgentWallet || (shouldOpenWalletLinkPanel ? expectedAgentWallet : '')
  const intendedAgentWallet = urlAgentWallet || expectedAgentWallet
  const [ignoreUrlAgentWallet, setIgnoreUrlAgentWallet] = useState(false)
  const fundingEventId = params.get('fundingId') ?? params.get('eventId') ?? ''
  const fundedAmount = params.get('fundedAmount') ?? params.get('amount') ?? ''
  const urlAgentNetwork = params.get('n') ?? 'base'
  const initialAgentNetwork = isAgentTreasuryNetwork(urlAgentNetwork) ? urlAgentNetwork : 'base'
  const [agentNetwork, setAgentNetwork] = useState<AgentTreasuryNetwork>(initialAgentNetwork)
  const showHelperDemo = params.get('helper') === 'live' || params.get('helper') === 'demo' || params.get('demo') === 'ai'
  const showAgentProfile = !showHelperDemo && (params.get('profile') === 'agent' || Boolean(agentSlug || agentWallet))
  const backHref = params.get('src') === 'telegram'
    ? '/telegram/payment-links?section=agent-wallets'
    : '/'
  const [eventId,    setEventId]    = useState(() => params.get('eventId') ?? '')
  const [payer,      setPayer]      = useState(() => params.get('payer')   ?? '')
  const [currentAgentWallet, setCurrentAgentWallet] = useState(agentWallet)
  const [agentWalletSessionConnected, setAgentWalletSessionConnected] = useState(Boolean(urlAgentWallet && !shouldOpenWalletLinkPanel))
  const [agentWalletChain, setAgentWalletChain] = useState('')
  const [treasuryBalance, setTreasuryBalance] = useState<string | null>(null)
  const [treasuryBalanceChecked, setTreasuryBalanceChecked] = useState(false)
  const [treasuryBalanceError, setTreasuryBalanceError] = useState('')
  const [balanceRefreshNonce, setBalanceRefreshNonce] = useState(0)
  const [fundingNoticeVisible, setFundingNoticeVisible] = useState(fundingSubmitted)
  const [x402Balance, setX402Balance] = useState<string | null>(null)
  const [x402BalanceChecked, setX402BalanceChecked] = useState(false)
  const [x402BalanceError, setX402BalanceError] = useState('')
  const [x402Amount, setX402Amount] = useState('0.5')
  const [x402Busy, setX402Busy] = useState(false)
  const [x402Status, setX402Status] = useState('')
  const [x402ModalOpen, setX402ModalOpen] = useState(false)
  const [x402ActivationSuccess, setX402ActivationSuccess] = useState('')
  const [receiptsOpen, setReceiptsOpen] = useState(false)
  const [agentProfile, setAgentProfile] = useState<AgentProfileSummary | null>(agentSlug === PLATFORM_AGENT_SLUG || !agentSlug ? PLATFORM_AGENT_PROFILE : null)
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
  const [verifying,  setVerifying]  = useState(false)
  const [verified,   setVerified]   = useState<VerifyResult | null>(null)
  const [question,   setQuestion]   = useState('')
  const [messages,   setMessages]   = useState<Message[]>([])
  const [isAsking,   setIsAsking]   = useState(false)
  const [askError,   setAskError]   = useState<string | null>(null)
  const [helperStarted, setHelperStarted] = useState(false)
  const [helperName, setHelperName] = useState(() => window.localStorage.getItem('hashpaylink-helper-name') ?? '')
  const [helperNameDraft, setHelperNameDraft] = useState(() => window.localStorage.getItem('hashpaylink-helper-name') ?? '')
  const bottomRef    = useRef<HTMLDivElement>(null)
  const autoRan      = useRef(false)
  const agentPrivyRestoreKey = useRef('')
  const agentFundingReturnLogoutRan = useRef(false)
  const returningFromHelperPayment = Boolean(eventId && payer && showHelperDemo && !verified?.verified)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isAsking])

  async function loadAgentWallet() {
    const slug = agentSlug || 'hashpaylink-agent'
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
  }, [agentSlug, showAgentProfile]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showAgentProfile || !fundingSubmitted || !PRIVY_AUTH_ENABLED || !privyAuthenticated || agentFundingReturnLogoutRan.current) return
    agentFundingReturnLogoutRan.current = true
    setWalletEmail('')
    setWalletMode('login')
    setWalletStep('idle')
    setWalletOtp('')
    setWalletOtpContext(null)
    setShowWalletAccessPanel(true)
    logoutPrivy().catch(() => undefined)
  }, [showAgentProfile, fundingSubmitted, privyAuthenticated, logoutPrivy])

  useEffect(() => {
    let cancelled = false
    if (!showAgentProfile) return
    const slug = agentSlug || PLATFORM_AGENT_SLUG
    setAgentProfileError('')
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
  }, [agentSlug, showAgentProfile]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false
    if (!showAgentProfile || fundingSubmitted || !PRIVY_AUTH_ENABLED || !privyAuthenticated || !privyEmail) return
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
    if (!showAgentProfile || !currentAgentWallet || (PRIVY_AUTH_ENABLED && !privyAuthenticated)) {
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
  }, [agentNetwork, currentAgentWallet, showAgentProfile, balanceRefreshNonce, privyAuthenticated])

  async function refreshX402Balance() {
    if (!showAgentProfile || !currentAgentWallet || !agentWalletSessionConnected || (PRIVY_AUTH_ENABLED && !privyAuthenticated)) {
      setX402Balance(null)
      setX402BalanceChecked(true)
      setX402BalanceError('')
      return
    }
    setX402Balance(null)
    setX402BalanceChecked(false)
    setX402BalanceError('')
    try {
      const slug = agentSlug || 'hashpaylink-agent'
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

  useEffect(() => {
    refreshX402Balance().catch(() => undefined)
  }, [agentSlug, agentWalletSessionConnected, currentAgentWallet, showAgentProfile, privyAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!eventId.trim() || !payer.trim()) return
    setVerifying(true)
    setVerified(null)
    try {
      const res  = await fetch(`/api/agent-verify?eventId=${encodeURIComponent(eventId.trim())}&payer=${encodeURIComponent(payer.trim())}`)
      const data = await res.json() as VerifyResult
      setVerified(data)
      if (data.verified) setMessages([])
    } catch {
      setVerified({ verified: false, error: 'Verification service unreachable' })
    } finally {
      setVerifying(false)
    }
  }

  async function handleAsk() {
    if (!question.trim() || isAsking || !verified?.verified) return
    const q = question.trim()
    setQuestion('')
    setAskError(null)
    setIsAsking(true)
    try {
      const res  = await fetch('/api/agent-ask', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ eventId: eventId.trim(), payer: payer.trim(), question: q }),
      })
      const data = await res.json() as {
        answer?: string; proof?: { ogTxHash: string; ogExplorer: string }; error?: string
      }
      if (!data.answer || !data.proof) throw new Error(data.error ?? 'No response')
      setMessages(prev => [...prev, { question: q, answer: data.answer!, proof: data.proof! }])
    } catch (err) {
      setAskError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setIsAsking(false)
    }
  }

  function openHelperCheckout() {
    const cleanPayer = (helperName || helperNameDraft || payer || 'Helper user').trim()
    const helperEventId = `helper-${Date.now().toString(36)}`
    const returnUrl = new URL('/agent', window.location.origin)
    returnUrl.searchParams.set('helper', 'live')
    returnUrl.searchParams.set('agent', 'hashpaylink-agent')
    returnUrl.searchParams.set('src', params.get('src') || 'dashboard')

    const checkout = new URLSearchParams()
    checkout.set('e', EVM_TREASURY)
    checkout.set('a', '0.5')
    checkout.set('m', 'Hash PayLink Agent Helper Access')
    checkout.set('n', 'base')
    checkout.set('v', '1')
    checkout.set('id', helperEventId)
    checkout.set('src', 'telegram-helper')
    checkout.set('g', returnUrl.toString())
    checkout.set('ad', '1')
    if (cleanPayer) checkout.set('payer', cleanPayer)
    window.location.href = `/pay?${checkout.toString()}`
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
    const displayName = agentProfile?.name || agentSlug || 'Hash PayLink Agent'
    const fundingId = `agent-${agentSlug || 'hashpaylink'}-fund-${Date.now().toString(36)}`
    const returnUrl = new URL('/agent', window.location.origin)
    returnUrl.searchParams.set('profile', 'agent')
    returnUrl.searchParams.set('agent', agentSlug || 'hashpaylink-agent')
    returnUrl.searchParams.set('src', 'dashboard')
    returnUrl.searchParams.set('funding', 'submitted')
    returnUrl.searchParams.set('fundingId', fundingId)
    returnUrl.searchParams.set('n', agentNetwork)
    returnUrl.searchParams.set('linkWallet', '1')
    if (currentAgentWallet) returnUrl.searchParams.set('expectedWallet', currentAgentWallet)
    const p = new URLSearchParams()
    p.set('id', fundingId)
    p.set('m', `Fund agent wallet: ${displayName}`)
    p.set('n', agentNetwork)
    p.set('f', '1')
    p.set('v', '1')
    p.set('x', '1')
    p.set('src', 'agent')
    p.set('agent', agentSlug || 'hashpaylink-agent')
    p.set('agentSlug', agentSlug || 'hashpaylink-agent')
    p.set('g', returnUrl.toString())
    p.set('ad', '1')
    if (currentAgentWallet) p.set('e', currentAgentWallet)
    return `/pay?${p.toString()}`
  }

  function handleFundAgent() {
    onNetworkSelect(agentNetwork)
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
    setWalletMode(selectedMode)
    if (PRIVY_AUTH_ENABLED && !privyAuthenticated) {
      setWalletError(null)
      loginPrivy({ loginMethods: ['email'] })
      return
    }
    if (PRIVY_AUTH_ENABLED && !privyEmail) {
      setWalletError('Sign in with email to manage your Circle agent wallet.')
      return
    }
    const email = (PRIVY_AUTH_ENABLED ? privyEmail : walletEmail).trim().toLowerCase()
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
          agentSlug: agentSlug || 'hashpaylink-agent',
          email,
          otp: walletOtp,
          testnet: agentNetwork === 'arc',
          expectedWallet: walletExpectedAddress.trim()
            || (ignoreUrlAgentWallet ? currentAgentWallet || undefined : intendedAgentWallet || currentAgentWallet || undefined),
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; walletAddress?: string; chain?: string; code?: string; existingWallet?: string; newWallet?: string; availableWallets?: WalletChoice[] }
      if (data.code === 'wallet_mismatch') {
        throw new Error(`Circle returned a different wallet. Existing: ${data.existingWallet ?? 'saved wallet'}. New: ${data.newWallet ?? 'new wallet'}. Sign in with the email for the existing funded wallet, or replace it intentionally.`)
      }
      if (data.code === 'multiple_agent_wallets') {
        setWalletChoices(Array.isArray(data.availableWallets) ? data.availableWallets : [])
        throw new Error('Circle found multiple agent wallets. Select the funded wallet below, then resend OTP and verify again.')
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
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Circle Agent Wallet request failed')
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
        if (PRIVY_AUTH_ENABLED && privyAuthenticated) {
          const token = await getAccessToken()
          if (token) {
            await savePrivyCircleLink({
              accessToken: token,
              chain: agentNetwork,
              purpose: 'agent',
              email,
              wallet: {
                id: `agent:${agentSlug || 'hashpaylink-agent'}:${data.walletAddress.toLowerCase()}`,
                address: data.walletAddress as `0x${string}`,
                blockchain: data.chain ?? (agentNetwork === 'arc' ? 'ARC-TESTNET' : agentNetwork.toUpperCase()),
              },
            })
          }
        }
        void loadAgentWallet()
      }
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : 'Circle Agent Wallet request failed')
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
        const res = await fetch('/api/agent-wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'disconnect',
            agentSlug: agentSlug || 'hashpaylink-agent',
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
      const amount = Number(x402Amount)
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid x402 amount.')
      if (amount < MIN_X402_ACTIVATION_USDC) throw new Error(`Minimum x402 top up is ${MIN_X402_ACTIVATION_USDC} USDC.`)
      const res = await fetch('/api/agent-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'gateway-deposit',
          agentSlug: agentSlug || 'hashpaylink-agent',
          amount: String(amount),
          chain: agentNetwork === 'arbitrum' ? 'ARBITRUM' : 'BASE',
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; amount?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'x402 activation failed')
      const activatedAmount = data.amount ?? x402Amount
      setX402Status(`${activatedAmount} USDC added to x402.`)
      setX402ActivationSuccess(`${activatedAmount} USDC added to x402.`)
      await refreshX402Balance()
      await loadAgentWallet()
      window.setTimeout(() => {
        setX402ActivationSuccess('')
      }, 3000)
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
    ? 'Fund treasury first, then activate x402.'
    : x402AmountInvalid
    ? 'Enter a valid x402 amount.'
    : x402AmountExceedsTreasury
    ? 'Amount is higher than the current treasury balance.'
    : x402AmountBelowMinimum
    ? `Minimum x402 top up is ${MIN_X402_ACTIVATION_USDC} USDC.`
    : ''
  const x402ActivationBlocked = Boolean(agentNetwork === 'arc' || !x402Amount || x402AmountInvalid || x402AmountBelowMinimum || treasuryEmpty || x402AmountExceedsTreasury)
  const displayAgentProfile = agentProfile ?? (agentSlug === PLATFORM_AGENT_SLUG || !agentSlug ? PLATFORM_AGENT_PROFILE : null)
  const displayAgentName = displayAgentProfile?.name || agentSlug || 'Your agent wallet'
  const displayAgentPurpose = displayAgentProfile?.purpose || 'Sign in, link a Circle agent wallet, fund treasury, and activate x402 from the dashboard.'
  const displayAgentImage = displayAgentProfile ? resolveAgentProfileImage(displayAgentProfile) : null
  const agentEmailConnected = Boolean(PRIVY_AUTH_ENABLED && privyAuthenticated)
  const agentWalletAccessConnected = Boolean(currentAgentWallet && agentWalletSessionConnected && (!PRIVY_AUTH_ENABLED || privyAuthenticated))
  const connectedWalletNeedsAccess = Boolean(currentAgentWallet && !agentWalletAccessConnected)
  const showAgentWalletAccessPanel = Boolean(!agentWalletAccessConnected && (!currentAgentWallet || showWalletAccessPanel))
  const x402Refreshing = Boolean(agentWalletAccessConnected && !x402BalanceChecked)
  const walletErrorMessage = walletError
    ? /invalid or expired request id/i.test(walletError)
      ? 'OTP expired. Resend OTP and use the newest code.'
      : /otp value is not matched|otp value.*not match|otp token match|invalid otp/i.test(walletError)
      ? 'Circle code was not accepted. Use the newest OTP from your email, or resend OTP and try again.'
      : walletError.replace(/^Command failed:[\s\S]*?\n/i, '').replace(/^Error:\s*/i, '').slice(0, 180)
    : ''

  useEffect(() => {
    if (!agentWalletAccessConnected) return
    if (fundingNoticeVisible) setFundingNoticeVisible(false)
    setBalanceRefreshNonce(current => current + 1)
  }, [agentWalletAccessConnected]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={cn('mx-auto animate-slide-up space-y-6', showAgentProfile || showHelperDemo ? 'max-w-md' : 'max-w-2xl')}>

      {/* ── Back ──────────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => {
          if (window.history.length > 1) navigate(-1)
          else navigate(backHref)
        }}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      {showAgentProfile && (
        <div
          className="relative rounded-xl border border-gray-100 bg-white p-4 shadow-card transition-all dark:border-white/10 dark:bg-[#111114]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3 sm:gap-4">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-black text-white shadow-sm"
                style={{
                  background: displayAgentImage
                    ? `linear-gradient(135deg, hsl(${displayAgentImage.hue} 72% 42%), hsl(${displayAgentImage.accentHue} 72% 34%))`
                    : undefined,
                }}
              >
                {displayAgentImage?.initials ?? <Bot className="h-[18px] w-[18px]" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Agent wallet</p>
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
                {agentProfileError && (
                  <p className="mt-1 text-[11px] font-medium text-amber-600 dark:text-amber-300">
                    {agentProfileError}
                  </p>
                )}
              </div>
            </div>
            {agentWalletAccessConnected && (
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

          <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Balance network</p>
                <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Check where this wallet holds USDC.</p>
              </div>
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
            </div>
            <div className="divide-y divide-gray-100 dark:divide-white/10">
              <div className="flex items-center justify-between gap-4 py-1.5 first:pt-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Wallet treasury</p>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white" title={treasuryBalanceError || undefined}>
                    {treasuryBalance !== null
                      ? `${Number(treasuryBalance).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`
                      : connectedWalletNeedsAccess
                      ? 'Sign in to view'
                      : currentAgentWallet
                      ? treasuryBalanceError || treasuryBalanceChecked ? 'Unavailable' : 'Checking...'
                      : 'No wallet'}
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold text-gray-400">{selectedAgentNetworkLabel}</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 py-1.5 last:pb-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">x402</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white" title={x402BalanceError || undefined}>
                  {x402Balance !== null
                    ? `${Number(x402Balance).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`
                    : agentWalletAccessConnected
                    ? x402BalanceError || x402BalanceChecked ? 'Unavailable' : 'Checking...'
                    : 'Not connected'}
                </p>
              </div>
            </div>
            {currentAgentWallet && (
              <p className="mt-3 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                Fund the wallet treasury first. x402 activation moves part of that funded balance into Circle Gateway.
              </p>
            )}
            {connectedWalletNeedsAccess && !showWalletAccessPanel && (
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
            {fundingNoticeVisible && !agentWalletAccessConnected && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2 dark:border-emerald-400/15 dark:bg-emerald-400/10">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-100">
                    Funding submitted{fundedAmount ? ` - ${fundedAmount} USDC` : ''}
                  </p>
                  {fundingEventId && (
                    <p className="mt-1 truncate font-mono text-[9px] text-emerald-700/60 dark:text-emerald-200/60">{fundingEventId}</p>
                  )}
                </div>
              </div>
            )}
            {treasuryBalanceError && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                {treasuryBalanceError}
              </p>
            )}
            {agentStreamPrice && agentStreamDuration && (
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                StreamPay retainer: {agentStreamPrice} USDC / {agentStreamDuration}
              </p>
            )}
          </div>

          {showAgentWalletAccessPanel && (
            <div className="mt-4 space-y-2 rounded-xl border border-gray-200 bg-gray-50/70 p-3 transition-all dark:border-white/10 dark:bg-white/[0.04]">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {currentAgentWallet ? 'Link wallet' : agentEmailConnected ? 'Link wallet' : 'Sign in'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {currentAgentWallet
                    ? 'Link this Circle agent wallet before balances, receipts, and x402 actions appear.'
                    : agentEmailConnected
                    ? 'Create or link a Circle agent wallet.'
                    : 'Email sign-in is required before wallet setup.'}
                </p>
              </div>

              {PRIVY_AUTH_ENABLED && !privyAuthenticated ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setWalletMode('login')
                      setWalletStep('idle')
                      setWalletOtp('')
                      setWalletOtpContext(null)
                      setWalletError(null)
                      loginPrivy({ loginMethods: ['email'] })
                    }}
                    disabled={walletBusy}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-6 py-3.5 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                  >
                    <img src="/hash-logo-transparent.png" alt="" className="h-5 w-5 object-contain invert mix-blend-screen" />
                    {currentAgentWallet ? 'Link wallet' : 'Sign in with email'}
                  </button>
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
                    Circle agent wallet access
                  </p>
                </>
              ) : (
                <div className="space-y-2">
                  {walletStep !== 'otp' && (
                    <>
                      {PRIVY_AUTH_ENABLED && privyAuthenticated ? (
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
                            placeholder="Enter your email"
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
                        disabled={walletBusy || (!PRIVY_AUTH_ENABLED && !walletEmail.trim()) || walletStep === 'done'}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-6 py-3.5 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                      >
                        {walletBusy && walletStep === 'idle'
                          ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening Circle wallet</>
                          : <><img src="/hash-logo-transparent.png" alt="" className="h-5 w-5 object-contain invert mix-blend-screen" /> {walletMode === 'create' ? 'Create wallet' : 'Link wallet'}</>}
                      </button>
                      <p className="text-center text-[11px] font-medium text-gray-400 dark:text-gray-500">
                        Circle will email a one-time code for this wallet session.
                      </p>
                    </>
                  )}

                  {walletStep === 'otp' && (
                    <div className="space-y-2">
                      <p className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] font-medium text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
                        Code sent to {walletOtpContext?.email || walletEmail || privyEmail || 'your email'} · {CHAIN_META[walletOtpContext?.network ?? agentNetwork].label} agent wallet
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
                        disabled={walletBusy || (!PRIVY_AUTH_ENABLED && !walletEmail.trim())}
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

          {agentWalletAccessConnected && (
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-gray-100 bg-white p-3 dark:border-white/10 dark:bg-white/[0.04]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-900 dark:text-white">Treasury</p>
                    <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white" title={treasuryBalanceError || undefined}>
                      {treasuryBalance !== null
                        ? `${Number(treasuryBalance).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`
                        : treasuryBalanceError || treasuryBalanceChecked
                        ? 'Unavailable'
                        : 'Checking...'}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                      Fund this wallet first. x402 activation uses this balance.
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
              </div>

              <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-900 dark:text-white">x402</p>
                    <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white" title={x402BalanceError || undefined}>
                      {x402Balance !== null
                        ? `${Number(x402Balance).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`
                        : x402BalanceError || x402BalanceChecked
                        ? 'Unavailable'
                        : 'Checking...'}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                      {treasuryEmpty ? 'Fund treasury before activation.' : 'Activate from treasury when your agent needs API spend.'}
                    </p>
                    {x402Status && (
                      <p className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-300">
                        {x402Status}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <button
                      type="button"
                      onClick={() => refreshX402Balance()}
                      disabled={x402Busy || x402Refreshing}
                      className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300"
                    >
                      {x402Refreshing ? 'Checking' : 'Refresh'}
                    </button>
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
                {(x402ModalOpen || x402ActivationSuccess) && (
                  <div className="mt-3 rounded-lg border border-gray-100 bg-white p-3 dark:border-white/10 dark:bg-black/10">
                    {x402ActivationSuccess ? (
                      <div className="py-2 text-center">
                        <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-200">
                          <CheckCircle2 className="h-5 w-5" />
                        </div>
                        <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">Top up successful</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{x402ActivationSuccess}</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold text-gray-900 dark:text-white">Activate x402</p>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                              Move USDC from treasury into x402 for API spend.
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
                    <p className="text-xs text-gray-500 dark:text-gray-400">Treasury funding, x402 activation, and Circle Gateway receipts</p>
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
                        x402 receipts appear here after this agent pays a Circle Gateway service. Fund treasury, activate x402, then run LP Scout.
                      </p>
                    </div>
                  )}
                </div>}
              </div>
            </div>
          )}

          <div className="mt-5 flex items-center justify-center gap-2 border-t border-gray-100 pt-3 text-[11px] font-semibold text-gray-400 dark:border-white/10 dark:text-gray-500">
            <img src="/brand/circle-logo.jpeg" alt="" className="h-4 w-4 rounded-full object-cover" />
            <span>
              Powered by Circle
            </span>
          </div>
        </div>
      )}

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      {!showAgentProfile && !showHelperDemo && (
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Agent Dashboard</p>
            <h1 className="mt-1 text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
              Manage agents, balances, and paid helpers.
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              Set up agent wallets, fund treasury, activate x402 from treasury balance, and launch paid agent services from one place.
            </p>
          </div>
          <div className="space-y-2">
            <Link
              to={`/agent?helper=live&agent=${PLATFORM_AGENT_SLUG}&src=dashboard`}
              className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-left transition-all hover:border-gray-300 hover:bg-white active:scale-[0.99] dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-gray-700 shadow-sm dark:bg-white/[0.08] dark:text-gray-200">
                <Bot className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{PLATFORM_AGENT_PROFILE.name}</span>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">Open</span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  {PLATFORM_AGENT_PROFILE.purpose}
                </span>
              </span>
              <ExternalLink className="h-4 w-4 text-gray-400" />
            </Link>

            <button
              type="button"
              disabled
              className="flex w-full cursor-not-allowed items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-3 text-left opacity-70 dark:border-white/10 dark:bg-white/[0.03]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-gray-700 shadow-sm dark:bg-white/[0.08] dark:text-gray-200">
                <Wallet className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">Agent Setup</span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-400 dark:bg-white/[0.06]">Next</span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  Name, purpose, Circle email login, wallet setup, and reusable agent profile.
                </span>
              </span>
            </button>

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
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Hash PayLink Agent Helper</p>
                  <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold uppercase text-purple-600 dark:bg-purple-300/15 dark:text-purple-200">0.5 USDC</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  A pocket AI helper for payments, Polymarket funding, StreamPay, research, planning, and daily questions.
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                ['0G proof', 'Access receipts'],
                ['Memory', 'Checkpoint next'],
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
                  <span className="rounded-md border border-purple-100 bg-white px-1.5 py-0.5 text-[10px] font-black text-purple-600 dark:border-purple-300/20 dark:bg-white/[0.08] dark:text-purple-200">0G</span>
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">Built on verifiable access</p>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                  Helper access is verified from 0G payment proofs. Personal profile memory starts locally here, then moves to approved 0G memory checkpoints in the next backend batch.
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
                        window.setTimeout(openHelperCheckout, 0)
                      }}
                      placeholder="Your name or Telegram handle"
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:focus:ring-white/10"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        saveHelperName()
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
                      {returningFromHelperPayment
                        ? 'Payment received. Verifying your 0G access receipt now.'
                        : 'Pay 0.5 USDC once to unlock the helper.'}
                    </p>
                  </div>
                  {returningFromHelperPayment && (
                    <div className="flex items-center gap-2 rounded-xl border border-purple-100 bg-purple-50 px-3 py-2.5 text-xs font-medium text-purple-700 dark:border-purple-300/20 dark:bg-purple-300/10 dark:text-purple-200">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Redirecting shortly while 0G verifies access
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={openHelperCheckout}
                    disabled={returningFromHelperPayment || (!helperName && !helperNameDraft.trim())}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                  >
                    Continue to payment
                  </button>
                  {verified && !verified.verified && (
                    <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">
                      {returningFromHelperPayment
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

                  <div className="max-h-[380px] min-h-[220px] space-y-4 overflow-y-auto p-3">
                    {messages.length === 0 && !isAsking && (
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
