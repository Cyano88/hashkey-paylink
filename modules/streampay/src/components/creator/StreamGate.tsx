import { useCallback, useEffect, useRef, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useSearchParams }    from 'react-router-dom'
import { useAccount, useChainId, useSwitchChain, useWriteContract } from 'wagmi'
import { useQuery }           from '@tanstack/react-query'
import { createPublicClient, http, defineChain, parseAbi, keccak256, toBytes } from 'viem'
import { usePoAStream }       from '../../hooks/usePoAStream'
import { usePasskey }         from '../../hooks/usePasskey'
import { STREAM_VAULT_ABI }   from '../../lib/streamVaultAbi'
import { CHECKPOINT_VAULT_FACTORY_ABI } from '../../lib/checkpointVaultAbi'
import { PRIVY_AUTH_ENABLED } from '../../../../../src/lib/authMode'
import { resolvePrivyCircleLink } from '../../../../../src/lib/privyCircleLink'
import {
  connectCircleEvmEmailWallet,
  sendCircleArcCheckpointRefund,
  sendCircleArcCheckpointVault,
  type CircleEvmEmailSession,
} from '../../../../../src/lib/circleEvmEmailWallet'
import {
  createPaymentReceiptPdf,
  createX402PaylinkReceipt,
  paymentReceiptFileName,
  type X402ReceiptLike,
} from '../../../../../src/lib/paymentReceiptPdf'

// ── Arc standalone client ─────────────────────────────────────────────────────
const arcClient = createPublicClient({
  chain: defineChain({
    id:             5042002,
    name:           'Arc Testnet',
    nativeCurrency: { decimals: 18, name: 'USD Coin', symbol: 'USDC' },
    rpcUrls:        { default: { http: ['https://rpc.testnet.arc.network'] } },
  }),
  transport: http('https://rpc.testnet.arc.network'),
})

const ARC_CHAIN_ID = 5042002
const ARC_USDC     = '0x3600000000000000000000000000000000000000' as const
const POA_CONTRACT = (import.meta.env.VITE_POA_CONTRACT ?? '') as `0x${string}`
const CHECKPOINT_FACTORY_ADDRESS = (import.meta.env.VITE_CHECKPOINT_FACTORY_ADDRESS ?? '') as `0x${string}`
const POLYMARKET_LOGO = '/brand/polymarket-logo.png'

const ERC20_ABI = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
])

type FetchedContent = { type: 'text' | 'url' | 'scores' | 'book'; content: string; coverImage?: string }
type ContentState   = 'idle' | 'loading' | 'ready' | 'error'
type CreatorReaction = 'up' | 'down'
type CreatorComment = {
  id: string
  walletAddress: string
  body: string
  createdAt: number
  upCount: number
  downCount: number
  myReaction: CreatorReaction | null
}
type CreatorSocialState = {
  upCount: number
  downCount: number
  myReaction: CreatorReaction | null
  comments: CreatorComment[]
}
type StreamMeterSnapshot = {
  totalAmount: bigint
  alreadyWithdrawn: bigint
  unlocked: bigint
  claimable: bigint
  cancelled: boolean
}
type WorldCupScoreMatch = {
  fixtureId?: string
  tag: string
  title: string
  time: string
  kickoffAt?: string
  status: string
  homeScore?: number | string
  awayScore?: number | string
  clock?: string
  probability?: string
  polymarketUrl?: string
  marketStatus?: 'matched' | 'pending'
}
type WorldCupScoreFeed = {
  ok?: boolean
  providerConfigured?: boolean
  providerStatus?: string
  displayDate?: string
  updatedAt?: string
  matches?: WorldCupScoreMatch[]
}
type AgentProfile = {
  slug: string
  name: string
  purpose?: string
  walletAddress?: string
}
type AgentWalletStatus = {
  ok?: boolean
  found?: boolean
  connected?: boolean
  source?: 'env' | 'store'
  walletAddress?: string
  balance?: string
  balanceError?: string
  balanceChecked?: boolean
  gatewayBalance?: string
  gatewayBalanceError?: string
  gatewayBalanceChecked?: boolean
}
type AgentOption = AgentProfile & {
  connected?: boolean
  balance?: string
  balanceError?: string
  balanceChecked?: boolean
  fundingBalance?: string
  fundingBalanceChecked?: boolean
  fundingBalanceError?: string
  gatewayBalance?: string
  gatewayBalanceError?: string
  gatewayBalanceChecked?: boolean
  source?: 'platform' | 'saved' | 'linked' | 'env' | 'store'
}
type UnlockStep = 'intro' | 'choose' | 'email' | 'otp' | 'fund'
const CREATOR_X402_GATEWAY_LABEL = 'Arc Testnet'

function hasWorldCupScore(match: WorldCupScoreMatch) {
  const home = String(match.homeScore ?? '').trim().toLowerCase()
  const away = String(match.awayScore ?? '').trim().toLowerCase()
  return Boolean(home && away && home !== 'undefined' && away !== 'undefined' && home !== 'null' && away !== 'null')
}

function readableWorldCupClock(value?: string) {
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

function worldCupCountdown(match: WorldCupScoreMatch) {
  const source = match.kickoffAt || match.time
  const ts = Date.parse(source)
  if (!Number.isFinite(ts)) return 'Countdown'
  const diffMs = ts - Date.now()
  if (diffMs <= 0) return 'Starting'
  const totalSeconds = Math.ceil(diffMs / 1000)
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (days > 0) return `${days} ${days === 1 ? 'day' : 'days'} ${hours} ${hours === 1 ? 'hr' : 'hrs'}`
  if (hours > 0) return `${hours} ${hours === 1 ? 'hr' : 'hrs'} ${minutes} ${minutes === 1 ? 'min' : 'mins'}`
  return `${Math.max(1, minutes)} ${minutes === 1 ? 'min' : 'mins'}`
}

function worldCupMatchDisplayState(match: WorldCupScoreMatch) {
  const status = `${match.status} ${match.tag || ''}`.toLowerCase()
  const scored = hasWorldCupScore(match)
  const matchTime = Date.parse(match.kickoffAt || match.time)
  const isPast = Number.isFinite(matchTime) && matchTime < Date.now() - 90 * 60 * 1000
  const clock = readableWorldCupClock(match.clock)
  if (/(live|inplay|in play|1h|2h|1st|2nd|first half|second half|et)/.test(status)) {
    return { tag: 'LIVE', center: scored ? `${match.homeScore}-${match.awayScore}` : 'Live', sub: clock || 'Live' }
  }
  if (/(half|ht)/.test(status)) {
    return { tag: 'HT', center: scored ? `${match.homeScore}-${match.awayScore}` : 'HT', sub: clock || 'Half time' }
  }
  if ((scored && /(ft|full time|full-time|finished|result|complete|ended|after extra time|pen)/.test(status)) || (scored && isPast)) {
    return { tag: 'FT', center: `${match.homeScore}-${match.awayScore}`, sub: clock || 'Full time' }
  }
  return { tag: 'NS', center: 'vs', sub: worldCupCountdown(match) }
}

function todayMatchdayKey() {
  return new Date().toISOString().slice(0, 10)
}

const ALLOWED_ARTICLE_TAGS = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'H2', 'H3', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'A', 'CODE', 'PRE'])

function sanitizeArticleHtml(input: string) {
  if (typeof window === 'undefined') return input
  const doc = new DOMParser().parseFromString(`<div>${input || ''}</div>`, 'text/html')
  const root = doc.body.firstElementChild || doc.createElement('div')

  function clean(node: Node): Node | null {
    if (node.nodeType === Node.TEXT_NODE) return doc.createTextNode(node.textContent || '')
    if (node.nodeType !== Node.ELEMENT_NODE) return null

    const element = node as HTMLElement
    if (!ALLOWED_ARTICLE_TAGS.has(element.tagName)) {
      const fragment = doc.createDocumentFragment()
      Array.from(element.childNodes).forEach(child => {
        const cleaned = clean(child)
        if (cleaned) fragment.appendChild(cleaned)
      })
      return fragment
    }

    const tagName =
      element.tagName === 'B' ? 'strong' :
      element.tagName === 'I' ? 'em' :
      element.tagName.toLowerCase()
    const next = doc.createElement(tagName)
    if (element.tagName === 'A') {
      const href = element.getAttribute('href') || ''
      try {
        const url = new URL(href, window.location.origin)
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          next.setAttribute('href', url.href)
          next.setAttribute('target', '_blank')
          next.setAttribute('rel', 'noopener noreferrer')
        }
      } catch {
        // Keep text, drop unsafe href.
      }
    }
    Array.from(element.childNodes).forEach(child => {
      const cleaned = clean(child)
      if (cleaned) next.appendChild(cleaned)
    })
    return next
  }

  const output = doc.createElement('div')
  Array.from(root.childNodes).forEach(child => {
    const cleaned = clean(child)
    if (cleaned) output.appendChild(cleaned)
  })
  return output.innerHTML
}

function showCopyToast(message: string) {
  if (typeof document === 'undefined') return
  const existing = document.getElementById('creator-code-copy-toast')
  if (existing) existing.remove()
  const toast = document.createElement('div')
  toast.id = 'creator-code-copy-toast'
  toast.textContent = message
  toast.style.cssText = [
    'position:fixed',
    'left:50%',
    'bottom:22px',
    'transform:translateX(-50%)',
    'z-index:9999',
    'max-width:calc(100vw - 32px)',
    'border-radius:10px',
    'background:#111827',
    'color:#fff',
    'box-shadow:0 16px 40px rgba(15,23,42,.18)',
    'font:600 12px/1.2 system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
    'padding:10px 12px',
    'white-space:nowrap',
    'overflow:hidden',
    'text-overflow:ellipsis',
  ].join(';')
  document.body.appendChild(toast)
  window.setTimeout(() => toast.remove(), 1400)
}

function cleanEmail(value: string) {
  return value.trim().toLowerCase()
}

function emailFromPrivyUser(user: unknown) {
  if (!user || typeof user !== 'object') return ''
  const record = user as Record<string, unknown>
  const directEmail = record.email
  if (directEmail && typeof directEmail === 'object') {
    const address = (directEmail as Record<string, unknown>).address
    if (typeof address === 'string') return address
  }
  for (const key of ['google', 'apple']) {
    const provider = record[key]
    if (provider && typeof provider === 'object') {
      const email = (provider as Record<string, unknown>).email
      if (typeof email === 'string') return email
    }
  }
  return ''
}

function shortAddress(value: string) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : ''
}

function cleanAgentSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 32)
}

function walletSlugFromEmail(email: string) {
  const value = cleanEmail(email)
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0
  }
  return `creator-${Math.abs(hash).toString(36)}`
}

function readerWalletSlug(email: string, selectedSlug?: string) {
  const explicit = cleanAgentSlug(selectedSlug || '')
  if (explicit && explicit !== 'hashpaylink-agent') return explicit
  return walletSlugFromEmail(email)
}

function agentSlugFromCircleWalletId(value?: string) {
  const match = String(value ?? '').match(/^agent:([a-z0-9-]+):/i)
  return cleanAgentSlug(match?.[1] ?? '')
}

function formatUsdc(value: number) {
  return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}

function formatRawUsdc(value: bigint) {
  const sign = value < 0n ? '-' : ''
  const abs = value < 0n ? -value : value
  const whole = abs / 1_000_000n
  const frac = (abs % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  return `${sign}${whole.toString()}${frac ? `.${frac}` : ''}`
}

function toContentBytes32(value: string): `0x${string}` {
  if (/^0x[0-9a-fA-F]{64}$/.test(value)) return value as `0x${string}`
  const bytes = Array.from(new TextEncoder().encode(value))
  const hex = bytes.map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 64).padEnd(64, '0')
  return `0x${hex}` as `0x${string}`
}

function formatBalanceLabel(value?: string) {
  if (value === undefined || value === null || value === '') return null
  const amount = Number(value)
  if (!Number.isFinite(amount)) return value
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`
}

function balancePreviewLabel(value?: string, checked?: boolean) {
  return formatBalanceLabel(value) || (checked ? '0 USDC' : 'Checking...')
}

function mergeAgentOptions(existing: AgentOption[], next: AgentOption) {
  const slug = cleanAgentSlug(next.slug)
  if (!slug) return existing
  const current = existing.find(item => item.slug === slug)
  if (!current) return [...existing, { ...next, slug }]
  return existing.map(item => item.slug === slug ? { ...item, ...next, slug } : item)
}

function normalizePaymentWalletOptions(options: AgentOption[]) {
  const bySlug = new Map<string, AgentOption>()
  for (const option of options) {
    const slug = cleanAgentSlug(option.slug)
    if (!slug) continue
    const existing = bySlug.get(slug)
    bySlug.set(slug, existing ? { ...existing, ...option, slug } : { ...option, slug })
  }

  const deduped = [...bySlug.values()]
  const hasConnectedReader = deduped.some(option =>
    option.connected &&
    option.walletAddress &&
    (option.source === 'store' || option.slug.startsWith('creator-'))
  )

  return deduped
    .filter(option => {
      if (!hasConnectedReader) return true
      if (option.connected || option.walletAddress) return true
      return !(option.source === 'store' || option.slug.startsWith('creator-'))
    })
    .sort((a, b) => {
      if (Boolean(a.connected) !== Boolean(b.connected)) return a.connected ? -1 : 1
      if (Boolean(a.walletAddress) !== Boolean(b.walletAddress)) return a.walletAddress ? -1 : 1
      return a.slug.localeCompare(b.slug)
    })
}

function paymentWalletName(agent?: AgentOption | null) {
  if (!agent) return 'Reader wallet'
  if (agent.slug === 'hashpaylink-agent' || agent.source === 'platform' || agent.source === 'env') return 'Hash PayLink wallet'
  if (agent.source === 'store' || agent.slug.startsWith('creator-')) return 'Reader wallet'
  return agent.name || agent.slug.replace(/-/g, ' ')
}

function paymentWalletStatusText(agent?: AgentOption | null) {
  if (!agent) return 'Ready to set up'
  if (agent.connected) return 'Ready'
  if (agent.walletAddress) return 'Sign in required'
  return 'Set up required'
}

function paymentWalletSourceText(agent?: AgentOption | null) {
  if (!agent) return 'No wallet selected'
  if (agent.source === 'env') return 'Platform wallet'
  if (agent.source === 'saved') return 'Saved wallet'
  if (agent.source === 'store') return 'Email reader wallet'
  if (agent.source === 'platform') return 'Platform wallet'
  return 'Creator unlock wallet'
}

function numericBalance(value?: string) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : 0
}

function hasActivatedGatewayBalance(agent: AgentOption | undefined, requiredAmount: number) {
  if (!agent?.gatewayBalanceChecked) return true
  return numericBalance(agent.gatewayBalance) >= requiredAmount
}

function isGatewayPendingMessage(message: string | null) {
  return /gateway deposit|pending|not made/i.test(message || '')
}

function unlockRecoveryStep(message: string): UnlockStep | null {
  if (/balance|fund|insufficient|gateway|deposit|activation/i.test(message)) return 'fund'
  if (/session|reconnect|login|wallet session|not found|not enabled|create the wallet/i.test(message)) return 'email'
  return null
}

function readableUnlockError(message: string) {
  if (/pinned by Hash PayLink/i.test(message)) {
    return 'This email needs its own reader wallet. Resend the code and use the newest email code.'
  }
  if (/OTP expired|Resend OTP/i.test(message)) {
    return 'That code expired. Resend the code and use the newest email code.'
  }
  if (/session|reconnect|login|wallet session|not found|not enabled|create the wallet/i.test(message)) {
    return 'Sign in to this reader wallet again to continue.'
  }
  if (/balance|fund|insufficient|gateway|deposit|activation/i.test(message)) {
    return 'Reader payment balance is not ready yet. Activate x402, then unlock.'
  }
  return message.slice(0, 180)
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StreamGate() {
  const [params] = useSearchParams()

  const contentId = params.get('id')   ?? ''
  const creator   = (params.get('cr')  ?? '') as `0x${string}`
  const initialAgentSlug = cleanAgentSlug(params.get('agent') ?? params.get('agentSlug') ?? '')
  const rateRaw   = parseInt(params.get('r')   ?? '1000',   10)
  const capRaw    = parseInt(params.get('cap') ?? '100000', 10)
  const title     = params.get('t')    ?? ''
  const requestedGateMode: 'unlock' | 'stream' = params.get('mode') === 'stream' ? 'stream' : 'unlock'
  const contentKind: 'text' | 'url' | 'scores' | 'book' | 'unknown' =
    params.get('ct') === 'url' ? 'url' :
    params.get('ct') === 'scores' ? 'scores' :
    params.get('ct') === 'book' ? 'book' :
    params.get('ct') === 'text' ? 'text' :
    'unknown'
  const contentCategory = (params.get('cat') ?? '').trim().toLowerCase()
  const streamContentAvailable = contentKind === 'scores' || contentCategory === 'live-scores' || contentCategory === 'video'
  const checkpointContentAvailable = !streamContentAvailable && (contentKind === 'text' || contentKind === 'book' || contentKind === 'unknown')
  const shouldChoosePayment = params.get('pay') === 'choice' || params.get('choose') === '1'
  const requestedPaymentMode = params.get('pay')
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<'x402' | 'escrow' | 'checkpoint' | null>(() => {
    if (shouldChoosePayment) return null
    if (requestedPaymentMode === 'checkpoint' && checkpointContentAvailable) return 'checkpoint'
    if (requestedGateMode === 'stream' && streamContentAvailable) return 'escrow'
    return 'x402'
  })
  const paymentMode: 'choice' | 'x402' | 'poa' | 'escrow' | 'checkpoint' = selectedPaymentMode ?? 'choice'
  const gateMode: 'unlock' | 'stream' = paymentMode === 'escrow' && streamContentAvailable ? 'stream' : 'unlock'
  const streamVault = (params.get('streamVault') ?? params.get('vault') ?? '').trim()

  const dripRate   = rateRaw  / 1_000_000
  const sessionCap = capRaw   / 1_000_000

  const { address, isConnected }  = useAccount()
  const chainId                   = useChainId()
  const { switchChain }           = useSwitchChain()
  const { writeContractAsync }    = useWriteContract()
  const isOnArc = chainId === ARC_CHAIN_ID
  const {
    authenticated: privyAuthenticated,
    user: privyUser,
    login: loginPrivy,
    getAccessToken,
  } = usePrivy()
  const privyEmail = cleanEmail(emailFromPrivyUser(privyUser))

  const passkey = usePasskey()
  const poa     = usePoAStream({ contentId, creator, dripRate, sessionCap })
  const { sessionStart, sessionStop, setVisible, forceSign } = poa
  const [ending,  setEnding]  = useState(false)
  const [ended,   setEnded]   = useState(false)
  const [agentSlug, setAgentSlug] = useState(initialAgentSlug)
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([])
  const [agentOptionsLoading, setAgentOptionsLoading] = useState(false)
  const [agentOptionsError, setAgentOptionsError] = useState<string | null>(null)
  const [circleNotice, setCircleNotice] = useState<string | null>(null)
  const [unlockStep, setUnlockStep] = useState<UnlockStep>('intro')
  const [walletEmail, setWalletEmail] = useState('')
  const [walletOtp, setWalletOtp] = useState('')
  const [walletOtpContext, setWalletOtpContext] = useState<{ email: string; slug: string } | null>(null)
  const [walletBusy, setWalletBusy] = useState(false)
  const [walletError, setWalletError] = useState<string | null>(null)
  const [fundAmount, setFundAmount] = useState('0.5')
  const [fundBusy, setFundBusy] = useState(false)
  const [fundMessage, setFundMessage] = useState<string | null>(null)
  const gatewayActivationPending = isGatewayPendingMessage(fundMessage)
  const [copiedWallet, setCopiedWallet] = useState(false)
  const [readerWalletAddress, setReaderWalletAddress] = useState('')
  const [social, setSocial] = useState<CreatorSocialState>({ upCount: 0, downCount: 0, myReaction: null, comments: [] })
  const [socialLoading, setSocialLoading] = useState(false)
  const [socialError, setSocialError] = useState<string | null>(null)
  const [commentBody, setCommentBody] = useState('')
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [midpointPromptOpen, setMidpointPromptOpen] = useState(false)
  const [midpointPromptSeen, setMidpointPromptSeen] = useState(false)
  const [contentViewCount, setContentViewCount] = useState(0)
  const [streamMeter, setStreamMeter] = useState<StreamMeterSnapshot | null>(null)
  const [checkpointSession, setCheckpointSession] = useState<CircleEvmEmailSession | null>(null)
  const [checkpointVault, setCheckpointVault] = useState((params.get('checkpointVault') ?? '').trim())
  const [checkpointBusy, setCheckpointBusy] = useState(false)
  const [checkpointRefunding, setCheckpointRefunding] = useState(false)
  const [checkpointRefunded, setCheckpointRefunded] = useState(false)
  const [checkpointError, setCheckpointError] = useState<string | null>(null)
  const [checkpointReleased, setCheckpointReleased] = useState<Record<number, string>>({})
  const recordedViewRef = useRef('')
  const checkpointReleaseRef = useRef<Set<number>>(new Set())

  async function handleEndSession() {
    setEnding(true)
    try {
      await forceSign() // one wallet popup — signs the total accrued amount
      sessionStop()
      setEnded(true)
    } finally {
      setEnding(false)
    }
  }

  // ── USDC allowance ────────────────────────────────────────────────────────
  const { data: allowance, refetch: refetchAllowance } = useQuery<bigint>({
    queryKey: ['poa_allowance', address, POA_CONTRACT],
    queryFn:  async () => {
      if (!address || !POA_CONTRACT) return 0n
      return await arcClient.readContract({
        address: ARC_USDC, abi: ERC20_ABI,
        functionName: 'allowance', args: [address, POA_CONTRACT],
      }) as bigint
    },
    enabled:         !!address && !!POA_CONTRACT && isOnArc,
    staleTime:       10_000,
    refetchInterval: 15_000,
  })

  const isApproved = !!allowance && allowance >= BigInt(capRaw)

  // ── USDC approve() ────────────────────────────────────────────────────────
  const [approving,      setApproving]      = useState(false)
  const [approveTx,      setApproveTx]      = useState<`0x${string}` | null>(null)
  const [approveError,   setApproveError]   = useState<string | null>(null)
  const [approvePending, setApprovePending] = useState(false)
  const safeAgentSlug = cleanAgentSlug(agentSlug)
  const selectedAgent = agentOptions.find(agent => agent.slug === safeAgentSlug)
  const resolvedReaderWallet = readerWalletAddress || selectedAgent?.walletAddress || address || ''
  const selectedWalletNeedsReconnect = Boolean(selectedAgent?.walletAddress && !selectedAgent.connected)
  const readerWalletSessionError = /reconnect|sign in|session|wallet session|activation did not complete/i.test(walletError || '')
  const fundingNeedsReconnect = selectedWalletNeedsReconnect || readerWalletSessionError
  const fundAmountNumber = Number(fundAmount)
  const fundingBalanceNumber = selectedAgent?.balance !== undefined ? Number(selectedAgent.balance) : null
  const fundingBalanceKnown = Boolean(selectedAgent?.balanceChecked && fundingBalanceNumber !== null && Number.isFinite(fundingBalanceNumber))
  const fundingAmountInvalid = !Number.isFinite(fundAmountNumber) || fundAmountNumber <= 0
  const fundingAmountExceedsBalance = Boolean(fundingBalanceKnown && Number.isFinite(fundAmountNumber) && fundAmountNumber > Number(fundingBalanceNumber))
  const gatewayActivationBlocked = fundingNeedsReconnect || fundingAmountInvalid || fundingAmountExceedsBalance

  useEffect(() => {
    if (privyEmail && !walletEmail) setWalletEmail(privyEmail)
  }, [privyEmail, walletEmail])

  useEffect(() => {
    if (paymentMode !== 'x402') return
    let cancelled = false

    async function hydrateAgentOptions() {
      setAgentOptionsLoading(true)
      setAgentOptionsError(null)
      let options: AgentOption[] = []

      async function addBySlug(slug: string, fallback?: Partial<AgentOption>) {
        const cleanSlug = cleanAgentSlug(slug)
        if (!cleanSlug) return
        let option: AgentOption = {
          slug: cleanSlug,
          name: fallback?.name || cleanSlug,
          purpose: fallback?.purpose,
          walletAddress: fallback?.walletAddress,
          source: fallback?.source,
        }
        try {
          const profileRes = await fetch(`/api/agent-profile?agent=${encodeURIComponent(cleanSlug)}`)
          const profileData = await profileRes.json().catch(() => ({})) as { ok?: boolean; agent?: AgentProfile }
          if (profileRes.ok && profileData.ok && profileData.agent) {
            option = { ...option, ...profileData.agent }
          }
        } catch {
          // Status lookup below still gives enough information to let the user reconnect.
        }
        try {
          const statusRes = await fetch(`/api/agent-wallet?agent=${encodeURIComponent(cleanSlug)}&balance=1&chain=arc&x402=1&x402Chain=arc`)
          const status = await statusRes.json().catch(() => ({})) as AgentWalletStatus
          if (statusRes.ok && status.ok !== false) {
            option = {
              ...option,
              walletAddress: status.walletAddress || option.walletAddress,
              connected: Boolean(status.connected),
              source: status.source === 'env' ? 'env' : option.source,
              balance: status.balance,
              balanceError: status.balanceError,
              balanceChecked: status.balanceChecked,
              gatewayBalance: status.gatewayBalance,
              gatewayBalanceError: status.gatewayBalanceError,
              gatewayBalanceChecked: status.gatewayBalanceChecked,
            }
          }
        } catch {
          option = { ...option, connected: false }
        }
        options = mergeAgentOptions(options, option)
      }

      try {
        if (initialAgentSlug) {
          await addBySlug(initialAgentSlug, {
            name: 'Reader wallet',
            source: 'saved',
          })
        }

        if (PRIVY_AUTH_ENABLED && privyAuthenticated) {
          const token = await getAccessToken()
          if (token) {
            try {
              const linked = await resolvePrivyCircleLink({ accessToken: token, chain: 'arc', purpose: 'agent' })
              const linkedSlug = agentSlugFromCircleWalletId(linked.link?.circleWalletId)
              if (linkedSlug) {
                await addBySlug(linkedSlug, {
                  walletAddress: linked.link?.circleWalletAddress,
                  name: linkedSlug,
                  purpose: 'Linked through Privy email',
                })
              }
            } catch {
              // Missing Privy server config should not block manual agent selection.
            }
          }

          if (privyEmail) {
            await addBySlug(walletSlugFromEmail(privyEmail), {
              name: 'Reader wallet',
              purpose: 'Email reader wallet',
              source: 'store',
            })
            try {
              const res = await fetch(`/api/agent-profile?owner=${encodeURIComponent(privyEmail)}`)
              const data = await res.json().catch(() => ({})) as { ok?: boolean; agents?: AgentProfile[] }
              if (res.ok && data.ok && Array.isArray(data.agents)) {
                for (const agent of data.agents) await addBySlug(agent.slug, { ...agent, source: 'saved' })
              }
            } catch {
              // Older Telegram-owned profiles may not be keyed by email yet.
            }
          }
        }

        if (!cancelled) {
          const normalizedOptions = normalizePaymentWalletOptions(options)
          const selected = normalizedOptions.find(option => option.slug === safeAgentSlug)
          const preferred = selected?.connected
            ? selected
            : normalizedOptions.find(option => option.connected && option.walletAddress) || selected || normalizedOptions[0]
          setAgentOptions(normalizedOptions)
          if (preferred && preferred.slug !== safeAgentSlug) setAgentSlug(preferred.slug)
        }
      } catch (err) {
        if (!cancelled) setAgentOptionsError(err instanceof Error ? err.message.slice(0, 140) : 'Could not load saved agents.')
      } finally {
        if (!cancelled) setAgentOptionsLoading(false)
      }
    }

    void hydrateAgentOptions()
    return () => { cancelled = true }
  }, [paymentMode, initialAgentSlug, privyAuthenticated, privyEmail, getAccessToken]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleApprove() {
    if (!POA_CONTRACT || !isConnected || !isOnArc) return
    setApproving(true); setApproveError(null)
    try {
      const tx = await writeContractAsync({
        address: ARC_USDC, abi: ERC20_ABI,
        functionName: 'approve',
        args: [POA_CONTRACT, BigInt(capRaw)],
        gas: 100_000n,
      })
      setApproveTx(tx); setApprovePending(true)
      pollApproval(tx)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!/rejected|denied/i.test(msg)) setApproveError(msg.slice(0, 140))
    } finally { setApproving(false) }
  }

  const pollApproval = useCallback((hash: `0x${string}`, attempts = 0) => {
    if (attempts > 40) {
      setApprovePending(false)
      setApproveError('Approval not confirmed after 2 min — check Arcscan')
      return
    }
    setTimeout(async () => {
      try {
        const receipt = await arcClient.getTransactionReceipt({ hash })
        if (receipt?.status === 'success') {
          setApprovePending(false); setApproveTx(null); refetchAllowance()
        } else if (receipt?.status === 'reverted') {
          setApprovePending(false); setApproveError('Approval transaction reverted')
        } else { pollApproval(hash, attempts + 1) }
      } catch { pollApproval(hash, attempts + 1) }
    }, 3_000)
  }, [refetchAllowance])

  // ── Content fetch (after full auth) ──────────────────────────────────────
  const [contentState,  setContentState]  = useState<ContentState>('idle')
  const [fetchedContent, setFetchedContent] = useState<FetchedContent | null>(null)
  const [contentError,  setContentError]  = useState<string | null>(null)
  const [gatewayPaying, setGatewayPaying] = useState(false)
  const [gatewayTx, setGatewayTx] = useState<string | null>(null)
  const [gatewayReceiptId, setGatewayReceiptId] = useState<string | null>(null)
  const [gatewayReceipt, setGatewayReceipt] = useState<X402ReceiptLike | null>(null)
  const [gatewayReceiptPollAttempts, setGatewayReceiptPollAttempts] = useState(0)
  const [gatewayArchiveTimedOut, setGatewayArchiveTimedOut] = useState(false)
  const [gatewayReferenceCopied, setGatewayReferenceCopied] = useState(false)
  const [gatewayReceiptOpening, setGatewayReceiptOpening] = useState(false)
  const [gatewayRestored, setGatewayRestored] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const gatewayReference = gatewayTx || gatewayReceiptId || ''
  const gatewayTxIsExplorerHash = /^0x[a-fA-F0-9]{64}$/.test(gatewayTx ?? '')
  const gatewayOgExplorer = gatewayReceipt?.og?.ogExplorer
  const gatewayOgProof = gatewayReceipt?.og?.ogTxHash || gatewayReceipt?.og?.rootHash || ''
  const gatewayOgReady = Boolean(gatewayOgProof || gatewayOgExplorer)
  const gatewayReceiptReady = Boolean(gatewayReceiptId && (gatewayOgReady || gatewayArchiveTimedOut))
  const gatewayArchiveLabel = gatewayArchiveTimedOut
    ? 'Archive delayed'
    : gatewayReceiptPollAttempts >= 9
      ? 'Still archiving...'
      : 'Archiving...'

  const legacyFullyAuthorised = isConnected && isOnArc && passkey.registered && isApproved
  const fullyAuthorised = paymentMode === 'x402' || paymentMode === 'escrow' || paymentMode === 'checkpoint'
    ? contentState === 'ready'
    : paymentMode === 'choice'
      ? false
      : legacyFullyAuthorised

  useEffect(() => {
    if (!fullyAuthorised || contentState !== 'ready') return
    void refreshCreatorSocial()
  }, [fullyAuthorised, contentState, contentId, readerWalletAddress, selectedAgent?.walletAddress])

  useEffect(() => {
    if (!fullyAuthorised || contentState !== 'ready') return
    if (fetchedContent?.type !== 'text' && fetchedContent?.type !== 'book') return
    void recordCreatorContentView()
  }, [fullyAuthorised, contentState, contentId, fetchedContent?.type, readerWalletAddress, selectedAgent?.walletAddress, address])

  useEffect(() => {
    if (paymentMode !== 'escrow' || !fullyAuthorised || contentState !== 'ready' || !/^0x[a-fA-F0-9]{40}$/.test(streamVault)) {
      setStreamMeter(null)
      return undefined
    }
    let cancelled = false
    async function loadStreamMeter() {
      try {
        const info = await arcClient.readContract({
          address: streamVault as `0x${string}`,
          abi: STREAM_VAULT_ABI,
          functionName: 'streamInfo',
        }) as readonly [`0x${string}`, `0x${string}`, bigint, bigint, bigint, bigint, boolean, bigint, bigint]
        if (cancelled) return
        setStreamMeter({
          totalAmount: info[2],
          alreadyWithdrawn: info[5],
          cancelled: info[6],
          unlocked: info[7],
          claimable: info[8],
        })
      } catch {
        if (!cancelled) setStreamMeter(null)
      }
    }
    void loadStreamMeter()
    const timer = window.setInterval(() => { void loadStreamMeter() }, 5000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [paymentMode, fullyAuthorised, contentState, streamVault])

  useEffect(() => {
    if (!gatewayReceiptId) return
    const receiptId = gatewayReceiptId
    let cancelled = false
    let timer: number | undefined
    let attempts = 0

    setGatewayReceiptPollAttempts(0)
    setGatewayArchiveTimedOut(false)

    async function loadReceipt() {
      attempts += 1
      if (!cancelled) setGatewayReceiptPollAttempts(attempts)
      try {
        const res = await fetch(`/api/x402/receipt?id=${encodeURIComponent(receiptId)}`)
        const data = await res.json().catch(() => ({})) as { ok?: boolean; receipt?: X402ReceiptLike }
        if (!cancelled && res.ok && data.ok && data.receipt) {
          setGatewayReceipt(data.receipt)
          if (data.receipt.og?.ogTxHash || data.receipt.og?.rootHash || data.receipt.og?.ogExplorer) {
            setGatewayArchiveTimedOut(false)
            return
          }
        }
      } catch {
        // Receipt polling should not affect already-unlocked creator content.
      }
      if (!cancelled && attempts < 40) timer = window.setTimeout(loadReceipt, 5_000)
      if (!cancelled && attempts >= 40) setGatewayArchiveTimedOut(true)
    }

    void loadReceipt()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [gatewayReceiptId])

  async function openGatewayReceiptPdf() {
    if (!gatewayReceiptId || gatewayReceiptOpening || !gatewayReceiptReady) return
    setGatewayReceiptOpening(true)
    try {
      let sourceReceipt = gatewayReceipt
      if (!sourceReceipt) {
        const res = await fetch(`/api/x402/receipt?id=${encodeURIComponent(gatewayReceiptId)}`)
        const data = await res.json().catch(() => ({})) as { ok?: boolean; receipt?: X402ReceiptLike }
        if (!res.ok || !data.ok || !data.receipt) throw new Error('Receipt unavailable')
        sourceReceipt = data.receipt
      }
      const receipt = sourceReceipt.receiptId
        ? sourceReceipt as unknown as Parameters<typeof createPaymentReceiptPdf>[0]
        : createX402PaylinkReceipt(sourceReceipt, gatewayReceiptId)
      const blob = await createPaymentReceiptPdf(receipt)
      const url = URL.createObjectURL(blob)
      const win = window.open(url, '_blank', 'noopener,noreferrer')
      if (!win) {
        const link = document.createElement('a')
        link.href = url
        link.download = paymentReceiptFileName(receipt)
        document.body.appendChild(link)
        link.click()
        link.remove()
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } catch {
      window.open(`/receipt/${gatewayReceiptId}`, '_blank', 'noopener,noreferrer')
    } finally {
      setGatewayReceiptOpening(false)
    }
  }

  async function unlockWithAgentX402(agentSlugOverride?: string) {
    if (gatewayPaying) return
    const paymentSlug = cleanAgentSlug(agentSlugOverride || safeAgentSlug)
    if (!paymentSlug) {
      setContentError('Choose a reader wallet to continue.')
      setContentState('error')
      setUnlockStep('choose')
      return
    }
    setGatewayPaying(true)
    setGatewayReferenceCopied(false)
    setGatewayReceiptOpening(false)
    setGatewayReceipt(null)
    setGatewayReceiptPollAttempts(0)
    setGatewayArchiveTimedOut(false)
    setGatewayRestored(false)
    setContentError(null)
    setContentState('loading')
    try {
      const res = await fetch('/api/creator-unlock-x402', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentId, agentSlug: paymentSlug }),
      })
      const data = await res.json() as {
        ok: boolean
        type?: string
        content?: string
        coverImage?: string
        payment?: { transaction?: string } | null
        receiptActivityId?: string | null
        walletAddress?: string
        restored?: boolean
        error?: string
        code?: string
      }
      if (!data.ok || !data.type || !data.content) throw new Error(data.error ?? 'Could not unlock content')
      setFetchedContent({ type: data.type as FetchedContent['type'], content: data.content, coverImage: data.coverImage })
      setGatewayTx(data.payment?.transaction ?? null)
      setGatewayReceiptId(data.receiptActivityId ?? null)
      setGatewayRestored(Boolean(data.restored))
      setReaderWalletAddress(data.walletAddress || selectedAgent?.walletAddress || '')
      setContentState('ready')
      setCircleNotice(
        data.restored
          ? 'Access restored'
          : data.walletAddress ? `Paid by ${shortAddress(data.walletAddress)}` : 'Payment complete',
      )
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : 'Payment failed.'
      const nextStep = unlockRecoveryStep(rawMessage)
      if (nextStep === 'email') {
        setAgentOptions(current => current.map(agent => (
          agent.slug === paymentSlug ? { ...agent, connected: false } : agent
        )))
        setUnlockStep(agentOptions.length > 0 ? 'choose' : 'email')
        setCircleNotice('Sign in once to refresh this reader wallet.')
        setWalletError(null)
        setContentError(null)
      } else {
        if (nextStep) setUnlockStep(nextStep)
        setContentError(readableUnlockError(rawMessage))
      }
      setContentState('error')
    } finally {
      setGatewayPaying(false)
    }
  }

  async function handlePrimaryGatewayPay() {
    setCircleNotice(null)
    if (PRIVY_AUTH_ENABLED && !privyAuthenticated) {
      loginPrivy()
      return
    }
    if (unlockStep === 'intro') {
      setUnlockStep(agentOptions.length > 0 ? 'choose' : 'email')
      return
    }
    if (!selectedAgent?.connected) {
      setUnlockStep(agentOptions.length > 0 ? 'choose' : 'email')
      return
    }
    if (!hasActivatedGatewayBalance(selectedAgent, sessionCap)) {
      setUnlockStep('fund')
      setFundMessage(null)
      return
    }
    await unlockWithAgentX402(selectedAgent.slug)
  }

  async function fetchCheckpointContent(vaultAddress: string) {
    setContentState('loading')
    const res = await fetch(`/api/get-content-checkpoint?id=${encodeURIComponent(contentId)}&vault=${encodeURIComponent(vaultAddress)}`)
    const data = await res.json().catch(() => ({})) as { ok?: boolean; type?: string; content?: string; coverImage?: string; error?: string }
    if (!res.ok || !data.ok || !data.type || !data.content) throw new Error(data.error || 'Could not verify checkpoint escrow.')
    setFetchedContent({ type: data.type as FetchedContent['type'], content: data.content, coverImage: data.coverImage })
    setContentState('ready')
  }

  async function startCheckpointEscrow() {
    const email = cleanEmail(walletEmail || privyEmail)
    setCheckpointError(null)
    setContentError(null)
    setCircleNotice(null)
    if (!checkpointContentAvailable) {
      setCheckpointError('Pay-as-you-read is only available for articles and books.')
      return
    }
    if (!CHECKPOINT_FACTORY_ADDRESS || !/^0x[a-fA-F0-9]{40}$/.test(CHECKPOINT_FACTORY_ADDRESS)) {
      setCheckpointError('Checkpoint escrow is not configured yet.')
      return
    }
    if (!email && !checkpointSession) {
      setCheckpointError('Enter your email to open your Circle reader wallet.')
      return
    }
    setCheckpointBusy(true)
    try {
      const session = checkpointSession ?? await connectCircleEvmEmailWallet(email, 'arc')
      setCheckpointSession(session)
      setReaderWalletAddress(session.wallet.address)

      const amountUnits = BigInt(Math.max(1, capRaw))
      const contentId32 = toContentBytes32(contentId)
      const saltSeed = `${contentId}:${session.wallet.address}:${Date.now()}:${Math.random()}`
      const salt = keccak256(toBytes(saltSeed))
      const predicted = await arcClient.readContract({
        address: CHECKPOINT_FACTORY_ADDRESS,
        abi: CHECKPOINT_VAULT_FACTORY_ABI,
        functionName: 'getVaultAddress',
        args: [session.wallet.address, creator, contentId32, amountUnits, salt],
      }) as `0x${string}`

      setCircleNotice('Confirm checkpoint escrow in Circle.')
      const txHash = await sendCircleArcCheckpointVault({
        session,
        factoryAddress: CHECKPOINT_FACTORY_ADDRESS,
        recipient: creator,
        amountUnits: amountUnits.toString(),
        contentId: contentId32,
        salt,
        predictedVault: predicted,
      })
      if (txHash) await arcClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` })
      setCheckpointVault(predicted)
      const nextParams = new URLSearchParams(window.location.search)
      nextParams.set('pay', 'checkpoint')
      nextParams.set('checkpointVault', predicted)
      window.history.replaceState(null, '', `${window.location.pathname}?${nextParams.toString()}${window.location.hash}`)
      await fetchCheckpointContent(predicted)
      setCircleNotice('Pay-as-you-read active.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not start checkpoint escrow.'
      setCheckpointError(message.slice(0, 180))
      setContentState('error')
      setContentError(message.slice(0, 180))
    } finally {
      setCheckpointBusy(false)
    }
  }

  async function releaseCheckpoint(checkpointPct: number) {
    if (!checkpointVault || checkpointReleaseRef.current.has(checkpointPct)) return
    checkpointReleaseRef.current.add(checkpointPct)
    try {
      const res = await fetch('/api/relay-checkpoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaultAddress: checkpointVault, checkpointPct }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean; txHash?: string; releasedAmount?: string; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Checkpoint release failed.')
      setCheckpointReleased(current => ({ ...current, [checkpointPct]: data.txHash || data.releasedAmount || 'released' }))
    } catch {
      checkpointReleaseRef.current.delete(checkpointPct)
    }
  }

  async function refundCheckpointEscrow() {
    const vault = checkpointVault.trim()
    const email = cleanEmail(walletEmail || privyEmail)
    if (!vault || !/^0x[a-fA-F0-9]{40}$/.test(vault)) {
      setCheckpointError('No checkpoint escrow is available to refund.')
      return
    }
    if (!email && !checkpointSession) {
      setCheckpointError('Enter your email to reopen this reader wallet before refunding.')
      return
    }
    setCheckpointError(null)
    setCheckpointRefunding(true)
    try {
      const session = checkpointSession ?? await connectCircleEvmEmailWallet(email, 'arc')
      setCheckpointSession(session)
      setReaderWalletAddress(session.wallet.address)
      setCircleNotice('Confirm refund in Circle.')
      const txHash = await sendCircleArcCheckpointRefund({ session, vaultAddress: vault as `0x${string}` })
      if (txHash) await arcClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` })
      setCircleNotice('Unread balance refunded.')
      setCheckpointRefunded(true)
      setCheckpointError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not refund unread balance.'
      setCheckpointError(message.slice(0, 180))
    } finally {
      setCheckpointRefunding(false)
    }
  }

  async function startPaymentWalletLogin(slugOverride?: string) {
    const email = cleanEmail(walletEmail || privyEmail)
    const slug = readerWalletSlug(email, slugOverride)
    const expectedWallet = agentOptions.find(agent => agent.slug === slug)?.walletAddress
    setWalletError(null)
    setContentError(null)
    setCircleNotice(null)
    if (!email) {
      setWalletError('Enter your email to open your reader wallet.')
      return
    }
    const savedWallet = agentOptions.find(agent => agent.slug === slug && agent.connected && agent.walletAddress)
    if (savedWallet && !slugOverride) {
      setAgentSlug(savedWallet.slug)
      setUnlockStep('choose')
      setCircleNotice('Reader wallet ready.')
      return
    }
    setAgentSlug(slug)
    setWalletBusy(true)
    try {
      const res = await fetch('/api/agent-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'init', agentSlug: slug, email, testnet: true, expectedWallet }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not send the sign-in code.')
      setWalletOtp('')
      setWalletOtpContext({ email, slug })
      setUnlockStep('otp')
      setCircleNotice('Check your email for the wallet code.')
    } catch (err) {
      setWalletError(err instanceof Error ? err.message.slice(0, 180) : 'Could not send the sign-in code.')
    } finally {
      setWalletBusy(false)
    }
  }

  async function completePaymentWalletLogin() {
    const fallbackEmail = cleanEmail(walletEmail || privyEmail)
    const context = walletOtpContext || { email: fallbackEmail, slug: readerWalletSlug(fallbackEmail) }
    const otp = walletOtp.trim()
    setWalletError(null)
    setContentError(null)
    setCircleNotice(null)
    if (!context.email || !context.slug) {
      setWalletError('Start wallet sign-in again.')
      setUnlockStep('email')
      return
    }
    if (otp.length < 4) {
      setWalletError('Enter the code from your email.')
      return
    }
    setWalletBusy(true)
    try {
      const res = await fetch('/api/agent-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'complete',
          agentSlug: context.slug,
          email: context.email,
          otp,
          testnet: true,
          expectedWallet: agentOptions.find(agent => agent.slug === context.slug)?.walletAddress,
        }),
      })
      const data = await res.json().catch(() => ({})) as {
        ok?: boolean
        error?: string
        walletAddress?: string
        agentSlug?: string
      }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not verify the wallet code.')
      const slug = cleanAgentSlug(data.agentSlug || context.slug)
      setAgentSlug(slug)
      setAgentOptions(current => normalizePaymentWalletOptions(mergeAgentOptions(current, {
          slug,
          name: slug === 'hashpaylink-agent' ? 'Hash PayLink wallet' : 'Reader wallet',
          walletAddress: data.walletAddress,
          connected: true,
          source: 'store',
        })))
      setWalletOtp('')
      setWalletOtpContext(null)
      setCircleNotice('Reader wallet ready.')
      setUnlockStep('choose')
      setContentState('idle')
      void refreshPaymentWalletStatus(slug)
    } catch (err) {
      setWalletError(err instanceof Error ? err.message.slice(0, 180) : 'Could not verify the wallet code.')
    } finally {
      setWalletBusy(false)
    }
  }

  async function resendPaymentWalletCode() {
    const slug = walletOtpContext?.slug || readerWalletSlug(cleanEmail(walletEmail || privyEmail))
    setWalletOtp('')
    await startPaymentWalletLogin(slug)
  }

  async function disconnectPaymentWallet(slugOverride?: string) {
    const slug = cleanAgentSlug(slugOverride || safeAgentSlug || selectedAgent?.slug)
    if (!slug) {
      setUnlockStep('email')
      return
    }
    setWalletBusy(true)
    setWalletError(null)
    setContentError(null)
    setCircleNotice(null)
    try {
      const res = await fetch('/api/agent-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect', agentSlug: slug }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not sign out this reader wallet.')
      setAgentOptions(current => normalizePaymentWalletOptions(current.filter(agent => agent.slug !== slug)))
      setAgentSlug('')
      setWalletOtp('')
      setWalletOtpContext(null)
      setGatewayRestored(false)
      setGatewayTx(null)
      setGatewayReceiptId(null)
      setGatewayReceipt(null)
      setGatewayArchiveTimedOut(false)
      setContentState('idle')
      setCircleNotice('Reader wallet signed out. Open another wallet to continue.')
      setUnlockStep('email')
    } catch (err) {
      setWalletError(err instanceof Error ? err.message.slice(0, 180) : 'Could not sign out this reader wallet.')
    } finally {
      setWalletBusy(false)
    }
  }

  async function copyPaymentWalletAddress() {
    const wallet = selectedAgent?.walletAddress
    if (!wallet) return
    await navigator.clipboard.writeText(wallet)
    setCopiedWallet(true)
    window.setTimeout(() => setCopiedWallet(false), 1500)
  }

  async function refreshCreatorSocial(walletOverride?: string) {
    const wallet = walletOverride || resolvedReaderWallet
    if (!contentId) return
    setSocialLoading(true)
    setSocialError(null)
    try {
      const res = await fetch(`/api/creator-social?id=${encodeURIComponent(contentId)}&wallet=${encodeURIComponent(wallet)}`)
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string } & CreatorSocialState
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not load reactions.')
      setSocial({
        upCount: Number(data.upCount || 0),
        downCount: Number(data.downCount || 0),
        myReaction: data.myReaction === 'up' || data.myReaction === 'down' ? data.myReaction : null,
        comments: Array.isArray(data.comments) ? data.comments : [],
      })
    } catch (err) {
      setSocialError(err instanceof Error ? err.message.slice(0, 120) : 'Could not load reactions.')
    } finally {
      setSocialLoading(false)
    }
  }

  async function recordCreatorContentView(walletOverride?: string) {
    if (!contentId) return
    const wallet = walletOverride || resolvedReaderWallet
    let viewerKey = wallet ? `wallet:${wallet.toLowerCase()}` : ''
    if (!viewerKey) {
      const storageKey = 'hashpaystream:reader-session'
      viewerKey = window.sessionStorage.getItem(storageKey) || ''
      if (!viewerKey) {
        viewerKey = `session:${crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}`
        window.sessionStorage.setItem(storageKey, viewerKey)
      }
    }
    const recordKey = `${contentId}:${viewerKey}`
    if (recordedViewRef.current === recordKey) return
    recordedViewRef.current = recordKey
    try {
      const res = await fetch('/api/creator-content-view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentId, viewerKey }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean; viewCount?: number }
      if (res.ok && data.ok) setContentViewCount(Number(data.viewCount || 0))
    } catch {
      // View count should never interrupt content reading.
    }
  }

  async function updateCreatorReaction(next: CreatorReaction) {
    const wallet = resolvedReaderWallet
    if (!wallet) {
      setSocialError('Unlock with a reader wallet before reacting.')
      return
    }
    const reaction = social.myReaction === next ? null : next
    setSocialError(null)
    try {
      const res = await fetch('/api/creator-social/reaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentId, walletAddress: wallet, reaction }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string } & CreatorSocialState
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not save reaction.')
      setSocial({
        upCount: Number(data.upCount || 0),
        downCount: Number(data.downCount || 0),
        myReaction: data.myReaction === 'up' || data.myReaction === 'down' ? data.myReaction : null,
        comments: Array.isArray(data.comments) ? data.comments : [],
      })
      setMidpointPromptOpen(false)
    } catch (err) {
      setSocialError(err instanceof Error ? err.message.slice(0, 120) : 'Could not save reaction.')
    }
  }

  async function addCreatorSocialComment() {
    const wallet = resolvedReaderWallet
    const body = commentBody.trim()
    if (!wallet || body.length < 2) return
    setSocialError(null)
    try {
      const res = await fetch('/api/creator-social/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentId, walletAddress: wallet, body }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string } & CreatorSocialState
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not add comment.')
      setCommentBody('')
      setCommentsOpen(true)
      setSocial({
        upCount: Number(data.upCount || 0),
        downCount: Number(data.downCount || 0),
        myReaction: data.myReaction === 'up' || data.myReaction === 'down' ? data.myReaction : null,
        comments: Array.isArray(data.comments) ? data.comments : [],
      })
    } catch (err) {
      setSocialError(err instanceof Error ? err.message.slice(0, 120) : 'Could not add comment.')
    }
  }

  async function updateCreatorCommentReaction(commentId: string, next: CreatorReaction, current: CreatorReaction | null) {
    const wallet = resolvedReaderWallet
    if (!wallet) return
    const reaction = current === next ? null : next
    setSocialError(null)
    try {
      const res = await fetch('/api/creator-social/comment-reaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentId, commentId, walletAddress: wallet, reaction }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string } & CreatorSocialState
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not save comment reaction.')
      setSocial({
        upCount: Number(data.upCount || 0),
        downCount: Number(data.downCount || 0),
        myReaction: data.myReaction === 'up' || data.myReaction === 'down' ? data.myReaction : null,
        comments: Array.isArray(data.comments) ? data.comments : [],
      })
    } catch (err) {
      setSocialError(err instanceof Error ? err.message.slice(0, 120) : 'Could not save comment reaction.')
    }
  }

  async function refreshPaymentWalletStatus(slug: string) {
    const cleanSlug = cleanAgentSlug(slug)
    if (!cleanSlug) return
    try {
      const res = await fetch(`/api/agent-wallet?agent=${encodeURIComponent(cleanSlug)}&balance=1&chain=arc&x402=1&x402Chain=arc`)
      const data = await res.json().catch(() => ({})) as AgentWalletStatus
      if (!res.ok || data.ok === false) return
      const walletAddress = data.walletAddress
      setAgentOptions(current => current.map(agent => (
        agent.slug === cleanSlug
          ? {
              ...agent,
              walletAddress: walletAddress || agent.walletAddress,
              connected: Boolean(data.connected),
              balance: data.balance,
              balanceError: data.balanceError,
              balanceChecked: data.balanceChecked,
              gatewayBalance: data.gatewayBalance,
              gatewayBalanceError: data.gatewayBalanceError,
              gatewayBalanceChecked: data.gatewayBalanceChecked,
            }
          : agent
      )))
      return data
    } catch {
      // Balance refresh is non-blocking; the unlock path will still return a clear error if payment fails.
    }
  }

  function x402WalletManagerHref() {
    const p = new URLSearchParams()
    p.set('product', 'agent')
    p.set('profile', 'agent')
    p.set('n', 'arc')
    p.set('src', 'creator-checkout')
    p.set('returnTo', `${window.location.pathname}${window.location.search}${window.location.hash}`)
    return `/app?${p.toString()}`
  }

  async function activatePaymentBalance() {
    const paymentSlug = selectedAgent?.slug || safeAgentSlug
    setFundMessage(null)
    setWalletError(null)
    if (!paymentSlug) {
      setWalletError('Choose a reader wallet first.')
      setUnlockStep('choose')
      return
    }
    if (fundingNeedsReconnect) {
      setWalletError('Sign in once to refresh this reader wallet.')
      return
    }
    if (fundingAmountInvalid) {
      setWalletError('Enter a valid USDC amount.')
      return
    }
    if (fundingAmountExceedsBalance) {
      setWalletError(`Fund this wallet with more USDC on ${CREATOR_X402_GATEWAY_LABEL}, then activate x402.`)
      return
    }
    setFundBusy(true)
    try {
      const res = await fetch('/api/agent-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'gateway-deposit-arc', agentSlug: paymentSlug, amount: fundAmount }),
      })
      const data = await res.json().catch(() => ({})) as {
        ok?: boolean
        code?: string
        error?: string
        gatewayBalance?: string
        walletAddress?: string
      }
      if (res.status === 202 && data.code === 'gateway_deposit_pending') {
        await refreshPaymentWalletStatus(paymentSlug)
        setFundMessage(data.error || 'Activation is pending. Wait a moment, then check activation again.')
        setWalletError(null)
        setContentError(null)
        return
      }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not activate x402.')
      setAgentOptions(current => current.map(agent => (
        agent.slug === paymentSlug
          ? { ...agent, connected: true, walletAddress: data.walletAddress || agent.walletAddress, gatewayBalance: data.gatewayBalance, gatewayBalanceChecked: true }
          : agent
      )))
      await refreshPaymentWalletStatus(paymentSlug)
      setFundMessage('x402 activated. You can unlock now.')
      setUnlockStep('choose')
      setContentState('idle')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not activate x402.'
      const recoveryStep = unlockRecoveryStep(message)
      if (recoveryStep === 'email') {
        setAgentOptions(current => current.map(agent => (
          agent.slug === paymentSlug ? { ...agent, connected: false } : agent
        )))
        setUnlockStep(agentOptions.length > 0 ? 'choose' : 'email')
        setCircleNotice('Sign in once to refresh this reader wallet.')
        setWalletError(null)
        setContentError(null)
      } else {
        if (recoveryStep === 'fund') setUnlockStep('fund')
        setWalletError(message.slice(0, 180))
      }
    } finally {
      setFundBusy(false)
    }
  }

  async function checkPaymentActivation() {
    const paymentSlug = selectedAgent?.slug || safeAgentSlug
    if (!paymentSlug) {
      setWalletError('Choose a reader wallet first.')
      setUnlockStep('choose')
      return
    }
    if (fundingNeedsReconnect) {
      setWalletError('Sign in once to refresh this reader wallet.')
      return
    }
    setFundBusy(true)
    setWalletError(null)
    setContentError(null)
    try {
      const fresh = await refreshPaymentWalletStatus(paymentSlug)
      if (numericBalance(fresh?.gatewayBalance) >= sessionCap) {
        setFundMessage('Payment balance activated. You can unlock now.')
        setUnlockStep('choose')
      } else {
        setFundMessage('Payment activation is still pending. Wait a moment, then check again. Do not activate again yet.')
      }
    } finally {
      setFundBusy(false)
    }
  }

  useEffect(() => {
    if (paymentMode !== 'poa' || !legacyFullyAuthorised || !address || !contentId || contentState !== 'idle') return
    setContentState('loading')
    fetch(`/api/get-content?id=${encodeURIComponent(contentId)}&viewer=${address}`)
      .then(r => r.json())
      .then((data: { ok: boolean; type?: string; content?: string; coverImage?: string; error?: string }) => {
        if (data.ok && data.type && data.content) {
          setFetchedContent({ type: data.type as FetchedContent['type'], content: data.content, coverImage: data.coverImage })
          setContentState('ready')
        } else {
          setContentError(data.error ?? 'Could not retrieve content')
          setContentState('error')
        }
      })
      .catch(() => { setContentError('Server error — please try again'); setContentState('error') })
  }, [paymentMode, legacyFullyAuthorised, address, contentId, contentState])

  useEffect(() => {
    if (paymentMode !== 'escrow' || !streamVault || !contentId || contentState !== 'idle') return
    setContentState('loading')
    fetch(`/api/get-content-stream?id=${encodeURIComponent(contentId)}&vault=${encodeURIComponent(streamVault)}`)
      .then(r => r.json())
      .then((data: { ok: boolean; type?: string; content?: string; coverImage?: string; error?: string }) => {
        if (data.ok && data.type && data.content) {
          setFetchedContent({ type: data.type as FetchedContent['type'], content: data.content, coverImage: data.coverImage })
          setContentState('ready')
        } else {
          setContentError(data.error ?? 'Could not verify nano meter')
          setContentState('error')
        }
      })
      .catch(() => { setContentError('Server error - please try again'); setContentState('error') })
  }, [paymentMode, streamVault, contentId, contentState])

  useEffect(() => {
    if (paymentMode !== 'checkpoint' || !checkpointVault || !contentId || contentState !== 'idle') return
    fetchCheckpointContent(checkpointVault).catch(err => {
      setContentError(err instanceof Error ? err.message : 'Could not verify checkpoint escrow')
      setContentState('error')
    })
  }, [paymentMode, checkpointVault, contentId, contentState])

  // ── IntersectionObserver: drip only when content is visible + ready ───────
  // Drip starts AFTER content is fetched and visible — not on auth alone.
  const contentRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = contentRef.current
    if (paymentMode !== 'poa' || !el || !fullyAuthorised || contentState !== 'ready') return

    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting && entry.intersectionRatio >= 0.5
        setVisible(visible)
        if (visible) sessionStart()
        else sessionStop()
      },
      { threshold: [0, 0.5, 1.0] },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [paymentMode, fullyAuthorised, contentState, sessionStart, sessionStop, setVisible])

  // Final checkpoint on unmount
  useEffect(() => () => sessionStop(), [sessionStop])

  // ── Auth step tracking ────────────────────────────────────────────────────
  const currentStep = paymentMode === 'x402'
    ? (!privyAuthenticated ? 0 : contentState === 'loading' ? 2 : contentState === 'ready' ? 3 : 1)
    : (!isConnected ? 0 : !isOnArc ? 1 : !passkey.registered ? 2 : 3)

  const progressPct = Math.min((poa.accrued / sessionCap) * 100, 100)
  const streamDurationSec = dripRate > 0 ? Math.max(1, Math.ceil(sessionCap / dripRate)) : 0
  const prepaidStreamEnded = paymentMode === 'escrow'
    && contentState === 'error'
    && Boolean(contentError && /(prepaid stream|nano meter) (has ended|was cancelled)/i.test(contentError))

  function streamEscrowHref() {
    const returnParams = new URLSearchParams(window.location.search)
    returnParams.set('mode', 'stream')
    returnParams.set('pay', 'escrow')
    returnParams.set('streamVault', '__STREAM_VAULT__')
    const returnTo = `${window.location.pathname}?${returnParams.toString()}`
    const p = new URLSearchParams()
    p.set('app', 'streampay')
    p.set('mode', 'creator-stream')
    p.set('wallet', 'circle')
    p.set('recipient', creator)
    p.set('amount', sessionCap.toFixed(6).replace(/\.?0+$/, ''))
    p.set('duration', `${streamDurationSec}s`)
    p.set('reason', title ? `Creator stream: ${title}` : `Creator stream: ${shortAddress(creator)}`)
    p.set('returnTo', returnTo)
    return `/stream?${p.toString()}`
  }

  function handleReadableProgress(progress: number) {
    if (paymentMode === 'checkpoint') {
      for (const mark of [25, 50, 75, 100]) {
        if (progress >= mark / 100) void releaseCheckpoint(mark)
      }
    }
    if (!midpointPromptSeen && !social.myReaction && progress >= 0.5) {
      setMidpointPromptSeen(true)
      setMidpointPromptOpen(true)
    }
  }

  if (!contentId || !creator) {
    return (
      <div className="w-full max-w-[480px] mx-auto mt-12 text-center text-[13px] text-gray-400 py-12">
        Invalid gate link — missing content parameters.
      </div>
    )
  }

  return (
    <div className="w-full max-w-[560px] mx-auto mt-6 px-3 sm:mt-8 sm:px-0 space-y-4">

      {/* ── Content card ── */}
      <div ref={contentRef} className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-[#111216]">

        {/* Blurred placeholder shown behind the auth overlay */}
        {!fullyAuthorised && paymentMode !== 'x402' && <ContentPlaceholder title={title} />}

        {/* ── Auth steps overlay ── */}
        {!fullyAuthorised && (
          <OverlayShell dripRate={dripRate} sessionCap={sessionCap} paymentMode={paymentMode} gateMode={gateMode}>

            {paymentMode === 'choice' ? (
              <div className="w-full max-w-[340px] space-y-3 text-left">
                {checkpointContentAvailable && (
                  <button
                    type="button"
                    onClick={() => {
                      setContentError(null)
                      setContentState('idle')
                      setSelectedPaymentMode('checkpoint')
                    }}
                    className="w-full rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-left shadow-sm transition-colors hover:border-blue-300 dark:border-blue-400/20 dark:bg-blue-500/10 dark:hover:border-blue-400/35"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-black text-gray-900 dark:text-gray-100">Pay as you read</p>
                        <p className="mt-1 text-[12px] leading-relaxed text-gray-500 dark:text-gray-400">
                          Prepay {formatUsdc(sessionCap)} USDC. Reading releases 25%, 50%, 75%, and 100%; unread balance stays refundable.
                        </p>
                      </div>
                      <span className="rounded-full bg-blue-600 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white dark:bg-blue-400 dark:text-gray-950">
                        Nano
                      </span>
                    </div>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    if (!streamContentAvailable) return
                    setContentError(null)
                    setContentState('idle')
                    setSelectedPaymentMode('escrow')
                  }}
                  disabled={!streamContentAvailable}
                  className={[
                    'w-full rounded-2xl border p-4 text-left shadow-sm transition-colors',
                    streamContentAvailable
                      ? 'border-emerald-200 bg-emerald-50/60 hover:border-emerald-300 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:hover:border-emerald-400/35'
                      : 'cursor-not-allowed border-gray-100 bg-gray-50 opacity-70 dark:border-white/10 dark:bg-white/[0.04]',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={['text-[13px] font-black', streamContentAvailable ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-600'].join(' ')}>
                        Pay as you watch
                      </p>
                      <p className="mt-1 text-[12px] leading-relaxed text-gray-500 dark:text-gray-400">
                        {streamContentAvailable
                          ? `Timed Arc stream at $${dripRate.toFixed(4)}/sec. End anytime; unused USDC stays refundable.`
                          : 'Timed streaming is reserved for live and video content. Articles and books use fixed unlock.'}
                      </p>
                    </div>
                    <span className={['rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em]', streamContentAvailable ? 'bg-emerald-600 text-white dark:bg-emerald-400 dark:text-gray-950' : 'bg-gray-100 text-gray-400 dark:bg-white/[0.06] dark:text-gray-500'].join(' ')}>
                      Nano
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setContentError(null)
                    setContentState('idle')
                    setSelectedPaymentMode('x402')
                  }}
                  className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-gray-300 dark:border-white/10 dark:bg-[#111216] dark:hover:border-white/25"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-black text-gray-900 dark:text-gray-100">Buy full access</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-gray-500 dark:text-gray-400">
                        Pay {formatUsdc(sessionCap)} USDC once with x402 and keep access to this content.
                      </p>
                    </div>
                    <span className="rounded-full bg-gray-950 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white dark:bg-white dark:text-gray-950">
                      x402
                    </span>
                  </div>
                </button>

                {!streamContentAvailable && (
                  <p className="text-center text-[11px] font-medium text-gray-400 dark:text-gray-500">
                    {checkpointContentAvailable
                      ? 'Scroll checkpoints release creator earnings only as readers progress.'
                      : 'Progress reading is only available for in-page articles and books.'}
                  </p>
                )}
              </div>
            ) : paymentMode === 'x402' ? (
              <div className="w-full space-y-4">
                <div className="rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm dark:border-white/10 dark:bg-[#111216]">
                  {unlockStep === 'intro' && (
                    <div className="space-y-4 text-center">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-blue-600">
                        <LockIcon />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[13px] font-bold text-gray-900">Private creator content</p>
                        <p className="mx-auto max-w-[280px] text-[12px] leading-relaxed text-gray-500">
                          Use your HashpayStream payment wallet to unlock this content.
                        </p>
                      </div>
                    </div>
                  )}

                  {unlockStep === 'choose' && (
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-bold text-gray-900">Choose reader wallet</p>
                          <p className="mt-1 text-[12px] leading-relaxed text-gray-500">
                            Select a wallet to pay this creator: {creator ? shortAddress(creator) : 'verified gate'}.
                          </p>
                        </div>
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-100">
                          Secure
                        </span>
                      </div>
                      {agentOptionsLoading && (
                        <p className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 text-center text-[12px] text-gray-500">
                          Loading reader wallets...
                        </p>
                      )}
                      {!agentOptionsLoading && agentOptions.length === 0 && (
                        <p className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-3 text-center text-[12px] font-medium text-blue-700">
                          Add a reader wallet to unlock this content.
                        </p>
                      )}
                      {agentOptions.map(agent => {
                        const active = safeAgentSlug === agent.slug
                        const ready = Boolean(agent.connected)
                        return (
                          <button
                            key={agent.slug}
                            type="button"
                            onClick={async () => {
                              setAgentSlug(agent.slug)
                              setWalletError(null)
                              setContentError(null)
                              setCircleNotice(null)
                              if (contentState === 'error') setContentState('idle')
                              setUnlockStep(ready ? 'choose' : 'email')
                            }}
                            className={[
                              'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition-all',
                              active
                                ? 'border-blue-200 bg-blue-50/80'
                                : 'border-gray-100 bg-gray-50 hover:border-gray-200 hover:bg-white',
                            ].join(' ')}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-bold text-gray-900">
                                {paymentWalletName(agent)}
                              </span>
                              <span className="mt-0.5 block truncate font-mono text-[11px] text-gray-500">
                                {agent.walletAddress ? shortAddress(agent.walletAddress) : 'Email sign-in'}
                              </span>
                              <span className="mt-0.5 block truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                                {paymentWalletSourceText(agent)}
                              </span>
                              {agent.walletAddress && (
                                <span className="mt-2 grid grid-cols-2 gap-1.5">
                                  <span className="min-w-0 rounded-lg border border-white bg-white/80 px-2 py-1">
                                    <span className="block text-[9px] font-bold uppercase tracking-[0.1em] text-gray-400">Arc</span>
                                    <span className="block truncate text-[10px] font-bold text-gray-700">
                                      {balancePreviewLabel(agent.balance, agent.balanceChecked)}
                                    </span>
                                  </span>
                                  <span className="min-w-0 rounded-lg border border-white bg-white/80 px-2 py-1">
                                    <span className="block text-[9px] font-bold uppercase tracking-[0.1em] text-gray-400">x402</span>
                                    <span className="block truncate text-[10px] font-bold text-gray-700">
                                      {balancePreviewLabel(agent.gatewayBalance, agent.gatewayBalanceChecked)}
                                    </span>
                                  </span>
                                </span>
                              )}
                            </span>
                            <span className={[
                              'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold',
                              ready ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
                            ].join(' ')}>
                              {paymentWalletStatusText(agent)}
                            </span>
                          </button>
                        )
                      })}
                      <button
                        type="button"
                        onClick={() => {
                          setAgentSlug('')
                          setWalletError(null)
                          setUnlockStep('email')
                        }}
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-[12px] font-bold text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50"
                      >
                        Add another email
                      </button>
                      {selectedAgent?.walletAddress && (
                        <button
                          type="button"
                          onClick={() => void disconnectPaymentWallet(selectedAgent.slug)}
                          disabled={walletBusy}
                          className="w-full rounded-xl border border-red-100 bg-red-50 px-3 py-3 text-[12px] font-bold text-red-700 transition-all hover:border-red-200 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {walletBusy ? 'Signing out...' : 'Sign out current wallet'}
                        </button>
                      )}
                      {agentOptionsError && (
                        <p className="text-center text-[11px] text-amber-600">{agentOptionsError}</p>
                      )}
                    </div>
                  )}

                  {unlockStep === 'email' && (
                    <div className="space-y-3">
                      <div className="border-b border-gray-100 pb-3">
                        <p className="text-[13px] font-bold text-gray-900">Open reader wallet</p>
                        <p className="mt-1 text-[12px] leading-relaxed text-gray-500">
                          Enter the wallet email. We will send a one-time code.
                        </p>
                      </div>
                      <label className="block space-y-1.5">
                        <span className="text-[11px] font-semibold text-gray-600">Email</span>
                        <input
                          type="email"
                          value={walletEmail}
                          onChange={event => {
                            setWalletEmail(event.target.value)
                            setWalletError(null)
                            setContentError(null)
                          }}
                          placeholder="you@example.com"
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-[14px] text-gray-900 outline-none placeholder:text-gray-300 focus:border-blue-300"
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setUnlockStep(agentOptions.length > 0 ? 'choose' : 'intro')}
                          className="rounded-xl border border-gray-200 bg-white px-3 py-3 text-[12px] font-bold text-gray-600"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          onClick={() => void startPaymentWalletLogin()}
                          disabled={walletBusy}
                          className="rounded-xl bg-gray-950 px-3 py-3 text-[12px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {walletBusy ? 'Sending...' : 'Send code'}
                        </button>
                      </div>
                    </div>
                  )}

                  {unlockStep === 'otp' && (
                    <div className="space-y-3">
                      <div className="border-b border-gray-100 pb-3">
                        <p className="text-[13px] font-bold text-gray-900">Enter verification code</p>
                        <p className="mt-1 text-[12px] leading-relaxed text-gray-500">
                          We sent a code to {walletOtpContext?.email || walletEmail || 'your email'}.
                        </p>
                      </div>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={walletOtp}
                        onChange={event => setWalletOtp(event.target.value.replace(/\D/g, '').slice(0, 8))}
                        placeholder="000000"
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-center font-mono text-[18px] font-bold tracking-[0.35em] text-gray-900 outline-none placeholder:text-gray-300 focus:border-blue-300"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setUnlockStep('email')}
                          className="rounded-xl border border-gray-200 bg-white px-3 py-3 text-[12px] font-bold text-gray-600"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          onClick={completePaymentWalletLogin}
                          disabled={walletBusy}
                          className="rounded-xl bg-gray-950 px-3 py-3 text-[12px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {walletBusy ? 'Verifying...' : 'Verify'}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={resendPaymentWalletCode}
                        disabled={walletBusy}
                        className="w-full rounded-xl border border-blue-100 bg-blue-50 px-3 py-3 text-[12px] font-bold text-blue-700 transition-all hover:border-blue-200 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {walletBusy ? 'Sending...' : 'Resend code'}
                      </button>
                      <p className="text-center text-[11px] leading-relaxed text-gray-400">
                        Use the newest email code. Resending replaces the previous code.
                      </p>
                    </div>
                  )}

                  {unlockStep === 'fund' && (
                    <div className="space-y-3">
                      <div className="border-b border-gray-100 pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[13px] font-bold text-gray-900">Activate x402</p>
                            <p className="mt-1 text-[12px] leading-relaxed text-gray-500">
                              Move Arc Testnet USDC into the reader payment balance, then unlock.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setWalletError(null)
                              setContentError(null)
                              setUnlockStep(agentOptions.length > 0 ? 'choose' : 'email')
                            }}
                            className="shrink-0 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-bold text-gray-700"
                          >
                            Switch
                          </button>
                        </div>
                      </div>
                      {selectedAgent && (
                        <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-bold text-blue-900">{paymentWalletName(selectedAgent)}</p>
                              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-500">
                                {paymentWalletSourceText(selectedAgent)}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-blue-700 ring-1 ring-blue-100">
                              Reader wallet
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => void disconnectPaymentWallet(selectedAgent.slug)}
                            disabled={walletBusy}
                            className="mt-2 w-full rounded-lg border border-blue-100 bg-white/80 px-3 py-2 text-[11px] font-bold text-blue-700 transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {walletBusy ? 'Signing out...' : 'Sign out and use another wallet'}
                          </button>
                        </div>
                      )}
                      {selectedAgent?.walletAddress && (
                        <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">Selected wallet address</p>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <p className="min-w-0 truncate font-mono text-[12px] text-gray-700">{selectedAgent.walletAddress}</p>
                            <button
                              type="button"
                              onClick={copyPaymentWalletAddress}
                              className="shrink-0 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10px] font-bold text-gray-600"
                            >
                              {copiedWallet ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div className="rounded-lg border border-white bg-white px-3 py-2">
                              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">{CREATOR_X402_GATEWAY_LABEL} wallet</p>
                              <p className="mt-0.5 truncate text-[12px] font-bold text-gray-900">
                                {formatBalanceLabel(selectedAgent.balance) || (selectedAgent.balanceChecked ? '0 USDC' : 'Checking...')}
                              </p>
                              {selectedAgent.balanceError && (
                                <p className="mt-1 text-[10px] font-medium text-amber-600">{selectedAgent.balanceError}</p>
                              )}
                            </div>
                            <div className="rounded-lg border border-white bg-white px-3 py-2">
                              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">Payment balance</p>
                              <p className="mt-0.5 truncate text-[12px] font-bold text-gray-900">
                                {formatBalanceLabel(selectedAgent.gatewayBalance) || (selectedAgent.gatewayBalanceChecked ? '0 USDC' : 'Checking...')}
                              </p>
                              {selectedAgent.gatewayBalanceError && (
                                <p className="mt-1 text-[10px] font-medium text-amber-600">{selectedAgent.gatewayBalanceError}</p>
                              )}
                            </div>
                          </div>
                          {selectedAgent.balanceChecked && numericBalance(selectedAgent.balance) <= 0 && (
                            <p className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-medium leading-relaxed text-amber-700">
                              Fund this reader wallet with Arc Testnet USDC before activating x402.
                            </p>
                          )}
                          {fundingAmountExceedsBalance && (
                            <p className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-medium leading-relaxed text-amber-700">
                              Amount is higher than the current {CREATOR_X402_GATEWAY_LABEL} wallet balance.
                            </p>
                          )}
                        </div>
                      )}
                      <div className="rounded-xl border border-gray-100 bg-white px-3 py-3">
                        <label className="block space-y-1.5">
                          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">Activation amount</span>
                          <div className="flex min-h-[46px] items-center rounded-xl border border-gray-200 bg-gray-50 px-3 focus-within:border-blue-300">
                            <input
                              type="number"
                              min="0.5"
                              step="0.1"
                              value={fundAmount}
                              onChange={event => {
                                setFundAmount(event.target.value)
                                setWalletError(null)
                                setFundMessage(null)
                              }}
                              className="min-w-0 flex-1 bg-transparent text-[15px] font-bold text-gray-900 outline-none"
                            />
                            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">USDC</span>
                          </div>
                        </label>
                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => void activatePaymentBalance()}
                            disabled={fundBusy || gatewayActivationBlocked}
                            className="flex min-h-[46px] items-center justify-center rounded-xl bg-gray-950 px-3 py-3 text-[12px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {fundBusy ? <><Spinner />Activating...</> : 'Activate x402'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void checkPaymentActivation()}
                            disabled={fundBusy || fundingNeedsReconnect}
                            className="min-h-[46px] rounded-xl border border-gray-200 bg-white px-3 py-3 text-[12px] font-bold text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Check activation
                          </button>
                        </div>
                      </div>
                      <p className="text-center text-[11px] leading-relaxed text-gray-400">
                        Want to manage your Circle x402 wallet?{' '}
                        <a href={x402WalletManagerHref()} className="font-semibold text-gray-500 underline underline-offset-2">
                          Open wallet manager
                        </a>
                      </p>
                    </div>
                  )}
                </div>

                {(unlockStep === 'intro' || unlockStep === 'choose') && (
                  <button
                    onClick={handlePrimaryGatewayPay}
                    disabled={gatewayPaying || (privyAuthenticated && unlockStep !== 'intro' && !safeAgentSlug)}
                    className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-[13px] font-semibold text-white transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ background: '#111827' }}
                  >
                    {gatewayPaying
                      ? <><Spinner />Unlocking...</>
                      : unlockStep === 'choose' && selectedAgent?.connected
                      ? 'Unlock content'
                      : 'Continue to unlock'}
                  </button>
                )}

                {circleNotice && (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-center text-[12px] font-medium text-emerald-700">
                    {circleNotice}
                  </div>
                )}
                {fundMessage && (
                  <div className={[
                    'rounded-xl border px-3 py-2.5 text-center text-[12px] font-medium',
                    gatewayActivationPending
                      ? 'border-amber-100 bg-amber-50 text-amber-700'
                      : 'border-emerald-100 bg-emerald-50 text-emerald-700',
                  ].join(' ')}>
                    {fundMessage}
                  </div>
                )}
                {(walletError || (contentState === 'error' && contentError)) && (
                  <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-center text-[12px] font-medium text-red-600">
                    {walletError || contentError}
                  </div>
                )}
              </div>
            ) : paymentMode === 'checkpoint' ? (
              <div className="w-full space-y-3 text-left">
                <div>
                  <p className="text-[12px] font-black text-gray-950 dark:text-white">Pay as you read</p>
                  <p className="mt-1 text-[12px] leading-5 text-gray-500 dark:text-gray-400">
                    Prepay {formatUsdc(sessionCap)} USDC. Creator earnings unlock only as you reach reading milestones.
                  </p>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[25, 50, 75, 100].map(mark => (
                    <span key={mark} className="rounded-lg bg-blue-50 px-2 py-1.5 text-center text-[10px] font-black text-blue-600 ring-1 ring-blue-100 dark:bg-blue-500/10 dark:text-blue-200 dark:ring-blue-400/20">
                      {mark}%
                    </span>
                  ))}
                </div>
                <input
                  type="email"
                  value={walletEmail}
                  onChange={event => setWalletEmail(event.target.value)}
                  placeholder="reader@email.com"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-[13px] font-semibold text-gray-900 outline-none focus:border-blue-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                />
                {(checkpointError || contentError) && (
                  <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-600 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-200">
                    {checkpointError || contentError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={startCheckpointEscrow}
                  disabled={checkpointBusy}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100"
                >
                  {checkpointBusy ? <><Spinner />Starting...</> : 'Start pay-as-you-read'}
                </button>
              </div>
            ) : paymentMode === 'escrow' ? (
              <div className="w-full max-w-[320px] space-y-3 text-center">
                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-600">
                    <LockIcon />
                  </div>
                  <p className="mt-3 text-[13px] font-bold text-gray-900">Pay-as-you-read nano meter</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-gray-500">
                    Stream ${dripRate.toFixed(4)}/sec up to {formatUsdc(sessionCap)} USDC. Stop anytime; unstreamed USDC remains refundable.
                  </p>
                  {streamVault && contentState === 'error' && contentError && (
                    <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-medium leading-relaxed text-amber-700">
                      {contentError}
                    </p>
                  )}
                </div>
                {streamVault && !prepaidStreamEnded ? (
                  <button
                    type="button"
                    onClick={() => {
                      setContentError(null)
                      setContentState('idle')
                    }}
                    className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-gray-950 px-5 py-3 text-[13px] font-semibold text-white"
                  >
                    Check nano meter
                  </button>
                ) : (
                  <a
                    href={streamEscrowHref()}
                    className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-gray-950 px-5 py-3 text-[13px] font-semibold text-white"
                  >
                    {prepaidStreamEnded ? 'Start new nano meter' : 'Start nano meter'}
                  </a>
                )}
              </div>
            ) : (
              <>
                {!isConnected && (
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-5 py-3 text-center text-[12px] text-gray-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400">
                    Legacy signed-viewer access is not available for public testing. Use fixed unlock or pay-as-you-read.
                  </div>
                )}

                {isConnected && !isOnArc && (
                  <button
                    onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
                    className="flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[13px] font-semibold text-white min-h-[48px] transition-all active:scale-[0.98]"
                    style={{ background: '#111827' }}
                  >
                    Switch to Arc Network
                  </button>
                )}
              </>
            )}

            {paymentMode === 'poa' && isConnected && isOnArc && !passkey.registered && (
              <>
                <button
                  onClick={() => void passkey.register()}
                  disabled={passkey.registering}
                  className="flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[13px] font-semibold text-white min-h-[48px] transition-all active:scale-[0.98]"
                  style={{ background: '#111827' }}
                >
                  {passkey.registering
                    ? <><Spinner />Authorizing…</>
                    : <><FingerprintIcon />Authorize via Passkey</>}
                </button>
                {passkey.error && (
                  <p className="text-[11px] text-red-500 text-center max-w-[260px]">{passkey.error}</p>
                )}
              </>
            )}

            {paymentMode === 'poa' && isConnected && isOnArc && passkey.registered && !isApproved && (
              <>
                {!POA_CONTRACT ? (
                  <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-center text-[12px] text-amber-700">
                    Contract not configured — set VITE_POA_CONTRACT on Render
                  </div>
                ) : approvePending ? (
                  <div className="space-y-2 w-full max-w-[260px]">
                    <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 py-3 text-[13px] text-gray-500">
                      <Spinner />Approval pending on Arc…
                    </div>
                    {approveTx && (
                      <button
                        type="button"
                        onClick={() => window.open(`https://testnet.arcscan.app/tx/${approveTx}`, '_blank', 'noopener,noreferrer')}
                        className="flex w-full items-center justify-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-gray-800 underline underline-offset-2 transition-colors"
                      >
                        <ExtLinkIcon />Track on Arcscan
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="text-center space-y-1 max-w-[260px]">
                      <p className="text-[13px] font-semibold text-gray-800">Set Spending Limit</p>
                      <p className="text-[12px] text-gray-500">
                        Approve up to{' '}
                        <span className="font-semibold">${sessionCap.toFixed(2)} USDC</span>
                        {' '}for this session.
                      </p>
                    </div>
                    <button
                      onClick={handleApprove}
                      disabled={approving}
                      className="flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[13px] font-semibold text-white min-h-[48px] transition-all active:scale-[0.98]"
                      style={{ background: '#111827' }}
                    >
                      {approving ? <><Spinner />Confirm in wallet…</> : 'Approve USDC Spending'}
                    </button>
                    {approveError && (
                      <p className="text-[11px] text-red-500 text-center max-w-[260px]">{approveError}</p>
                    )}
                  </>
                )}
              </>
            )}

            {(paymentMode === 'x402' || paymentMode === 'poa') && <StepDots current={currentStep} />}
          </OverlayShell>
        )}

        {/* ── Content loading ── */}
        {fullyAuthorised && contentState === 'loading' && (
          <div className="flex items-center justify-center gap-3 py-16 text-gray-400">
            <Spinner />
            <span className="text-[13px]">Unlocking content…</span>
          </div>
        )}

        {/* ── Native text content — reader view ── */}
        {fullyAuthorised && contentState === 'ready' && fetchedContent?.type === 'text' && (
          <div className="p-6 space-y-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-500">Unlocked Content</p>
            {paymentMode === 'escrow' && (
              <InlineStreamMeter snapshot={streamMeter} streamVault={streamVault} />
            )}
            {paymentMode === 'checkpoint' && (
              <InlineCheckpointMeter
                released={checkpointReleased}
                sessionCap={sessionCap}
                checkpointVault={checkpointVault}
                refunding={checkpointRefunding}
                refunded={checkpointRefunded}
                error={checkpointError}
                onRefund={refundCheckpointEscrow}
              />
            )}
            {fetchedContent.coverImage && (
              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-gray-100 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
                <img
                  src={fetchedContent.coverImage}
                  alt=""
                  className="h-40 w-full object-cover sm:h-48"
                  loading="lazy"
                />
              </div>
            )}
            {title && (
              <div className="flex items-start justify-between gap-3">
                <h2 className="min-w-0 text-[18px] font-bold leading-snug text-gray-900 dark:text-white">{title}</h2>
                <ViewCountBadge count={contentViewCount} />
              </div>
            )}
            <div
              className="max-h-[480px] overflow-y-auto pr-1"
              onScroll={event => {
                const el = event.currentTarget
                const progress = (el.scrollTop + el.clientHeight) / Math.max(el.scrollHeight, 1)
                handleReadableProgress(progress)
              }}
            >
              <div
                className="text-[14px] leading-7 text-gray-700 dark:text-gray-300 [&_a]:font-semibold [&_a]:text-blue-600 dark:[&_a]:text-blue-300 [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 dark:[&_blockquote]:border-white/20 [&_blockquote]:pl-3 [&_blockquote]:text-gray-500 dark:[&_blockquote]:text-gray-400 [&_code]:cursor-pointer [&_code]:rounded-md [&_code]:bg-gray-100 dark:[&_code]:bg-white/10 [&_code]:px-2 [&_code]:py-1 [&_code]:font-mono [&_code]:text-[12px] [&_code]:font-semibold [&_code]:text-gray-900 dark:[&_code]:text-white [&_em]:italic [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-[18px] [&_h2]:font-black [&_h2]:text-gray-950 dark:[&_h2]:text-white [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-[16px] [&_h3]:font-bold [&_h3]:text-gray-900 dark:[&_h3]:text-gray-100 [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-3 [&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-gray-950 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-gray-50 [&_strong]:font-black"
                onClick={async event => {
                  const code = (event.target as HTMLElement).closest('code')
                  const value = code?.textContent?.trim()
                  if (!value || !navigator.clipboard) return
                  await navigator.clipboard.writeText(value).catch(() => undefined)
                  showCopyToast(`Copied: ${value.length > 42 ? `${value.slice(0, 39)}...` : value}`)
                }}
                dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(fetchedContent.content) }}
              />
            </div>
            <CreatorSocialPanel
              social={social}
              loading={socialLoading}
              error={socialError}
              commentBody={commentBody}
              commentsOpen={commentsOpen}
              onReact={updateCreatorReaction}
              onCommentBody={setCommentBody}
              onSubmitComment={addCreatorSocialComment}
              onToggleComments={() => setCommentsOpen(open => !open)}
              onCommentReact={updateCreatorCommentReaction}
            />
            {midpointPromptOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
                <div className="w-full max-w-[340px] rounded-2xl border border-white/20 bg-white p-5 text-center shadow-2xl dark:border-white/10 dark:bg-[#111216]">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-500">Quick check</p>
                  <h3 className="mt-2 text-[18px] font-black text-gray-950 dark:text-white">Enjoying your stream?</h3>
                  <p className="mt-1 text-[12px] leading-5 text-gray-500 dark:text-gray-400">Your feedback helps creators understand what readers value.</p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => updateCreatorReaction('up')} className="rounded-xl bg-blue-600 px-4 py-3 text-[16px] font-black text-white shadow-sm hover:bg-blue-700" aria-label="Thumbs up">👍</button>
                    <button type="button" onClick={() => updateCreatorReaction('down')} className="rounded-xl border border-gray-200 px-4 py-3 text-[16px] font-black text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/10" aria-label="Thumbs down">👎</button>
                  </div>
                  <button type="button" onClick={() => setMidpointPromptOpen(false)} className="mt-3 text-[11px] font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">Not now</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Private URL — reveal button ── */}
        {fullyAuthorised && contentState === 'ready' && fetchedContent?.type === 'book' && (
          <BookUnlocked
            contentId={contentId}
            title={title}
            coverImage={fetchedContent.coverImage}
            viewCount={contentViewCount}
            streamMeter={paymentMode === 'escrow' ? streamMeter : null}
            streamVault={streamVault}
            checkpointReleased={paymentMode === 'checkpoint' ? checkpointReleased : null}
            checkpointVault={checkpointVault}
            sessionCap={sessionCap}
            checkpointRefunding={checkpointRefunding}
            checkpointRefunded={checkpointRefunded}
            checkpointError={checkpointError}
            onCheckpointRefund={refundCheckpointEscrow}
            onReadingProgress={handleReadableProgress}
            social={social}
            socialLoading={socialLoading}
            socialError={socialError}
            commentBody={commentBody}
            commentsOpen={commentsOpen}
            onReact={updateCreatorReaction}
            onCommentBody={setCommentBody}
            onSubmitComment={addCreatorSocialComment}
            onToggleComments={() => setCommentsOpen(open => !open)}
            onCommentReact={updateCreatorCommentReaction}
          />
        )}

        {fullyAuthorised && contentState === 'ready' && fetchedContent?.type === 'url' && (
          <div className="p-6 space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 border border-emerald-100">
              <svg className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            {title && <p className="text-[15px] font-bold text-gray-900 dark:text-gray-100">{title}</p>}
            <p className="text-[12px] text-gray-500 dark:text-gray-400">Your private link is ready</p>
            <button
              onClick={() => window.open(fetchedContent.content, '_blank', 'noopener,noreferrer')}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[14px] font-semibold text-white transition-all active:scale-[0.98]"
              style={{ background: '#111827' }}
            >
              Access Content
            </button>
          </div>
        )}

        {fullyAuthorised && contentState === 'ready' && fetchedContent?.type === 'scores' && (
          <WorldCupScoresUnlocked />
        )}

        {/* ── Content error ── */}
        {fullyAuthorised && contentState === 'error' && (
          <div className="p-6 text-center space-y-3">
            <p className="text-[13px] text-red-500">{contentError}</p>
            <button
              onClick={() => setContentState('idle')}
              className="text-[12px] font-semibold text-gray-500 underline underline-offset-2 hover:text-gray-800 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── ViewerHUD — drip meter ── */}
        {paymentMode === 'poa' && fullyAuthorised && contentState === 'ready' && !ended && (
          <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span className="text-[11px] font-semibold text-gray-500">
                  {poa.isPaused  ? 'Idle — move to resume'
                   : poa.isActive ? 'Session Active'
                   : poa.capHit  ? 'Session Complete'
                   :               'Session Paused'}
                </span>
              </div>
              <span className="font-mono text-[12px] font-semibold text-gray-700">
                ${poa.accrued.toFixed(6)}{' '}
                <span className="text-gray-400 font-normal">/ ${sessionCap.toFixed(2)}</span>
              </span>
            </div>

            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width:      `${progressPct}%`,
                  background: progressPct >= 100 ? '#6b7280' : '#3b82f6',
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <p className="text-[10px] text-gray-400">
                {gateMode === 'unlock' ? 'Sign once to confirm this access payment' : 'Sign once when done reading to confirm payment'}
              </p>
              <button
                onClick={handleEndSession}
                disabled={ending || poa.accrued === 0}
                className="text-[10px] font-semibold transition-colors disabled:opacity-40"
                style={{ color: ending ? '#9ca3af' : '#111827' }}
              >
                {ending ? 'Signing…' : 'End Session'}
              </button>
            </div>
          </div>
        )}

        {/* ── Session ended confirmation ── */}
        {paymentMode === 'poa' && fullyAuthorised && ended && (
          <div className="border-t border-gray-100 bg-emerald-50/60 px-4 py-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <span className="text-[11px] font-semibold text-emerald-700">
                Payment signed — ${poa.accrued.toFixed(6)} USDC
              </span>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-emerald-600">
                {gateMode === 'unlock' ? 'Your creator access payment is ready to settle on Arc.' : 'The creator can now settle your payment on Arc.'}
              </p>
              <button
                onClick={() => setEnded(false)}
                className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 underline underline-offset-2 transition-colors"
              >
                {gateMode === 'unlock' ? 'Open again' : 'Read again'}
              </button>
            </div>
          </div>
        )}

        {paymentMode === 'x402' && fullyAuthorised && gatewayReference && (
          <div className="border-t border-gray-100 bg-white px-4 py-3 dark:border-white/10 dark:bg-[#111216]">
            <button
              type="button"
              onClick={() => setReceiptOpen(open => !open)}
              className="flex w-full items-center gap-2 text-left"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-400/10 dark:ring-emerald-400/20"><CheckIcon /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
                  {gatewayRestored ? 'Access restored' : 'Content unlocked'}
                </p>
                <p className="mt-0.5 truncate font-mono text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                  Circle Gateway - {gatewayReference.slice(0, 8)}...{gatewayReference.slice(-6)}
                </p>
              </div>
              <span className="text-[11px] font-black text-gray-400">{receiptOpen ? 'Hide' : 'Details'}</span>
            </button>
            {receiptOpen && (
            <div className="mt-3 grid gap-2 rounded-2xl border border-gray-100 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
              {gatewayRestored && (
                <p className="text-[11px] font-semibold leading-4 text-emerald-700/80 dark:text-emerald-300/80">
                  This reader wallet already unlocked this content.
                </p>
              )}
              {gatewayReceiptId && (
                <button
                  type="button"
                  onClick={openGatewayReceiptPdf}
                  disabled={gatewayReceiptOpening || !gatewayReceiptReady}
                  className={[
                    'flex w-full items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-all active:scale-[0.98]',
                    gatewayReceiptReady
                      ? 'bg-gray-900 text-white hover:bg-gray-800'
                      : 'cursor-not-allowed bg-gray-100 text-gray-400',
                  ].join(' ')}
                >
                  <ReceiptIcon />
                  {gatewayReceiptOpening ? 'Opening receipt...' : gatewayReceiptReady ? 'View receipt' : 'Receipt archiving'}
                </button>
              )}
              <div className={gatewayTxIsExplorerHash ? 'grid grid-cols-2 gap-2' : 'grid gap-2'}>
                {gatewayOgReady ? (
                  <a
                    href={gatewayOgExplorer || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => {
                      if (!gatewayOgExplorer) event.preventDefault()
                    }}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-purple-100 bg-purple-50 px-3 py-2.5 text-[12px] font-bold text-purple-700 transition-colors hover:bg-purple-100"
                  >
                    <img src="/brand/0g-logo.jpeg" alt="0G" className="h-3.5 w-3.5 rounded-full object-contain" />
                    0G archived
                    {gatewayOgProof && <span className="font-mono text-[10px] text-purple-500">{gatewayOgProof.slice(0, 6)}...{gatewayOgProof.slice(-4)}</span>}
                  </a>
                ) : (
                  <div className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-100 bg-white px-3 py-2.5 text-[12px] font-semibold text-gray-400">
                    {gatewayArchiveTimedOut ? (
                      <span className="h-3.5 w-3.5 rounded-full border border-gray-300" />
                    ) : (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-400" />
                    )}
                    {gatewayArchiveLabel}
                  </div>
                )}
                {gatewayTxIsExplorerHash && (
                  <button
                    type="button"
                    onClick={() => window.open(`https://testnet.arcscan.app/tx/${gatewayTx}`, '_blank', 'noopener,noreferrer')}
                    className="flex items-center justify-center rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-[12px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
                  >
                    ArcScan
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(gatewayReference).catch(() => {})
                  setGatewayReferenceCopied(true)
                  window.setTimeout(() => setGatewayReferenceCopied(false), 1600)
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white/55 px-5 py-2.5 text-sm font-medium text-emerald-800 transition-all hover:bg-white active:scale-[0.98]"
              >
                {gatewayReferenceCopied ? 'Reference copied' : 'Copy reference'}
              </button>
            </div>
            )}
          </div>
        )}
      </div>

      {/* ── Creator / rate strip ── */}
      <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
        <div className="space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Creator</p>
          <p className="font-mono text-[12px] text-gray-600">
            {creator ? `${creator.slice(0, 6)}…${creator.slice(-4)}` : '—'}
          </p>
        </div>
        <div className="text-right space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            {gateMode === 'unlock' ? 'Access Price' : 'Nano Rate'}
          </p>
          <p className="text-[12px] font-semibold text-gray-700">
            {gateMode === 'unlock' ? `${formatUsdc(sessionCap)} USDC` : `$${dripRate.toFixed(4)}/sec`}
          </p>
        </div>
      </div>

    </div>
  )
}

// ── Shared overlay shell ──────────────────────────────────────────────────────

function CreatorSocialPanel({
  social,
  loading,
  error,
  commentBody,
  commentsOpen,
  onReact,
  onCommentBody,
  onSubmitComment,
  onToggleComments,
  onCommentReact,
}: {
  social: CreatorSocialState
  loading: boolean
  error: string | null
  commentBody: string
  commentsOpen: boolean
  onReact: (reaction: CreatorReaction) => void
  onCommentBody: (value: string) => void
  onSubmitComment: () => void
  onToggleComments: () => void
  onCommentReact: (commentId: string, reaction: CreatorReaction, current: CreatorReaction | null) => void
}) {
  const reactionClass = (active: boolean) => [
    'inline-flex h-8 min-w-[58px] items-center justify-center gap-1.5 rounded-full border px-2.5 text-[12px] font-black transition',
    active
      ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10',
  ].join(' ')

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_10px_30px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">Reader pulse</p>
          <p className="mt-0.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400">{loading ? 'Loading...' : 'Tap again to remove.'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onReact('up')} className={reactionClass(social.myReaction === 'up')}>
            <span aria-hidden="true">👍</span>
            <span>{social.upCount}</span>
          </button>
          <button type="button" onClick={() => onReact('down')} className={reactionClass(social.myReaction === 'down')}>
            <span aria-hidden="true">👎</span>
            <span>{social.downCount}</span>
          </button>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={commentBody}
          onChange={event => onCommentBody(event.target.value)}
          maxLength={800}
          placeholder="Leave a comment"
          className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[12px] font-semibold text-gray-900 outline-none focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-[#0b0c0f] dark:text-white"
        />
        <button
          type="button"
          onClick={onSubmitComment}
          disabled={commentBody.trim().length < 2}
          className="rounded-xl bg-gray-950 px-3.5 py-2.5 text-[12px] font-black text-white disabled:cursor-not-allowed disabled:bg-gray-300 dark:bg-white dark:text-gray-950 dark:disabled:bg-white/20 dark:disabled:text-white/40"
        >
          Post
        </button>
      </div>
      {error && <p className="mt-2 text-[11px] font-semibold text-red-500">{error}</p>}

      <button
        type="button"
        onClick={onToggleComments}
        className="mt-2 flex w-full items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-left text-[12px] font-black text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
      >
        <span>Comments</span>
        <span>{social.comments.length}</span>
      </button>

      {commentsOpen && (
        <div className="mt-2 space-y-2">
          {social.comments.length === 0 ? (
            <p className="rounded-xl bg-gray-50 px-3 py-3 text-center text-[12px] font-semibold text-gray-400 dark:bg-white/5">No comments yet.</p>
          ) : social.comments.map(comment => (
            <div key={comment.id} className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-[#0b0c0f]">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[11px] font-bold text-gray-400">{shortAddress(comment.walletAddress)}</p>
                <p className="text-[10px] font-semibold text-gray-400">{new Date(comment.createdAt).toLocaleDateString()}</p>
              </div>
              <p className="mt-1.5 text-[13px] leading-5 text-gray-700 dark:text-gray-300">{comment.body}</p>
              <div className="mt-2 flex items-center gap-2">
                <button type="button" onClick={() => onCommentReact(comment.id, 'up', comment.myReaction)} className={reactionClass(comment.myReaction === 'up')}>
                  <span aria-hidden="true">👍</span>
                  <span>{comment.upCount}</span>
                </button>
                <button type="button" onClick={() => onCommentReact(comment.id, 'down', comment.myReaction)} className={reactionClass(comment.myReaction === 'down')}>
                  <span aria-hidden="true">👎</span>
                  <span>{comment.downCount}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ViewCountBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-gray-100 bg-gray-50 px-2.5 text-[11px] font-black text-gray-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-300" title="Views">
      <EyeIcon />
      {Math.max(0, count).toLocaleString()}
    </span>
  )
}

function InlineStreamMeter({ snapshot, streamVault }: { snapshot: StreamMeterSnapshot | null; streamVault: string }) {
  const total = snapshot?.totalAmount ?? 0n
  const consumed = snapshot?.unlocked ?? 0n
  const claimable = snapshot?.claimable ?? 0n
  const refundable = total > consumed ? total - consumed : 0n
  const percent = total > 0n ? Number((consumed * 100n) / total) : 0
  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3 dark:border-emerald-400/20 dark:bg-emerald-500/10">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
            {snapshot?.cancelled ? 'Stream ended' : 'Timed live stream'}
          </p>
          <p className="mt-0.5 text-[11px] font-semibold text-emerald-700/75 dark:text-emerald-200/75">
            USDC unlocks by elapsed live viewing time. End the stream to refund unused balance.
          </p>
        </div>
        {streamVault && (
          <a href={`/stream/${streamVault}?app=streampay&wallet=circle&role=reader`} className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-100 dark:bg-white/10 dark:text-emerald-200 dark:ring-white/10">
            End / refund
          </a>
        )}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white dark:bg-white/10">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <StreamMeterCell label="Consumed" value={`${formatRawUsdc(consumed)} USDC`} />
        <StreamMeterCell label="Refundable" value={`${formatRawUsdc(refundable)} USDC`} />
        <StreamMeterCell label="Creator claim" value={`${formatRawUsdc(claimable)} USDC`} green />
      </div>
    </div>
  )
}

function StreamMeterCell({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div className="rounded-xl bg-white px-2 py-2 dark:bg-white/[0.06]">
      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500">{label}</p>
      <p className={['mt-0.5 truncate text-[11px] font-black', green ? 'text-emerald-600 dark:text-emerald-300' : 'text-gray-800 dark:text-gray-100'].join(' ')}>
        {value}
      </p>
    </div>
  )
}

function InlineCheckpointMeter({
  released,
  sessionCap,
  checkpointVault,
  refunding,
  refunded,
  error,
  onRefund,
}: {
  released: Record<number, string>
  sessionCap: number
  checkpointVault: string
  refunding: boolean
  refunded: boolean
  error: string | null
  onRefund: () => void
}) {
  const marks = [25, 50, 75, 100]
  const latest = marks.filter(mark => released[mark]).pop() ?? 0
  const releasedAmount = sessionCap * (latest / 100)
  const refundableAmount = Math.max(0, sessionCap - releasedAmount)
  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3 dark:border-blue-400/20 dark:bg-blue-500/10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">
            Pay-as-you-read active
          </p>
          <p className="mt-0.5 text-[11px] font-semibold text-blue-700/75 dark:text-blue-200/75">
            USDC releases only at scroll checkpoints.
          </p>
        </div>
        {checkpointVault && (
          <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-blue-700 ring-1 ring-blue-100 dark:bg-white/10 dark:text-blue-200 dark:ring-white/10">
            {latest}%
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {marks.map(mark => (
          <div key={mark} className={['h-1.5 rounded-full transition-colors', released[mark] ? 'bg-blue-600 dark:bg-blue-300' : 'bg-white dark:bg-white/10'].join(' ')} />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] font-bold">
        <div className="rounded-xl bg-white px-2 py-2 text-gray-500 ring-1 ring-blue-100 dark:bg-white/10 dark:text-gray-300 dark:ring-white/10">
          Released<br /><span className="text-gray-950 dark:text-white">{formatUsdc(releasedAmount)} USDC</span>
        </div>
        <div className="rounded-xl bg-white px-2 py-2 text-gray-500 ring-1 ring-blue-100 dark:bg-white/10 dark:text-gray-300 dark:ring-white/10">
          Refundable<br /><span className="text-gray-950 dark:text-white">{refunded ? 'Refunded' : `${formatUsdc(refundableAmount)} USDC`}</span>
        </div>
      </div>
      {checkpointVault && refundableAmount > 0 && !refunded && (
        <button
          type="button"
          onClick={onRefund}
          disabled={refunding}
          className="mt-2 flex min-h-[36px] w-full items-center justify-center rounded-xl bg-white px-3 text-[11px] font-black text-blue-700 ring-1 ring-blue-100 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white/10 dark:text-blue-200 dark:ring-white/10 dark:hover:bg-white/15"
        >
          {refunding ? 'Refunding unread balance...' : 'End reading and refund unread balance'}
        </button>
      )}
      {refunded && (
        <p className="mt-2 text-[10px] font-black uppercase tracking-[0.12em] text-blue-700 dark:text-blue-200">Reading session ended</p>
      )}
      {error && (
        <p className="mt-2 text-[10px] font-semibold leading-4 text-red-500 dark:text-red-300">{error}</p>
      )}
    </div>
  )
}

function BookUnlocked({
  contentId,
  title,
  coverImage,
  viewCount,
  streamMeter,
  streamVault,
  checkpointReleased,
  checkpointVault,
  sessionCap,
  checkpointRefunding,
  checkpointRefunded,
  checkpointError,
  onCheckpointRefund,
  onReadingProgress,
  social,
  socialLoading,
  socialError,
  commentBody,
  commentsOpen,
  onReact,
  onCommentBody,
  onSubmitComment,
  onToggleComments,
  onCommentReact,
}: {
  contentId: string
  title: string
  coverImage?: string
  viewCount: number
  streamMeter: StreamMeterSnapshot | null
  streamVault: string
  checkpointReleased: Record<number, string> | null
  checkpointVault: string
  sessionCap: number
  checkpointRefunding: boolean
  checkpointRefunded: boolean
  checkpointError: string | null
  onCheckpointRefund: () => void
  onReadingProgress: (progress: number) => void
  social: CreatorSocialState
  socialLoading: boolean
  socialError: string | null
  commentBody: string
  commentsOpen: boolean
  onReact: (reaction: CreatorReaction) => void
  onCommentBody: (value: string) => void
  onSubmitComment: () => void
  onToggleComments: () => void
  onCommentReact: (commentId: string, reaction: CreatorReaction, current: CreatorReaction | null) => void
}) {
  const [book, setBook] = useState<{ title?: string; source?: string; text?: string; coverImage?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(`/api/creator-book?id=${encodeURIComponent(contentId)}`)
      .then(async response => {
        const data = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; title?: string; source?: string; text?: string; coverImage?: string }
        if (!response.ok || !data.ok || !data.text) throw new Error(data.error || 'Book could not load.')
        if (!cancelled) setBook(data)
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Book could not load.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [contentId])

  const paragraphs = (book?.text || '')
    .split(/\n{2,}/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 260)
  const displayTitle = book?.title || title || 'Book reader'
  const displayCover = book?.coverImage || coverImage

  return (
    <div className="space-y-3 p-4 sm:p-5">
      {streamVault && (
        <InlineStreamMeter snapshot={streamMeter} streamVault={streamVault} />
      )}
      {checkpointReleased && (
        <InlineCheckpointMeter
          released={checkpointReleased}
          sessionCap={sessionCap}
          checkpointVault={checkpointVault}
          refunding={checkpointRefunding}
          refunded={checkpointRefunded}
          error={checkpointError}
          onRefund={onCheckpointRefund}
        />
      )}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-[#111216]">
        <div className="flex gap-4 p-4">
          {displayCover && (
            <div className="h-28 w-20 shrink-0 overflow-hidden rounded-xl bg-gray-100 shadow-sm ring-1 ring-gray-100 dark:bg-white/[0.04] dark:ring-white/10">
              <img src={displayCover} alt="" className="h-full w-full object-cover" loading="lazy" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-500">Unlocked Book</p>
              <ViewCountBadge count={viewCount} />
            </div>
            <h2 className="mt-1 text-[20px] font-black leading-tight text-gray-950 dark:text-white">{displayTitle}</h2>
            <p className="mt-2 inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-gray-500 dark:bg-white/[0.08] dark:text-gray-300">
              {book?.source || 'Classic reader'}
            </p>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-gray-50 py-12 text-[12px] font-semibold text-gray-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-300">
          <Spinner />
          Loading book
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-[12px] font-semibold text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div
          className="max-h-[620px] overflow-y-auto rounded-2xl border border-gray-100 bg-[#fffaf3] px-5 py-6 shadow-sm dark:border-white/10 dark:bg-[#111216] sm:px-6"
          onScroll={event => {
            const el = event.currentTarget
            onReadingProgress((el.scrollTop + el.clientHeight) / Math.max(el.scrollHeight, 1))
          }}
        >
          <div className="mx-auto max-w-[62ch] space-y-4 text-[15px] leading-8 text-gray-800 dark:text-gray-200">
            {paragraphs.map((paragraph, index) => (
              <p key={`${contentId}-${index}`} className={index === 0 ? 'text-[16px] font-semibold leading-8 text-gray-950 dark:text-white' : undefined}>
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      )}

      {!loading && !error && (
        <CreatorSocialPanel
          social={social}
          loading={socialLoading}
          error={socialError}
          commentBody={commentBody}
          commentsOpen={commentsOpen}
          onReact={onReact}
          onCommentBody={onCommentBody}
          onSubmitComment={onSubmitComment}
          onToggleComments={onToggleComments}
          onCommentReact={onCommentReact}
        />
      )}
    </div>
  )
}

function WorldCupScoresUnlocked() {
  const [feed, setFeed] = useState<WorldCupScoreFeed | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const matches = feed?.matches ?? []
  const providerReady = Boolean(feed?.providerConfigured && feed.providerStatus === 'connected' && matches.length)
  const status = loading
    ? 'Refreshing'
    : error
    ? 'Provider error'
    : providerReady
    ? 'Live'
    : 'Waiting'

  const loadScores = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/poly-stream?date=${todayMatchdayKey()}`)
      const data = await res.json() as WorldCupScoreFeed
      if (!res.ok || !data.ok) throw new Error('Live scores are not available.')
      setFeed(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Live scores are not available.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadScores()
  }, [loadScores])

  return (
    <div className="space-y-3 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">Unlocked</p>
          <h2 className="mt-1 text-[18px] font-black tracking-tight text-gray-950">World Cup Scores</h2>
          <p className="mt-1 text-[12px] leading-5 text-gray-500">
            Live score context with Polymarket routes when an exact market is matched.
          </p>
        </div>
        <span className={[
          'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase',
          providerReady ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-gray-100 text-gray-500',
        ].join(' ')}>
          {status}
        </span>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-gray-50 py-10 text-[12px] font-semibold text-gray-500">
          <Spinner />
          Loading scores
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-center">
          <p className="text-[13px] font-bold text-rose-700">{error}</p>
          <button
            type="button"
            onClick={() => void loadScores()}
            className="mt-3 rounded-xl bg-white px-4 py-2 text-[12px] font-bold text-rose-700 shadow-sm"
          >
            Refresh
          </button>
        </div>
      )}

      {!loading && !error && matches.length === 0 && (
        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-center">
          <p className="text-[13px] font-bold text-gray-900">Live board is waiting for match data</p>
          <p className="mx-auto mt-1 max-w-xs text-[12px] leading-5 text-gray-500">
            Scores appear when the provider returns live, upcoming, or completed World Cup fixtures.
          </p>
          <button
            type="button"
            onClick={() => void loadScores()}
            className="mt-3 rounded-xl bg-gray-950 px-4 py-2 text-[12px] font-bold text-white"
          >
            Refresh
          </button>
        </div>
      )}

      {!loading && !error && matches.length > 0 && (
        <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1 [scrollbar-width:none]">
          {matches.slice(0, 16).map(match => {
            const state = worldCupMatchDisplayState(match)
            const marketUrl = match.marketStatus === 'matched' && match.polymarketUrl ? match.polymarketUrl : ''
            const matched = Boolean(marketUrl)
            return (
              <div
                key={match.fixtureId || `${match.title}-${match.time}`}
                className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-black uppercase text-gray-600">{state.tag}</span>
                      <span className="text-[10px] font-semibold text-gray-400">{match.time}</span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[13px] font-black leading-snug text-gray-950">{match.title}</p>
                    <p className="mt-1 text-[11px] leading-4 text-gray-500">{state.sub || match.status}</p>
                    {match.probability && <p className="mt-1 text-[11px] font-semibold text-gray-600">{match.probability}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="rounded-xl bg-gray-950 px-3 py-2 text-[14px] font-black tabular-nums text-white">
                      {state.center}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-3">
                  <span className="text-[10px] font-semibold text-gray-400">
                    {matched ? 'Exact market matched' : 'Market pending'}
                  </span>
                  {matched ? (
                    <button
                      type="button"
                      onClick={() => window.open(marketUrl, '_blank', 'noopener,noreferrer')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-gray-950 px-3 py-2 text-[11px] font-black text-white transition-all active:scale-[0.98]"
                    >
                      <img src={POLYMARKET_LOGO} alt="" className="h-3.5 w-3.5" />
                      Trade
                    </button>
                  ) : (
                    <span className="rounded-xl border border-gray-100 px-3 py-2 text-[11px] font-bold text-gray-400">
                      Pending
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function OverlayShell({
  dripRate, sessionCap, paymentMode, gateMode, children,
}: {
  dripRate: number
  sessionCap: number
  paymentMode: 'choice' | 'x402' | 'poa' | 'escrow' | 'checkpoint'
  gateMode: 'unlock' | 'stream'
  children: React.ReactNode
}) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center space-y-4',
        paymentMode === 'x402' || paymentMode === 'choice' || paymentMode === 'escrow'
          ? 'relative min-h-[520px] bg-gradient-to-b from-white/95 to-gray-50/95 p-5 dark:from-[#111216]/95 dark:to-[#0b0c0f]/95 sm:p-7'
          : 'absolute inset-0 bg-white/75 p-6 backdrop-blur-[3px] dark:bg-[#0b0c0f]/75',
      ].join(' ')}
    >
      <div className="text-center space-y-1.5">
        <p className="text-[17px] font-bold text-gray-900 dark:text-gray-100">Content Locked</p>
        {paymentMode === 'choice' && (
          <p className="text-[13px] text-gray-500 max-w-[320px] dark:text-gray-400">
            Choose how you want to access this creator content.
          </p>
        )}
        {paymentMode === 'x402' && (
          <p className="text-[13px] text-gray-500 max-w-[320px] dark:text-gray-400">
            Pay <span className="font-semibold">{formatUsdc(sessionCap)} USDC</span> to unlock this creator content.
          </p>
        )}
        <p className={paymentMode === 'x402' || paymentMode === 'choice' ? 'hidden' : 'text-[12px] text-gray-500 max-w-[280px] dark:text-gray-400'}>
          {gateMode === 'unlock' ? (
            <>
              Pay <span className="font-semibold">${sessionCap.toFixed(2)} USDC</span> to unlock this creator content.
            </>
          ) : (
            <>
              Timed live stream at <span className="font-semibold">${dripRate.toFixed(4)}/sec</span>, up to <span className="font-semibold">${sessionCap.toFixed(2)} USDC</span>
            </>
          )}
        </p>
      </div>
      {children}
      <div className="flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-gray-500">
        {paymentMode === 'x402' ? 'Powered by Circle Gateway on Arc' : paymentMode === 'poa' ? 'Powered by Arc Network' : 'Powered by HashpayStream Creator Checkout'}
      </div>
    </div>
  )
}

// Placeholder so the overlay has something to blur over while loading
function ContentPlaceholder({ title }: { title: string }) {
  return (
    <div className="p-6 space-y-3 select-none" style={{ filter: 'blur(5px) brightness(0.9)', pointerEvents: 'none' }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-500">Gated Content</p>
      <h2 className="text-[18px] font-bold text-gray-900 leading-snug">{title || 'Premium Content'}</h2>
      <div className="space-y-2 pt-1">
        {[90, 75, 55, 80, 65].map(w => (
          <div key={w} className="h-2.5 rounded-full bg-gray-100" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  )
}

function StepDots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2, 3].map(i => (
        <span key={i} className="h-1.5 rounded-full transition-all"
          style={{ width: i === current ? 16 : 6, background: i <= current ? '#111827' : '#e5e7eb' }} />
      ))}
    </div>
  )
}

function FingerprintIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a7.464 7.464 0 01-1.15 3.993m1.989 3.559A11.209 11.209 0 008.25 10.5a3.75 3.75 0 117.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 01-3.6 9.75m6.633-4.596a18.666 18.666 0 01-2.485 5.33" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M7.5 10.5V8a4.5 4.5 0 119 0v2.5M6.75 10.5h10.5A1.75 1.75 0 0119 12.25v6A1.75 1.75 0 0117.25 20H6.75A1.75 1.75 0 015 18.25v-6a1.75 1.75 0 011.75-1.75z" />
    </svg>
  )
}

function ExtLinkIcon() {
  return (
    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}

function ReceiptIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 3.75h10A1.25 1.25 0 0118.25 5v15.25l-2.5-1.25-2.5 1.25-2.5-1.25-2.5 1.25V5A1.25 1.25 0 017 3.75z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 8h6M9 11.5h6M9 15h3.5" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12s-3.75 6.75-9.75 6.75S2.25 12 2.25 12z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
