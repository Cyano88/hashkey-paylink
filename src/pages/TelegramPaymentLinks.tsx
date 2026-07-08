import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BellRing,
  Bot,
  Building2,
  ChevronDown,
  CheckCircle2,
  Coins,
  Copy,
  Download,
  ExternalLink,
  Activity,
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
  Share2,
  Sparkles,
  TrendingDown,
  UserRound,
  UsersRound,
  Wallet,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { EVM_TREASURY } from '../lib/chains'
import AgentWorkspace from './AgentWorkspace'
import ZeroScoutPowerBadge from '../components/ZeroScoutPowerBadge'
import PayLinkShareSheet from '../components/PayLinkShareSheet'
import { PrivyConnectButton } from '../lib/PrivyConnectButton'
import { PrivyWalletConnectButton } from '../lib/PrivyWalletConnectButton'
import { PrivyDisconnectButton } from '../lib/PrivyDisconnectButton'
import { PRIVY_AUTH_ENABLED } from '../lib/authMode'

const TELEGRAM_BOT_URL = import.meta.env.VITE_TELEGRAM_AGENT_URL || 'https://t.me/HashPayLinkBot'
const PUBLIC_PAYLINK_ORIGIN = (import.meta.env.VITE_PUBLIC_PAYLINK_ORIGIN || 'https://hashpaylink.com').replace(/\/+$/, '')
const POLYMARKET_LOGO = '/brand/polymarket-logo.png'
const HELPER_PAYMENT_REQUEST_DAILY_LIMIT = 20
function TelegramServicesIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden="true"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="42" y="260" width="76" height="158" rx="12" fill="#000000" />
      <path
        d="M138 276h65c20 0 43 8 62 19l42 24c9 5 13 15 9 24-3 7-10 12-18 12H207v12h99c10 0 19-2 27-7l113-48c14-6 30 2 34 16 3 10-1 21-11 27L297 459c-14 8-30 10-45 5l-137-44V292c7-10 14-16 23-16Z"
        fill="#000000"
      />
      <path
        d="M208 356h90c18 0 29-20 20-35"
        stroke="#ffffff"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M314 64h52l10 47 39-27 37 37-27 39 47 10v52l-47 10 27 39-37 37-39-27-10 47h-52l-10-47-39 27-37-37 27-39-47-10v-52l47-10-27-39 37-37 39 27 10-47Z"
        fill="#000000"
      />
      <circle cx="340" cy="196" r="56" fill="#ffffff" />
    </svg>
  )
}

function displayTelegramName(rawName: string | null, fallback = 'there') {
  const clean = (rawName ?? '').replace(/^@+/, '').trim()
  if (!clean) return fallback
  if (/\s/.test(clean)) return clean
  return `@${clean}`
}

function shortAddress(value: string) {
  return value.length > 14 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value
}

function polymarketFundingRequestId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `pmf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

type TelegramSectionId = 'payment-links' | 'agent-wallets' | 'market-tools' | 'streampay'
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
  | 'streampay-creator'

type TelegramService = {
  id: TelegramServiceId
  title: string
  body: string
  icon: typeof Coins
  status: 'Open' | 'Soon' | 'Next' | 'Telegram'
  active: boolean
  brand?: 'polymarket'
}

type LpScoutMode = 'best' | 'theme' | 'market'
export type LpScoutPrefill = {
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
      id: 'streampay-creator',
      title: 'HashpayStream Creator',
      body: 'Publish paid posts, unlock content, and track creator earnings.',
      icon: Pencil,
      status: 'Open',
      active: true,
    },
  ],
}

const sectionDescriptions: Record<TelegramSectionId, string> = {
  'payment-links': 'Create normal USDC requests and share them into Telegram.',
  'agent-wallets': 'Manage Circle wallet balance, x402 service balance, and receipts.',
  'market-tools': 'PolyDesk for Polymarket funding, portfolio alerts, LP Scout, and live market context.',
  streampay: 'Creator publishing, paid access, reader comments, and earnings on HashpayStream.',
}

const telegramSections: Array<{ id: TelegramSectionId; title: string; icon: typeof Coins }> = [
  { id: 'payment-links', title: 'Payment Links', icon: Coins },
  { id: 'agent-wallets', title: 'Agent Wallets', icon: Bot },
  { id: 'market-tools', title: 'PolyDesk', icon: LineChart },
  { id: 'streampay', title: 'HashpayStream', icon: Radio },
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

function isPolymarketBridgeNetwork(network: RequestNetwork | ''): network is PolymarketBridgeNetwork {
  return network === 'base' || network === 'arbitrum' || network === 'solana'
}

function polymarketBridgeNetworkPrompt(amount: string) {
  return `Which network should I use for this ${amount} USDC Polymarket funding checkout: Base, Arbitrum, or Solana?`
}

type SavedRequest = {
  id?: string
  eventId?: string
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
  dashboardUrl?: string
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
  offeredSavedWalletNetwork?: RequestNetwork | ''
}

type PolyPortfolioFundingDraft = {
  amount: string
  network: RequestNetwork | ''
}

const blockedPayerNames = new Set([
  'a',
  'an',
  'the',
  'request',
  'payment',
  'paylink',
  'invoice',
  'buy',
  'send',
  'receive',
  'confirm',
  'continue',
  'use',
  'base',
  'arc',
  'solana',
  'arbitrum',
  'dinner',
  'lunch',
  'food',
  'her',
  'him',
  'them',
  'she',
  'he',
  'they',
  'me',
  'my',
  'myself',
  'you',
  'yes',
  'no',
  'ok',
  'okay',
  'one',
  'same',
  'new',
  'wallet',
  'address',
  'network',
  'chain',
  'purpose',
  'reason',
  'tuition',
  'fee',
  'love',
  'care',
  'asap',
  'picked',
  'prefers',
  'preferred',
  'wealthy',
  'friend',
])

type PolymarketMode = 'self' | 'friends' | ''
type HelperMode = 'payments' | 'daily' | 'services' | 'polydesk' | 'support'
type PolyDeskSubMode = 'portfolio' | 'worldcup' | 'lp-scout'
type HelperThinkingState = 'light' | 'payment-draft' | 'payment-wallet' | 'paylink-build' | 'deep-research' | 'proof'

type HelperMessage = {
  id?: string
  question?: string
  answer?: string
  proof?: { ogTxHash: string; ogExplorer: string }
  zeroscoutSponsorship?: ZeroScoutSponsorship
  paylink?: SavedRequest
  actionLink?: { label: string; url: string }
  actionLinks?: Array<{ label: string; url: string }>
}

type StoredHelperThreadMessage = {
  id: string
  mode?: string
  subMode?: string
  question?: string
  answer: string
  paylink?: SavedRequest
  actionLinks?: Array<{ label: string; url: string }>
  receiptId?: string
  txHash?: string
  createdAt: number
}

type ZeroScoutSponsorship = {
  proofClass: 'zeroscout_sponsored_action'
  sponsor: 'ZeroScout'
  service: string
  action: string
  requestHash: string
  sponsoredAt: string
  sourceProofClass?: 'helper_access_receipt' | 'helper_free_access' | 'helper_memory_proof' | 'service_receipt'
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
  helperThread?: StoredHelperThreadMessage[]
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
  const explicitOwner = String(searchParams.get('helperOwner') ?? '').trim().slice(0, 160)
  if (explicitOwner) {
    return {
      owner: explicitOwner,
      legacyOwner: displayName === 'there' ? 'telegram-user' : displayName,
      isStable: true,
      username: String(searchParams.get('u') ?? searchParams.get('username') ?? '').replace(/^@+/, '').trim(),
    }
  }
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

function extractGroupContributionAmount(text: string) {
  const clean = text.replace(/\s+/g, ' ').trim()
  const match = clean.match(/\b(?:each|per\s+(?:person|payer|contributor|donor)|everyone|everybody|minimum|min\.?|at\s+least|least)\b[^.?!,;]{0,80}?\b(\d+(?:\.\d{1,6})?)\s*(?:usdc|usd|\$)\b/i)
    ?? clean.match(/\b(\d+(?:\.\d{1,6})?)\s*(?:usdc|usd|\$)\b[^.?!,;]{0,80}?\b(?:each|per\s+(?:person|payer|contributor|donor)|minimum|min\.?|at\s+least|least)\b/i)
  return match?.[1] ?? ''
}

function extractAmountCorrection(text: string) {
  if (!/\b(change|update|correct|set)\s+(?:the\s+)?amount\b|\bamount\s*(?:to|is|=|:)\b/i.test(text)) return ''
  return extractAmount(text)
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

function extractNetworkCorrection(text: string): RequestNetwork | '' {
  if (!/\b(change|update|correct|set|switch|use)\s+(?:the\s+)?(?:network|chain)\b|\b(?:network|chain)\s*(?:to|is|=|:)\b/i.test(text)) return ''
  return extractNetwork(text)
}

function extractWallet(text: string) {
  const evm = text.match(/0x[a-fA-F0-9]{40}/)?.[0] ?? ''
  if (evm) return evm
  const solana = text.match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/)?.[0] ?? ''
  return solana
}

function extractWalletCorrection(text: string) {
  if (!/\b(change|update|correct|set|replace|use)\s+(?:the\s+)?(?:wallet|address|receive wallet|receive address)\b|\b(?:wallet|address|receive wallet|receive address)\s*(?:to|is|=|:)\b/i.test(text)) return ''
  return extractWallet(text)
}

function stripWallets(text: string) {
  return text
    .replace(/0x[a-fA-F0-9]{40}/g, '')
    .replace(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanPaymentPurpose(value: string) {
  return stripWallets(value)
    .replace(/\b\d+(?:\.\d{1,6})?\s*(?:usdc|usd)\b/gi, '')
    .replace(/\b(?:base|arc|solana|arbitrum|all networks?|any network|evm|usdc)\b/gi, '')
    .replace(/\b(?:to|from)\s+@?[a-zA-Z][\w.-]{1,40}\b/gi, '')
    .replace(/\b(?:payment|paylink|request)\s+(?:is\s+)?(?:for\s+)?/gi, '')
    .replace(/\b(?:the\s+)?only details?.*$/i, '')
    .replace(/\b(?:then\s+)?give me .*$/i, '')
    .replace(/^(?:for|purpose|memo|reason)\s+/i, '')
    .replace(/\s+/g, ' ')
    .replace(/^[,.;:\s-]+|[,.;:\s-]+$/g, '')
    .trim()
    .slice(0, 80)
}

function cleanCollectionLabel(value: string) {
  return cleanPaymentPurpose(value)
    .replace(/\b(?:group|collection|fundraiser|fundraising|contributors|contribution|contributions)\b/gi, '')
    .replace(/\b(?:from|with)\s+\d+\s+(?:people|friends|contributors|payers)\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/^[,.;:\s-]+|[,.;:\s-]+$/g, '')
    .trim()
    .slice(0, 80)
}

function extractCollectionLabel(text: string) {
  const clean = stripWallets(text).replace(/\s+/g, ' ').trim()
  const match = clean.match(/\b(?:group donation|group collection|collection|fundraiser|fundraising|donation|dues|split)\s+(?:for|called|named|to|towards?)\s+([^?.!,;]+)/i)?.[1]?.trim()
    ?? clean.match(/\b(?:collect|raise)\s+(?:\d+(?:\.\d{1,6})?\s*(?:usdc|usd)\s+)?(?:from\s+[^?.!,;]+?\s+)?for\s+([^?.!,;]+)/i)?.[1]?.trim()
    ?? ''
  if (!match) return ''
  return cleanCollectionLabel(match)
}

function extractTarget(text: string, mode: RequestMode) {
  const clean = text.replace(/\s+/g, ' ').trim()
  const relationship = extractRelationshipMemory(clean)
  if (relationship && isPaymentRequestIntent(clean)) return relationship.name
  const candidates = Array.from(clean.matchAll(/\b(from|to|for)\s+(@?[a-zA-Z][\w.-]{1,40})\b/gi))
    .map(match => ({ preposition: match[1].toLowerCase(), value: match[2] }))
    .filter(item => !blockedPayerNames.has(item.value.toLowerCase()))
  const fromCandidate = candidates.find(item => item.preposition === 'from')
  if (fromCandidate) return fromCandidate.value
  const person = candidates.find(item => item.preposition !== 'for')?.value ?? ''
  if (person) return person
  const group = clean.match(/\b(?:group|collection|collect from)\s+([^,.;]+)/i)?.[1]?.trim() ?? ''
  if (mode === 'group' && group) return group.slice(0, 48)
  return ''
}

const helperModes: Array<{ id: HelperMode; label: string; intro: string }> = [
  {
    id: 'payments',
    label: 'Payments',
    intro: 'Payments mode is ready. I can help you request money, create a PayLink, check a receipt, or clarify wallet and network details. What do you want to do?',
  },
  {
    id: 'daily',
    label: 'Daily',
    intro: "Daily mode is ready. I can help with personal planning, normal questions, ideas, and everyday support. What's on your mind?",
  },
  {
    id: 'services',
    label: 'Services',
    intro: 'Services mode is ready. I can help with HashpayStream, Agent Wallets, x402, Circle wallet setup, PolyDesk, and Hash PayLink features. What are you trying to use?',
  },
  {
    id: 'polydesk',
    label: 'PolyDesk',
    intro: 'PolyDesk is ready. Choose Portfolio, World Cup, or LP Scout so I can use the right Polymarket flow.',
  },
  {
    id: 'support',
    label: 'Support',
    intro: "Support mode is ready. Tell me what is stuck, confusing, or not working, and I'll help you fix it step by step.",
  },
]

const polyDeskSubModes: Array<{ id: PolyDeskSubMode; label: string; intro: string; icon: typeof Wallet }> = [
  {
    id: 'portfolio',
    label: 'Portfolio',
    intro: 'Portfolio mode is ready. I can check saved profile setup, portfolio value, open positions, claimables, alerts, and funding.',
    icon: Wallet,
  },
  {
    id: 'worldcup',
    label: 'World Cup',
    intro: 'World Cup mode is ready. I can read live score feeds, fixture context, market routes, and latest World Cup news.',
    icon: Radio,
  },
  {
    id: 'lp-scout',
    label: 'LP Scout',
    intro: 'LP Scout mode is ready. I can help you choose paid LP Scout access through x402 or a normal USDC access payment.',
    icon: LineChart,
  },
]

function inferPolyDeskSubMode(text: string): PolyDeskSubMode | '' {
  const value = text.toLowerCase()
  if (/\b(lp scout|liquidity|reward market|maker|spread|depth|scout|lp\b)\b/.test(value)) return 'lp-scout'
  if (/\b(world cup|score|fixture|match|game|news|headline|argentina|jordan|fifa|market odds|live board)\b/.test(value)) return 'worldcup'
  if (/\b(portfolio|position|positions|claimable|claim|pnl|value|balance|exposure|fund polymarket|polymarket profile|open positions)\b/.test(value)) return 'portfolio'
  return ''
}

function extractPayerCorrection(text: string) {
  const match = text.match(/\b(?:change|update|correct|set)?\s*(?:payer(?: name)?|payee|sender|from|her name'?s?|her name is|his name'?s?|his name is|their name'?s?|their name is)\s*(?:to|is|=|:)?\s+(@?[\p{L}\p{M}][\p{L}\p{M}\w .'-]{1,40})\b/iu)?.[1] ?? ''
  return cleanPayerCandidate(match)
}

function cleanPayerCandidate(value: string) {
  const clean = usableHelperName(
    value
      .replace(/\s+\b(?:and\s+i|and\s+we|i\s+want|i\s+need|who|that|she|he|they|for|with|from|to|on|picked|prefers?)\b.*$/i, '')
      .replace(/^[,.;:\s-]+|[,.;:\s-]+$/g, ''),
  )
  if (!clean) return ''
  const firstToken = clean.split(/\s+/)[0]?.toLowerCase() ?? ''
  if (blockedPayerNames.has(clean.toLowerCase()) || blockedPayerNames.has(firstToken)) return ''
  if (!/^[\p{L}\p{M}@][\p{L}\p{M}\w.'-]{1,40}$/u.test(clean)) return ''
  return friendlyName(clean)
}

function extractInlinePayerName(text: string, mode: RequestMode) {
  if (mode !== 'person') return ''
  const clean = stripWallets(text)
    .replace(/\b\d+(?:\.\d{1,6})?\s*(?:usdc|usd)\b/gi, '')
    .replace(/\b(?:base|arc|solana|arbitrum|all networks?|any network|evm|usdc)\b/gi, '')
    .replace(/\b(?:for|purpose|memo|reason)\s+[^,.;]+/gi, '')
    .replace(/\b(?:request|collect|charge|invoice|paylink|payment|link|continue|use|saved|wallet|new|receive|picked|please|prepare|asap|reason|name|generous|very|would|like|confirm|network|prefers?|send|through|first|wait|hold|minute|ask|friend|called|named|wealthy)\b/gi, '')
    .replace(/[^\p{L}\p{M}' -]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const firstName = clean.match(/\b[\p{L}\p{M}][\p{L}\p{M}'-]{1,40}\b/u)?.[0] ?? ''
  return cleanPayerCandidate(firstName)
}

function extractPurpose(text: string) {
  const clean = text.replace(/\s+/g, ' ').trim()
  const match = clean.match(/\b(?:change|update|correct|set)?\s*(?:purpose|memo|reason)\s*(?:for\s+payment\s*)?(?:to|is|=|:)?\s*(?:for\s+)?([^?.!,;]+)/i)?.[1]?.trim()
    ?? clean.match(/\bfor\s+([^?.!,;]+)/i)?.[1]?.trim()
    ?? ''
  if (!match) return ''
  return cleanPaymentPurpose(match)
}

function isExplicitDraftCorrection(text: string) {
  return /\b(change|update|edit|correct|set|replace|switch)\s+(?:the\s+)?(?:payer|payer name|purpose|memo|reason|amount|network|chain|wallet|address|receive wallet|receive address)\b|\b(?:payer|purpose|memo|reason|amount|network|chain|wallet|address|receive wallet|receive address)\s*(?:to|is|=|:)\b/i.test(text)
}

function isPaymentRequestIntent(text: string) {
  return /\b(request|collect|charge|invoice|paylink|payment link|receive (?:a )?payments?|get paid|ask .*pay|split|dues|donation|group collection|contribution|fundraiser|fundraising)\b/i.test(text)
}

function isDeepResearchIntent(text: string) {
  return /\b(research|analyze|analysis|strategy|investor|pitch|grant|roadmap|architecture|design|compare|plan|proposal|polymarket|lp scout|liquidity|market|x402 architecture|product strategy|look up|find|near me|nearby|restaurant|wuse|abuja)\b/i.test(text)
    || text.trim().length > 220
}

function isGroupRequestIntent(text: string) {
  const clean = text.replace(/\s+/g, ' ').trim()
  return /\b(group|collection|multi payer|multi-payer|everyone|split|dues|donation|donations|fundraiser|fundraising|contributors|contributor|contribution|contributions|event|events|wedding|party|ticket|tickets|registration|class|team|club|community|committee|members|many people|multiple people|several people|from \d+\s+(?:people|friends|contributors|payers|members))\b/i.test(clean)
    || /\b(?:collect|request|receive|get)\s+payments?\s+(?:from|for)\b/i.test(clean)
    || /\bpayments?\s+(?:from|for)\s+(?:everyone|the group|my class|the class|my team|the team|members|contributors|an event|events|donations?)\b/i.test(clean)
}

function hasStrongGroupCue(text: string) {
  return /\b(group|collection|multi payer|multi-payer|everyone|split|dues|fundraiser|fundraising|contributors|contributor|contribution|contributions|event|events|wedding|party|ticket|tickets|registration|class|team|club|community|committee|members|many people|multiple people|several people|from \d+\s+(?:people|friends|contributors|payers|members)|each|per\s+(?:person|payer|contributor|donor)|minimum|min\.?|at\s+least|least)\b/i.test(text)
}

function isSinglePayerRequestIntent(text: string) {
  const clean = text.replace(/\s+/g, ' ').trim()
  return /\b(?:from|payer is|payer name is|her name is|his name is|their name is)\s+[\p{L}\p{M}][\p{L}\p{M}'-]{1,40}\b/iu.test(clean)
    || /\b(friend|client|customer|person|payer|sister|brother|mother|father|partner|colleague|boss|aunt|uncle|nana|chioma|julia)\b/i.test(clean)
    || /\brequest\s+(?:a\s+)?payment\b/i.test(clean)
}

function inferPaylinkRequestMode(text: string, existing?: HelperPaylinkDraft | null): RequestMode {
  if (existing?.mode) return existing.mode
  const groupIntent = isGroupRequestIntent(text)
  const singleIntent = isSinglePayerRequestIntent(text)
  if (groupIntent && !singleIntent) return 'group'
  if (groupIntent && singleIntent && hasStrongGroupCue(text)) {
    return 'group'
  }
  return 'person'
}

function shouldStartFreshPersonDraft(text: string, existing?: HelperPaylinkDraft | null) {
  if (!existing || existing.mode !== 'group') return false
  if (isExplicitDraftCorrection(text) || isPaylinkRevisionIntent(text)) return false
  return isPaymentRequestIntent(text) && isSinglePayerRequestIntent(text) && !isGroupRequestIntent(text)
}

function shouldStartFreshGroupDraft(text: string, existing?: HelperPaylinkDraft | null) {
  if (!existing || existing.mode !== 'person') return false
  if (isExplicitDraftCorrection(text) || isPaylinkRevisionIntent(text)) return false
  return isPaymentRequestIntent(text) && isGroupRequestIntent(text) && hasStrongGroupCue(text)
}

function shouldStartFreshDraftRequest(text: string, existing?: HelperPaylinkDraft | null) {
  if (!existing) return false
  if (isExplicitDraftCorrection(text) || isPaylinkRevisionIntent(text)) return false
  if (!isPaymentRequestIntent(text)) return false
  const mode = inferPaylinkRequestMode(text)
  const target = extractTarget(text, mode) || extractInlinePayerName(text, mode)
  return Boolean(extractAmount(text) && target)
}

function wantsSavedWallet(text: string) {
  const normalized = text.trim().toLowerCase().replace(/[.!?]+$/g, '')
  if (/^(yes\s+)?(use|use it|use this|use this one|use that|continue|same|yes|yep|yeah|sure|ok|okay|saved|saved wallet|my saved wallet|use saved|use my saved wallet|use the one saved|continue with my saved wallet)$/.test(normalized)) {
    return true
  }
  return /\b(use|continue)\s+(the\s+)?(saved|same|one saved|my saved)\b/i.test(text)
}

function wantsNewWallet(text: string) {
  return /\b(new|replace|change|different|another)\b/i.test(text)
}

function isPaylinkDraftSideQuestion(text: string) {
  return /[?]/.test(text)
    || /\b(can i|can we|should i|should we|do i|do we|what if|which|what|how|why|ask|wait|before|first|answered|answer my question|not answered)\b/i.test(text)
}

function hasPaylinkDraftUpdate(text: string, draft: HelperPaylinkDraft | null) {
  if (wantsSavedWallet(text) || wantsNewWallet(text)) return true
  if (isExplicitDraftCorrection(text)) return true
  if (extractAmount(text) || extractNetwork(text) || extractWallet(text) || extractPurpose(text)) return true
  if (!draft?.target) {
    const mode = inferPaylinkRequestMode(text, draft)
    return Boolean(extractTarget(text, mode) || extractInlinePayerName(text, mode))
  }
  return false
}

function isPaylinkRevisionIntent(text: string) {
  return /\b(change|update|edit|correct|replace|new link|new paylink|new payment link|only details|details to change|payer is|payer name|her name|his name|their name|reason is|purpose is)\b/i.test(text)
}

function paylinkDraftSideQuestionFallback(draft: HelperPaylinkDraft, text: string) {
  const target = draft.target ? friendlyName(draft.target) : 'the payer'
  const missing = describeMissingDraftFields(draft).filter(item => item !== 'receive wallet' || !draft.offeredSavedWallet)
  if (/\b(network|send through|send with|chain|base|solana|arc|arbitrum)\b/i.test(text)) {
    return `Yes. Ask ${target} which network works for them. I will hold this draft here.`
  }
  if (/\b(wallet|receive address|address)\b/i.test(text)) {
    return 'Yes. Confirm the receive wallet first; this draft stays open.'
  }
  if (/\b(answered|answer my question|not answered)\b/i.test(text)) {
    return missing.length
      ? `You're right. Confirm with ${target} first, then send ${missing.join(', ')} when ready.`
      : "You're right. This draft is still open, and I can continue from here."
  }
  return missing.length
    ? `Yes. I will hold the draft; send ${missing.join(', ')} when ready.`
    : 'Yes. This draft is still open.'
}

function describeMissingDraftFields(draft: HelperPaylinkDraft, savedWallet?: string) {
  const missing = [
    draft.mode !== 'group' && !draft.target && 'payer name',
    draft.mode !== 'group' && !draft.amount && 'amount in USDC',
    !draft.network && 'network',
    !draft.label && 'purpose',
    !draft.wallet && !savedWallet && 'receive wallet',
  ].filter(Boolean)
  return missing as string[]
}

function compactSavedWallet(wallet: string) {
  return wallet ? shortAddress(wallet).replace('...', '..') : ''
}

function walletMatchesNetwork(wallet: string, network: RequestNetwork | '') {
  if (!wallet || !network || network === 'all') return true
  if (network === 'solana') return !wallet.startsWith('0x')
  return wallet.startsWith('0x')
}

function walletNetworkLabel(wallet: string) {
  return wallet.startsWith('0x') ? 'Base/EVM' : 'Solana'
}

function friendlyName(value: string) {
  const clean = normalizeHelperName(value)
  if (!clean || clean.startsWith('@')) return clean
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

const moodNameWords = new Set([
  'sad',
  'happy',
  'angry',
  'tired',
  'sick',
  'bored',
  'excited',
  'stressed',
  'depressed',
  'anxious',
  'lonely',
  'confused',
  'upset',
  'okay',
  'ok',
  'fine',
  'well',
  'busy',
])

function normalizeHelperName(value: string) {
  return value
    .trim()
    .replace(/^@+/, '')
    .replace(/\b(?:not|is not|isn't)\s+@?[a-zA-Z0-9_.-]+.*$/i, '')
    .replace(/\banymore\b.*$/i, '')
    .replace(/[.?!,;:]+$/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join(' ')
    .slice(0, 48)
}

function isMoodName(value: string) {
  const clean = normalizeHelperName(value).toLowerCase()
  return Boolean(clean && moodNameWords.has(clean))
}

function usableHelperName(value: string) {
  const clean = normalizeHelperName(value)
  return isMoodName(clean) ? '' : clean
}

function isNameCorrectionMessage(text: string) {
  return /\b(?:not my name|isn'?t my name|that's not my name|that is not my name|my mood|i meant my mood)\b/i.test(text)
}

function isMoodNameMemoryLine(line: string) {
  const match = /\bUser (?:prefers to be called|is known as)\s+(.+?)[.!,;:]?$/i.exec(line.trim())?.[1] ?? ''
  return isMoodName(match)
}

function isAskingUserName(text: string) {
  return /\b(what'?s|what is|tell me)\s+my\s+name\b|\bdo you know my name\b|\bwho am i\b|\bwhat do you call me\b/i.test(text)
}

function extractRememberedName(text: string) {
  const match = text.match(/\b(?:remember\s+)?(?:my name is|call me)\s+(@?[a-zA-Z][\w .-]{1,40})/i)?.[1] ?? ''
  return usableHelperName(match)
}

function cleanRelationshipName(value: string) {
  return cleanPayerCandidate(value
    .replace(/\s+\b(?:and\s+i|and\s+we|i\s+want|i\s+need|who|that|she|he|they|for)\b.*$/i, '')
    .trim())
}

function extractRelationshipMemory(text: string) {
  const match = text.match(/\b(?:i have|my)\s+(?:a\s+|an\s+)?(friend|sister|brother|mother|father|partner|client|customer|payer|colleague)\s+(?:called|named|is)\s+(@?[a-zA-Z][\w .-]{1,40})/i)
  if (!match) return null
  const relation = match[1].toLowerCase()
  const name = cleanRelationshipName(match[2])
  if (!name) return null
  return { relation, name }
}

function nameFromMemorySummary(value: string) {
  const summary = value.trim()
  if (!summary) return ''
  const match = summary.match(/\b(?:known as|called|prefers to be called)\s+(@?[a-zA-Z][\w .-]{1,40})/i)?.[1] ?? ''
  return usableHelperName(match)
}

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

export default function TelegramPaymentLinks() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const startPayload = (searchParams.get('start') ?? searchParams.get('tgWebAppStartParam') ?? telegramWebAppStartParam()).trim().toLowerCase()
  const initialMode: RequestMode | '' = searchParams.get('mode') === 'group' ? 'group' : searchParams.get('mode') === 'person' ? 'person' : ''
  const initialSectionParam = searchParams.get('section')
  const initialSection: TelegramSectionId =
    startPayload === 'polymarket' || startPayload === 'poly'
      ? 'market-tools'
      : initialSectionParam === 'agent-wallets' || initialSectionParam === 'market-tools' || initialSectionParam === 'streampay'
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
      : ''
  const initialAgentService = initialService === 'agent-dashboard'
  const initialHelperService = initialService === 'hashpaylink-helper'
  const initialMarketService = initialService === 'poly-portfolio' || initialService === 'lp-scout' || initialService === 'poly-worldcup' || initialService === 'poly-worldcup-news' || initialService === 'poly-stream'
  const initialPersonTarget = displayTelegramName(searchParams.get('target') ?? searchParams.get('payer') ?? searchParams.get('p'), '')
  const initialGroupTarget = displayTelegramName(searchParams.get('target') ?? searchParams.get('group') ?? searchParams.get('g') ?? searchParams.get('chat'), '')
  const [opened, setOpened] = useState(searchParams.get('open') !== '0')
  const [activeSection, setActiveSection] = useState<TelegramSectionId>(initialAgentService ? 'agent-wallets' : initialMarketService ? 'market-tools' : initialSection)
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
  const [savedHelperName, setSavedHelperName] = useState(() => usableHelperName(window.localStorage.getItem('hashpaylink-helper-name') ?? ''))
  const [agentPromptIndex, setAgentPromptIndex] = useState(0)
  const [helperBackSignal, setHelperBackSignal] = useState(0)
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
  const agentGreetingName = friendlyName(savedHelperName || (telegramName === 'there' ? '' : telegramName) || recoveredTelegramName || 'there')
  const agentHeaderPrompts = useMemo(() => [
    { text: 'I can help with payments and Hash PayLink services.', delayMs: 9500 },
    { text: 'I am Agent Hash.', delayMs: 7000 },
    { text: 'Tap to launch me.', delayMs: 3600 },
    { text: 'What do you want to fund or request today?', delayMs: 8500 },
  ], [])
  const isAgentHashOpen = opened && activeService === 'hashpaylink-helper'

  useEffect(() => {
    if (isAgentHashOpen) return undefined
    const delay = agentHeaderPrompts[agentPromptIndex]?.delayMs ?? 7000
    const timer = window.setTimeout(() => {
      setAgentPromptIndex(index => (index + 1) % agentHeaderPrompts.length)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [agentPromptIndex, agentHeaderPrompts, isAgentHashOpen])

  function launchAgentHash() {
    setOpened(true)
    setActiveService('hashpaylink-helper')
    setRequestMode('')
    setPolymarketMode('')
  }

  function rememberRecoveredHelperName(value: string) {
    const clean = value.trim().slice(0, 48)
    if (!clean) return
    setRecoveredTelegramName(clean)
    setSavedHelperName(clean)
  }

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
    const next = new URLSearchParams(searchParams)
    next.set('section', section)
    ;['service', 'mode', 'poly', 'notice', 'open'].forEach(key => next.delete(key))
    setSearchParams(next, { replace: true })
  }

  function clearTelegramServiceRoute(nextSection?: TelegramSectionId) {
    const next = new URLSearchParams(searchParams)
    if (nextSection) next.set('section', nextSection)
    ;['service', 'mode', 'poly', 'notice', 'open', 'eventId', 'payer', 'back'].forEach(key => next.delete(key))
    setSearchParams(next, { replace: true })
  }

  function internalBackTarget() {
    const raw = (searchParams.get('back') || '').trim()
    if (!raw) return ''
    try {
      const url = new URL(raw, window.location.origin)
      if (url.origin !== window.location.origin) return ''
      return `${url.pathname}${url.search}${url.hash}`
    } catch {
      return raw.startsWith('/') && !raw.startsWith('//') ? raw : ''
    }
  }

  function closeTelegramOrFallback() {
    const telegramWebApp = (window as Window & {
      Telegram?: { WebApp?: { close?: () => void } }
    }).Telegram?.WebApp
    if (telegramWebApp?.close) {
      telegramWebApp.close()
      return
    }
    setActiveSection('payment-links')
    clearTelegramServiceRoute('payment-links')
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
    if (service.id === 'streampay-creator') {
      window.location.href = '/creator?app=streampay&src=telegram'
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
    if (activeService) {
      if (activeService === 'hashpaylink-helper') {
        setHelperBackSignal(value => value + 1)
        return
      }
      if (activeService === 'poly-worldcup-news' || activeService === 'poly-stream') {
        setActiveService('poly-worldcup')
        const next = new URLSearchParams(searchParams)
        next.set('section', 'market-tools')
        next.set('service', 'poly-worldcup')
        ;['mode', 'poly', 'notice', 'open'].forEach(key => next.delete(key))
        setSearchParams(next, { replace: true })
        return
      }
      if (activeService === 'fund-polymarket' && polymarketMode) {
        setPolymarketMode('')
        return
      }
      if (activeService === 'request-usdc' && requestMode) {
        setRequestMode('')
        return
      }
      setActiveService('')
      clearTelegramServiceRoute()
      return
    }
    closeTelegramOrFallback()
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-[calc(100vw-2rem)] animate-slide-up space-y-5 sm:max-w-md">
      {isAgentHashOpen && (
        <button
          type="button"
          onClick={goBackFromTelegramDashboard}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <span className="back-btn" aria-hidden="true">
            <span className="arrow-container">
              <span className="chevron c1" />
              <span className="chevron c2" />
              <span className="chevron c3" />
            </span>
          </span>
          Back
        </button>
      )}

      <button
        type="button"
        onClick={launchAgentHash}
        className={cn(
          'group w-full border border-gray-100 bg-white p-4 text-left shadow-card transition-all hover:border-gray-200 hover:shadow-lg active:scale-[0.995] dark:border-white/10 dark:bg-[#111114] dark:hover:bg-[#15151a]',
          isAgentHashOpen
            ? '!mt-0 rounded-t-2xl rounded-b-none border-b-0 pb-1 shadow-none'
            : 'rounded-2xl',
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex shrink-0 items-start pt-0.5 text-gray-700 dark:text-gray-300">
            <AskHashLiveAgentIcon header isStatic={isAgentHashOpen} />
          </div>
          <div className="min-w-0 flex-1">
            {isAgentHashOpen ? (
              <p className="pt-0.5 text-sm font-semibold text-gray-900 dark:text-white">Agent Hash</p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Agent Hash</p>
                    <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-white">
                      Hello {agentGreetingName}
                    </p>
                  </div>
                  <span className="back-btn shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-600" aria-hidden="true">
                    <span className="arrow-container arrow-container--right">
                      <span className="chevron chevron--right c1" />
                      <span className="chevron chevron--right c2" />
                      <span className="chevron chevron--right c3" />
                    </span>
                  </span>
                </div>
                <div className="mt-3 rounded-2xl rounded-tl-md bg-gray-100 px-4 py-3 dark:bg-white/[0.07]">
                  <p
                    key={agentPromptIndex}
                    className="telegram-agent-typewriter text-sm font-semibold leading-relaxed text-gray-800 dark:text-gray-100"
                  >
                    {agentHeaderPrompts[agentPromptIndex]?.text}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </button>

      {opened && (
        <div
          className={cn(
            'border border-gray-100 bg-white shadow-card dark:border-white/10 dark:bg-[#111114]',
            isAgentHashOpen
              ? '!mt-0 rounded-b-2xl border-t-0 p-0'
              : 'rounded-2xl p-4',
          )}
        >
          {activeService !== 'hashpaylink-helper' && (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Hash PayLink</p>
                  <h1 className="mt-1 text-lg font-semibold tracking-tight text-gray-900 dark:text-white">Telegram Services</h1>
                  <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                    Create payment actions and share them back into Telegram.
                  </p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-100 bg-white p-1 dark:border-white/10">
                  <TelegramServicesIcon className="h-full w-full" />
                </span>
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
            </>
          )}

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
              initialPortfolioAction={searchParams.get('portfolio') === 'trading' ? 'trading' : null}
              initialTradingWalletTab={searchParams.get('wallet') === 'balance' ? 'balance' : undefined}
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
          ) : activeService === 'hashpaylink-helper' ? (
            <TelegramHelperPanel
              telegramName={telegramName}
              ownerKey={telegramIdentity.isStable ? telegramIdentity.owner : ''}
              telegramId={telegramIdentity.isStable ? telegramIdentity.owner.replace(/^telegram:/, '') : ''}
              fallbackOwner={telegramIdentity.legacyOwner}
              initialEventId={searchParams.get('eventId') ?? ''}
              initialPayer={searchParams.get('payer') ?? ''}
              initialHelperMode={searchParams.get('notice') === 'polymarket-funding-complete' && searchParams.get('mode') === 'polydesk' ? 'polydesk' : ''}
              initialPolyDeskSubMode={searchParams.get('notice') === 'polymarket-funding-complete' ? (searchParams.get('poly') === 'portfolio' ? 'portfolio' : searchParams.get('poly') === 'worldcup' ? 'worldcup' : searchParams.get('poly') === 'lp-scout' ? 'lp-scout' : '') : ''}
              initialNotice={searchParams.get('notice') ?? ''}
              helperBackSignal={helperBackSignal}
              onRecoverTelegramName={rememberRecoveredHelperName}
              onBack={goBackFromTelegramDashboard}
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
      {service.id === 'hashpaylink-helper' ? (
        <AskHashLiveAgentIcon />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-gray-700 shadow-sm dark:bg-white/[0.08] dark:text-gray-200">
          {service.brand === 'polymarket'
            ? <img src={POLYMARKET_LOGO} alt="" className="h-4 w-4 invert dark:invert-0" />
            : <Icon className="h-4 w-4" />}
        </span>
      )}
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

function AskHashLiveAgentIcon({ isStatic = false, header = false }: { isStatic?: boolean; header?: boolean }) {
  return (
    <div className={cn('ask-hash-live-agent shrink-0', isStatic && 'ask-hash-live-agent--static', header && 'ask-hash-live-agent--header')} aria-hidden="true">
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

export function TelegramHelperPanel({
  telegramName,
  ownerKey,
  telegramId,
  fallbackOwner,
  initialEventId,
  initialPayer,
  initialHelperMode,
  initialPolyDeskSubMode,
  initialNotice,
  onRecoverTelegramName,
  onBack,
  lockedHelperMode = '',
  welcomeText,
  inputPlaceholder,
  hideTopDivider = false,
  polyDeskResetSignal = 0,
  helperBackSignal = 0,
  onPolyDeskSubModeChange,
}: {
  telegramName: string
  ownerKey: string
  telegramId: string
  fallbackOwner: string
  initialEventId: string
  initialPayer: string
  initialHelperMode?: HelperMode | ''
  initialPolyDeskSubMode?: PolyDeskSubMode | ''
  initialNotice?: string
  onRecoverTelegramName: (name: string) => void
  onBack: () => void
  lockedHelperMode?: HelperMode | ''
  welcomeText?: string
  inputPlaceholder?: string
  hideTopDivider?: boolean
  polyDeskResetSignal?: number
  helperBackSignal?: number
  onPolyDeskSubModeChange?: (mode: PolyDeskSubMode | '') => void
}) {
  const cleanTelegramName = telegramName === 'there' ? '' : telegramName
  const helperSessionKeyBase = (ownerKey || telegramId || initialPayer || cleanTelegramName || 'local-helper').trim().toLowerCase()
  const helperModeStorageKey = `hashpaylink-helper-active-mode:${helperSessionKeyBase}`
  const storedHelperMode = (() => {
    if (lockedHelperMode) return lockedHelperMode
    if (initialHelperMode) return initialHelperMode
    const saved = window.localStorage.getItem(helperModeStorageKey)
    return helperModes.some(mode => mode.id === saved) ? saved as HelperMode : ''
  })()
  const storedPolyDeskSubMode = (() => {
    if (initialPolyDeskSubMode) return initialPolyDeskSubMode
    if (lockedHelperMode === 'polydesk') return ''
    if (storedHelperMode !== 'polydesk') return ''
    const saved = window.localStorage.getItem(`${helperModeStorageKey}:polydesk`)
    return polyDeskSubModes.some(mode => mode.id === saved) ? saved as PolyDeskSubMode : ''
  })()
  const [started, setStarted] = useState(true)
  const [helperName, setHelperName] = useState(() => usableHelperName(window.localStorage.getItem('hashpaylink-helper-name') ?? (initialPayer || cleanTelegramName)))
  const [helperNameDraft, setHelperNameDraft] = useState(() => usableHelperName(window.localStorage.getItem('hashpaylink-helper-name') ?? (initialPayer || cleanTelegramName)))
  const [eventId, setEventId] = useState(initialEventId)
  const [payer, setPayer] = useState(initialPayer || cleanTelegramName)
  const [messages, setMessages] = useState<HelperMessage[]>(() => {
    if (initialNotice !== 'polymarket-funding-complete') return []
    return [{
      answer: 'Polymarket funding is complete. I can track open positions, claimables, alerts, and portfolio value right now; Polymarket cash balance should still be confirmed inside Polymarket.',
      actionLink: { label: 'Portfolio', url: '/telegram/payment-links?section=market-tools&service=poly-portfolio' },
    }]
  })
  const [helperMode, setHelperMode] = useState<HelperMode | ''>(storedHelperMode)
  const [polyDeskSubMode, setPolyDeskSubMode] = useState<PolyDeskSubMode | ''>(storedHelperMode === 'polydesk' ? storedPolyDeskSubMode : '')
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [agentStatus, setAgentStatus] = useState('Asking ZeroScout for guidance...')
  const [thinkingState, setThinkingState] = useState<HelperThinkingState>('light')
  const [askError, setAskError] = useState('')
  const [helperToast, setHelperToast] = useState('')
  const [clearHistoryPending, setClearHistoryPending] = useState(false)
  const [profile, setProfile] = useState<HelperProfile | null>(null)
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [memoryDraft, setMemoryDraft] = useState('')
  const [paylinkDraft, setPaylinkDraft] = useState<HelperPaylinkDraft | null>(null)
  const [lastPaylinkDraft, setLastPaylinkDraft] = useState<HelperPaylinkDraft | null>(null)
  const [polyPortfolioFundingDraft, setPolyPortfolioFundingDraft] = useState<PolyPortfolioFundingDraft | null>(null)
  const [checkpointBusy, setCheckpointBusy] = useState(false)
  const helperScrollRef = useRef<HTMLDivElement | null>(null)
  const helperAbortRef = useRef<AbortController | null>(null)
  const initialRouteAppliedRef = useRef(Boolean(initialNotice || initialHelperMode || initialPolyDeskSubMode))
  const helperFirstScrollRef = useRef(true)
  const suppressThreadHydrationRef = useRef(false)
  const freshThreadIdsRef = useRef<Set<string>>(new Set())
  const helperIdentityKey = (ownerKey || telegramId || payer || cleanTelegramName || 'local-helper').trim().toLowerCase()
  const activeHelperThreadId = `mode:${helperMode || 'general'}${helperMode === 'polydesk' && polyDeskSubMode ? `:${polyDeskSubMode}` : ''}`
  const { authenticated: polyDeskAuthenticated, getAccessToken: getPolyDeskAccessToken } = usePrivy()

  useEffect(() => {
    if (lockedHelperMode && helperMode !== lockedHelperMode) {
      setHelperMode(lockedHelperMode)
    }
  }, [helperMode, lockedHelperMode])

  useEffect(() => {
    if (!polyDeskResetSignal) return
    setPolyDeskSubMode('')
    setPolyPortfolioFundingDraft(null)
    setQuestion('')
    setAskError('')
    setMessages([])
    window.localStorage.removeItem(`${helperModeStorageKey}:polydesk`)
    onPolyDeskSubModeChange?.('')
  }, [polyDeskResetSignal]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!helperBackSignal) return
    resetHelperMode()
  }, [helperBackSignal]) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const node = helperScrollRef.current
      if (!node) return
      if (helperFirstScrollRef.current) {
        node.scrollTop = node.scrollHeight
        helperFirstScrollRef.current = false
        return
      }
      node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [messages, asking, agentStatus])

  function helperMemoryContext() {
    const profileName = helperName || profile?.displayName || helperNameDraft || nameFromMemorySummary(memoryDraft || profile?.memorySummary || '')
    const activeMode = helperModes.find(mode => mode.id === helperMode)
    const activePolyDeskSubMode = polyDeskSubModes.find(mode => mode.id === polyDeskSubMode)
    const recentThread = messages
      .slice(-8)
      .map(message => [
        `User: ${message.question.replace(/\s+/g, ' ').slice(0, 220)}`,
        `Agent Hash: ${message.answer.replace(/\s+/g, ' ').slice(0, 320)}`,
      ].join('\n'))
      .join('\n')
    return [
      activeMode ? `Agent Hash mode is ${activeMode.label}. Route the answer for this mode.` : '',
      activePolyDeskSubMode ? `PolyDesk submode is ${activePolyDeskSubMode.label}. Only answer tasks for this PolyDesk lane.` : '',
      profileName ? `User is known as ${friendlyName(profileName)}.` : '',
      cleanTelegramName ? `Telegram context is ${cleanTelegramName}. Do not use it as the user's name if a known name is provided.` : '',
      recentThread ? `Recent Agent Hash thread:\n${recentThread}` : '',
      memoryDraft.trim() || profile?.memorySummary || '',
    ].filter(Boolean).join('\n').slice(0, 2400)
  }

  function paymentQuotaStorageKey() {
    return `hashpaylink-helper-payment-count:${todayKey()}:${helperIdentityKey}`
  }

  function paymentQuotaStatus() {
    const used = Math.max(0, parseInt(window.localStorage.getItem(paymentQuotaStorageKey()) ?? '0', 10) || 0)
    return {
      used,
      remaining: Math.max(0, HELPER_PAYMENT_REQUEST_DAILY_LIMIT - used),
      allowed: used < HELPER_PAYMENT_REQUEST_DAILY_LIMIT,
    }
  }

  function consumePaymentQuota() {
    const status = paymentQuotaStatus()
    window.localStorage.setItem(paymentQuotaStorageKey(), String(status.used + 1))
  }

  useEffect(() => {
    if (helperMode) {
      window.localStorage.setItem(helperModeStorageKey, helperMode)
    } else {
      window.localStorage.removeItem(helperModeStorageKey)
    }
    if (helperMode === 'polydesk' && polyDeskSubMode) {
      window.localStorage.setItem(`${helperModeStorageKey}:polydesk`, polyDeskSubMode)
    } else if (helperMode !== 'polydesk') {
      window.localStorage.removeItem(`${helperModeStorageKey}:polydesk`)
    }
  }, [helperMode, polyDeskSubMode, helperModeStorageKey])

  useEffect(() => {
    if (initialRouteAppliedRef.current) {
      initialRouteAppliedRef.current = false
      return
    }
    setMessages([])
    setPaylinkDraft(null)
    setPolyPortfolioFundingDraft(null)
    setHelperMode('')
    setPolyDeskSubMode('')
    setAskError('')
  }, [eventId, payer])

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
    if (helperMode) profileParams.set('threadId', activeHelperThreadId)
    fetch(`/api/helper-profile?${profileParams.toString()}`)
      .then(res => res.json() as Promise<{ ok?: boolean; profile?: HelperProfile | null; error?: string }>)
      .then(data => {
        if (cancelled) return
        if (!data.ok) throw new Error(data.error || 'Could not load helper profile.')
        setProfile(data.profile ?? null)
        if (data.profile?.displayName) {
          const cleanDisplayName = usableHelperName(data.profile.displayName)
          if (cleanDisplayName) {
            window.localStorage.setItem('hashpaylink-helper-name', cleanDisplayName)
            setHelperName(cleanDisplayName)
            setHelperNameDraft(cleanDisplayName)
          } else if (isMoodName(data.profile.displayName)) {
            window.localStorage.removeItem('hashpaylink-helper-name')
          }
        }
        const recoveredName = data.profile?.telegramHandle || usableHelperName(data.profile?.displayName || '') || ''
        if (recoveredName) onRecoverTelegramName(recoveredName)
        if (data.profile?.memorySummary) setMemoryDraft(data.profile.memorySummary)
        if (suppressThreadHydrationRef.current) {
          suppressThreadHydrationRef.current = false
          return
        }
        if (freshThreadIdsRef.current.has(activeHelperThreadId)) return
        if (helperMode && data.profile?.helperThread?.length && !(lockedHelperMode === 'polydesk' && helperMode === 'polydesk' && !polyDeskSubMode)) {
          const storedMessages = data.profile.helperThread.map(item => ({
            id: item.id,
            question: item.question,
            answer: item.answer,
            paylink: item.paylink,
            actionLinks: item.actionLinks,
          }))
          setMessages(prev => {
            const seenIds = new Set(prev.map(item => item.id).filter(Boolean))
            const seenFallback = new Set(prev.map(item => `${item.question ?? ''}|${item.answer ?? ''}`))
            return [
              ...prev,
              ...storedMessages.filter(item => {
                if (item.id && seenIds.has(item.id)) return false
                return !seenFallback.has(`${item.question ?? ''}|${item.answer ?? ''}`)
              }),
            ]
          })
        }
      })
      .catch(err => {
        if (!cancelled) setProfileError(err instanceof Error ? err.message : 'Could not load helper profile.')
      })
      .finally(() => {
        if (!cancelled) setProfileBusy(false)
      })
    return () => { cancelled = true }
  }, [payer, ownerKey, fallbackOwner, activeHelperThreadId]) // eslint-disable-line react-hooks/exhaustive-deps

  function startHelper() {
    setStarted(true)
    if (helperName && !payer.trim()) setPayer(helperName)
  }

  function saveName() {
    const clean = usableHelperName(helperNameDraft)
    if (!clean) return
    window.localStorage.setItem('hashpaylink-helper-name', clean)
    setHelperName(clean)
    onRecoverTelegramName(clean)
    if (!payer.trim()) setPayer(clean)
    void saveProfile({ displayName: clean })
  }

  function queueHelperMessage(nextQuestion: string) {
    setMessages(prev => [...prev, { question: nextQuestion, answer: '' }])
  }

  function finishHelperMessage(nextQuestion: string, message: Omit<HelperMessage, 'question'>) {
    const messageId = message.id || `helper-${helperIdentityKey}-${Date.now().toString(36)}`
    setMessages(prev => {
      const next = [...prev]
      let pendingIndex = -1
      for (let index = next.length - 1; index >= 0; index -= 1) {
        const item = next[index]
        if (item.question === nextQuestion && !item.answer && !item.paylink) {
          pendingIndex = index
          break
        }
      }
      const finished = { question: nextQuestion, ...message, id: messageId }
      if (pendingIndex >= 0) {
        next[pendingIndex] = finished
        return next
      }
      return prev
    })
    void appendHelperThreadMessage(nextQuestion, { ...message, id: messageId })
  }

  async function appendHelperThreadMessage(nextQuestion: string, message: Omit<HelperMessage, 'question'>) {
    const answer = (message.answer ?? '').trim()
    const actionLinks = helperActionLinks({ ...message, answer })
    if (!answer && !message.paylink && actionLinks.length === 0) return
    try {
      await fetch('/api/helper-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'append-thread',
          owner: ownerKey,
          payer: payer.trim() || helperName || cleanTelegramName || ownerKey,
          fallbackOwner,
          mode: helperMode || undefined,
          subMode: polyDeskSubMode || undefined,
          threadId: activeHelperThreadId,
          id: message.id || `helper-${helperIdentityKey}-${Date.now().toString(36)}`,
          question: nextQuestion,
          answer,
          paylink: message.paylink,
          actionLinks,
        }),
      })
    } catch {
      // Thread persistence is best-effort; the visible helper response should not fail.
    }
  }

  async function copyHelperActionLink(url: string) {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setHelperToast('Copy unavailable.')
      window.setTimeout(() => setHelperToast(''), 1200)
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setHelperToast('Link copied.')
    } catch {
      setHelperToast('Copy unavailable.')
    }
    window.setTimeout(() => setHelperToast(''), 1200)
  }

  function helperActionLinks(message: HelperMessage) {
    const paylink = message.paylink
    const cardLinks = paylink
      ? [
          {
            label: paylink.kind === 'polymarket-funding'
              ? 'Funding'
              : paylink.mode === 'group'
              ? 'Collection'
              : 'PayLink',
            url: paylink.payUrl || buildRequestPayLink(paylink),
          },
          paylink.mode === 'group'
            ? {
                label: 'Dashboard',
                url: paylink.dashboardUrl || buildRequestDashboardLink(paylink),
              }
            : null,
        ]
      : []
    return [message.actionLink, ...(message.actionLinks ?? []), ...cardLinks].filter((link): link is { label: string; url: string } => Boolean(link?.url))
  }

  function chooseHelperMode(mode: HelperMode) {
    const selected = helperModes.find(item => item.id === mode)
    if (!selected || asking) return
    setHelperMode(mode)
    setPolyDeskSubMode('')
    setPaylinkDraft(null)
    setPolyPortfolioFundingDraft(null)
    setQuestion('')
    setAskError('')
    suppressThreadHydrationRef.current = true
    freshThreadIdsRef.current.add(`mode:${mode}`)
    setMessages([{ question: selected.label, answer: selected.intro }])
    window.setTimeout(() => {
      document.querySelector<HTMLInputElement>('[data-agent-hash-input="true"]')?.focus()
    }, 40)
  }

  function resetHelperMode() {
    if (lockedHelperMode) {
      setPolyDeskSubMode('')
      window.localStorage.removeItem(`${helperModeStorageKey}:polydesk`)
      setMessages([])
      setPaylinkDraft(null)
      setPolyPortfolioFundingDraft(null)
      setQuestion('')
      setAskError('')
      return
    }
    setHelperMode('')
    setPolyDeskSubMode('')
    window.localStorage.removeItem(helperModeStorageKey)
    window.localStorage.removeItem(`${helperModeStorageKey}:polydesk`)
    setMessages([])
    setPaylinkDraft(null)
    setPolyPortfolioFundingDraft(null)
    setQuestion('')
    setAskError('')
  }

  function choosePolyDeskSubMode(mode: PolyDeskSubMode) {
    const selected = polyDeskSubModes.find(item => item.id === mode)
    if (!selected || asking) return
    setPolyDeskSubMode(mode)
    onPolyDeskSubModeChange?.(mode)
    setPolyPortfolioFundingDraft(null)
    setAskError('')
    suppressThreadHydrationRef.current = true
    freshThreadIdsRef.current.add(`mode:polydesk:${mode}`)
    setMessages([{ question: selected.label, answer: selected.intro }])
    window.setTimeout(() => {
      document.querySelector<HTMLInputElement>('[data-agent-hash-input="true"]')?.focus()
    }, 40)
  }

  function stopHelperResponse() {
    helperAbortRef.current?.abort()
    helperAbortRef.current = null
    setAsking(false)
    setAgentStatus('Stopped.')
    setThinkingState('light')
    setMessages(prev => prev.filter(message => message.answer || message.paylink))
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
          accessPayer: extra.accessPayer,
          telegramHandle: cleanTelegramName,
          accessEventId: extra.accessEventId,
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
          accessPayer: profile?.accessPayer,
          telegramHandle: cleanTelegramName,
          accessEventId: profile?.accessEventId,
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

  async function polishLocalHelperResult(prompt: string, fallback: string, memorySummaryOverride?: string) {
    try {
      const res = await fetch('/api/agent-ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: helperAbortRef.current?.signal,
        body: JSON.stringify({
          eventId: eventId.trim(),
          payer: payer.trim(),
          question: prompt,
          accessMode: 'helper-free',
          helperMode: helperMode || undefined,
          memorySummary: memorySummaryOverride ?? helperMemoryContext(),
        }),
      })
      const data = await res.json() as { answer?: string; error?: string }
      if (!res.ok || !data.answer) return fallback
      return data.answer
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160) || fallback
    } catch {
      return fallback
    }
  }

  function preferredWalletFor(network: RequestNetwork | '') {
    if (!profile) return ''
    if (network === 'solana') return profile.preferredPaymentSolanaWallet || (!profile.preferredPaymentWallet?.startsWith('0x') ? profile.preferredPaymentWallet ?? '' : '')
    return profile.preferredPaymentEvmWallet || (profile.preferredPaymentWallet?.startsWith('0x') ? profile.preferredPaymentWallet : '')
  }

  function savedWalletForOtherNetwork(network: RequestNetwork | '') {
    if (!profile || !network || network === 'all') return ''
    const evmWallet = profile.preferredPaymentEvmWallet || (profile.preferredPaymentWallet?.startsWith('0x') ? profile.preferredPaymentWallet : '')
    const solanaWallet = profile.preferredPaymentSolanaWallet || (profile.preferredPaymentWallet && !profile.preferredPaymentWallet.startsWith('0x') ? profile.preferredPaymentWallet : '')
    if (network === 'solana') return evmWallet || ''
    return solanaWallet || ''
  }

  function buildDraftFromText(text: string, existing?: HelperPaylinkDraft | null): HelperPaylinkDraft {
    const mode = inferPaylinkRequestMode(text, existing)
    const walletCorrection = extractWalletCorrection(text)
    const walletFromText = walletCorrection || extractWallet(text)
    const networkCorrection = extractNetworkCorrection(text)
    const networkFromText = networkCorrection || extractNetwork(text)
    const nextNetwork = networkFromText || existing?.network || (walletFromText ? (walletFromText.startsWith('0x') ? 'base' : 'solana') : '')
    const payerCorrection = extractPayerCorrection(text)
    const extractedTarget = extractTarget(text, mode)
    const targetFromText = payerCorrection || (!existing?.target ? extractedTarget : '')
    const inlineTarget = !targetFromText && existing && !existing.target ? extractInlinePayerName(text, mode) : ''
    const purposeFromText = mode === 'group'
      ? extractCollectionLabel(text) || extractPurpose(text)
      : extractPurpose(text)
    const amountFromText = extractAmountCorrection(text) || (mode === 'group' ? extractGroupContributionAmount(text) : '') || extractAmount(text)
    const existingWallet = existing?.wallet || ''
    const keepExistingWallet = Boolean(existingWallet && !walletFromText && (!networkCorrection || walletMatchesNetwork(existingWallet, nextNetwork)))
    const nextWallet = walletFromText || (keepExistingWallet ? existingWallet : '')
    const savedWalletOfferStillApplies = Boolean(
      existing?.offeredSavedWallet
      && existing.offeredSavedWalletNetwork
      && existing.offeredSavedWalletNetwork === nextNetwork,
    )
    return {
      mode,
      target: mode === 'group'
        ? targetFromText || inlineTarget || existing?.target || purposeFromText || 'Group collection'
        : targetFromText || inlineTarget || existing?.target || '',
      amount: amountFromText || existing?.amount || '',
      network: nextNetwork,
      label: purposeFromText || existing?.label || '',
      wallet: nextWallet,
      evmWallet: nextWallet?.startsWith('0x') ? nextWallet : keepExistingWallet ? existing?.evmWallet || '' : '',
      solanaWallet: nextWallet && !nextWallet.startsWith('0x') ? nextWallet : keepExistingWallet ? existing?.solanaWallet || '' : '',
      offeredSavedWallet: networkCorrection && !keepExistingWallet ? false : savedWalletOfferStillApplies,
      offeredSavedWalletNetwork: savedWalletOfferStillApplies ? existing?.offeredSavedWalletNetwork : '',
    }
  }

  function draftFromSavedRequest(request: SavedRequest): HelperPaylinkDraft {
    const wallet = request.wallet || request.evmWallet || request.solanaWallet || ''
    return {
      mode: request.mode,
      target: request.target,
      amount: request.amount,
      network: request.network || (wallet.startsWith('0x') ? 'base' : ''),
      label: request.label,
      wallet,
      evmWallet: request.evmWallet || (wallet.startsWith('0x') ? wallet : ''),
      solanaWallet: request.solanaWallet || (!wallet.startsWith('0x') ? wallet : ''),
      offeredSavedWallet: true,
      offeredSavedWalletNetwork: request.network || (wallet.startsWith('0x') ? 'base' : ''),
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
      target: draft.mode === 'group' ? draft.target || draft.label || 'Group collection' : draft.target,
      amount: draft.amount,
    }
    const res = await fetch('/api/telegram-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    let data: { ok?: boolean; request?: SavedRequest; error?: string }
    try {
      data = await res.json() as { ok?: boolean; request?: SavedRequest; error?: string }
    } catch {
      throw new Error('Could not create PayLink right now. Try again shortly.')
    }
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
    const revisionBase = !paylinkDraft && lastPaylinkDraft && isPaylinkRevisionIntent(nextQuestion) ? lastPaylinkDraft : null
    if (!paylinkDraft && !revisionBase && !isPaymentRequestIntent(nextQuestion)) return false
    if (!paylinkDraft && !paymentQuotaStatus().allowed) {
      finishHelperMessage(nextQuestion, {
        answer: 'You have used today\'s 20 AI-assisted PayLink requests. The normal Payment Links tab is still available for manual requests.',
      })
      return true
    }
    if (paylinkDraft && isPaylinkDraftSideQuestion(nextQuestion) && !hasPaylinkDraftUpdate(nextQuestion, paylinkDraft)) {
      setThinkingState('payment-draft')
      const missingForDraftQuestion = describeMissingDraftFields(paylinkDraft).filter(item => item !== 'receive wallet' || !paylinkDraft.offeredSavedWallet)
      const fallbackAnswer = paylinkDraftSideQuestionFallback(paylinkDraft, nextQuestion)
      const answer = await polishLocalHelperResult(
        [
          'local_action=payment_request_draft_question',
          `user_question=${nextQuestion}`,
          `payer=${paylinkDraft.target ? friendlyName(paylinkDraft.target) : ''}`,
          `known_amount=${paylinkDraft.amount}`,
          `known_purpose=${paylinkDraft.label}`,
          `known_network=${paylinkDraft.network ? requestNetworkLabels[paylinkDraft.network] : ''}`,
          `has_receive_wallet=${Boolean(paylinkDraft.wallet)}`,
          `missing_fields=${missingForDraftQuestion.join(', ')}`,
          'Answer the user question directly in the context of the open PayLink draft.',
          'Do not re-ask for missing fields unless the answer naturally says what details are still needed later.',
          'Keep the PayLink draft open.',
          'Return one short consumer chat answer only.',
        ].join('\n'),
        fallbackAnswer,
      )
      finishHelperMessage(nextQuestion, {
        answer,
      })
      return true
    }
    const activeDraft = shouldStartFreshDraftRequest(nextQuestion, paylinkDraft) || shouldStartFreshPersonDraft(nextQuestion, paylinkDraft) || shouldStartFreshGroupDraft(nextQuestion, paylinkDraft)
      ? null
      : paylinkDraft ?? revisionBase
    let draft = buildDraftFromText(nextQuestion, activeDraft)
    const savedWallet = preferredWalletFor(draft.network)

    if (!draft.wallet && savedWallet && wantsSavedWallet(nextQuestion)) {
      const savedNetwork: RequestNetwork = savedWallet.startsWith('0x') ? 'base' : 'solana'
      const shouldDeferEvmNetworkChoice = savedWallet.startsWith('0x') && !draft.network
      draft = {
        ...draft,
        network: shouldDeferEvmNetworkChoice ? '' : draft.network || savedNetwork,
        wallet: savedWallet,
        evmWallet: savedWallet.startsWith('0x') ? savedWallet : draft.evmWallet,
        solanaWallet: savedWallet.startsWith('0x') ? draft.solanaWallet : savedWallet,
        offeredSavedWallet: true,
        offeredSavedWalletNetwork: shouldDeferEvmNetworkChoice ? '' : draft.network || savedNetwork,
      }
    }

    if (!draft.wallet && savedWallet && !draft.offeredSavedWallet) {
      setThinkingState('payment-wallet')
      draft = { ...draft, offeredSavedWallet: true, offeredSavedWalletNetwork: draft.network }
      setPaylinkDraft(draft)
      const savedWalletNetwork = draft.network ? requestNetworkLabels[draft.network] : walletNetworkLabel(savedWallet)
      const fallbackAnswer = `Use your saved ${savedWalletNetwork} receive wallet ${compactSavedWallet(savedWallet)}, or add a new receive wallet?`
      finishHelperMessage(nextQuestion, {
        answer: fallbackAnswer,
      })
      return true
    }

    if (!draft.wallet && !savedWallet && draft.network && draft.network !== 'all' && wantsSavedWallet(nextQuestion)) {
      setThinkingState('payment-wallet')
      setPaylinkDraft(draft)
      const otherWallet = savedWalletForOtherNetwork(draft.network)
      const requestedNetwork = requestNetworkLabels[draft.network]
      const fallbackAnswer = otherWallet
        ? `I only have your saved ${walletNetworkLabel(otherWallet)} wallet ${compactSavedWallet(otherWallet)}. For ${requestedNetwork}, send a ${requestedNetwork} receive wallet, or change the network.`
        : `I do not have a saved ${requestedNetwork} receive wallet yet. Send the receive wallet for this PayLink.`
      const answer = await polishLocalHelperResult(
        [
          'local_action=payment_request_saved_wallet_unavailable',
          `requested_network=${requestedNetwork}`,
          `other_saved_wallet=${otherWallet ? compactSavedWallet(otherWallet) : ''}`,
          `other_saved_wallet_network=${otherWallet ? walletNetworkLabel(otherWallet) : ''}`,
          'Explain that no saved wallet is available for the requested network.',
          'Ask for a matching receive wallet or a network change.',
          'Do not create a PayLink yet.',
          'Return one short consumer chat answer only.',
        ].join('\n'),
        fallbackAnswer,
      )
      finishHelperMessage(nextQuestion, {
        answer,
      })
      return true
    }

    if (!draft.wallet && savedWallet && draft.offeredSavedWallet && wantsSavedWallet(nextQuestion)) {
      if (!walletMatchesNetwork(savedWallet, draft.network)) {
        setThinkingState('payment-wallet')
        setPaylinkDraft(draft)
        const savedNetwork = walletNetworkLabel(savedWallet)
        const requestedNetwork = draft.network ? requestNetworkLabels[draft.network] : 'that network'
        const fallbackAnswer = `I only have your saved ${savedNetwork} wallet ${compactSavedWallet(savedWallet)}. For ${requestedNetwork}, send a ${requestedNetwork} receive wallet, or switch this PayLink back to ${savedNetwork.includes('Base') ? 'Base' : 'Solana'}.`
        const answer = await polishLocalHelperResult(
          [
            'local_action=payment_request_saved_wallet_network_mismatch',
            `saved_wallet=${compactSavedWallet(savedWallet)}`,
            `saved_wallet_network=${savedNetwork}`,
            `requested_network=${requestedNetwork}`,
            'Explain that the saved wallet cannot be used for the requested network.',
            'Ask for a matching receive wallet or offer to switch back to the saved wallet network.',
            'Return one short consumer chat answer only.',
          ].join('\n'),
          fallbackAnswer,
        )
        finishHelperMessage(nextQuestion, {
          answer,
        })
        return true
      }
      draft = {
        ...draft,
        wallet: savedWallet,
        evmWallet: savedWallet.startsWith('0x') ? savedWallet : draft.evmWallet,
        solanaWallet: savedWallet.startsWith('0x') ? draft.solanaWallet : savedWallet,
      }
    }

    if (!draft.wallet && savedWallet && draft.offeredSavedWallet && wantsNewWallet(nextQuestion)) {
      setThinkingState('payment-wallet')
      setPaylinkDraft(draft)
      const fallbackAnswer = 'Send the new receive wallet. I will use it for this PayLink.'
      const answer = await polishLocalHelperResult(
        [
          'local_action=payment_request_new_wallet_needed',
          'Ask the user for the new receive wallet.',
          'Do not mention replacing the saved wallet unless the user asks.',
          'Return one short consumer chat sentence only.',
        ].join('\n'),
        fallbackAnswer,
      )
      finishHelperMessage(nextQuestion, {
        answer,
      })
      return true
    }

    if (draft.network === 'all') {
      draft = { ...draft, network: '' }
    }
    if (draft.wallet && !walletMatchesNetwork(draft.wallet, draft.network)) {
      setThinkingState('payment-wallet')
      setPaylinkDraft(draft)
      const walletNetwork = walletNetworkLabel(draft.wallet)
      const requestedNetwork = draft.network ? requestNetworkLabels[draft.network] : 'the selected network'
      const fallbackAnswer = `That receive wallet looks like ${walletNetwork}, but this PayLink is set to ${requestedNetwork}. Send a matching receive wallet, or change the network.`
      const answer = await polishLocalHelperResult(
        [
          'local_action=payment_request_wallet_network_mismatch',
          `wallet_network=${walletNetwork}`,
          `requested_network=${requestedNetwork}`,
          'Explain that the receive wallet does not match the selected network.',
          'Ask for a matching receive wallet or a network change.',
          'Do not create a PayLink yet.',
          'Return one short consumer chat answer only.',
        ].join('\n'),
        fallbackAnswer,
      )
      finishHelperMessage(nextQuestion, {
        answer,
      })
      return true
    }

    const missing = describeMissingDraftFields(draft, draft.wallet ? '' : savedWallet)
    if (missing.length > 0) {
      setThinkingState('payment-draft')
      setPaylinkDraft(draft)
      const missingNetworkOnly = missing.length === 1 && missing[0] === 'network'
      const missingTarget = draft.target ? friendlyName(draft.target) : 'the payer'
      const missingPurposeOnly = missing.length === 1 && missing[0] === 'purpose'
      const fallbackAnswer = missingNetworkOnly
        ? draft.wallet?.startsWith('0x')
          ? `Which EVM network should ${missingTarget} use: Base, Arbitrum, or Arc?`
          : `Which network should ${missingTarget} use: Base, Arc, Arbitrum, Solana, or all networks?`
        : missingPurposeOnly
        ? `What is this payment for?`
        : `Send ${missing.join(', ')}. One line is fine.`
      const answer = await polishLocalHelperResult(
        [
          'local_action=payment_request_missing_fields',
          `mode=${draft.mode}`,
          `missing_fields=${missing.join(', ')}`,
          `payer=${draft.target}`,
          `amount=${draft.amount}`,
          `purpose=${draft.label}`,
          draft.mode === 'person'
            ? 'This is a one-payer payment request. Do not call it a donation, collection, group payment, fundraiser, or contribution.'
            : 'This is a group collection.',
          'Ask only for the missing fields. Do not say a provided payer name is missing.',
          'Use the payer name if available.',
          'Return one short consumer chat sentence only.',
        ].join('\n'),
        fallbackAnswer,
      )
      finishHelperMessage(nextQuestion, {
        answer,
      })
      return true
    }

    setThinkingState('paylink-build')
    setAgentStatus('Preparing PayLink...')
    let saved: SavedRequest
    try {
      saved = await createPaylinkFromDraft(draft)
    } catch (err) {
      const message = err instanceof Error && err.message
        ? err.message
        : 'Could not create PayLink right now. Try again shortly.'
      finishHelperMessage(nextQuestion, {
        answer: message,
      })
      return true
    }
    consumePaymentQuota()
    setPaylinkDraft(null)
    setLastPaylinkDraft(draftFromSavedRequest(saved))
    const target = friendlyName(saved.target)
    const fallbackAnswer = saved.mode === 'group'
      ? 'Collection ready.'
      : `PayLink ready for ${target}.`
    const answer = await polishLocalHelperResult(
      [
        'local_action=paylink_ready',
        `mode=${saved.mode}`,
        `target=${target}`,
        `amount=${saved.amount} USDC`,
        `network=${saved.network ? requestNetworkLabels[saved.network] : ''}`,
        `purpose=${saved.label}`,
        'Return one short consumer chat sentence only.',
        'Do not repeat amount, wallet, network, or purpose because the card shows those details.',
      ].join('\n'),
      fallbackAnswer,
    )
    finishHelperMessage(nextQuestion, {
      answer,
      paylink: saved,
    })
    return true
  }

  function polyDeskUrl(service: TelegramServiceId) {
    const params = new URLSearchParams()
    params.set('section', 'market-tools')
    params.set('service', service)
    params.set('open', '1')
    return `${shareOrigin()}/telegram/payment-links?${params.toString()}`
  }

  function buildLpScoutWalletManagerUrl(context: string) {
    const params = new URLSearchParams()
    params.set('profile', 'agent')
    params.set('walletManager', 'service')
    params.set('src', 'lp-scout')
    params.set('run', 'polymarket-scout')
    params.set('scoutMode', /\b(url|market|slug|theme|specific|this)\b/i.test(context) ? 'theme' : 'best')
    params.set('maxAmount', lpScoutOptions[0]?.amount ?? '0.01')
    params.set('serviceUrl', '/api/x402/polymarket-scout')
    params.set('n', 'base')
    if (context.trim()) params.set('context', context.trim().slice(0, 180))
    return `${shareOrigin()}/agent?${params.toString()}`
  }

  function lpScoutTreasuryAccessRequest(): SavedRequest {
    return {
      mode: 'person',
      network: 'base',
      wallet: EVM_TREASURY,
      evmWallet: EVM_TREASURY,
      solanaWallet: '',
      amount: lpScoutOptions[0]?.amount ?? '0.01',
      label: 'LP Scout access',
      target: 'Hash PayLink treasury',
    }
  }

  async function portfolioAnswer(nextQuestion: string) {
    const portfolioUrl = polyDeskUrl('poly-portfolio')
    if (!polyDeskAuthenticated) {
      return {
        answer: 'Open PolyDesk Portfolio and sign in to connect your Polymarket profile first.',
        actionLink: { label: 'Portfolio', url: portfolioUrl },
      }
    }
    const token = await getPolyDeskAccessToken()
    if (!token) {
      return {
        answer: 'Open PolyDesk Portfolio and sign in to continue.',
        actionLink: { label: 'Portfolio', url: portfolioUrl },
      }
    }
    const profileRes = await fetch('/api/polymarket-portfolio?action=profile', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const profileData = await profileRes.json() as { ok?: boolean; profile?: PolymarketProfile | null; error?: string }
    if (!profileRes.ok || !profileData.ok) throw new Error(profileData.error || 'Could not load PolyDesk profile.')
    const address = profileData.profile?.polymarketAddress
    if (!address) {
      return {
        answer: 'Connect your Polymarket 0x profile in PolyDesk Portfolio first.',
        actionLink: { label: 'Portfolio', url: portfolioUrl },
      }
    }

    const isFundingContinuation = Boolean(polyPortfolioFundingDraft)
    const isFundingIntent = /\b(fund|deposit|top up|bridge)\b/i.test(nextQuestion)
    if (isFundingIntent || isFundingContinuation) {
      const requestedAmount = extractAmount(nextQuestion) || polyPortfolioFundingDraft?.amount || ''
      const requestedNetwork = extractNetwork(nextQuestion) || polyPortfolioFundingDraft?.network || ''
      if (!requestedAmount) {
        setPolyPortfolioFundingDraft({ amount: '', network: requestedNetwork })
        return {
          answer: 'How much USDC do you want to fund? Minimum bridge amount is 3 USDC.',
          actionLink: { label: 'Portfolio', url: portfolioUrl },
        }
      }
      if (Number(requestedAmount) < 3) {
        setPolyPortfolioFundingDraft({ amount: '', network: requestedNetwork })
        return {
          answer: 'Minimum bridge amount is 3 USDC. Send an amount of 3 USDC or more.',
          actionLink: { label: 'Portfolio', url: portfolioUrl },
        }
      }
      if (requestedNetwork === 'arc' || requestedNetwork === 'all') {
        setPolyPortfolioFundingDraft({ amount: requestedAmount, network: '' })
        return {
          answer: 'Polymarket bridge checkout supports Base, Arbitrum, or Solana right now. Which one should I use?',
          actionLink: { label: 'Portfolio', url: portfolioUrl },
        }
      }
      if (!requestedNetwork) {
        setPolyPortfolioFundingDraft({ amount: requestedAmount, network: '' })
        return {
          answer: polymarketBridgeNetworkPrompt(requestedAmount),
          actionLink: { label: 'Portfolio', url: portfolioUrl },
        }
      }
      if (!isPolymarketBridgeNetwork(requestedNetwork)) {
        setPolyPortfolioFundingDraft({ amount: requestedAmount, network: '' })
        return {
          answer: 'Polymarket bridge checkout supports Base, Arbitrum, or Solana right now. Which one should I use?',
          actionLink: { label: 'Portfolio', url: portfolioUrl },
        }
      }
      const bridgeNetwork = requestedNetwork
      const bridgeRes = await fetch('/api/polymarket-bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          polymarketWallet: address,
          network: bridgeNetwork,
        }),
      })
      const bridgeData = await readPolyDeskJson<{
        ok?: boolean
        depositAddress?: string
        network?: PolymarketBridgeNetwork
        minimumUsdc?: number
        error?: string
      }>(bridgeRes, 'Could not prepare bridge address.')
      if (!bridgeRes.ok || !bridgeData.ok || !bridgeData.depositAddress) {
        throw new Error(bridgeData.error || 'Could not prepare Polymarket bridge checkout.')
      }
      const finalNetwork = (bridgeData.network ?? bridgeNetwork) as RequestNetwork
      const requestId = polymarketFundingRequestId()
      await fetch('/api/polymarket-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'log-funding',
          polymarketWallet: address,
          network: finalNetwork,
          amount: requestedAmount,
          status: 'pending',
          requestId,
          depositAddress: bridgeData.depositAddress,
        }),
      }).catch(() => undefined)
      const payUrl = buildPolymarketPayLink({
        wallet: bridgeData.depositAddress,
        amount: requestedAmount,
        funding: 'Polymarket portfolio',
        network: finalNetwork,
        polymarketWallet: address,
        returnToAgentHash: true,
        requestId,
        helperOwner: ownerKey || fallbackOwner || payer.trim(),
      })
      setPolyPortfolioFundingDraft(null)
      return {
        answer: `Bridge checkout ready for ${requestedAmount} USDC to your Polymarket profile ${shortAddress(address)} on ${requestNetworkLabels[finalNetwork]}.`,
        paylink: {
          kind: 'polymarket-funding' as const,
          mode: 'person' as const,
          network: finalNetwork,
          wallet: bridgeData.depositAddress,
          evmWallet: finalNetwork === 'solana' ? '' : bridgeData.depositAddress,
          solanaWallet: finalNetwork === 'solana' ? bridgeData.depositAddress : '',
          polymarketWallet: address,
          label: 'Polymarket funding',
          target: 'Your Polymarket account',
          amount: requestedAmount,
          payUrl,
        },
        actionLink: { label: 'Portfolio', url: portfolioUrl },
      }
    }

    const [valueRes, positionsRes] = await Promise.all([
      fetch(`/api/polymarket-portfolio?action=value&address=${encodeURIComponent(address)}`),
      fetch(`/api/polymarket-portfolio?action=positions&address=${encodeURIComponent(address)}&sizeThreshold=0&limit=100`),
    ])
    const valueData = await valueRes.json() as { ok?: boolean; value?: unknown; error?: string }
    const positionsData = await positionsRes.json() as { ok?: boolean; positions?: PolymarketPosition[]; error?: string }
    if (!valueRes.ok || !valueData.ok) throw new Error(valueData.error || 'Could not load portfolio value.')
    if (!positionsRes.ok || !positionsData.ok) throw new Error(positionsData.error || 'Could not load positions.')
    const positions = Array.isArray(positionsData.positions) ? positionsData.positions : []
    const active = positions.filter(isActiveOpenPosition)
    const claimable = positions.filter(isClaimablePosition)
    const total = normalizePortfolioValue(valueData.value)?.value
    const claimableText = claimable.length ? ` ${claimable.length} claimable position${claimable.length === 1 ? '' : 's'} need attention.` : ' No claimables right now.'
    const wantsCashBalance = /\b(cash|available|wallet balance|cash balance|current balance|portfolio balance)\b/i.test(nextQuestion)
    return {
      answer: wantsCashBalance
        ? `Your saved Polymarket portfolio value is ${formatUsd(total)} across ${active.length} open position${active.length === 1 ? '' : 's'}.${claimableText} I cannot verify idle Polymarket cash balance yet.`
        : `Your saved Polymarket portfolio is ${formatUsd(total)} across ${active.length} open position${active.length === 1 ? '' : 's'}.${claimableText}`,
      actionLink: { label: 'Portfolio', url: portfolioUrl },
    }
  }

  async function worldCupAnswer(nextQuestion: string) {
    const scoresUrl = polyDeskUrl('poly-stream')
    const newsUrl = polyDeskUrl('poly-worldcup-news')
    const wantsFixture = /\b(match|matches|fixture|fixtures|playing|play|game|games|score|scores|live|today|tonight|next|upcoming|schedule)\b/i.test(nextQuestion)
    const wantsNews = !wantsFixture && /\b(news|headline|headlines|latest|update|updates)\b/i.test(nextQuestion)
    if (wantsNews) {
      const response = await fetch('/api/poly-worldcup-news')
      const data = await response.json() as PolyWorldCupFeed
      if (!response.ok || !data.ok) throw new Error('World Cup news is unavailable right now.')
      const articles = (data.articles ?? []).slice(0, 3)
      if (!articles.length) {
        return {
          answer: 'I do not have verified World Cup news from the feed right now.',
          actionLink: { label: 'News', url: newsUrl },
        }
      }
      const lines = articles.map((article, index) => `${index + 1}. ${article.title}${article.source ? ` (${article.source})` : ''}`)
      return {
        answer: `Latest verified World Cup market news:\n${lines.join('\n')}`,
        actionLink: { label: 'News', url: newsUrl },
      }
    }

    const response = await fetch('/api/poly-stream')
    const data = await response.json() as PolyStreamFeed
    if (!response.ok || !data.ok) throw new Error('World Cup live board is unavailable right now.')
    const matches = data.matches ?? []
    const wantsToday = /\b(today|tonight|now|live|playing)\b/i.test(nextQuestion)
    const wantsUpcoming = /\b(upcoming|next|schedule|fixtures|all fixtures|all upcoming)\b/i.test(nextQuestion)
    const wantsTradeLink = /\b(trade|trading|link|open market|market link)\b/i.test(nextQuestion)
    const wantsLiquidity = /\b(liquidity|volume|market price|prices?|odds)\b/i.test(nextQuestion)
    const wantsGoals = /\b(goal|goals|scored|scorer|scorers|goalscorer|goalscorers)\b/i.test(nextQuestion)
    const wantsCards = /\b(card|cards|yellow|red)\b/i.test(nextQuestion)
    const wantsCorners = /\b(corner|corners)\b/i.test(nextQuestion)
    const wantsStats = /\b(stat|stats|statistics)\b/i.test(nextQuestion) || wantsCards || wantsCorners
    const wantsMatchDetail = wantsTradeLink || wantsLiquidity || wantsGoals || wantsCards || wantsCorners || wantsStats
    const todayMatches = matches.filter(match => {
      const kickoffTime = Date.parse(match.kickoffAt || match.time)
      if (/^(live|today)$/i.test(match.tag)) return true
      if (!Number.isFinite(kickoffTime)) return false
      return new Date(kickoffTime).toDateString() === new Date().toDateString()
    })
    const words = nextQuestion.toLowerCase().match(/[a-z]{3,}/g)?.filter(word => !['what', 'when', 'score', 'scores', 'between', 'playing', 'their', 'next', 'world', 'cup', 'game', 'games', 'match', 'matches', 'fixture', 'fixtures', 'current', 'latest', 'today', 'tonight', 'live', 'upcoming', 'schedule', 'all', 'trade', 'trading', 'link', 'open', 'market', 'polymarket', 'liquidity', 'volume', 'price', 'prices', 'odds', 'goal', 'goals', 'scored', 'scorer', 'scorers', 'goalscorer', 'goalscorers', 'card', 'cards', 'yellow', 'red', 'corner', 'corners', 'stat', 'stats', 'statistics', 'played', 'particular'].includes(word)) ?? []
    const matchedByWords = words.length ? matches.find(item => {
      const title = item.title.toLowerCase()
      const hits = words.filter(word => title.includes(word))
      return hits.length >= Math.min(2, Math.max(1, words.length))
    }) : undefined
    if (wantsToday && todayMatches.length && !matchedByWords && !wantsMatchDetail) {
      const lines = todayMatches.slice(0, 4).map(match => {
        const state = matchDisplayState(match)
        const score = hasMatchScore(match) ? `${match.homeScore}-${match.awayScore}` : state.center
        return `${match.title}: ${state.tag}${state.phase ? `, ${state.phase}` : ''}. ${score}. ${state.sub || match.time}.`
      })
      return {
        answer: `Today's verified World Cup matches:\n${lines.join('\n')}`,
        actionLink: { label: 'Live board', url: scoresUrl },
      }
    }
    const match = matchedByWords || (words.length || wantsMatchDetail ? undefined : matches[0])
    if (wantsMatchDetail && !match) {
      return {
        answer: 'Which match should I check? Send the fixture name, for example: South Africa vs Canada.',
        actionLink: { label: 'Live board', url: scoresUrl },
      }
    }
    if (match && wantsMatchDetail) {
      const state = matchDisplayState(match)
      const score = hasMatchScore(match) ? `${match.homeScore}-${match.awayScore}` : state.center
      const actionLinks = [
        { label: 'Live board', url: scoresUrl },
        ...(match.polymarketUrl ? [{ label: 'Market', url: match.polymarketUrl }] : []),
      ]
      if (wantsTradeLink) {
        return {
          answer: match.polymarketUrl
            ? `Trade route found for ${match.title}. Current board status: ${state.tag}, ${score}.`
            : `I do not have a verified Polymarket trade route for ${match.title} right now.`,
          actionLinks,
        }
      }
      if (wantsLiquidity) {
        const liquidity = match.polymarketLiquidity ? `Liquidity: ${match.polymarketLiquidity}.` : 'Liquidity is not verified in the feed right now.'
        const volume = match.polymarketVolume ? `Volume: ${match.polymarketVolume}.` : ''
        const price = match.probability ? `Market price: ${match.probability}.` : ''
        return {
          answer: `${match.title}: ${liquidity}${volume ? ` ${volume}` : ''}${price ? ` ${price}` : ''}`,
          actionLinks,
        }
      }
      if (wantsGoals) {
        const goals = (match.goalScorers || []).map(goal => formatGoalScorer(goal, ...splitFixtureTitle(match.title))).filter(Boolean)
        return {
          answer: goals.length
            ? `${match.title} goals:\n${goals.slice(0, 6).join('\n')}`
            : `${match.title}: no verified goalscorer names are available in the feed right now. Score/status: ${score}.`,
          actionLinks,
        }
      }
      if (wantsCards) {
        const [home, away] = splitFixtureTitle(match.title)
        const cardEvents = (match.events || [])
          .filter(event => /\b(card|yellow|red)\b/i.test(event))
          .map(event => formatMatchEvent(event, home, away))
          .filter((event): event is MatchEventDetail => Boolean(event))
        const yellowCount = cardEvents.filter(event => event.kind === 'yellow' || event.kind === 'yellow-red').length
        const redCount = cardEvents.filter(event => event.kind === 'red' || event.kind === 'yellow-red').length
        return {
          answer: cardEvents.length
            ? `${match.title} cards: ${yellowCount} yellow, ${redCount} red.\n${cardEvents.slice(0, 6).map(event => event.text).join('\n')}`
            : `${match.title}: no verified card events are available in the feed right now.`,
          actionLinks,
        }
      }
      if (wantsCorners) {
        const cornerStats = (match.stats || []).filter(stat => /\bcorner|corners\b/i.test(stat))
        return {
          answer: cornerStats.length
            ? `${match.title} corner stats:\n${cornerStats.slice(0, 4).join('\n')}`
            : `${match.title}: verified corner stats are not available in the feed right now.`,
          actionLinks,
        }
      }
      const stats = (match.stats || []).filter(Boolean)
      return {
        answer: stats.length
          ? `${match.title} verified stats:\n${stats.slice(0, 6).join('\n')}`
          : `${match.title}: detailed verified match stats are not available in the feed right now. Score/status: ${score}.`,
        actionLinks,
      }
    }
    const upcomingMatches = matches.filter(match => {
      const state = matchDisplayState(match)
      const kickoffTime = Date.parse(match.kickoffAt || match.time)
      return state.tag === 'NS' || /upcoming|scheduled|not started|fixture/i.test(`${match.tag} ${match.status}`) || (Number.isFinite(kickoffTime) && kickoffTime > Date.now())
    })
    if (wantsUpcoming && upcomingMatches.length) {
      const lines = upcomingMatches.slice(0, 6).map(match => {
        const state = matchDisplayState(match)
        return `${match.title}: ${state.sub || match.time}.`
      })
      return {
        answer: `Upcoming verified World Cup fixtures:\n${lines.join('\n')}`,
        actionLink: { label: 'Live board', url: scoresUrl },
      }
    }
    if (!match) {
      return {
        answer: 'I do not have verified World Cup match data from the feed right now.',
        actionLink: { label: 'Live board', url: scoresUrl },
      }
    }
    const state = matchDisplayState(match)
    const score = hasMatchScore(match) ? `${match.homeScore}-${match.awayScore}` : state.center
    return {
      answer: `${match.title}: ${state.tag}${state.phase ? `, ${state.phase}` : ''}. Score/status: ${score}. ${state.sub || match.time}.`,
      actionLinks: [
        { label: 'Live board', url: scoresUrl },
        ...(match.polymarketUrl ? [{ label: 'Market', url: match.polymarketUrl }] : []),
      ],
    }
  }

  async function handlePolyDeskConversation(nextQuestion: string) {
    if (helperMode !== 'polydesk' || !polyDeskSubMode) return false
    setThinkingState(polyDeskSubMode === 'lp-scout' ? 'deep-research' : 'light')
    setAgentStatus(polyDeskSubMode === 'lp-scout' ? 'Preparing LP Scout access...' : 'Reading PolyDesk data...')

    if (polyDeskSubMode === 'portfolio') {
      const result = await portfolioAnswer(nextQuestion)
      finishHelperMessage(nextQuestion, result)
      return true
    }

    if (polyDeskSubMode === 'worldcup') {
      const result = await worldCupAnswer(nextQuestion)
      finishHelperMessage(nextQuestion, result)
      return true
    }

    const x402Url = buildLpScoutWalletManagerUrl(nextQuestion)
    const treasuryRequest = lpScoutTreasuryAccessRequest()
    finishHelperMessage(nextQuestion, {
      answer: [
        'LP Scout is paid access.',
        'Choose x402 access for strict LP Scout proof, or pay normal USDC access below.',
        'Normal USDC access is not LP Scout x402 proof.',
      ].join('\n'),
      actionLink: { label: 'x402 access', url: x402Url },
      paylink: treasuryRequest,
    })
    return true
  }

  function isClearHistoryRequest(value: string) {
    return /^(clear|clean|delete|wipe|reset)\s+(this\s+)?(chat|conversation|history|chat history)\b/i.test(value.trim())
  }

  function isClearHistoryConfirm(value: string) {
    return /^(clear|yes|confirm|do it|delete)$/i.test(value.trim())
  }

  function isClearHistoryCancel(value: string) {
    return /^(cancel|no|stop|never mind|nevermind)$/i.test(value.trim())
  }

  async function clearCurrentHelperThread() {
    try {
      await fetch('/api/helper-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'clear-thread',
          owner: ownerKey,
          payer: payer.trim() || helperName || cleanTelegramName || ownerKey,
          fallbackOwner,
          threadId: activeHelperThreadId,
        }),
      })
    } catch {
      // Local clear should still work if persistence is temporarily unavailable.
    }
  }

  async function askHelper() {
    if (!question.trim() || asking || !started) return
    const nextQuestion = question.trim()
    if (!helperMode) {
      setAskError('Choose a mode to start.')
      return
    }
    if (helperMode === 'polydesk' && !polyDeskSubMode) {
      setAskError('Choose Portfolio, World Cup, or LP Scout first.')
      return
    }
    setQuestion('')
    setAskError('')

    if (clearHistoryPending) {
      setClearHistoryPending(false)
      if (isClearHistoryCancel(nextQuestion)) {
        setMessages(prev => [...prev, { question: nextQuestion, answer: 'No problem. I kept this chat history.' }])
        return
      }
      if (isClearHistoryConfirm(nextQuestion)) {
        await clearCurrentHelperThread()
        setMessages([{ answer: 'Chat history cleared. I kept your saved profile, wallet preferences, and memory.' }])
        return
      }
      setMessages(prev => [...prev, {
        question: nextQuestion,
        answer: 'I kept this chat history. Type "clear history" again if you want to clear the visible chat.',
      }])
      return
    }

    if (isClearHistoryRequest(nextQuestion)) {
      setClearHistoryPending(true)
      setMessages(prev => [...prev, {
        question: nextQuestion,
        answer: 'Clear this chat history? Type "clear" to confirm or "cancel" to keep it. I will keep your saved profile, wallet preferences, and memory.',
      }])
      return
    }

    setAsking(true)
    setThinkingState('light')
    const abortController = new AbortController()
    helperAbortRef.current = abortController
    queueHelperMessage(nextQuestion)
    try {
      const isPaylinkFlow = helperMode === 'payments' && Boolean(paylinkDraft || isPaymentRequestIntent(nextQuestion))
      const isDeepResearch = helperMode === 'polydesk' || isDeepResearchIntent(nextQuestion)
      setThinkingState(isPaylinkFlow ? 'payment-draft' : isDeepResearch ? 'deep-research' : 'light')
      setAgentStatus(isPaylinkFlow
        ? 'Checking payment details...'
        : isDeepResearch
          ? 'Running deeper research... this might take a little time.'
          : 'Reading your message...')
      if (isNameCorrectionMessage(nextQuestion)) {
        const nextMemory = [
          (memoryDraft.trim() || profile?.memorySummary || '')
            .split('\n')
            .filter(line => !isMoodNameMemoryLine(line))
            .join('\n'),
          'User clarified that recent mood wording was not their name.',
        ].filter(Boolean).join('\n').slice(0, 1200)
        window.localStorage.removeItem('hashpaylink-helper-name')
        const fallbackName = usableHelperName(profile?.displayName || nameFromMemorySummary(nextMemory) || '')
        setHelperName(fallbackName)
        setHelperNameDraft(fallbackName)
        setMemoryDraft(nextMemory)
        const answer = await polishLocalHelperResult(
          [
            'local_action=personal_context_correction',
            `question=${nextQuestion}`,
            'The user clarified that a mood was mistaken for their name.',
            'Apologize briefly, acknowledge the correction, and continue as a normal supportive chat.',
            'Return one short consumer chat answer only.',
          ].join('\n'),
          "You're right. I won't treat that as your name. Tell me what's on your mind.",
          nextMemory,
        )
        finishHelperMessage(nextQuestion, { answer })
        void saveProfile({ displayName: fallbackName || '', memorySummary: nextMemory })
        return
      }
      const rememberedName = extractRememberedName(nextQuestion)
      if (rememberedName) {
        const cleanName = friendlyName(rememberedName)
        const nextMemory = [`User prefers to be called ${cleanName}.`, memoryDraft.trim() || profile?.memorySummary || '']
          .filter(Boolean)
          .join('\n')
          .slice(0, 1200)
        window.localStorage.setItem('hashpaylink-helper-name', cleanName)
        setHelperName(cleanName)
        setHelperNameDraft(cleanName)
        onRecoverTelegramName(cleanName)
        setPayer(current => current || cleanName)
        setMemoryDraft(nextMemory)
        const fallbackAnswer = `Got it. I'll call you ${cleanName}.`
        const answer = await polishLocalHelperResult(
          [
            'local_action=remember_name',
            `preferred_name=${cleanName}`,
            'Return one warm, short confirmation sentence only.',
          ].join('\n'),
          fallbackAnswer,
          nextMemory,
        )
        finishHelperMessage(nextQuestion, {
          answer,
        })
        void saveProfile({ displayName: cleanName, memorySummary: nextMemory })
        return
      }
      const relationshipMemory = extractRelationshipMemory(nextQuestion)
      if (relationshipMemory && !isPaymentRequestIntent(nextQuestion)) {
        const memoryLine = `User has a ${relationshipMemory.relation} called ${relationshipMemory.name}.`
        const nextMemory = [memoryDraft.trim() || profile?.memorySummary || '', memoryLine]
          .filter(Boolean)
          .join('\n')
          .slice(0, 1200)
        setMemoryDraft(nextMemory)
        const fallbackAnswer = `Got it. I'll remember that your ${relationshipMemory.relation} is ${relationshipMemory.name}.`
        const answer = await polishLocalHelperResult(
          [
            'local_action=remember_relationship',
            `relationship=${relationshipMemory.relation}`,
            `name=${relationshipMemory.name}`,
            'Return one warm, short confirmation sentence only.',
          ].join('\n'),
          fallbackAnswer,
          nextMemory,
        )
        finishHelperMessage(nextQuestion, {
          answer,
        })
        void saveProfile({ memorySummary: nextMemory })
        return
      }
      if (relationshipMemory) {
        const memoryLine = `User has a ${relationshipMemory.relation} called ${relationshipMemory.name}.`
        const nextMemory = [memoryDraft.trim() || profile?.memorySummary || '', memoryLine]
          .filter(Boolean)
          .join('\n')
          .slice(0, 1200)
        setMemoryDraft(nextMemory)
        void saveProfile({ memorySummary: nextMemory })
      }
      if (isAskingUserName(nextQuestion)) {
        const knownName = normalizeHelperName(helperName || profile?.displayName || helperNameDraft || nameFromMemorySummary(memoryDraft || profile?.memorySummary || '') || '')
        const fallbackAnswer = knownName && knownName !== 'there'
          ? `You're ${friendlyName(knownName)}.`
          : "I don't know your preferred name yet. Tell me what to call you and I'll remember it."
        const answer = await polishLocalHelperResult(
          [
            'local_action=personal_memory_answer',
            `question=${nextQuestion}`,
            `known_name=${knownName && knownName !== 'there' ? friendlyName(knownName) : ''}`,
            'Answer only the user name question. If the name is unknown, say that naturally.',
          ].join('\n'),
          fallbackAnswer,
        )
        finishHelperMessage(nextQuestion, {
          answer,
        })
        return
      }
      if (helperMode !== 'payments' && isPaymentRequestIntent(nextQuestion)) {
        finishHelperMessage(nextQuestion, {
          answer: 'That sounds like a payment request. Switch to Payments mode and I will prepare it cleanly.',
        })
        return
      }
      if (helperMode === 'payments' && await handlePaylinkConversation(nextQuestion)) return
      if (helperMode === 'polydesk' && await handlePolyDeskConversation(nextQuestion)) return
      setThinkingState(isDeepResearch ? 'deep-research' : 'light')
      setAgentStatus(isDeepResearch ? 'Running deeper research... this might take a little time.' : 'Asking ZeroScout...')
      const res = await fetch('/api/agent-ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          eventId: eventId.trim(),
          payer: payer.trim(),
          question: nextQuestion,
          accessMode: 'helper-free',
          helperMode,
          memorySummary: helperMemoryContext(),
        }),
      })
      const rawHelperResponse = await res.text()
      let data: {
        answer?: string
        proof?: { ogTxHash: string; ogExplorer: string }
        zeroscoutSponsorship?: ZeroScoutSponsorship
        error?: string
        upgradeRequired?: boolean
        upgradeLink?: string
        upgradeAmount?: string
        upgradeCurrency?: string
      }
      try {
        data = rawHelperResponse ? JSON.parse(rawHelperResponse) : {}
      } catch {
        data = {
          error: rawHelperResponse.trim().startsWith('<')
            ? 'Agent Hash is temporarily receiving a service page instead of an API response. Please try again shortly.'
            : 'Agent Hash returned an unreadable response. Please try again shortly.',
        }
      }
      if (!data.answer) {
        if (data.upgradeRequired && data.upgradeLink) {
          finishHelperMessage(nextQuestion, {
            answer: `Deep research is paused after today's free uses. Agent Hash Pro is ${data.upgradeAmount ?? '10'} ${data.upgradeCurrency ?? 'USDC'} monthly: ${data.upgradeLink}`,
          })
          return
        }
        throw new Error(data.error ?? 'No helper response returned.')
      }
      setThinkingState('proof')
      setAgentStatus('Securing proof...')
      finishHelperMessage(nextQuestion, { answer: data.answer!, proof: data.proof, zeroscoutSponsorship: data.zeroscoutSponsorship })
      void saveProfile({ question: nextQuestion, answer: data.answer } as Partial<HelperProfile>)
      if (!memoryDraft.trim()) {
        setMemoryDraft(`User is known as ${helperName || payer}. They use Hash PayLink Agent Helper from Telegram and may ask about payments, Polymarket, HashpayStream, agents, research, planning, and daily questions.`)
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setAskError(err instanceof Error ? err.message : 'Helper request failed.')
    } finally {
      if (helperAbortRef.current === abortController) helperAbortRef.current = null
      setAsking(false)
    }
  }

  function openHelperCheckout() {
    startHelper()
  }

  return (
    <div>
      <div className="space-y-3">
        <div className="overflow-hidden">
              <div
                ref={helperScrollRef}
                className={cn(
                  'max-h-[360px] min-h-[220px] space-y-4 overflow-y-auto p-3 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                  !hideTopDivider && 'border-t border-gray-100 dark:border-white/10',
                )}
              >
                <div className="max-w-[82%] break-words rounded-[18px] rounded-bl-md bg-[#f0f0f0] px-3.5 py-2.5 text-sm leading-relaxed text-gray-900 shadow-sm dark:bg-white/[0.08] dark:text-gray-100">
                  <p>
                    {welcomeText ?? `Welcome back, ${helperName || cleanTelegramName || 'there'}. Ask me about payments, Polymarket funding, HashpayStream, agent setup, research, planning, or daily questions.`}
                  </p>
                  <div className="mt-2">
                    <ZeroScoutPowerBadge compact />
                  </div>
                </div>

                {!helperMode && !lockedHelperMode && (
                  <div className="max-w-[92%] rounded-[18px] rounded-bl-md bg-[#f0f0f0] px-3.5 py-3 text-sm text-gray-900 shadow-sm dark:bg-white/[0.08] dark:text-gray-100">
                    <p className="mb-2 font-medium">Choose how Agent Hash should help you first.</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {helperModes.map(mode => (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => chooseHelperMode(mode.id)}
                          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-xs font-semibold text-gray-900 transition hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:hover:bg-white/[0.1]"
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {helperMode && !lockedHelperMode && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={resetHelperMode}
                      className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-semibold text-gray-600 shadow-sm transition hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]"
                    >
                      {helperModes.find(mode => mode.id === helperMode)?.label} mode
                    </button>
                  </div>
                )}

                {helperMode === 'polydesk' && !polyDeskSubMode && (
                  <div className="max-w-[92%] rounded-[18px] rounded-bl-md bg-[#f0f0f0] px-3.5 py-3 text-sm text-gray-900 shadow-sm dark:bg-white/[0.08] dark:text-gray-100">
                    <p className="mb-2 font-medium">Choose your Desk Agent lane.</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {polyDeskSubModes.map(mode => {
                        const Icon = mode.icon
                        return (
                          <button
                            key={mode.id}
                            type="button"
                            onClick={() => choosePolyDeskSubMode(mode.id)}
                            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-xs font-semibold text-gray-900 transition hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:hover:bg-white/[0.1]"
                          >
                            <Icon className="h-3.5 w-3.5 text-gray-500 dark:text-gray-300" />
                            {mode.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {helperMode === 'polydesk' && polyDeskSubMode && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        setPolyDeskSubMode('')
                        setPolyPortfolioFundingDraft(null)
                        setMessages([])
                        setQuestion('')
                        setAskError('')
                        window.localStorage.removeItem(`${helperModeStorageKey}:polydesk`)
                        onPolyDeskSubModeChange?.('')
                      }}
                      className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-semibold text-gray-600 shadow-sm transition hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]"
                    >
                      Desk Agent / {polyDeskSubModes.find(mode => mode.id === polyDeskSubMode)?.label}
                    </button>
                  </div>
                )}

                {messages.map((message, index) => (
                  <div key={index} className="space-y-2.5">
                    {message.question && (
                      <div className="flex justify-end">
                        <div className="max-w-[82%] break-words rounded-[18px] rounded-br-md bg-black px-3.5 py-2 text-sm leading-relaxed text-white shadow-sm dark:bg-white dark:text-gray-950">
                          {message.question}
                        </div>
                      </div>
                    )}
                    {(message.answer || message.paylink) && (
                      <div>
                        {message.answer && (
                          <div className="max-w-[82%] break-words whitespace-pre-wrap rounded-[18px] rounded-bl-md bg-[#f0f0f0] px-3.5 py-2.5 text-sm leading-relaxed text-gray-900 shadow-sm dark:bg-white/[0.08] dark:text-gray-100">
                            {message.answer}
                            {helperActionLinks(message).length > 0 && (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                {helperActionLinks(message).map(link => (
                                  <span key={`${link.label}-${link.url}`} className="inline-flex items-center gap-1.5">
                                    <a
                                      href={link.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-800 transition hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.08] dark:text-gray-100 dark:hover:bg-white/[0.12]"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                      {link.label}
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => copyHelperActionLink(link.url)}
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-800 dark:border-white/10 dark:bg-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.12]"
                                      aria-label={`Copy ${link.label} link`}
                                    >
                                      <Copy className="h-3.5 w-3.5" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {message.paylink && <HelperPaylinkCard request={message.paylink} />}
                      </div>
                    )}
                  </div>
                ))}

                {asking && <HelperThinkingIndicator statusText={agentStatus} state={thinkingState} />}
                {helperToast && (
                  <p className="w-fit rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 shadow-sm dark:border-white/10 dark:bg-white/[0.08] dark:text-gray-200">{helperToast}</p>
                )}
                {askError && (
                  <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">{askError}</p>
                )}
              </div>

              <div className="border-t border-gray-100 p-3 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <input
                    data-agent-hash-input="true"
                    value={question}
                    onChange={event => setQuestion(event.target.value)}
                    onKeyDown={event => event.key === 'Enter' && !event.shiftKey && !asking && askHelper()}
                    placeholder={helperMode === 'polydesk' && !polyDeskSubMode ? 'Choose a Desk Agent lane' : helperMode ? inputPlaceholder ?? 'Ask Hash...' : 'Choose a mode to start'}
                    disabled={!helperMode || (helperMode === 'polydesk' && !polyDeskSubMode)}
                    className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-gray-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.05] dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={asking ? stopHelperResponse : askHelper}
                    disabled={!asking && (!question.trim() || !helperMode || (helperMode === 'polydesk' && !polyDeskSubMode))}
                    aria-label={asking ? 'Stop response' : 'Send message'}
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all active:scale-95 disabled:opacity-40',
                      asking
                        ? 'border border-gray-200 bg-white text-gray-900 shadow-sm hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.08] dark:text-white dark:hover:bg-white/[0.12]'
                        : 'bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-gray-950',
                    )}
                  >
                    {asking ? <span className="h-3.5 w-3.5 rounded-[4px] bg-current" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
              </div>
        </div>
      </div>
    </div>
  )
}

const helperThinkingCopy: Record<HelperThinkingState, string[]> = {
  light: ['Reading this...', 'Checking context...', 'Preparing reply...', 'Polishing wording...'],
  'payment-draft': ['Matching details...', 'Holding the draft...', 'Preparing reply...', 'Polishing wording...'],
  'payment-wallet': ['Checking wallet...', 'Validating flow...', 'Matching details...', 'Preparing reply...'],
  'paylink-build': ['Building PayLink...', 'Validating flow...', 'Polishing wording...', 'Almost ready...'],
  'deep-research': ['Reading this...', 'Checking context...', 'Preparing reply...', 'Almost ready...'],
  proof: ['Polishing wording...', 'Validating flow...', 'Almost ready...'],
}

const helperSlowThinkingCopy = ['Putting things in order...', 'Almost ready...', 'Please be patient...']

function helperSlowThinkingDelays(state: HelperThinkingState) {
  if (state === 'deep-research') return [10000, 18000, 26000]
  if (state === 'paylink-build') return [5000, 8500, 12500]
  return [6500, 10500, 15000]
}

function HelperThinkingIndicator({ statusText, state }: { statusText: string; state: HelperThinkingState }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [slowPhase, setSlowPhase] = useState(-1)
  const steps = useMemo(() => helperThinkingCopy[state] ?? helperThinkingCopy.light, [state])

  useEffect(() => {
    setSlowPhase(-1)
    setStepIndex(Math.floor(Math.random() * steps.length))
    const slowTimers = helperSlowThinkingDelays(state).map((delay, index) => (
      window.setTimeout(() => setSlowPhase(index), delay)
    ))
    const timer = window.setInterval(() => {
      setStepIndex(index => (index + 1) % steps.length)
    }, 900)
    return () => {
      slowTimers.forEach(window.clearTimeout)
      window.clearInterval(timer)
    }
  }, [statusText, state, steps.length])

  return (
    <div className="max-w-[82%]">
      <div className="inline-flex items-center rounded-[18px] rounded-bl-md bg-[#f0f0f0] px-3.5 py-2.5 shadow-sm dark:bg-white/[0.08]">
        <span className="inline-flex items-center gap-1">
          {[0, 1, 2].map(index => (
            <span
              key={index}
              className="h-2 w-2 animate-bounce rounded-full bg-[#8e8e93] dark:bg-gray-300"
              style={{ animationDelay: `${index * 120}ms` }}
            />
          ))}
        </span>
      </div>
      <p className="ml-3 mt-1 text-xs italic text-[#8e8e93] dark:text-gray-400">
        {slowPhase >= 0 ? helperSlowThinkingCopy[slowPhase] : steps[stepIndex]}
      </p>
    </div>
  )
}

function HelperPaylinkCard({ request }: { request: SavedRequest }) {
  const [shareOpen, setShareOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const network = request.network ?? inferRequestNetwork(request)
  const isPolymarketFunding = request.kind === 'polymarket-funding'
  const url = request.payUrl || buildRequestPayLink(request)
  const shareUrl = url.startsWith('http') ? url : `${PUBLIC_PAYLINK_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`
  const dashboardUrl = request.mode === 'group' ? request.dashboardUrl || buildRequestDashboardLink(request) : ''
  const amountLine = request.amount ? `${request.amount} USDC` : 'Flexible amount'
  const target = friendlyName(request.target)
  const recipient = request.wallet || request.evmWallet || request.solanaWallet
  const shareText = [
    isPolymarketFunding ? 'Polymarket funding checkout' : request.mode === 'group' ? 'Hash PayLink collection' : 'Hash PayLink payment request',
    `${request.label} - ${amountLine}`,
    isPolymarketFunding ? `Profile: ${request.polymarketWallet ? shortAddress(request.polymarketWallet) : target}` : request.mode === 'group' ? `Collection: ${target}` : `Payer: ${target}`,
    isPolymarketFunding
      ? 'Open the checkout to fund the saved Polymarket profile through the bridge.'
      : request.mode === 'group'
      ? 'Open the link, enter your name, and contribute securely.'
      : 'Please share the receipt after payment is confirmed.',
  ].join('\n')

  async function shareLink() {
    const title = isPolymarketFunding ? 'Polymarket funding checkout' : request.mode === 'group' ? 'Hash PayLink collection' : 'Hash PayLink payment request'
    const richPayload = { title, text: shareText, url: shareUrl }
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(richPayload)
        return
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        try {
          await navigator.share({ title, url: shareUrl })
          return
        } catch {
          setShareOpen(true)
          return
        }
      }
    }
    setShareOpen(true)
  }

  async function copyShareLink() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="mt-2 w-full max-w-[82%] rounded-[18px] rounded-bl-md border border-emerald-100 bg-emerald-50/70 p-2.5 dark:border-emerald-300/20 dark:bg-emerald-300/10">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-200" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-100">
            {isPolymarketFunding ? 'Polymarket funding ready' : request.mode === 'group' ? 'Collection ready' : 'Payment request ready'}
          </p>
          <p className="truncate text-[11px] text-emerald-700/80 dark:text-emerald-100/75">
            {amountLine} on {requestNetworkLabels[network]}
          </p>
        </div>
      </div>
      <div className="mt-2 grid gap-1 rounded-xl bg-white/80 p-2 text-xs dark:bg-white/[0.06]">
        {[
          ['Amount', amountLine],
          ['Network', requestNetworkLabels[network]],
          ['Purpose', request.label || 'Payment'],
          [isPolymarketFunding ? 'Bridge' : 'Recipient', recipient ? shortAddress(recipient) : 'Not set'],
          [isPolymarketFunding ? 'Profile' : request.mode === 'group' ? 'Collection' : 'Payer', isPolymarketFunding && request.polymarketWallet ? shortAddress(request.polymarketWallet) : target || 'Not set'],
        ].map(([label, value]) => (
          <div key={label} className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2">
            <span className="text-[10px] font-semibold uppercase text-gray-400">{label}</span>
            <span className="min-w-0 truncate font-medium text-gray-800 dark:text-gray-100" title={value}>{value}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={shareLink}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gray-950 px-2.5 py-2 text-xs font-semibold text-white dark:bg-white dark:text-gray-950"
        >
          <Share2 className="h-3.5 w-3.5" />
          Share
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-2.5 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-300/20 dark:bg-white/[0.06] dark:text-emerald-100"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {isPolymarketFunding ? 'Proceed' : request.mode === 'group' ? 'Contribute' : 'Open'}
        </a>
      </div>
      {dashboardUrl && (
        <a
          href={dashboardUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-2.5 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-300/20 dark:bg-white/[0.06] dark:text-emerald-100"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Track payments
        </a>
      )}
      <p className="mt-2 text-[11px] font-medium text-emerald-700/80 dark:text-emerald-100/80">
        {request.mode === 'group'
          ? 'Each payer enters their name before paying; the dashboard tracks every contribution.'
          : 'Ask for the receipt after payment.'}
      </p>
      <PayLinkShareSheet
        open={shareOpen}
        url={shareUrl}
        copied={copied}
        shareText={shareText}
        title={isPolymarketFunding ? 'Share funding link' : request.mode === 'group' ? 'Share collection link' : 'Share payment link'}
        subtitle="Send it through your preferred app."
        emailSubject={isPolymarketFunding ? 'Polymarket funding checkout' : request.mode === 'group' ? 'Hash PayLink collection' : 'Hash PayLink payment request'}
        onCopy={copyShareLink}
        onClose={() => setShareOpen(false)}
      />
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

      <AgentWorkspace embedded forceProfile />
    </div>
  )
}

type LpScoutPath = '' | 'access' | 'daily'
type LpScoutStep = 'service' | 'agent'

function PolyDeskBackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex w-fit items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
    >
      <span className="back-btn" aria-hidden="true">
        <span className="arrow-container">
          <span className="chevron c1" />
          <span className="chevron c2" />
          <span className="chevron c3" />
        </span>
      </span>
      Back
    </button>
  )
}

function PolyDeskMenuCard({ title, body, onClick }: { title: string; body: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-200 hover:shadow-md active:scale-[0.99] dark:border-white/10 dark:bg-[#111216] dark:hover:border-white/20"
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-black text-gray-950 dark:text-white">{title}</span>
        <span className="mt-1 block text-[12px] leading-5 text-gray-500 dark:text-gray-400">{body}</span>
      </span>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-950 text-white transition-transform group-hover:translate-x-0.5 dark:bg-white dark:text-gray-950">
        <ChevronDown className="-rotate-90 h-4 w-4" />
      </span>
    </button>
  )
}

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

export function LpScoutPanel({
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
        <PolyDeskBackButton onClick={onBack} />
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
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

        <div className="space-y-2">
          <PolyDeskMenuCard
            title="Tip for LP Scout access"
            body="Pick a Polymarket scout category, then use your x402 Wallet Manager to pay Hash PayLink through Circle Gateway."
            onClick={startAccessFlow}
          />
          <PolyDeskMenuCard
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
      <PolyDeskBackButton onClick={backFromPath} />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
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

export function PolyWorldCupNewsPanel({
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
      <PolyDeskBackButton onClick={onBack} />
      <div className="flex flex-col items-start justify-between gap-2.5 sm:flex-row">
        <div className="min-w-0">
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
  polymarketTradeOptions?: PolyStreamTradeOption[]
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

type PolyStreamTradeOption = {
  label: string
  outcome: 'home' | 'draw' | 'away'
  tokenId: string
  price?: string
  conditionId?: string
  tickSize?: number
  minSize?: number
  negRisk?: boolean
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

function polymarketTickSize(value?: number): '0.1' | '0.01' | '0.005' | '0.0025' | '0.001' | '0.0001' | '' {
  const text = String(value ?? '')
  return text === '0.1' || text === '0.01' || text === '0.005' || text === '0.0025' || text === '0.001' || text === '0.0001' ? text : ''
}

function polymarketRestrictionNotice(country?: string, region?: string) {
  const location = country ? ` from ${[country, region].filter(Boolean).join('-')}` : ' from your current region or network'
  return `Polymarket trading is not available${location}. PolyDesk can still show live scores, market context, portfolio state, funding requests, and LP Scout, but order placement is only available from Polymarket-supported regions.`
}

async function checkPolymarketTradingRestriction() {
  try {
    const response = await fetch('https://polymarket.com/api/geoblock', { cache: 'no-store' })
    const data = await response.json().catch(() => null) as { blocked?: boolean; country?: string; region?: string } | null
    if (response.ok && data?.blocked) return polymarketRestrictionNotice(data.country, data.region)
  } catch {
    // If the availability probe cannot be reached, continue and let CLOB return
    // the authoritative execution error.
  }
  return ''
}

function friendlyTradeError(err: unknown) {
  const rawMessage = err instanceof Error
    ? err.message
    : typeof err === 'object' && err
      ? JSON.stringify(err)
      : String(err ?? '')
  const cleanMessage = rawMessage.replace(/\s+/g, ' ').trim()
  const message = cleanMessage.toLowerCase()
  if (!cleanMessage) return 'We could not complete the order. Please try again.'
  if (/\b(trading restricted|restricted in your region|geoblock|geo-block|available regions)\b/.test(message)) {
    return polymarketRestrictionNotice()
  }
  if (/^(signed order|polydesk|polymarket|user polymarket|world cup|this polymarket|unsupported|buying is temporarily|this market is not ready)/i.test(cleanMessage)) {
    return cleanMessage
  }
  if (/\b(reject|rejected|denied|cancel|cancelled|user rejected)\b/.test(message)) {
    return 'Order approval was cancelled.'
  }
  if (/\b(insufficient|not enough|balance|funds|allowance|collateral)\b/.test(message)) {
    return 'Not enough balance or allowance for this order. Refresh the wallet and try again.'
  }
  if (/\b(network|timeout|fetch|failed to fetch|503|502|504|unavailable)\b/.test(message)) {
    return 'Connection issue while sending the order. Please try again.'
  }
  if (/\b(price|fillable|liquidity|minimum|min size|too small|market)\b/.test(message)) {
    return 'This market moved before the order finished. Refresh and try again.'
  }
  return cleanMessage
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
  onSubmitTrade,
  tradeAmount,
  onTradeAmountChange,
  tradeBusyKey,
  tradeNotice,
  tradeSuccess,
  signingWalletAddress,
}: {
  matches: PolyStreamMatch[]
  loading: boolean
  providerReady: boolean
  error: string
  onRetry: () => void
  onSubmitTrade: (match: PolyStreamMatch, option: PolyStreamTradeOption) => void
  tradeAmount: string
  onTradeAmountChange: (value: string) => void
  tradeBusyKey: string
  tradeNotice: string
  tradeSuccess: { matchKey: string; label: string; amount: string } | null
  signingWalletAddress: string
}) {
  const [selectedMatchKey, setSelectedMatchKey] = useState('')
  const [detailIndex, setDetailIndex] = useState(0)
  const [detailPageIndex, setDetailPageIndex] = useState(0)
  const [tradeMenuOpen, setTradeMenuOpen] = useState(false)
  const [selectedTradeOption, setSelectedTradeOption] = useState<PolyStreamTradeOption | null>(null)
  const [, setCountdownTick] = useState(0)
  const featured = matches.find(match => matchKey(match) === selectedMatchKey) || matches[0]
  const rest = featured ? matches.filter(match => matchKey(match) !== matchKey(featured)) : []
  const [home, away] = featured ? splitFixtureTitle(featured.title) : ['World Cup', 'Scores']
  const featuredState = featured ? matchDisplayState(featured) : null
  const homeFlag = flagUrlForTeam(home)
  const awayFlag = flagUrlForTeam(away)
  const featuredDetails = useMemo(() => featured ? detailItems(featured) : [], [featured])
  const featuredMarketMatched = featured?.marketStatus === 'matched' && Boolean(featured.polymarketUrl)
  const featuredTradeOptions = featured?.polymarketTradeOptions ?? []
  const featuredCanPrepareTrade = featuredMarketMatched && featuredTradeOptions.length > 0
  const featuredTradeSuccess = featured && tradeSuccess?.matchKey === matchKey(featured) ? tradeSuccess : null
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
    setTradeMenuOpen(false)
    setSelectedTradeOption(null)
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
            {featuredCanPrepareTrade ? (
              <button
                type="button"
                onClick={() => setTradeMenuOpen(open => !open)}
                className="inline-flex items-center justify-center gap-1 rounded-full border border-white/15 bg-black/35 px-2 py-1 text-[10px] font-black leading-none text-white shadow-sm backdrop-blur-sm transition-all hover:bg-black/50 active:scale-[0.98]"
              >
                <img src={POLYMARKET_LOGO} alt="" className="h-3 w-3 invert-0" />
                Trade
              </button>
            ) : featuredMarketMatched ? (
              <a
                href={featured.polymarketUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1 rounded-full border border-white/15 bg-black/35 px-2 py-1 text-[10px] font-black leading-none text-white shadow-sm backdrop-blur-sm transition-all hover:bg-black/50 active:scale-[0.98]"
              >
                <img src={POLYMARKET_LOGO} alt="" className="h-3 w-3 invert-0" />
                Market
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
          {featured && tradeMenuOpen && featuredCanPrepareTrade && (
            <div className="relative z-10 mt-1.5 rounded-lg border border-white/10 bg-black/35 p-2 backdrop-blur-sm">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="truncate text-[10px] font-semibold text-white/55">
                  {signingWalletAddress ? `Wallet ${shortHex(signingWalletAddress)}` : 'Connect a wallet to trade'}
                </p>
                {signingWalletAddress ? (
                  <PrivyDisconnectButton
                    title="Sign out wallet"
                    className="inline-flex items-center justify-center gap-1 rounded-md border border-white/10 bg-white/10 px-2 py-1 text-[10px] font-bold text-white/75 transition hover:bg-white/15 hover:text-white"
                  >
                    <LogOut className="h-3 w-3" />
                    Sign out
                  </PrivyDisconnectButton>
                ) : (
                  <PrivyConnectButton
                    debugLabel="polydesk-trade-login"
                    logoutOnAuthenticated={false}
                    className="inline-flex items-center justify-center gap-1 rounded-md border border-white/10 bg-white px-2 py-1 text-[10px] font-black text-gray-950 transition hover:bg-gray-100"
                  >
                    <Wallet className="h-3 w-3" />
                    Sign in
                  </PrivyConnectButton>
                )}
              </div>
              <input
                value={tradeAmount}
                onChange={event => onTradeAmountChange(event.target.value)}
                placeholder={`Amount, min ${featuredTradeOptions[0]?.minSize ?? 5} USDC`}
                inputMode="decimal"
                className="h-8 w-full rounded-md border border-white/10 bg-white/10 px-2 text-xs font-semibold text-white placeholder:text-white/45 outline-none focus:border-white/30"
              />
              <div className="mt-1.5 grid grid-cols-3 gap-1">
                {featuredTradeOptions.map(option => {
                  const busy = tradeBusyKey === `${matchKey(featured)}:${option.outcome}`
                  const selected = selectedTradeOption?.tokenId === option.tokenId
                  return (
                    <button
                      key={`${option.outcome}-${option.tokenId}`}
                      type="button"
                      onClick={() => {
                        setSelectedTradeOption(option)
                      }}
                      disabled={Boolean(tradeBusyKey)}
                      className={cn(
                        'inline-flex min-h-8 items-center justify-center gap-1 rounded-md px-1.5 text-[10px] font-black transition disabled:cursor-wait disabled:opacity-60',
                        selected ? 'bg-emerald-300 text-emerald-950' : 'bg-white text-gray-950 hover:bg-gray-100',
                      )}
                    >
                      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      <span className="truncate">{option.label}</span>
                      {option.price && <span className={cn('shrink-0', selected ? 'text-emerald-800' : 'text-gray-500')}>{option.price}</span>}
                    </button>
                  )
                })}
              </div>
              {featuredTradeSuccess ? (
                <div className="relative mt-1.5 overflow-hidden rounded-lg border border-emerald-200/30 bg-emerald-300/15 p-2.5 shadow-sm">
                  <div className="pointer-events-none absolute inset-0 overflow-hidden">
                    {['$', '$', '$', '$', '$', '$'].map((symbol, index) => (
                      <span
                        key={`${symbol}-${index}`}
                        className="absolute top-[-10px] text-[11px] font-black text-emerald-200/80 [animation:hpDollarFall_1.8s_ease-in-out_infinite]"
                        style={{ left: `${12 + index * 14}%`, animationDelay: `${index * 0.16}s` }}
                      >
                        {symbol}
                      </span>
                    ))}
                  </div>
                  <div className="relative flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100/70">Bought</p>
                      <p className="mt-1 truncate text-sm font-black text-white">
                        {featuredTradeSuccess.label}
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold leading-snug text-emerald-50/75">
                        Your {featuredTradeSuccess.amount} USDC order was sent. You can follow it from your wallet or Polymarket account.
                      </p>
                    </div>
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-200" />
                  </div>
                </div>
              ) : selectedTradeOption && (
                <div className="mt-1.5 rounded-md border border-emerald-300/25 bg-emerald-300/10 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[10px] font-black text-emerald-50">
                        Buy {selectedTradeOption.label}{selectedTradeOption.price ? ` near ${selectedTradeOption.price}` : ''}
                      </p>
                      <p className="mt-0.5 text-[9px] font-semibold text-emerald-100/65">
                        Confirm in your wallet. Signing is free and does not move funds by itself.
                      </p>
                      <p className="mt-0.5 text-[9px] font-semibold text-emerald-100/65">
                        After approval, PolyDesk sends your order securely.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSubmitTrade(featured, selectedTradeOption)}
                      disabled={Boolean(tradeBusyKey)}
                      className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1 rounded-md bg-emerald-300 px-2 text-[10px] font-black text-emerald-950 transition hover:bg-emerald-200 disabled:cursor-wait disabled:opacity-60"
                    >
                      {tradeBusyKey ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      Continue
                    </button>
                  </div>
                </div>
              )}
              {tradeNotice && <p className="mt-1.5 text-[10px] font-semibold leading-snug text-white/70">{tradeNotice}</p>}
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

export function PolyStreamPanel({
  onBack,
  onOpenNews,
}: {
  onBack: () => void
  onOpenNews: () => void
}) {
  const { authenticated, getAccessToken } = usePrivy()
  const { wallets: privyWallets } = useWallets()
  const [feed, setFeed] = useState<PolyStreamFeed | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tradeAmount, setTradeAmount] = useState('')
  const [tradeBusyKey, setTradeBusyKey] = useState('')
  const [tradeNotice, setTradeNotice] = useState('')
  const [tradeSuccess, setTradeSuccess] = useState<{ matchKey: string; label: string; amount: string } | null>(null)
  const [profile, setProfile] = useState<PolymarketProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const mountedRef = useRef(true)
  const matches = feed?.matches ?? []
  const signingWalletAddress = privyWallets.find(wallet => /^0x[a-fA-F0-9]{40}$/.test(wallet.address ?? ''))?.address ?? ''
  const savedTradingAddress = profile?.tradingAddress || ''
  const polymarketDepositWallet = profile?.depositWalletAddress || ''
  const polymarketWalletReady = Boolean(polymarketDepositWallet && String(profile?.depositWalletStatus || '').toLowerCase() === 'ready')
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

  const loadTradingProfile = useCallback(async () => {
    if (!authenticated) {
      setProfile(null)
      return
    }
    setProfileLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        setProfile(null)
        return
      }
      const response = await fetch('/api/polymarket-portfolio?action=profile', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await readPolyDeskJson<{ ok?: boolean; profile?: PolymarketProfile | null; error?: string }>(response, 'Could not load PolyDesk trading profile.')
      if (!response.ok || !data.ok) throw new Error(data.error || 'Could not load PolyDesk trading profile.')
      if (mountedRef.current) setProfile(data.profile ?? null)
    } catch {
      if (mountedRef.current) setProfile(null)
    } finally {
      if (mountedRef.current) setProfileLoading(false)
    }
  }, [authenticated, getAccessToken])

  const signWorldCupTrade = useCallback(async (match: PolyStreamMatch, option: PolyStreamTradeOption) => {
    setTradeNotice('')
    setTradeSuccess(null)
    if (!authenticated) {
      setTradeNotice('Sign in with Privy, then open Main Wallet to activate your Polymarket wallet.')
      return
    }
    if (profileLoading) {
      setTradeNotice('Loading your PolyDesk trading wallet. Try again in a moment.')
      return
    }
    if (!savedTradingAddress || !polymarketDepositWallet || !polymarketWalletReady) {
      setTradeNotice('Open Portfolio > Main Wallet and activate your Polymarket wallet before trading.')
      return
    }
    const signingWallet = privyWallets.find(wallet => wallet.address?.toLowerCase() === savedTradingAddress.toLowerCase())
    if (!signingWallet || typeof signingWallet.getEthereumProvider !== 'function') {
      setTradeNotice('Your connected Privy wallet does not match the saved Main Wallet. Open Portfolio > Main Wallet and choose Change or Use connected wallet.')
      return
    }
    const amount = tradeAmount.trim()
    if (!/^\d+(?:\.\d{1,6})?$/.test(amount) || Number(amount) <= 0) {
      setTradeNotice('Enter how much USDC you want to use.')
      return
    }
    if (typeof option.minSize === 'number' && Number(amount) < option.minSize) {
      setTradeNotice(`Minimum order for this market is ${option.minSize} USDC.`)
      return
    }
    const tickSize = polymarketTickSize(option.tickSize)
    if (!tickSize) {
      setTradeNotice('This market is not ready for in-app buying yet.')
      return
    }
    setTradeNotice('Checking Polymarket availability...')
    const restrictionNotice = await checkPolymarketTradingRestriction()
    if (restrictionNotice) {
      setTradeNotice(restrictionNotice)
      return
    }
    const busyKey = `${matchKey(match)}:${option.outcome}`
    setTradeBusyKey(busyKey)
    try {
      const response = await fetch('/api/polymarket-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketTitle: match.polymarketTitle || match.title,
          marketUrl: match.polymarketUrl,
          tokenId: option.tokenId,
          outcome: option.label,
          action: 'prepare',
          side: 'buy',
          amount,
          signer: signingWalletAddress,
          tickSize: option.tickSize,
          minSize: option.minSize,
          negRisk: option.negRisk,
          worldCup: true,
        }),
      })
      const data = await response.json() as { ok?: boolean; error?: string; builderCode?: string; builderCodeConfigured?: boolean; builderCodePreview?: string; builderCredentialMode?: string }
      if (!response.ok || !data.ok) {
        setTradeNotice('This market is not ready for in-app buying yet. Try again shortly.')
        return
      }
      if (!data.builderCode || !/^0x[a-fA-F0-9]{64}$/.test(data.builderCode)) {
        setTradeNotice('Buying is temporarily unavailable. Try again shortly.')
        return
      }
      if (typeof signingWallet.switchChain === 'function') {
        await signingWallet.switchChain(137)
      }
      const provider = await signingWallet.getEthereumProvider()
      const [{ ClobClient, Side, OrderType, SignatureTypeV2, createL2Headers, getContractConfig, orderToJsonV2 }, { createWalletClient, custom, encodeAbiParameters, keccak256, toHex }, { polygon }] = await Promise.all([
        import('@polymarket/clob-client-v2'),
        import('viem'),
        import('viem/chains'),
      ])
      const walletClient = createWalletClient({
        account: savedTradingAddress as `0x${string}`,
        chain: polygon,
        transport: custom(provider),
      })
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in required.')
      const walletCheck = await fetch('/api/polymarket-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'verify-deposit-wallet',
          ownerAddress: savedTradingAddress,
          depositWalletAddress: polymarketDepositWallet,
        }),
      })
      const walletCheckData = await readPolyDeskJson<{ ok?: boolean; error?: string; profile?: PolymarketProfile | null }>(walletCheck, 'Could not verify Polymarket wallet ownership.')
      if (!walletCheck.ok || !walletCheckData.ok) {
        if (walletCheckData.profile) setProfile(walletCheckData.profile)
        throw new Error(walletCheckData.error || 'Connected owner wallet does not control this Polymarket wallet.')
      }
      const signatureType = SignatureTypeV2.POLY_1271
      const signingClient = new ClobClient({
        host: 'https://clob.polymarket.com',
        chain: 137,
        signer: walletClient,
        signatureType,
        funderAddress: polymarketDepositWallet,
      })
      setTradeNotice('Checking live Polymarket market settings...')
      const [rawLiveTickSize, rawLiveNegRisk] = await Promise.all([
        signingClient.getTickSize(option.tokenId).catch(() => option.tickSize),
        signingClient.getNegRisk(option.tokenId).catch(() => option.negRisk === true),
      ])
      const liveTickText = String(rawLiveTickSize ?? '')
      const liveTickSize = polymarketTickSize(Number(liveTickText)) || (
        liveTickText === '0.1' || liveTickText === '0.01' || liveTickText === '0.005' || liveTickText === '0.0025' || liveTickText === '0.001' || liveTickText === '0.0001'
          ? liveTickText
          : tickSize
      )
      const liveNegRisk = rawLiveNegRisk === true || String(rawLiveNegRisk).toLowerCase() === 'true'
      const contractConfig = getContractConfig(137)
      const exchangeAddress = liveNegRisk ? contractConfig.negRiskExchangeV2 : contractConfig.exchangeV2
      setTradeNotice('Confirm the order in your wallet. Signing is free.')
      const signedOrder = await signingClient.createMarketOrder(
        {
          tokenID: option.tokenId,
          amount: Number(amount),
          price: Number(option.price ? Number.parseFloat(option.price) / 100 : 1),
          side: Side.BUY,
          orderType: OrderType.FOK,
          builderCode: data.builderCode,
        },
        { tickSize: liveTickSize, negRisk: liveNegRisk, version: 2 },
      )
      signedOrder.signature = await signPolymarketDepositWalletOrder({
        walletClient,
        order: signedOrder,
        chainId: 137,
        depositWalletAddress: polymarketDepositWallet,
        exchangeAddress,
        encodeAbiParameters,
        keccak256,
        toHex,
      })
      setTradeNotice('Approved. Sending your order...')
      const userCreds = await signingClient.createOrDeriveApiKey()
      const orderPayload = orderToJsonV2(signedOrder, userCreds.key, OrderType.FOK, false, false)
      const handoffResponse = await fetch('/api/polymarket-builder-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'world-cup-moneyline',
          marketTitle: match.polymarketTitle || match.title,
          marketUrl: match.polymarketUrl,
          outcome: option.label,
          tokenId: option.tokenId,
          signer: polymarketDepositWallet,
          orderType: OrderType.FOK,
          order: signedOrder,
          orderPayload,
        }),
      })
      const handoff = await handoffResponse.json() as Record<string, unknown> & {
        ok?: boolean
        error?: string
        builderCredentialMode?: string
        remoteBuilderSigner?: { url?: string; token?: string }
        handoff?: { orderPayload?: typeof orderPayload }
      }
      if (!handoffResponse.ok || !handoff.ok) {
        setTradeNotice(handoff.error || `PolyDesk handoff failed without a server reason. HTTP ${handoffResponse.status}.`)
        return
      }
      setTradeNotice('Sending your order...')
      const finalOrderPayload = handoff.handoff?.orderPayload ?? orderPayload
      const orderBody = JSON.stringify(finalOrderPayload)
      const l2Headers = await createL2Headers(walletClient, userCreds, {
        method: 'POST',
        requestPath: '/order',
        body: orderBody,
      })
      setTradeNotice('Sending your order from this browser...')
      await submitPolymarketOrderFromBrowser({
        orderBody,
        userHeaders: l2Headers,
        remoteBuilderSigner: handoff.remoteBuilderSigner,
        fallbackMessage: 'Polymarket rejected the submitted order.',
      })
      setTradeSuccess({ matchKey: matchKey(match), label: option.label, amount })
      setTradeNotice('')
    } catch (err) {
      setTradeNotice(friendlyTradeError(err))
    } finally {
      setTradeBusyKey('')
    }
  }, [authenticated, getAccessToken, profileLoading, privyWallets, savedTradingAddress, polymarketDepositWallet, polymarketWalletReady, tradeAmount])

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

  useEffect(() => {
    void loadTradingProfile()
  }, [loadTradingProfile])

  return (
    <div className="mt-4 space-y-3">
      <PolyDeskBackButton onClick={onBack} />
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
        <div className="min-w-0">
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
          onSubmitTrade={(match, option) => void signWorldCupTrade(match, option)}
          tradeAmount={tradeAmount}
          onTradeAmountChange={setTradeAmount}
          tradeBusyKey={tradeBusyKey}
          tradeNotice={tradeNotice}
          tradeSuccess={tradeSuccess}
          signingWalletAddress={savedTradingAddress || signingWalletAddress}
        />
        <p className="px-1 pb-1 text-[10px] font-medium leading-relaxed text-gray-400 dark:text-gray-500">
          Live markets move fast. Confirm the latest score and odds on Polymarket before trading.
        </p>
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
  returnToStandalonePortfolio,
  returnToAgentHash,
  returnToTradingWallet,
  requestId,
  helperOwner,
}: {
  wallet: string
  amount: string
  funding?: string
  network: RequestNetwork
  polymarketWallet: string
  returnToPortfolio?: boolean
  returnToStandalonePortfolio?: boolean
  returnToAgentHash?: boolean
  returnToTradingWallet?: boolean
  requestId?: string
  helperOwner?: string
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
  if (requestId) params.set('pmr', requestId)
  if (returnToAgentHash) params.set('return', 'agent-hash-polydesk-portfolio')
  if (returnToStandalonePortfolio) params.set('return', 'polydesk-portfolio')
  if (returnToPortfolio) params.set('return', 'poly-portfolio')
  if (returnToTradingWallet) {
    params.set('portfolio', 'trading')
    params.set('wallet', 'balance')
  }
  if (helperOwner) params.set('helperOwner', helperOwner)
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
    params.set('id', request.eventId || request.id || request.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'telegram-request')
  }

  return `${shareOrigin()}/pay?${params.toString()}`
}

function buildRequestDashboardLink(request: SavedRequest) {
  const params = new URLSearchParams()
  const wallet = request.wallet.trim()
  const amount = request.amount.trim()
  const network = request.network ?? inferRequestNetwork(request)
  params.set('id', request.eventId || request.id || request.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'telegram-request')
  if (amount) params.set('a', amount)
  else params.set('f', '1')
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
  return `${shareOrigin()}/event?${params.toString()}`
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
    params.set('id', request.eventId || request.id || request.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'telegram-request')
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
  const amountLine = request.amount ? `${request.amount} USDC` : 'a flexible USDC amount'
  const targetLine = request.mode === 'group' ? `Group: ${request.target}` : `Payer: ${request.target}`
  const text = [
    request.mode === 'group' ? 'Hash PayLink collection' : 'Hash PayLink payment request',
    '',
    request.mode === 'group'
      ? `${request.label} is collecting ${amountLine}.`
      : `${request.label} requested ${amountLine}.`,
    targetLine,
    '',
    request.mode === 'group' ? 'Tap to contribute securely:' : 'Tap to pay securely:',
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
  watchedAddress?: string | null
  tradingAddress?: string | null
  depositWalletAddress?: string | null
  depositWalletStatus?: string | null
  depositWalletTxId?: string | null
  depositWalletTxHash?: string | null
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
  tokenId?: string
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
  startDate?: string
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

function normalizeTradeOutcome(value: unknown): 'Yes' | 'No' {
  const text = String(value ?? '').trim().toLowerCase()
  if (text === 'no' || text === 'false' || text === '0') return 'No'
  return 'Yes'
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

function positionValueSum(positions: PolymarketPosition[]) {
  return positions.reduce((sum, position) => {
    const value = numberOrNull(position.currentValue)
    return value === null ? sum : sum + value
  }, 0)
}

function polymarketPositionTokenId(position: PolymarketPosition) {
  const tokenId = String(position.tokenId ?? position.asset ?? '').trim()
  return /^\d+$/.test(tokenId) ? tokenId : ''
}

type PolymarketPositionStatus = 'not-started' | 'live' | 'ended'

function polymarketPositionStatus(position: PolymarketPosition): PolymarketPositionStatus {
  if (isClaimablePosition(position)) return 'ended'
  if (position.closed === true || position.archived === true) return 'ended'
  const status = `${position.status ?? ''} ${position.marketStatus ?? ''}`.toLowerCase()
  if (/(resolved|closed|settled|final|ended|archived)/.test(status)) return 'ended'
  if (/(not started|upcoming|scheduled|pre.?market)/.test(status)) return 'not-started'
  if (position.startDate) {
    const startedAt = new Date(position.startDate).getTime()
    if (Number.isFinite(startedAt) && startedAt > Date.now()) return 'not-started'
  }
  if (position.endDate) {
    const endedAt = new Date(position.endDate).getTime()
    if (Number.isFinite(endedAt) && endedAt < Date.now()) return 'ended'
  }
  return 'live'
}

function shortHex(value: string) {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value
}

async function readPolyDeskJson<T>(res: Response, fallbackMessage: string): Promise<T> {
  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.toLowerCase().includes('application/json')) {
    return await res.json() as T
  }
  const text = await res.text().catch(() => '')
  if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
    throw new Error('PolyDesk portfolio service is not reachable from this page. Refresh and try again, or check the API deployment.')
  }
  throw new Error(fallbackMessage)
}

function polyDeskStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  const headers: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string' && key.trim()) headers[key] = raw
  }
  return headers
}

function polyDeskResponseError(value: unknown, fallbackMessage: string) {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const message = record.error ?? record.errorMsg ?? record.message
    if (typeof message === 'string' && message.trim()) return message.trim()
  }
  return fallbackMessage
}

async function loadPolymarketBuilderHeaders(remoteBuilderSigner: { url?: string; token?: string } | undefined, orderBody: string) {
  if (!remoteBuilderSigner?.url || !remoteBuilderSigner.token) return {}
  const response = await fetch(remoteBuilderSigner.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${remoteBuilderSigner.token}`,
    },
    body: JSON.stringify({
      method: 'POST',
      path: '/order',
      body: orderBody,
    }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(polyDeskResponseError(data, 'Could not prepare Polymarket builder headers.'))
  }
  return polyDeskStringRecord(data)
}

async function submitPolymarketOrderFromBrowser({
  orderBody,
  userHeaders,
  remoteBuilderSigner,
  fallbackMessage,
}: {
  orderBody: string
  userHeaders: Record<string, string>
  remoteBuilderSigner?: { url?: string; token?: string }
  fallbackMessage: string
}) {
  const builderHeaders = await loadPolymarketBuilderHeaders(remoteBuilderSigner, orderBody)
  const response = await fetch('https://clob.polymarket.com/order', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...polyDeskStringRecord(userHeaders),
      ...builderHeaders,
    },
    body: orderBody,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || (data && typeof data === 'object' && 'error' in data)) {
    throw new Error(polyDeskResponseError(data, fallbackMessage))
  }
  if (data && typeof data === 'object' && 'success' in data && data.success === false) {
    throw new Error(polyDeskResponseError(data, fallbackMessage))
  }
  return data
}

type DepositWalletOrderSignerArgs = {
  walletClient: {
    account?: { address?: string } | string
    signTypedData: (args: Record<string, unknown>) => Promise<string>
  }
  order: Record<string, unknown>
  chainId: number
  depositWalletAddress: string
  exchangeAddress: string
  encodeAbiParameters: (params: readonly { type: string }[], values: readonly unknown[]) => string
  keccak256: (value: string) => string
  toHex: (value: string) => string
}

async function signPolymarketDepositWalletOrder({
  walletClient,
  order,
  chainId,
  depositWalletAddress,
  exchangeAddress,
  encodeAbiParameters,
  keccak256,
  toHex,
}: DepositWalletOrderSignerArgs) {
  const ownerAddress = typeof walletClient.account === 'string' ? walletClient.account : walletClient.account?.address
  if (!ownerAddress) throw new Error('Connected wallet is missing an owner address.')
  const bytes32Zero = '0x0000000000000000000000000000000000000000000000000000000000000000'
  const exchangeDomainName = 'Polymarket CTF Exchange'
  const exchangeDomainVersion = '2'
  const orderTypeString = 'Order(uint256 salt,address maker,address signer,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,uint8 side,uint8 signatureType,uint256 timestamp,bytes32 metadata,bytes32 builder)'
  const orderStruct = [
    { name: 'salt', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'signer', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'makerAmount', type: 'uint256' },
    { name: 'takerAmount', type: 'uint256' },
    { name: 'side', type: 'uint8' },
    { name: 'signatureType', type: 'uint8' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'metadata', type: 'bytes32' },
    { name: 'builder', type: 'bytes32' },
  ] as const
  const typedOrder = {
    salt: String(order.salt),
    maker: String(order.maker),
    signer: String(order.signer),
    tokenId: String(order.tokenId),
    makerAmount: String(order.makerAmount),
    takerAmount: String(order.takerAmount),
    side: String(order.side).toUpperCase() === 'BUY' ? 0 : 1,
    signatureType: Number(order.signatureType),
    timestamp: String(order.timestamp),
    metadata: String(order.metadata || bytes32Zero),
    builder: String(order.builder || bytes32Zero),
  }
  const domainTypeHash = keccak256(toHex('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'))
  const appDomainSeparator = keccak256(encodeAbiParameters([
    { type: 'bytes32' },
    { type: 'bytes32' },
    { type: 'bytes32' },
    { type: 'uint256' },
    { type: 'address' },
  ], [
    domainTypeHash,
    keccak256(toHex(exchangeDomainName)),
    keccak256(toHex(exchangeDomainVersion)),
    BigInt(chainId),
    exchangeAddress,
  ]))
  const contentsHash = keccak256(encodeAbiParameters([
    { type: 'bytes32' },
    { type: 'uint256' },
    { type: 'address' },
    { type: 'address' },
    { type: 'uint256' },
    { type: 'uint256' },
    { type: 'uint256' },
    { type: 'uint8' },
    { type: 'uint8' },
    { type: 'uint256' },
    { type: 'bytes32' },
    { type: 'bytes32' },
  ], [
    keccak256(toHex(orderTypeString)),
    BigInt(typedOrder.salt),
    typedOrder.maker,
    typedOrder.signer,
    BigInt(typedOrder.tokenId),
    BigInt(typedOrder.makerAmount),
    BigInt(typedOrder.takerAmount),
    typedOrder.side,
    typedOrder.signatureType,
    BigInt(typedOrder.timestamp),
    typedOrder.metadata,
    typedOrder.builder,
  ]))
  const innerSignature = await walletClient.signTypedData({
    account: ownerAddress,
    domain: {
      name: exchangeDomainName,
      version: exchangeDomainVersion,
      chainId,
      verifyingContract: exchangeAddress,
    },
    types: {
      TypedDataSign: [
        { name: 'contents', type: 'Order' },
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
        { name: 'salt', type: 'bytes32' },
      ],
      Order: orderStruct,
    },
    primaryType: 'TypedDataSign',
    message: {
      contents: typedOrder,
      name: 'DepositWallet',
      version: '1',
      chainId,
      verifyingContract: depositWalletAddress,
      salt: bytes32Zero,
    },
  })
  const lenHex = orderTypeString.length.toString(16).padStart(4, '0')
  return `0x${innerSignature.slice(2)}${appDomainSeparator.slice(2)}${contentsHash.slice(2)}${toHex(orderTypeString).slice(2)}${lenHex}`
}

export function PolyPortfolioPanel({
  onBack,
  onOpenLpScout,
  onOpenWorldCup,
  telegramOwner,
  telegramId,
  surface = 'telegram',
  initialPortfolioAction = null,
  initialTradingWalletTab,
}: {
  onBack: () => void
  onOpenLpScout: () => void
  onOpenWorldCup: () => void
  telegramOwner?: string
  telegramId?: string
  surface?: 'telegram' | 'standalone'
  initialPortfolioAction?: 'watch' | 'trading' | 'external' | null
  initialTradingWalletTab?: 'balance' | 'fund' | 'withdraw' | 'positions'
}) {
  const { ready: privyReady, authenticated, login, getAccessToken } = usePrivy()
  const { wallets: privyWallets } = useWallets()

  const [privyWaitExpired, setPrivyWaitExpired] = useState(false)
  const [bundle, setBundle] = useState<PolymarketPortfolioBundle | null>(null)
  const [bundleLoading, setBundleLoading] = useState(false)
  const [bundleError, setBundleError] = useState('')

  const [addressInput, setAddressInput] = useState('')
  const [networkInput, setNetworkInput] = useState<PolymarketBridgeNetwork>('base')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [depositWalletBusy, setDepositWalletBusy] = useState(false)
  const [depositWalletError, setDepositWalletError] = useState('')
  const depositWalletAutoKey = useRef('')

  const [liveValue, setLiveValue] = useState<{ value?: number } | null>(null)
  const [livePositions, setLivePositions] = useState<PolymarketPosition[]>([])
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError, setLiveError] = useState('')
  const [liveLoadedAddress, setLiveLoadedAddress] = useState('')

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
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawRecipient, setWithdrawRecipient] = useState('')
  const [withdrawNetwork, setWithdrawNetwork] = useState<PolymarketBridgeNetwork>('base')
  const [withdrawBusy, setWithdrawBusy] = useState(false)
  const [withdrawError, setWithdrawError] = useState('')
  const [withdrawResult, setWithdrawResult] = useState<{
    bridgeAddress: string
    recipientAddr: string
    network: PolymarketBridgeNetwork
    amount: string
    transactionId?: string
    transactionHash?: string
    status?: string
    note?: string
  } | null>(null)
  const [sellBusyKey, setSellBusyKey] = useState('')
  const [sellNotice, setSellNotice] = useState('')
  const [sellSuccess, setSellSuccess] = useState('')

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState<PolymarketAlertSettings | null>(null)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [addressCopied, setAddressCopied] = useState(false)
  const initialPortfolioActionApplied = useRef(Boolean(initialPortfolioAction))
  const [unsignedPortfolioAction, setUnsignedPortfolioAction] = useState<'watch' | 'trading' | 'external' | null>(initialPortfolioAction)
  const [unsignedWatchAddress, setUnsignedWatchAddress] = useState('')
  const [unsignedExternalAddress, setUnsignedExternalAddress] = useState('')
  const [unsignedExternalAmount, setUnsignedExternalAmount] = useState('')
  const [unsignedExternalNetwork, setUnsignedExternalNetwork] = useState<PolymarketBridgeNetwork>('base')
  const [unsignedExternalBusy, setUnsignedExternalBusy] = useState(false)
  const [unsignedExternalError, setUnsignedExternalError] = useState('')
  const [unsignedExternalTab, setUnsignedExternalTab] = useState<'balance' | 'fund'>('balance')
  const [unsignedExternalValue, setUnsignedExternalValue] = useState<{ value?: number } | null>(null)
  const [unsignedExternalPositions, setUnsignedExternalPositions] = useState<PolymarketPosition[]>([])
  const [unsignedExternalLoading, setUnsignedExternalLoading] = useState(false)
  const [unsignedExternalResult, setUnsignedExternalResult] = useState<{
    depositAddress: string
    network: PolymarketBridgeNetwork
    payUrl: string
    minimumUsdc: number
  } | null>(null)
  const [tradingPusdBalance, setTradingPusdBalance] = useState<{ raw: string; formatted: string } | null>(null)
  const [tradingPusdLoading, setTradingPusdLoading] = useState(false)
  const [tradingPusdError, setTradingPusdError] = useState('')
  const [tradingWalletTab, setTradingWalletTab] = useState<'balance' | 'fund' | 'withdraw' | 'positions'>(initialPortfolioAction === 'trading' ? (initialTradingWalletTab ?? 'balance') : 'balance')
  const [tradingWalletNetwork, setTradingWalletNetwork] = useState<PolymarketBridgeNetwork>('base')
  const [watchAccountTab, setWatchAccountTab] = useState<'balance' | 'positions' | 'alerts'>('balance')
  const [positionStatusTab, setPositionStatusTab] = useState<PolymarketPositionStatus>('live')

  const profile = bundle?.profile ?? null
  const settings = bundle?.settings ?? null
  const signingWallet = privyWallets.find(wallet => /^0x[a-fA-F0-9]{40}$/.test(wallet.address ?? '')) ?? null
  const signingWalletAddress = signingWallet?.address ?? ''
  const watchedAddress = profile?.watchedAddress || profile?.polymarketAddress || ''
  const savedTradingAddress = profile?.tradingAddress || ''
  const polymarketDepositWallet = profile?.depositWalletAddress || ''
  const depositWalletStatus = String(profile?.depositWalletStatus || '').toLowerCase()
  const polymarketWalletReady = Boolean(polymarketDepositWallet && depositWalletStatus === 'ready')
  const polymarketWalletPending = Boolean(polymarketDepositWallet && !polymarketWalletReady)
  const tradingAddress = savedTradingAddress || signingWalletAddress || ''
  const tradingPortfolioAddress = polymarketDepositWallet || tradingAddress
  const connectedTradingWalletMismatch = Boolean(
    savedTradingAddress &&
    signingWalletAddress &&
    savedTradingAddress.toLowerCase() !== signingWalletAddress.toLowerCase(),
  )
  const liveDataAddress = unsignedPortfolioAction === 'trading' ? tradingPortfolioAddress : watchedAddress
  const tradingPusdValue = tradingPusdBalance?.formatted ? Number(tradingPusdBalance.formatted) : null
  const tradingPusdDisplay = tradingPusdLoading
    ? null
    : tradingPusdValue !== null && Number.isFinite(tradingPusdValue)
      ? formatUsd(tradingPusdValue)
      : '--'
  const mainWalletCopy = 'View pUSD trading cash, fund your account, withdraw as USDC, and track positions.'

  const claimablePositions = useMemo(
    () => livePositions.filter(isClaimablePosition),
    [livePositions],
  )

  const activeOpenPositions = useMemo(
    () => livePositions.filter(isActiveOpenPosition),
    [livePositions],
  )

  const activePositionValue = useMemo(() => positionValueSum(activeOpenPositions), [activeOpenPositions])
  const claimableValue = useMemo(() => positionValueSum(claimablePositions), [claimablePositions])

  const positionsByStatus = useMemo(
    () => livePositions.filter(position => polymarketPositionStatus(position) === positionStatusTab),
    [livePositions, positionStatusTab],
  )

  useEffect(() => {
    if (!initialPortfolioAction || initialPortfolioActionApplied.current) return
    initialPortfolioActionApplied.current = true
    setUnsignedPortfolioAction(initialPortfolioAction)
    if (initialPortfolioAction === 'trading') {
      setTradingWalletTab(initialTradingWalletTab ?? 'balance')
    }
  }, [initialPortfolioAction, initialTradingWalletTab])

  useEffect(() => {
    if (privyReady) {
      setPrivyWaitExpired(false)
      return
    }
    const timer = window.setTimeout(() => setPrivyWaitExpired(true), 12000)
    return () => window.clearTimeout(timer)
  }, [privyReady])

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
      const data = await readPolyDeskJson<{ ok?: boolean; error?: string } & PolymarketPortfolioBundle>(res, 'Could not load Polymarket portfolio.')
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
    setLiveLoadedAddress('')
    try {
      const [valueRes, positionsRes] = await Promise.all([
        fetch(`/api/polymarket-portfolio?action=value&address=${encodeURIComponent(address)}`),
        fetch(`/api/polymarket-portfolio?action=positions&address=${encodeURIComponent(address)}&sizeThreshold=0&limit=100`),
      ])
      const valueData = await readPolyDeskJson<{ ok?: boolean; value?: unknown; error?: string }>(valueRes, 'Could not load portfolio value.')
      const positionsData = await readPolyDeskJson<{ ok?: boolean; positions?: PolymarketPosition[]; error?: string }>(positionsRes, 'Could not load positions.')
      if (!valueRes.ok || !valueData.ok) throw new Error(valueData.error || 'Could not load portfolio value.')
      if (!positionsRes.ok || !positionsData.ok) throw new Error(positionsData.error || 'Could not load positions.')
      setLiveValue(normalizePortfolioValue(valueData.value))
      setLivePositions(Array.isArray(positionsData.positions) ? positionsData.positions : [])
      setLiveLoadedAddress(address)
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
      const data = await readPolyDeskJson<{ ok?: boolean; alerts?: PolymarketAlertRecord[] }>(res, 'Could not evaluate alerts.')
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
    if (liveDataAddress) {
      void fetchLiveData(liveDataAddress)
    }
  }, [liveDataAddress, fetchLiveData])

  useEffect(() => {
    if (!liveDataAddress) return
    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') {
        void fetchLiveData(liveDataAddress)
        void fetchBundle()
      }
    }
    window.addEventListener('focus', refreshOnReturn)
    document.addEventListener('visibilitychange', refreshOnReturn)
    return () => {
      window.removeEventListener('focus', refreshOnReturn)
      document.removeEventListener('visibilitychange', refreshOnReturn)
    }
  }, [liveDataAddress, fetchLiveData, fetchBundle])

  useEffect(() => {
    if (unsignedPortfolioAction !== 'watch') return
    if (!watchedAddress || liveLoading) return
    if (liveLoadedAddress.toLowerCase() !== watchedAddress.toLowerCase()) return
    void evaluateAlerts()
  }, [unsignedPortfolioAction, watchedAddress, liveLoadedAddress, liveLoading, livePositions.length, evaluateAlerts])

  useEffect(() => {
    if (settings) setSettingsDraft(settings)
  }, [settings])

  useEffect(() => {
    if (unsignedPortfolioAction !== 'trading') return
    if (!authenticated || !savedTradingAddress || polymarketWalletReady || depositWalletBusy) return
    const key = `${savedTradingAddress.toLowerCase()}:${depositWalletStatus || 'none'}`
    if (depositWalletAutoKey.current === key) return
    depositWalletAutoKey.current = key
    void activatePolymarketWallet(savedTradingAddress)
  }, [unsignedPortfolioAction, authenticated, savedTradingAddress, polymarketWalletReady, depositWalletStatus, depositWalletBusy])

  useEffect(() => {
    if (unsignedPortfolioAction !== 'trading') return
    if (!authenticated || !savedTradingAddress || polymarketWalletReady || depositWalletBusy) return
    const timer = window.setTimeout(() => {
      void activatePolymarketWallet(savedTradingAddress)
    }, polymarketWalletPending ? 15000 : 5000)
    return () => window.clearTimeout(timer)
  }, [
    unsignedPortfolioAction,
    authenticated,
    savedTradingAddress,
    polymarketWalletReady,
    polymarketWalletPending,
    depositWalletStatus,
    depositWalletBusy,
  ])

  useEffect(() => {
    if (unsignedPortfolioAction !== 'trading') return
    if (tradingWalletTab !== 'balance') return
    if (!polymarketWalletReady || !polymarketDepositWallet) return
    void loadTradingPusdBalance(polymarketDepositWallet)
  }, [unsignedPortfolioAction, tradingWalletTab, polymarketWalletReady, polymarketDepositWallet])

  async function saveProfile(addressOverride?: string): Promise<PolymarketPortfolioBundle | null> {
    const address = (addressOverride ?? addressInput).trim()
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      setProfileError('Enter a valid 0x Polymarket profile address.')
      return null
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
          mode: unsignedPortfolioAction === 'trading' ? 'trading' : 'watch',
          fundingNetwork: networkInput,
          telegramOwner,
          telegramId,
        }),
      })
      const data = await readPolyDeskJson<{ ok?: boolean; error?: string } & PolymarketPortfolioBundle>(res, 'Could not save profile.')
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not save profile.')
      const nextBundle = {
        profile: data.profile,
        settings: data.settings,
        watchlist: data.watchlist ?? [],
        fundingAttempts: data.fundingAttempts ?? [],
        alerts: data.alerts ?? [],
      }
      setBundle(nextBundle)
      setAddressInput('')
      return nextBundle
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not save profile.')
      return null
    } finally {
      setSavingProfile(false)
    }
  }

  async function activatePolymarketWallet(ownerAddress = savedTradingAddress || signingWalletAddress) {
    const owner = ownerAddress.trim()
    if (!/^0x[a-fA-F0-9]{40}$/.test(owner)) {
      setDepositWalletError('Connect Main Wallet before activating Polymarket wallet.')
      return null
    }
    setDepositWalletBusy(true)
    setDepositWalletError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in required.')
      const res = await fetch('/api/polymarket-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'ensure-deposit-wallet', ownerAddress: owner }),
      })
      const data = await readPolyDeskJson<{ ok?: boolean; error?: string } & PolymarketPortfolioBundle>(res, 'Could not activate Polymarket wallet.')
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not activate Polymarket wallet.')
      const nextBundle = {
        profile: data.profile,
        settings: data.settings,
        watchlist: data.watchlist ?? [],
        fundingAttempts: data.fundingAttempts ?? [],
        alerts: data.alerts ?? [],
      }
      setBundle(nextBundle)
      return nextBundle
    } catch (err) {
      setDepositWalletError(err instanceof Error ? err.message : 'Could not activate Polymarket wallet.')
      return null
    } finally {
      setDepositWalletBusy(false)
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
        body: JSON.stringify({ action: 'disconnect-watch' }),
      })
      const data = await readPolyDeskJson<{ ok?: boolean; error?: string } & PolymarketPortfolioBundle>(res, 'Could not disconnect.')
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not disconnect.')
      setBundle({
        profile: data.profile,
        settings: data.settings,
        watchlist: data.watchlist ?? [],
        fundingAttempts: data.fundingAttempts ?? [],
        alerts: data.alerts ?? [],
      })
      setLiveValue(null)
      setLivePositions([])
      setLiveError('')
      setFundResult(null)
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

  async function disconnectTradingProfile(): Promise<PolymarketPortfolioBundle | null> {
    setSavingProfile(true)
    setProfileError('')
    setDepositWalletError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in required.')
      const res = await fetch('/api/polymarket-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'disconnect-trading' }),
      })
      const data = await readPolyDeskJson<{ ok?: boolean; error?: string } & PolymarketPortfolioBundle>(res, 'Could not change Main Wallet.')
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not change Main Wallet.')
      const nextBundle = {
        profile: data.profile,
        settings: data.settings,
        watchlist: data.watchlist ?? [],
        fundingAttempts: data.fundingAttempts ?? [],
        alerts: data.alerts ?? [],
      }
      setBundle(nextBundle)
      setTradingPusdBalance(null)
      setTradingPusdError('')
      setFundResult(null)
      setFundAmount('')
      setFundError('')
      setWithdrawResult(null)
      setWithdrawAmount('')
      setWithdrawError('')
      return nextBundle
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not change Main Wallet.')
      return null
    } finally {
      setSavingProfile(false)
    }
  }

  async function useConnectedTradingWallet() {
    if (!signingWalletAddress) {
      setProfileError('Attach a Privy wallet before changing Main Wallet.')
      return
    }
    const cleared = savedTradingAddress ? await disconnectTradingProfile() : true
    if (cleared === null) return
    const saved = await saveProfile(signingWalletAddress)
    if (saved?.profile?.tradingAddress) void activatePolymarketWallet(saved.profile.tradingAddress)
  }

  async function startFund(marketUrlForCta = '') {
    if (!savedTradingAddress) {
      setFundError('Open Main Wallet before funding.')
      return
    }
    if (!polymarketDepositWallet) {
      setFundError('Activate Polymarket Wallet before funding.')
      return
    }
    if (!polymarketWalletReady) {
      setFundError('Polymarket Wallet is still activating. Funding will unlock automatically once it is ready.')
      return
    }
    setFundError('')
    const amt = fundAmount.trim()
    if (!/^\d+(?:\.\d{1,6})?$/.test(amt) || Number(amt) < 3) {
      setFundError('Enter at least 3 USDC.')
      return
    }
    setFundBusy(true)
    try {
      const network = tradingWalletNetwork
      const bridgeRes = await fetch('/api/polymarket-bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          polymarketWallet: polymarketDepositWallet,
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
      const requestId = polymarketFundingRequestId()
      const token = await getAccessToken()
      if (token) {
        await fetch('/api/polymarket-portfolio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            action: 'log-funding',
            polymarketWallet: polymarketDepositWallet,
            network: bridgeData.network ?? network,
            amount: amt,
            status: 'pending',
            requestId,
            depositAddress: bridgeData.depositAddress,
          }),
        }).catch(() => undefined)
      }
      const payUrl = buildPolymarketPayLink({
        wallet: bridgeData.depositAddress,
        amount: amt,
        funding: 'Polymarket portfolio',
        network: (bridgeData.network ?? network) as RequestNetwork,
        polymarketWallet: polymarketDepositWallet,
        returnToPortfolio: surface !== 'standalone',
        returnToStandalonePortfolio: surface === 'standalone',
        returnToTradingWallet: true,
        requestId,
      })
      setFundResult({
        depositAddress: bridgeData.depositAddress,
        network: (bridgeData.network ?? network) as PolymarketBridgeNetwork,
        minimumUsdc: bridgeData.minimumUsdc ?? 3,
        payUrl,
        marketUrl: marketUrlForCta || 'https://polymarket.com',
      })
      void fetchBundle()
      void loadTradingPusdBalance(polymarketDepositWallet)
    } catch (err) {
      setFundError(err instanceof Error ? err.message : 'Could not prepare funding.')
    } finally {
      setFundBusy(false)
    }
  }

  async function loadTradingPusdBalance(wallet = polymarketDepositWallet) {
    if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) return
    setTradingPusdLoading(true)
    setTradingPusdError('')
    try {
      const res = await fetch('/api/polymarket-bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'balance',
          polymarketWallet: wallet,
        }),
      })
      const data = await readPolyDeskJson<{
        ok?: boolean
        balance?: { raw?: string; formatted?: string }
        error?: string
      }>(res, 'Could not load pUSD balance.')
      if (!res.ok || !data.ok || !data.balance) throw new Error(data.error || 'Could not load pUSD balance.')
      setTradingPusdBalance({
        raw: data.balance.raw ?? '0',
        formatted: data.balance.formatted ?? '0',
      })
    } catch (err) {
      setTradingPusdError(err instanceof Error ? err.message : 'Could not load pUSD balance.')
    } finally {
      setTradingPusdLoading(false)
    }
  }

  async function withdrawPolymarketPusd() {
    if (!polymarketDepositWallet) {
      setWithdrawError('Activate Polymarket Wallet before withdrawing.')
      return
    }
    if (!polymarketWalletReady) {
      setWithdrawError('Polymarket Wallet is still activating. Withdrawals will unlock automatically once it is ready.')
      return
    }
    if (!savedTradingAddress) {
      setWithdrawError('Open Main Wallet before withdrawing.')
      return
    }
    const amount = withdrawAmount.trim()
    if (!/^\d+(?:\.\d{1,6})?$/.test(amount) || Number(amount) <= 0) {
      setWithdrawError('Enter the pUSD amount to withdraw as USDC.')
      return
    }
    const signingWallet = privyWallets.find(wallet => wallet.address?.toLowerCase() === savedTradingAddress.toLowerCase())
      ?? privyWallets.find(wallet => wallet.address?.toLowerCase() === signingWalletAddress.toLowerCase())
    if (!signingWallet || typeof signingWallet.getEthereumProvider !== 'function') {
      setWithdrawError('Connect the owner wallet that controls this Polymarket wallet.')
      return
    }
    setWithdrawBusy(true)
    setWithdrawError('')
    setWithdrawResult(null)
    try {
      const res = await fetch('/api/polymarket-bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'withdraw',
          polymarketWallet: polymarketDepositWallet,
          network: withdrawNetwork,
          recipientAddr: withdrawRecipient.trim(),
        }),
      })
      const data = await readPolyDeskJson<{
        ok?: boolean
        bridgeAddress?: string
        recipientAddr?: string
        network?: PolymarketBridgeNetwork
        relayerReady?: boolean
        relayerUrl?: string | null
        sourceTokenAddress?: string
        sourceTokenDecimals?: number
        balance?: { raw?: string; formatted?: string } | null
        note?: string
        error?: string
      }>(res, 'Could not prepare withdrawal route.')
      if (!res.ok || !data.ok || !data.bridgeAddress) {
        throw new Error(data.error || 'Could not prepare withdrawal route.')
      }
      if (!data.relayerReady || !data.relayerUrl) {
        throw new Error('Polymarket relayer is not configured for native withdrawals.')
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(data.bridgeAddress)) {
        throw new Error('Polymarket bridge did not return a Polygon source address.')
      }
      const sourceToken = data.sourceTokenAddress || '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB'
      const decimals = data.sourceTokenDecimals ?? 6
      const [{ RelayClient }, { encodeFunctionData, parseUnits, createWalletClient, custom }, { polygon }] = await Promise.all([
        import('@polymarket/builder-relayer-client'),
        import('viem'),
        import('viem/chains'),
      ])
      const amountUnits = parseUnits(amount, decimals)
      const balanceRaw = data.balance?.raw ? BigInt(data.balance.raw) : null
      if (balanceRaw !== null && balanceRaw < amountUnits) {
        throw new Error(`Available pUSD is ${data.balance?.formatted ?? 'below the requested amount'}.`)
      }
      if (typeof signingWallet.switchChain === 'function') {
        await signingWallet.switchChain(137)
      }
      const provider = await signingWallet.getEthereumProvider()
      const walletClient = createWalletClient({
        account: savedTradingAddress as `0x${string}`,
        chain: polygon,
        transport: custom(provider),
      })
      const relayerClient = new RelayClient(data.relayerUrl, 137, walletClient, undefined, undefined, { chain: polygon })
      const derivedWallet = await relayerClient.deriveDepositWalletAddress()
      if (derivedWallet.toLowerCase() !== polymarketDepositWallet.toLowerCase()) {
        throw new Error('Connected owner wallet does not control this Polymarket wallet.')
      }
      const deployed = await relayerClient.getDeployed(polymarketDepositWallet, 'WALLET')
      if (!deployed) {
        throw new Error('Polymarket wallet is not deployed yet. Activate it, wait for confirmation, then retry.')
      }
      const transferData = encodeFunctionData({
        abi: [{
          type: 'function',
          name: 'transfer',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          outputs: [{ name: '', type: 'bool' }],
        }] as const,
        functionName: 'transfer',
        args: [data.bridgeAddress as `0x${string}`, amountUnits],
      })
      const deadline = Math.floor(Date.now() / 1000 + 240).toString()
      const response = await relayerClient.executeDepositWalletBatch([
        {
          target: sourceToken,
          value: '0',
          data: transferData,
        },
      ], polymarketDepositWallet, deadline)
      const mined = await response.wait().catch(() => undefined)
      setWithdrawResult({
        bridgeAddress: data.bridgeAddress,
        recipientAddr: data.recipientAddr || withdrawRecipient.trim(),
        network: (data.network ?? withdrawNetwork) as PolymarketBridgeNetwork,
        amount,
        transactionId: response.transactionID,
        transactionHash: mined?.transactionHash || response.transactionHash || response.hash,
        status: mined?.state || response.state,
        note: data.note,
      })
      void fetchLiveData(tradingPortfolioAddress)
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : 'Could not withdraw from Polymarket.')
    } finally {
      setWithdrawBusy(false)
    }
  }

  async function sellPosition(position: PolymarketPosition) {
    setSellNotice('')
    setSellSuccess('')
    const tokenId = polymarketPositionTokenId(position)
    const size = numberOrNull(position.size)
    if (!tokenId || !size || size <= 0) {
      setSellNotice('This position is missing a sellable token balance.')
      return
    }
    if (!savedTradingAddress || !polymarketDepositWallet) {
      setSellNotice('Open Main Wallet and activate the Polymarket wallet before selling.')
      return
    }
    const signingWallet = privyWallets.find(wallet => wallet.address?.toLowerCase() === savedTradingAddress.toLowerCase())
      ?? privyWallets.find(wallet => wallet.address?.toLowerCase() === signingWalletAddress.toLowerCase())
    if (!signingWallet || typeof signingWallet.getEthereumProvider !== 'function') {
      setSellNotice('Connect the owner wallet that controls this Polymarket wallet.')
      return
    }
    setSellNotice('Checking Polymarket availability...')
    const restrictionNotice = await checkPolymarketTradingRestriction()
    if (restrictionNotice) {
      setSellNotice(restrictionNotice)
      return
    }
    const title = position.title ?? 'Polymarket position'
    const marketUrl = polymarketEventUrl(position)
    setSellNotice('')
    const confirmed = window.confirm(`Sell up to ${size.toLocaleString(undefined, { maximumFractionDigits: 6 })} shares of "${title}" at market?`)
    if (!confirmed) return
    const busyKey = polymarketPositionKey(position)
    setSellBusyKey(busyKey)
    try {
      const prepareResponse = await fetch('/api/polymarket-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketTitle: title,
          marketUrl,
          tokenId,
          outcome: position.outcome ?? 'Position',
          action: 'prepare',
          side: 'sell',
          amount: String(size),
          signer: savedTradingAddress,
        }),
      })
      const prepareData = await readPolyDeskJson<{ ok?: boolean; builderCode?: string; error?: string }>(prepareResponse, 'Could not prepare sell order.')
      if (!prepareResponse.ok || !prepareData.ok || !prepareData.builderCode || !/^0x[a-fA-F0-9]{64}$/.test(prepareData.builderCode)) {
        throw new Error(prepareData.error || 'Selling is temporarily unavailable.')
      }
      if (typeof signingWallet.switchChain === 'function') {
        await signingWallet.switchChain(137)
      }
      const provider = await signingWallet.getEthereumProvider()
      const [{ ClobClient, Side, OrderType, AssetType, SignatureTypeV2, createL2Headers, getContractConfig, orderToJsonV2 }, { createWalletClient, custom, encodeAbiParameters, keccak256, toHex }, { polygon }] = await Promise.all([
        import('@polymarket/clob-client-v2'),
        import('viem'),
        import('viem/chains'),
      ])
      const walletClient = createWalletClient({
        account: savedTradingAddress as `0x${string}`,
        chain: polygon,
        transport: custom(provider),
      })
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in required.')
      const walletCheck = await fetch('/api/polymarket-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'verify-deposit-wallet',
          ownerAddress: savedTradingAddress,
          depositWalletAddress: polymarketDepositWallet,
        }),
      })
      const walletCheckData = await readPolyDeskJson<{ ok?: boolean; error?: string; profile?: PolymarketProfile | null }>(walletCheck, 'Could not verify Polymarket wallet ownership.')
      if (!walletCheck.ok || !walletCheckData.ok) {
        if (walletCheckData.profile) {
          setBundle(current => current ? { ...current, profile: walletCheckData.profile ?? current.profile } : current)
        }
        throw new Error(walletCheckData.error || 'Connected owner wallet does not control this Polymarket wallet.')
      }
      const signatureType = SignatureTypeV2.POLY_1271
      const baseClient = new ClobClient({
        host: 'https://clob.polymarket.com',
        chain: 137,
        signer: walletClient,
        signatureType,
        funderAddress: polymarketDepositWallet,
      })
      setSellNotice('Checking sell balance and market settings...')
      const userCreds = await baseClient.createOrDeriveApiKey()
      const clobClient = new ClobClient({
        host: 'https://clob.polymarket.com',
        chain: 137,
        signer: walletClient,
        creds: userCreds,
        signatureType,
        funderAddress: polymarketDepositWallet,
      })
      const [rawTickSize, negRisk, balanceAllowance] = await Promise.all([
        clobClient.getTickSize(tokenId),
        clobClient.getNegRisk(tokenId),
        clobClient.getBalanceAllowance({ asset_type: AssetType.CONDITIONAL, token_id: tokenId }).catch(() => null),
      ])
      const tickText = String(rawTickSize ?? '')
      const tickSize = polymarketTickSize(Number(tickText)) || (tickText === '0.1' || tickText === '0.01' || tickText === '0.005' || tickText === '0.0025' || tickText === '0.001' || tickText === '0.0001' ? tickText : '')
      if (!tickSize) throw new Error('This market is missing CLOB tick size metadata.')
      const contractConfig = getContractConfig(137)
      const exchangeAddress = negRisk === true ? contractConfig.negRiskExchangeV2 : contractConfig.exchangeV2
      if (balanceAllowance) {
        const rawBalance = Number(balanceAllowance.balance)
        const normalizedBalance = Number.isFinite(rawBalance) && rawBalance > 100_000 ? rawBalance / 1_000_000 : rawBalance
        if (Number.isFinite(normalizedBalance) && normalizedBalance <= 0) {
          throw new Error('No sellable conditional token balance was found for this position.')
        }
      }
      setSellNotice('Confirm the sell order in your wallet. Signing is free.')
      const signedOrder = await clobClient.createMarketOrder(
        {
          tokenID: tokenId,
          amount: size,
          side: Side.SELL,
          orderType: OrderType.FAK,
          builderCode: prepareData.builderCode,
        },
        { tickSize, negRisk: negRisk === true, version: 2 },
      )
      signedOrder.signature = await signPolymarketDepositWalletOrder({
        walletClient,
        order: signedOrder,
        chainId: 137,
        depositWalletAddress: polymarketDepositWallet,
        exchangeAddress,
        encodeAbiParameters,
        keccak256,
        toHex,
      })
      setSellNotice('Approved. Sending sell order...')
      const orderPayload = orderToJsonV2(signedOrder, userCreds.key, OrderType.FAK, false, false)
      const handoffResponse = await fetch('/api/polymarket-builder-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'portfolio-position-sell',
          marketTitle: title,
          marketUrl,
          outcome: position.outcome ?? 'Position',
          tokenId,
          signer: polymarketDepositWallet,
          orderType: OrderType.FAK,
          order: signedOrder,
          orderPayload,
        }),
      })
      const handoff = await readPolyDeskJson<{
        ok?: boolean
        error?: string
        remoteBuilderSigner?: { url?: string; token?: string }
        handoff?: { orderPayload?: typeof orderPayload }
      }>(handoffResponse, 'Could not prepare sell submission.')
      if (!handoffResponse.ok || !handoff.ok) throw new Error(handoff.error || 'Sell handoff failed.')
      const finalOrderPayload = handoff.handoff?.orderPayload ?? orderPayload
      const orderBody = JSON.stringify(finalOrderPayload)
      const l2Headers = await createL2Headers(walletClient, userCreds, {
        method: 'POST',
        requestPath: '/order',
        body: orderBody,
      })
      setSellNotice('Sending sell order from this browser...')
      await submitPolymarketOrderFromBrowser({
        orderBody,
        userHeaders: l2Headers,
        remoteBuilderSigner: handoff.remoteBuilderSigner,
        fallbackMessage: 'Polymarket rejected the sell order.',
      })
      setSellSuccess(`Sell order sent for ${position.outcome ?? 'position'}.`)
      setSellNotice('')
      if (tradingPortfolioAddress) void fetchLiveData(tradingPortfolioAddress)
    } catch (err) {
      setSellNotice(friendlyTradeError(err))
    } finally {
      setSellBusyKey('')
    }
  }

  async function prepareUnsignedExternalFunding() {
    setUnsignedExternalError('')
    setUnsignedExternalResult(null)
    const wallet = unsignedExternalAddress.trim()
    const amount = unsignedExternalAmount.trim()
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      setUnsignedExternalError('Enter the external Polymarket 0x wallet you want to fund.')
      return
    }
    if (!/^\d+(?:\.\d{1,6})?$/.test(amount) || Number(amount) < 3) {
      setUnsignedExternalError('Enter at least 3 USDC.')
      return
    }
    setUnsignedExternalBusy(true)
    try {
      const bridgeRes = await fetch('/api/polymarket-bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          polymarketWallet: wallet,
          network: unsignedExternalNetwork,
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
        throw new Error(bridgeData.error || 'Could not prepare external funding.')
      }
      const network = (bridgeData.network ?? unsignedExternalNetwork) as PolymarketBridgeNetwork
      setUnsignedExternalResult({
        depositAddress: bridgeData.depositAddress,
        network,
        minimumUsdc: bridgeData.minimumUsdc ?? 3,
        payUrl: buildPolymarketPayLink({
          wallet: bridgeData.depositAddress,
          amount,
          funding: 'External Polymarket account',
          network: network as RequestNetwork,
          polymarketWallet: wallet,
          returnToPortfolio: surface !== 'standalone',
          returnToStandalonePortfolio: surface === 'standalone',
        }),
      })
    } catch (err) {
      setUnsignedExternalError(err instanceof Error ? err.message : 'Could not prepare external funding.')
    } finally {
      setUnsignedExternalBusy(false)
    }
  }

  async function loadUnsignedExternalBalance() {
    setUnsignedExternalError('')
    const wallet = unsignedExternalAddress.trim()
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      setUnsignedExternalError('Enter a valid external Polymarket 0x wallet first.')
      return
    }
    setUnsignedExternalLoading(true)
    try {
      const [valueRes, positionsRes] = await Promise.all([
        fetch(`/api/polymarket-portfolio?action=value&address=${encodeURIComponent(wallet)}`),
        fetch(`/api/polymarket-portfolio?action=positions&address=${encodeURIComponent(wallet)}&sizeThreshold=0&limit=100`),
      ])
      const valueData = await readPolyDeskJson<{ ok?: boolean; value?: number; error?: string }>(valueRes, 'Could not load external balance.')
      const positionsData = await readPolyDeskJson<{ ok?: boolean; positions?: PolymarketPosition[]; error?: string }>(positionsRes, 'Could not load external positions.')
      if (!valueRes.ok || !valueData.ok) throw new Error(valueData.error || 'Could not load external balance.')
      if (!positionsRes.ok || !positionsData.ok) throw new Error(positionsData.error || 'Could not load external positions.')
      setUnsignedExternalValue({ value: valueData.value })
      setUnsignedExternalPositions(Array.isArray(positionsData.positions) ? positionsData.positions : [])
    } catch (err) {
      setUnsignedExternalError(err instanceof Error ? err.message : 'Could not load external account.')
    } finally {
      setUnsignedExternalLoading(false)
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
      const data = await readPolyDeskJson<{ ok?: boolean; settings?: PolymarketAlertSettings; error?: string }>(res, 'Could not save alert settings.')
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
    if (!watchedAddress) return
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    navigator.clipboard.writeText(watchedAddress).then(() => {
      setAddressCopied(true)
      window.setTimeout(() => setAddressCopied(false), 1500)
    }).catch(() => undefined)
  }

  // ── Render ────────────────────────────────────────────────────────────
  const sessionlessExternalMode = !PRIVY_AUTH_ENABLED && unsignedPortfolioAction === 'external'

  if (!PRIVY_AUTH_ENABLED && !sessionlessExternalMode) {
    const portfolioActions = [
      ['watch', 'Watch Polymarket account', 'Sign-in required for saved alerts.'],
      ['trading', 'Trading wallet', 'Sign-in required for Main Wallet readiness.'],
      ['external', 'External funding', 'Check or fund another Polymarket wallet.'],
    ] as const
    const selectedAction = portfolioActions.find(([key]) => key === unsignedPortfolioAction)
    return (
      <div className="mt-4 space-y-3">
        <PolyDeskBackButton onClick={selectedAction ? () => setUnsignedPortfolioAction(null) : onBack} />
        {!selectedAction ? (
          <div className="space-y-2">
            {portfolioActions.map(([key, label, body]) => (
              <PolyDeskMenuCard key={key} title={label} body={body} onClick={() => setUnsignedPortfolioAction(key)} />
            ))}
          </div>
        ) : (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0f1014]">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
              <img src={POLYMARKET_LOGO} alt="" className="h-4 w-4 invert dark:invert-0" />
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">PolyDesk Portfolio</p>
          </div>
          <h2 className="mt-2 text-lg font-semibold tracking-tight text-gray-900 dark:text-white">{selectedAction[1]} needs sign-in</h2>
          <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            Saved portfolio alerts and trading-wallet readiness need the Hash PayLink Privy session. External Polymarket wallet checks and funding still work without sign-in.
          </p>
          <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
            Build env needed: VITE_PRIVY_APP_ID and VITE_AUTH_BRIDGE=hybrid.
          </p>
          <button
            type="button"
            onClick={() => setUnsignedPortfolioAction('external')}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
          >
            <ExternalLink className="h-4 w-4" /> Use external funding
          </button>
        </div>
        )}
      </div>
    )
  }

  if (!sessionlessExternalMode && !privyReady && privyWaitExpired) {
    return (
      <div className="mt-4 space-y-3">
        <PolyDeskBackButton onClick={onBack} />
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0f1014]">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading PolyDesk session...
          </div>
          <div className="mt-3 space-y-3">
            <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              PolyDesk is still waiting for the wallet session. Refresh this page if it does not continue.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/[0.04]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh PolyDesk
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!sessionlessExternalMode && !privyReady) {
    return (
      <div className="mt-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    )
  }

  if (!sessionlessExternalMode && !authenticated) {
    const portfolioActions = [
      ['watch', 'Watch account', 'Track a public Polymarket profile.'],
      ['trading', 'Main Wallet', 'Add USDC, withdraw pUSD as USDC, and view active positions.'],
      ['external', 'Fund external', 'Send funds to another Poly account.'],
    ] as const
    const selectedAction = portfolioActions.find(([key]) => key === unsignedPortfolioAction)
    const backHandler = selectedAction ? () => setUnsignedPortfolioAction(null) : onBack

    return (
      <div className="mt-4 space-y-3">
        <PolyDeskBackButton onClick={backHandler} />

        {!selectedAction ? (
          <div className="space-y-2">
            {portfolioActions.map(([key, label, body]) => (
              <PolyDeskMenuCard
                key={key}
                title={label}
                body={body}
                onClick={() => setUnsignedPortfolioAction(key)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111216]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">PolyDesk Portfolio</p>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight text-gray-900 dark:text-white">{selectedAction[1]}</h2>
                </div>
              </div>

              {unsignedPortfolioAction === 'watch' && (
                <div className="mt-3 space-y-3">
                  <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                    Paste any public Polymarket 0x profile. Watching is read-only and never funds or controls that account.
                  </p>
                  <InputBlock
                    label="Public profile address"
                    value={unsignedWatchAddress}
                    onChange={setUnsignedWatchAddress}
                    placeholder="0x... public profile"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setAddressInput(unsignedWatchAddress.trim())
                      void login()
                    }}
                    disabled={!/^0x[a-fA-F0-9]{40}$/.test(unsignedWatchAddress.trim())}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                  >
                    <ArrowRight className="h-4 w-4" /> Continue to watch setup
                  </button>
                </div>
              )}

              {unsignedPortfolioAction === 'trading' && (
                <div className="mt-3 space-y-3">
                  <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                    Add USDC, send it out, or use it across PolyDesk.
                  </p>
                  <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0f1014]">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">pUSD trading cash</p>
                    <p className="mt-1 text-2xl font-black tracking-tight text-gray-950 dark:text-white">$0</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Sign in to load your Polymarket account.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => login()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-3 text-sm font-bold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                  >
                    <Wallet className="h-4 w-4" /> Connect wallet
                  </button>
                  <p className="text-center text-xs font-medium text-gray-400 dark:text-gray-500">Email or wallet</p>
                </div>
              )}

              {unsignedPortfolioAction === 'external' && (
                <div className="mt-3 space-y-3">
                  <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                    Enter the recipient 0x wallet from the Polymarket account you want to fund. PolyDesk can check public activity, but it cannot verify ownership.
                  </p>
                  <div className="grid grid-cols-2 gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-[#17181d]">
                    {[
                      { key: 'balance', label: 'Balance', icon: Activity },
                      { key: 'fund', label: 'Fund', icon: Download },
                    ].map(({ key, label, icon: Icon }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setUnsignedExternalTab(key as typeof unsignedExternalTab)}
                        className={cn(
                          'flex min-h-[46px] flex-col items-center justify-center gap-1 rounded-lg border px-1.5 text-[10px] font-bold transition-all',
                          unsignedExternalTab === key
                            ? 'border-gray-300 bg-gray-100 text-gray-950 shadow-sm dark:border-white/15 dark:bg-white/[0.12] dark:text-white'
                            : 'border-transparent bg-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200',
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </button>
                    ))}
                  </div>
                  <InputBlock
                    label="Polymarket wallet"
                    value={unsignedExternalAddress}
                    onChange={value => {
                      setUnsignedExternalAddress(value)
                      setUnsignedExternalResult(null)
                      setUnsignedExternalValue(null)
                      setUnsignedExternalPositions([])
                    }}
                    placeholder="0x... wallet to fund"
                  />

                  {unsignedExternalTab === 'balance' && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/[0.04]">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Portfolio value</p>
                          <p className="mt-1 text-base font-semibold tabular-nums text-gray-900 dark:text-white">
                            {unsignedExternalLoading ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : formatUsd(unsignedExternalValue?.value)}
                          </p>
                        </div>
                        <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/[0.04]">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Open positions</p>
                          <p className="mt-1 text-base font-semibold tabular-nums text-gray-900 dark:text-white">
                            {unsignedExternalLoading ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : unsignedExternalPositions.filter(isActiveOpenPosition).length}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={loadUnsignedExternalBalance}
                        disabled={unsignedExternalLoading || !/^0x[a-fA-F0-9]{40}$/.test(unsignedExternalAddress.trim())}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                      >
                        {unsignedExternalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        Check account
                      </button>
                    </div>
                  )}

                  {unsignedExternalTab === 'fund' && (
                    <div className="space-y-3">
                      <InputBlock
                        label="Amount USDC"
                        value={unsignedExternalAmount}
                        onChange={value => {
                          setUnsignedExternalAmount(value)
                          setUnsignedExternalResult(null)
                        }}
                        placeholder="0.00"
                        inputMode="decimal"
                      />
                      <div className="grid grid-cols-3 gap-1.5">
                        {polymarketBridgeNetworks.map(network => (
                          <button
                            key={network.key}
                            type="button"
                            onClick={() => {
                              if (network.key === 'base' || network.key === 'arbitrum' || network.key === 'solana') {
                                setUnsignedExternalNetwork(network.key)
                                setUnsignedExternalResult(null)
                              }
                            }}
                            className={cn(
                              'rounded-lg border px-2 py-2 text-[11px] font-bold transition-all',
                              unsignedExternalNetwork === network.key
                                ? 'border-gray-950 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950'
                                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400 dark:hover:border-white/20 dark:hover:text-gray-200',
                            )}
                          >
                            {network.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                        {unsignedExternalNetwork === 'solana'
                          ? 'Solana checkout creates an SVM deposit address that credits the 0x Polymarket wallet above.'
                          : `${requestNetworkLabels[unsignedExternalNetwork]} checkout creates an EVM deposit address that credits the 0x Polymarket wallet above.`}
                      </p>
                      {!unsignedExternalResult ? (
                        <button
                          type="button"
                          onClick={prepareUnsignedExternalFunding}
                          disabled={unsignedExternalBusy || !/^0x[a-fA-F0-9]{40}$/.test(unsignedExternalAddress.trim())}
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                        >
                          {unsignedExternalBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                          Prepare checkout
                        </button>
                      ) : (
                        <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                          <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                            Checkout is ready on {requestNetworkLabels[unsignedExternalResult.network]}.
                          </p>
                          <a
                            href={unsignedExternalResult.payUrl}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                          >
                            <ExternalLink className="h-4 w-4" /> Open checkout
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                  {unsignedExternalError && <p className="text-xs text-red-500 dark:text-red-300">{unsignedExternalError}</p>}
                </div>
              )}
          </div>
        )}
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
  if (!unsignedPortfolioAction) {
    const portfolioActions = [
      ['watch', 'Watch Polymarket account', watchedAddress ? `Watching ${shortHex(watchedAddress)}` : 'Read-only alerts for any public profile.'],
      ['trading', 'Trading wallet', savedTradingAddress ? `Trading with ${shortHex(savedTradingAddress)}` : 'Connect and persist the wallet used for trades.'],
      ['external', 'External funding', 'Send funds to another Polymarket wallet.'],
    ] as const
    return (
      <div className="mt-4 space-y-3">
        <PolyDeskBackButton onClick={onBack} />
        <div className="space-y-2">
          {portfolioActions.map(([key, label, body]) => (
            <PolyDeskMenuCard key={key} title={label} body={body} onClick={() => setUnsignedPortfolioAction(key)} />
          ))}
        </div>
      </div>
    )
  }

  if (unsignedPortfolioAction === 'external') {
    const externalOpenPositions = unsignedExternalPositions.filter(isActiveOpenPosition)
    const externalWalletValid = /^0x[a-fA-F0-9]{40}$/.test(unsignedExternalAddress.trim())
    return (
      <div className="mt-4 space-y-3">
        <PolyDeskBackButton onClick={() => setUnsignedPortfolioAction(null)} />
        <div className="rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#0f1014]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">External account</p>
            <h2 className="mt-1 text-base font-semibold tracking-tight text-gray-900 dark:text-white">Fund a Polymarket wallet</h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              Enter the recipient 0x wallet from the Polymarket account you want to fund. PolyDesk can check public activity, but it cannot verify ownership.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-[#17181d]">
            {[
              { key: 'balance', label: 'Balance', icon: Activity },
              { key: 'fund', label: 'Fund', icon: Download },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setUnsignedExternalTab(key as typeof unsignedExternalTab)}
                className={cn(
                  'flex min-h-[46px] flex-col items-center justify-center gap-1 rounded-lg border px-1.5 text-[10px] font-bold transition-all',
                  unsignedExternalTab === key
                    ? 'border-gray-300 bg-gray-100 text-gray-950 shadow-sm dark:border-white/15 dark:bg-white/[0.12] dark:text-white'
                    : 'border-transparent bg-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          <div className="mt-3 space-y-3">
            <InputBlock
              label="Polymarket wallet"
              value={unsignedExternalAddress}
              onChange={value => {
                setUnsignedExternalAddress(value)
                setUnsignedExternalResult(null)
                setUnsignedExternalValue(null)
                setUnsignedExternalPositions([])
              }}
              placeholder="0x... wallet to fund"
            />

            {unsignedExternalTab === 'balance' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/[0.04]">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Portfolio value</p>
                    <p className="mt-1 text-base font-semibold tabular-nums text-gray-900 dark:text-white">
                      {unsignedExternalLoading ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : formatUsd(unsignedExternalValue?.value)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/[0.04]">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Open positions</p>
                    <p className="mt-1 text-base font-semibold tabular-nums text-gray-900 dark:text-white">
                      {unsignedExternalLoading ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : externalOpenPositions.length}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={loadUnsignedExternalBalance}
                  disabled={unsignedExternalLoading || !externalWalletValid}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                >
                  {unsignedExternalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Check account
                </button>
              </div>
            )}

            {unsignedExternalTab === 'fund' && (
              <div className="space-y-3">
                <InputBlock
                  label="Amount USDC"
                  value={unsignedExternalAmount}
                  onChange={value => {
                    setUnsignedExternalAmount(value)
                    setUnsignedExternalResult(null)
                  }}
                  placeholder="0.00"
                  inputMode="decimal"
                />
                <div className="grid grid-cols-3 gap-1.5">
                  {polymarketBridgeNetworks.map(network => (
                    <button
                      key={network.key}
                      type="button"
                      onClick={() => {
                        if (network.key === 'base' || network.key === 'arbitrum' || network.key === 'solana') {
                          setUnsignedExternalNetwork(network.key)
                          setUnsignedExternalResult(null)
                        }
                      }}
                      className={cn(
                        'rounded-lg border px-2 py-2 text-[11px] font-bold transition-all',
                        unsignedExternalNetwork === network.key
                          ? 'border-gray-950 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950'
                          : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400 dark:hover:border-white/20 dark:hover:text-gray-200',
                      )}
                    >
                      {network.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  {unsignedExternalNetwork === 'solana'
                    ? 'Solana checkout creates an SVM deposit address that credits the 0x Polymarket wallet above.'
                    : `${requestNetworkLabels[unsignedExternalNetwork]} checkout creates an EVM deposit address that credits the 0x Polymarket wallet above.`}
                </p>
                {!unsignedExternalResult ? (
                  <button
                    type="button"
                    onClick={prepareUnsignedExternalFunding}
                    disabled={unsignedExternalBusy || !externalWalletValid}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                  >
                    {unsignedExternalBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    Prepare checkout
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-300">Checkout ready</p>
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Min {unsignedExternalResult.minimumUsdc} USDC</p>
                      </div>
                      <p className="mt-2 break-all font-mono text-xs text-gray-700 dark:text-gray-200">{unsignedExternalResult.depositAddress}</p>
                    </div>
                    <a href={unsignedExternalResult.payUrl} className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200">
                      <ExternalLink className="h-4 w-4" /> Open checkout
                    </a>
                  </div>
                )}
              </div>
            )}

            {unsignedExternalError && <p className="text-xs text-red-500 dark:text-red-300">{unsignedExternalError}</p>}
          </div>
        </div>
      </div>
    )
  }

  if (!watchedAddress && unsignedPortfolioAction === 'watch') {
    return (
      <div className="mt-4">
        <PolyDeskBackButton onClick={() => setUnsignedPortfolioAction(null)} />
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
            <img src={POLYMARKET_LOGO} alt="" className="h-4 w-4 invert dark:invert-0" />
          </span>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">PolyDesk</p>
        </div>
        <h2 className="mt-2 text-lg font-semibold tracking-tight text-gray-900 dark:text-white">Watch a public Polymarket account</h2>
        <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          Paste the public 0x address from a Polymarket account panel. PolyDesk uses it to show positions, claimables, and alerts. It does not give PolyDesk control of that account.
        </p>
        <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-800 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-100">
          Public profile tracking is separate from Main Wallet. PolyDesk only reads this address for positions and alerts.
        </div>
        <div className="mt-4 space-y-3">
          <InputBlock
            label="Watched account address"
            value={addressInput}
            onChange={setAddressInput}
            placeholder="0x... public profile address"
          />
          {profileError && <p className="text-xs text-red-500 dark:text-red-300">{profileError}</p>}
          {bundleError && <p className="text-xs text-red-500 dark:text-red-300">{bundleError}</p>}
          <button
            type="button"
            onClick={saveProfile}
            disabled={savingProfile}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
          >
            {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Save watched account
          </button>
        </div>
      </div>
    )
  }

  if (!profile && unsignedPortfolioAction === 'trading') {
    return (
      <div className="mt-4 space-y-3">
        <PolyDeskBackButton onClick={() => setUnsignedPortfolioAction(null)} />
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111216]">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Balance</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-gray-900 dark:text-white">Main Wallet</h2>
          <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            {mainWalletCopy}
          </p>
          <div className="mt-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0f1014]">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">pUSD trading cash</p>
            <p className="mt-1 text-2xl font-black tracking-tight text-gray-950 dark:text-white">$0</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Connect to load live Polymarket balances.</p>
          </div>
          <div className="mt-3">
            {!authenticated ? (
              <>
                <PrivyConnectButton
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                >
                  <Wallet className="h-4 w-4" />
                  Connect wallet
                </PrivyConnectButton>
                <p className="mt-2 text-center text-xs font-medium text-gray-400 dark:text-gray-500">Email or wallet</p>
              </>
            ) : signingWalletAddress ? (
              <button
                type="button"
                onClick={async () => {
                  const saved = await saveProfile(signingWalletAddress)
                  if (saved?.profile?.tradingAddress) void activatePolymarketWallet(saved.profile.tradingAddress)
                }}
                disabled={savingProfile || depositWalletBusy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
              >
                {savingProfile || depositWalletBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Open Main Wallet
              </button>
            ) : (
              <>
                <PrivyWalletConnectButton className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200">
                  <Wallet className="h-4 w-4" />
                  Attach wallet
                </PrivyWalletConnectButton>
                <p className="mt-2 text-center text-xs font-medium text-gray-400 dark:text-gray-500">Privy session active</p>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  const totalValue = liveValue?.value
  const unreadAlerts = bundle?.alerts.filter(a => !a.readAt) ?? []
  const uniqueUnreadAlerts = Array.from(
    new Map(unreadAlerts.map(alert => [`${alert.alertType}:${alert.title}:${alert.body ?? ''}`, alert])).values(),
  )
  const visibleAlerts = uniqueUnreadAlerts.slice(0, 4)
  const hiddenAlertCount = Math.max(0, uniqueUnreadAlerts.length - visibleAlerts.length)
  const latestFunding = bundle?.fundingAttempts?.[0] ?? null

  return (
    <div className="mt-4 space-y-4">
      <PolyDeskBackButton onClick={onBack} />

      {/* Watched account card */}
      {unsignedPortfolioAction === 'watch' && (
      <div
        className="rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#0f1014]"
        data-polydesk-surface={surface}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
                <img src={POLYMARKET_LOGO} alt="" className="h-4 w-4 invert dark:invert-0" />
              </span>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Read-only profile</p>
            </div>
            <p className="mt-1.5 text-xs leading-snug text-gray-500 dark:text-gray-400">
              Track a public Polymarket profile without signing trades.
            </p>
            <button
              type="button"
              onClick={copyAddress}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-100 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08]"
            >
              <span className="font-mono tabular-nums">{shortHex(watchedAddress)}</span>
              {addressCopied ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 opacity-60" />}
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => watchedAddress && void fetchLiveData(watchedAddress)}
              disabled={liveLoading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/[0.04]"
              aria-label="Refresh"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', liveLoading && 'animate-spin')} />
            </button>
            <button
              type="button"
              onClick={disconnectProfile}
              disabled={savingProfile}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/[0.04]"
              aria-label="Disconnect"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-[#17181d]">
          {[
            { key: 'balance', label: 'Balance', icon: Activity },
            { key: 'positions', label: 'Positions', icon: LineChart },
            { key: 'alerts', label: 'Alerts', icon: Bell },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setWatchAccountTab(key as typeof watchAccountTab)}
              className={cn(
                'flex min-h-[46px] flex-col items-center justify-center gap-1 rounded-lg border px-1.5 text-[10px] font-bold transition-all',
                watchAccountTab === key
                  ? 'border-gray-300 bg-gray-100 text-gray-950 shadow-sm dark:border-white/15 dark:bg-white/[0.12] dark:text-white'
                  : 'border-transparent bg-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {watchAccountTab === 'balance' && (
        <div className="mt-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/[0.04]">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Position value</p>
            <p className="mt-1 text-base font-semibold tabular-nums text-gray-900 dark:text-white">
              {liveLoading ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : formatUsd(totalValue)}
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/[0.04]">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Open positions</p>
            <p className="mt-1 text-base font-semibold tabular-nums text-gray-900 dark:text-white">
              {liveLoading ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : activeOpenPositions.length}
            </p>
          </div>
        </div>
        </div>
        )}

        {liveError && <p className="mt-2 text-xs text-red-500 dark:text-red-300">{liveError}</p>}
      </div>
      )}

      {/* Main wallet card */}
      {unsignedPortfolioAction === 'trading' && (
      <div className="rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#0f1014]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Balance</p>
          <div className="mt-1 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">Main Wallet</h2>
              <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                {mainWalletCopy}
              </p>
            </div>
            {signingWalletAddress && (
              <PrivyDisconnectButton
                title="Sign out wallet"
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/[0.04]"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </PrivyDisconnectButton>
            )}
          </div>
        </div>

        {!savedTradingAddress && (
          <div className="mt-3 rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Open Main Wallet</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Save the wallet that will fund and prepare PolyDesk trades.
            </p>
            <div className="mt-3">
              {!authenticated ? (
                <PrivyConnectButton
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                >
                  <Wallet className="h-4 w-4" />
                  Connect wallet
                </PrivyConnectButton>
              ) : signingWalletAddress ? (
                <button
                  type="button"
                  onClick={async () => {
                    const saved = await saveProfile(signingWalletAddress)
                    if (saved?.profile?.tradingAddress) void activatePolymarketWallet(saved.profile.tradingAddress)
                  }}
                  disabled={savingProfile || depositWalletBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                >
                  {savingProfile || depositWalletBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Open Main Wallet
                </button>
              ) : (
                <>
                  <PrivyWalletConnectButton className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200">
                    <Wallet className="h-4 w-4" />
                    Attach wallet
                  </PrivyWalletConnectButton>
                  <p className="mt-2 text-center text-xs font-medium text-gray-400 dark:text-gray-500">Privy session active</p>
                </>
              )}
            </div>
            {profileError && <p className="mt-2 text-xs text-red-500 dark:text-red-300">{profileError}</p>}
          </div>
        )}

        {savedTradingAddress && (
          <div className="mt-3 grid gap-2 rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Owner wallet</p>
                <p className="mt-1 font-mono text-xs font-semibold text-gray-800 dark:text-gray-100">{shortHex(savedTradingAddress)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void disconnectTradingProfile()}
                  disabled={savingProfile}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08]"
                >
                  {savingProfile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Change
                </button>
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:bg-white/[0.06] dark:text-gray-300">Signer</span>
              </div>
            </div>
            {connectedTradingWalletMismatch && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
                <p className="font-semibold">Connected Privy wallet does not match this saved Main Wallet.</p>
                <p className="mt-1 font-mono">{shortHex(signingWalletAddress)} connected</p>
                <button
                  type="button"
                  onClick={() => void useConnectedTradingWallet()}
                  disabled={savingProfile || depositWalletBusy}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-950 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-amber-900 disabled:opacity-50 dark:bg-amber-200 dark:text-amber-950 dark:hover:bg-amber-100"
                >
                  {savingProfile || depositWalletBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Use connected wallet
                </button>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-2 dark:border-white/10">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Polymarket wallet</p>
                <p className="mt-1 font-mono text-xs font-semibold text-gray-800 dark:text-gray-100">
                  {polymarketDepositWallet
                    ? `${shortHex(polymarketDepositWallet)}${polymarketWalletReady ? '' : ' - activating'}`
                    : depositWalletBusy ? 'Activating...' : 'Not active'}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  {polymarketWalletReady
                    ? 'Funding goes to this Polymarket deposit wallet, not the owner wallet.'
                    : 'PolyDesk is activating this Polymarket wallet automatically before funding unlocks.'}
                </p>
              </div>
              {!polymarketWalletReady && (
                <button
                  type="button"
                  onClick={() => void activatePolymarketWallet(savedTradingAddress)}
                  disabled={depositWalletBusy}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-black px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                >
                  {depositWalletBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {polymarketDepositWallet ? 'Check' : 'Activate'}
                </button>
              )}
            </div>
            {depositWalletError && <p className="text-xs text-red-500 dark:text-red-300">{depositWalletError}</p>}
            {profile?.depositWalletStatus && polymarketDepositWallet && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Status: <span className="font-semibold">{profile.depositWalletStatus}</span>
                {profile.depositWalletTxHash ? ` - ${shortHex(profile.depositWalletTxHash)}` : ''}
              </p>
            )}
          </div>
        )}

        <div className="mt-4 grid grid-cols-4 gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-[#17181d]">
          {[
            { key: 'balance', label: 'Balance', icon: Activity },
            { key: 'fund', label: 'Fund', icon: Download },
            { key: 'withdraw', label: 'Withdraw', icon: ArrowRight },
            { key: 'positions', label: 'Positions', icon: LineChart },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTradingWalletTab(key as typeof tradingWalletTab)}
              className={cn(
                'flex min-h-[46px] flex-col items-center justify-center gap-1 rounded-lg border px-1.5 text-[10px] font-bold transition-all',
                tradingWalletTab === key
                  ? 'border-gray-300 bg-gray-100 text-gray-950 shadow-sm dark:border-white/15 dark:bg-white/[0.12] dark:text-white'
                  : 'border-transparent bg-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {(tradingWalletTab === 'fund' || tradingWalletTab === 'withdraw') && (
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {polymarketBridgeNetworks.map(network => (
              <button
                key={network.key}
                type="button"
                onClick={() => {
                  if (tradingWalletTab === 'withdraw') {
                    setWithdrawNetwork(network.key as PolymarketBridgeNetwork)
                    setWithdrawResult(null)
                  } else {
                    setTradingWalletNetwork(network.key as PolymarketBridgeNetwork)
                    setFundResult(null)
                  }
                }}
                className={cn(
                  'rounded-lg border px-2 py-2 text-[11px] font-bold transition-all',
                  (tradingWalletTab === 'withdraw' ? withdrawNetwork : tradingWalletNetwork) === network.key
                    ? 'border-gray-950 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950'
                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400 dark:hover:border-white/20 dark:hover:text-gray-200',
                )}
              >
                {network.label}
              </button>
            ))}
          </div>
        )}

        {tradingWalletTab === 'balance' && (
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111216]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">pUSD trading cash</p>
                  <p className="mt-1 text-2xl font-black tracking-tight text-gray-950 dark:text-white">
                    {tradingPusdLoading ? <Loader2 className="inline h-5 w-5 animate-spin" /> : tradingPusdDisplay}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {tradingPusdError
                      ? tradingPusdError
                      : polymarketWalletReady ? 'Live pUSD balance on the Polymarket wallet.' : 'Activates after Polymarket wallet is ready.'}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111216]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Portfolio value</p>
                  <p className="mt-1 text-2xl font-black tracking-tight text-gray-950 dark:text-white">
                    {liveLoading ? <Loader2 className="inline h-5 w-5 animate-spin" /> : formatUsd(totalValue)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatUsd(activePositionValue)} active positions</p>
                  {tradingPortfolioAddress && <p className="mt-1 text-xs font-semibold text-gray-400">{shortHex(tradingPortfolioAddress)}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (tradingPortfolioAddress) void fetchLiveData(tradingPortfolioAddress)
                    if (polymarketDepositWallet) void loadTradingPusdBalance(polymarketDepositWallet)
                  }}
                  disabled={(liveLoading && tradingPusdLoading) || !tradingPortfolioAddress}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-600 transition hover:bg-gray-100 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]"
                  aria-label="Refresh PolyDesk portfolio value"
                >
                  <RefreshCw className={cn('h-4 w-4', (liveLoading || tradingPusdLoading) && 'animate-spin')} />
                </button>
              </div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111216]">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Claimable</p>
              <p className="mt-1 text-2xl font-black tracking-tight text-gray-950 dark:text-white">
                {liveLoading ? <Loader2 className="inline h-5 w-5 animate-spin" /> : formatUsd(claimableValue)}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{claimablePositions.length} redeemable position{claimablePositions.length === 1 ? '' : 's'}</p>
            </div>
          </div>
        )}

        {tradingWalletTab === 'fund' && (
          <div className="mt-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111216]">
            {!fundResult ? (
              <div className="space-y-3">
                <InputBlock
                  label="Amount USDC"
                  value={fundAmount}
                  onChange={setFundAmount}
                  placeholder="0.00"
                  inputMode="decimal"
                />
                <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  Funds are routed to your Polymarket wallet on {requestNetworkLabels[tradingWalletNetwork]}. Minimum bridge amount is 3 USDC.
                </p>
                {!polymarketWalletReady && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100">
                    Activate Polymarket Wallet before funding.
                  </p>
                )}
                {fundError && <p className="text-xs text-red-500 dark:text-red-300">{fundError}</p>}
                <button
                  type="button"
                  onClick={() => startFund()}
                  disabled={fundBusy || !polymarketWalletReady}
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
                  Send <span className="font-semibold tabular-nums">{fundAmount} USDC</span> via {requestNetworkLabels[fundResult.network]} to the bridge address.
                </p>
                <a
                  href={fundResult.payUrl}
                  className="block truncate rounded-lg bg-gray-50 px-3 py-2 font-mono text-xs text-gray-800 dark:bg-white/[0.06] dark:text-gray-200"
                  rel="noreferrer"
                >
                  {fundResult.depositAddress}
                </a>
                <a
                  href={fundResult.payUrl}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                >
                  <ExternalLink className="h-4 w-4" /> Open Hash PayLink checkout
                </a>
              </div>
            )}
          </div>
        )}

        {tradingWalletTab === 'withdraw' && (
          <div className="mt-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111216]">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Withdraw pUSD as USDC</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Polymarket trading cash is held as pUSD. PolyDesk sends pUSD from your Polymarket wallet to the official bridge route, and the destination wallet receives USDC.
            </p>
            {!withdrawResult ? (
              <div className="mt-3 space-y-3">
                <InputBlock
                  label="Amount pUSD"
                  value={withdrawAmount}
                  onChange={value => {
                    setWithdrawAmount(value)
                    setWithdrawResult(null)
                  }}
                  placeholder="0.00"
                  inputMode="decimal"
                />
                <InputBlock
                  label={`${requestNetworkLabels[withdrawNetwork]} recipient`}
                  value={withdrawRecipient}
                  onChange={value => {
                    setWithdrawRecipient(value)
                    setWithdrawResult(null)
                  }}
                  placeholder={withdrawNetwork === 'solana' ? 'Solana wallet address' : '0x... wallet address'}
                />
                {withdrawError && <p className="text-xs text-red-500 dark:text-red-300">{withdrawError}</p>}
                <button
                  type="button"
                  onClick={() => void withdrawPolymarketPusd()}
                  disabled={withdrawBusy || !polymarketWalletReady}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                >
                  {withdrawBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  Withdraw as USDC
                </button>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-300">Withdrawal submitted</p>
                <p className="text-sm text-gray-700 dark:text-gray-200">
                  Withdrawing <span className="font-semibold tabular-nums">{withdrawResult.amount} pUSD</span> to {requestNetworkLabels[withdrawResult.network]}. The recipient receives USDC after the bridge completes.
                </p>
                <p className="truncate rounded-lg bg-gray-50 px-3 py-2 font-mono text-xs text-gray-800 dark:bg-white/[0.06] dark:text-gray-200">
                  {withdrawResult.bridgeAddress}
                </p>
                {withdrawResult.status && <p className="text-xs text-gray-500 dark:text-gray-400">Relayer status: <span className="font-semibold">{withdrawResult.status}</span></p>}
                {withdrawResult.transactionHash && <p className="break-all text-[11px] text-gray-400">Tx: {withdrawResult.transactionHash}</p>}
                {withdrawResult.transactionId && !withdrawResult.transactionHash && <p className="break-all text-[11px] text-gray-400">Relayer ID: {withdrawResult.transactionId}</p>}
                {withdrawResult.note && <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">{withdrawResult.note}</p>}
                <a
                  href="https://polymarket.com"
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                >
                  <ExternalLink className="h-4 w-4" /> View Polymarket
                </a>
              </div>
            )}
          </div>
        )}

        {tradingWalletTab === 'positions' && (
          <div className="mt-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111216]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Total positions</p>
                <p className="mt-1 text-2xl font-black tracking-tight text-gray-950 dark:text-white">{livePositions.length}</p>
              </div>
              <button
                type="button"
                onClick={() => tradingPortfolioAddress && void fetchLiveData(tradingPortfolioAddress)}
                disabled={liveLoading || !tradingPortfolioAddress}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-600 transition hover:bg-gray-100 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]"
                aria-label="Refresh PolyDesk positions"
              >
                <RefreshCw className={cn('h-4 w-4', liveLoading && 'animate-spin')} />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-[#17181d]">
              {[
                { key: 'not-started', label: 'Not started' },
                { key: 'live', label: 'Live' },
                { key: 'ended', label: 'Ended' },
              ].map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setPositionStatusTab(tab.key as PolymarketPositionStatus)}
                  className={cn(
                    'min-h-[34px] rounded-lg px-2 text-[11px] font-bold transition-all',
                    positionStatusTab === tab.key
                      ? 'bg-gray-100 text-gray-950 shadow-sm dark:bg-white/[0.12] dark:text-white'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {liveLoading && livePositions.length === 0 ? (
              <div className="mt-3 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Fetching positions...
              </div>
            ) : positionsByStatus.length === 0 ? (
              <p className="mt-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">No {positionStatusTab.replace('-', ' ')} positions in this wallet.</p>
            ) : (
              <div className="mt-3 max-h-[220px] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(156,163,175,0.35)_transparent]">
                {sellNotice && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:bg-amber-400/10 dark:text-amber-200">{sellNotice}</p>}
                {sellSuccess && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">{sellSuccess}</p>}
                {positionsByStatus.slice(0, 8).map(position => {
                  const pnl = position.percentPnl
                  const claimable = isClaimablePosition(position)
                  const active = isActiveOpenPosition(position)
                  const positionKey = polymarketPositionKey(position)
                  const sellBusy = sellBusyKey === positionKey
                  const tone = typeof pnl === 'number'
                    ? pnl >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-500 dark:text-red-300'
                    : 'text-gray-400'
                  return (
                    <div key={positionKey} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{position.title ?? 'Polymarket position'}</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            {position.outcome ?? 'Position'} - {formatUsd(position.currentValue)}
                          </p>
                        </div>
                        <p className={cn('text-sm font-semibold tabular-nums', tone)}>{formatPercent(pnl)}</p>
                      </div>
                      <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                        {active && (
                          <button
                            type="button"
                            onClick={() => void sellPosition(position)}
                            disabled={Boolean(sellBusyKey) || !polymarketPositionTokenId(position)}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 hover:border-gray-300 hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-300 dark:hover:border-white/20 dark:hover:text-white"
                          >
                            {sellBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                            Sell
                          </button>
                        )}
                        {claimable && (
                          <a
                            href={polymarketEventUrl(position)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:border-emerald-300 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
                          >
                            Claim <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => setTradingWalletTab('withdraw')}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 hover:border-gray-300 hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-300 dark:hover:border-white/20 dark:hover:text-white"
                        >
                          Withdraw <ArrowRight className="h-3 w-3" />
                        </button>
                        <a
                          href={polymarketEventUrl(position)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-1.5 py-1.5 text-[11px] font-semibold text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white"
                        >
                          Open <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {!authenticated ? (
          <div className="mt-3 overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-br from-white to-gray-50 p-4 shadow-sm dark:border-white/10 dark:from-[#111216] dark:to-white/[0.04]">
            <PrivyConnectButton
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-black active:scale-[0.98] disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100"
            >
              <Wallet className="h-4 w-4" />
              Connect wallet
            </PrivyConnectButton>
            <p className="mt-2 text-center text-xs font-medium text-gray-400 dark:text-gray-500">Email or wallet</p>
          </div>
        ) : !signingWalletAddress ? (
          <div className="mt-3">
            <PrivyWalletConnectButton className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-black active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100">
              <Wallet className="h-4 w-4" />
              Attach wallet
            </PrivyWalletConnectButton>
            <p className="mt-2 text-center text-xs font-medium text-gray-400 dark:text-gray-500">Privy session active</p>
          </div>
        ) : null}

      </div>
      )}

      {/* Alerts card */}
      {unsignedPortfolioAction === 'watch' && watchAccountTab === 'alerts' && (
      <div className="rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#0f1014]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Alerts</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">
              {uniqueUnreadAlerts.length > 0 ? `${uniqueUnreadAlerts.length} active` : 'No active alerts'}
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
          <div className="mt-2.5 space-y-2.5 rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
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

        {visibleAlerts.length > 0 ? (
          <div className="mt-2.5 space-y-1.5">
            <ul className="space-y-1.5">
              {visibleAlerts.map(alert => (
              <li key={alert.id} className="flex items-start gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-1.5 dark:border-white/10 dark:bg-white/[0.04]">
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
                  {alert.body && <p className="mt-0.5 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">{alert.body}</p>}
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
            {hiddenAlertCount > 0 && (
              <p className="rounded-xl bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
                +{hiddenAlertCount} more. Open Settings to tune alerts.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            No active alerts. We watch your saved positions against your alert settings each time you open Portfolio.
          </p>
        )}
      </div>
      )}

      {/* Claimables card */}
      {unsignedPortfolioAction === 'watch' && watchAccountTab === 'alerts' && claimablePositions.length > 0 && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3.5 shadow-sm dark:border-emerald-300/20 dark:bg-emerald-400/[0.04]">
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
                    if (watchedAddress) window.setTimeout(() => void fetchLiveData(watchedAddress), 4000)
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
      {unsignedPortfolioAction === 'watch' && watchAccountTab === 'positions' && (
      <div className="rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#0f1014]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Open positions</p>
          {activeOpenPositions.length > 0 && <p className="text-xs text-gray-500 dark:text-gray-400">{activeOpenPositions.length}</p>}
        </div>
        {liveLoading && livePositions.length === 0 ? (
          <div className="mt-2.5 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Fetching positions…
          </div>
        ) : activeOpenPositions.length === 0 ? (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">No open positions on this address.</p>
        ) : (
          <ul className="mt-2.5 max-h-[220px] space-y-1.5 overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(156,163,175,0.35)_transparent]">
            {activeOpenPositions.map(position => {
              const pnl = position.percentPnl
              const tone = typeof pnl === 'number'
                ? pnl >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-500 dark:text-red-300'
                : 'text-gray-400'
              const isLoser = losers.some(p => polymarketPositionKey(p) === polymarketPositionKey(position))
              return (
                <li key={polymarketPositionKey(position)} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
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
                  <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
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
      )}
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

export function PolyWorldCupHubPanel({
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
    <div className="mt-4 space-y-4">
      <PolyDeskBackButton onClick={onBack} />
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

      <div className="space-y-2">
        <PolyDeskMenuCard
          title="World Cup markets"
          body="Live match centre with exact Polymarket fixture routing."
          onClick={onOpenScores}
        />
        <PolyDeskMenuCard
          title="World Cup news"
          body="Headlines that move Polymarket prices and LP risk."
          onClick={onOpenNews}
        />
        {hasProfile && (
          <PolyDeskMenuCard
            title="Portfolio exposure"
            body="Check watched positions and market exposure before opening a trade."
            onClick={onOpenPortfolio}
          />
        )}
      </div>
    </div>
  )
}
