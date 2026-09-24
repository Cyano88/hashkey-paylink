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
import ZeroScoutPowerBadge from './ZeroScoutPowerBadge'
import PayLinkShareSheet from './PayLinkShareSheet'
import DynamicSendButton from './DynamicSendButton'
import { readPocketWallet } from '../pocket/api/pocketWalletLinkClient'
import { askPocketAgent } from '../pocket/api/pocketAgentClient'
import { pocketApiUrl } from '../pocket/lib/pocketRoutes'
import { isClearAgentHashChatCommand } from '../lib/agentHashChat'
import { circlePocketAgentHeaders, getCirclePocketBrowserSession } from '../lib/circlePocketAgentIdentity'
import {
  cleanAgentHashPaymentPurpose,
  extractAgentHashRememberedName,
  extractNairaPaymentAmount,
  extractPaymentAmount,
  extractPosSettlementChoice,
  extractPosTerminalName,
  inferPaymentCreationLane,
  isNewPaymentFlowIntent,
  isOutboundTransferIntent,
  isPaymentCreationConfirmIntent,
  isPaymentFlowCancelIntent,
  isPaymentRequestIntent,
  isSavedWalletChoiceIntent,
  isStandalonePaymentPurposeReply,
  type PaymentCreationLane,
} from '../lib/agentHashPaymentParser'

const PUBLIC_PAYLINK_ORIGIN = (import.meta.env.VITE_PUBLIC_PAYLINK_ORIGIN || 'https://hashpaylink.com').replace(/\/+$/, '')

const HELPER_PAYMENT_REQUEST_DAILY_LIMIT = 20

export function shortAddress(value: string) {
  return value.length > 14 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value
}

export function polymarketFundingRequestId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `pmf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export type TelegramServiceId =
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

export type LpScoutMode = 'best' | 'theme' | 'market'

export type RequestMode = 'person' | 'group'

export type RequestNetwork = 'base' | 'arc' | 'solana' | 'arbitrum' | 'all'

export const requestNetworkLabels: Record<RequestNetwork, string> = {
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

export type SavedRequest = {
  id?: string
  eventId?: string
  kind?: 'payment-request' | 'polymarket-funding' | 'bank-receive'
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
  currency?: 'USDC' | 'NGN'
  recipientLabel?: string
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
  awaitingConfirmation?: boolean
  idempotencyKey?: string
}

function sameOriginHelperPath(value: string) {
  if (typeof window === 'undefined') return ''
  try {
    const url = new URL(value, window.location.origin)
    const isPocketAction = url.hostname.toLowerCase() === 'pocket.hashpaylink.com'
    return url.origin === window.location.origin || isPocketAction ? `${url.pathname}${url.search}${url.hash}` : ''
  } catch {
    return ''
  }
}

type BankPaylinkDraft = {
  target: string
  amountNgn: string
  label: string
  awaitingConfirmation?: boolean
  idempotencyKey?: string
  savedBankLabel?: string
}

type PosSettlement = 'KEEP_CRYPTO' | 'INSTANT_FIAT' | ''

type PosNetwork = Exclude<RequestNetwork, 'all'>

type PosTerminalDraft = {
  displayName: string
  settlement: PosSettlement
  network: PosNetwork | ''
  wallet: string
  offeredSavedWallet?: boolean
  awaitingConfirmation?: boolean
  idempotencyKey?: string
  destinationLabel?: string
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

type HelperMode = 'circle-pocket' | 'daily' | 'services' | 'polydesk' | 'support'

export type PolyDeskSubMode = 'portfolio' | 'worldcup' | 'lp-scout'

type HelperThinkingState = 'light' | 'payment-draft' | 'payment-wallet' | 'paylink-build' | 'deep-research' | 'proof'

type HelperMessage = {
  id?: string
  question?: string
  answer?: string
  acceptedModeLabel?: string
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

function extractAmount(text: string) {
  return extractPaymentAmount(text)
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
  return cleanAgentHashPaymentPurpose(value)
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

const helperModes: Array<{ id: HelperMode; label: string; intro: string; available?: boolean }> = [
  {
    id: 'circle-pocket',
    label: 'Pocket Support',
    intro: 'I can help with Pocket balances, sending and receiving USDC, payment requests, bank payouts, Retail POS, bills, activity, receipts, and account support. What do you want to do?',
  },
  {
    id: 'daily',
    label: 'Daily Companion',
    intro: 'Daily Companion is ready. Ask questions, explore ideas, plan your day, or talk through whatever is on your mind.',
    available: false,
  },
  {
    id: 'services',
    label: 'Hash PayLink',
    intro: 'Hash PayLink is ready. Ask about payment links, hosted checkout, integrations, receipts, and developer support.',
  },
  {
    id: 'polydesk',
    label: 'PolyDesk',
    intro: 'PolyDesk is ready. Choose Portfolio, World Cup, or LP Scout so I can use the right Polymarket flow.',
    available: false,
  },
  {
    id: 'support',
    label: 'Support',
    intro: "Tell me what is stuck, confusing, or not working, and I'll help you fix it step by step.",
    available: false,
  },
]

const polyDeskSubModes: Array<{ id: PolyDeskSubMode; label: string; intro: string; icon: typeof Wallet }> = [
  {
    id: 'portfolio',
    label: 'Portfolio',
    intro: 'I can check saved profile setup, portfolio value, open positions, claimables, alerts, and funding.',
    icon: Wallet,
  },
  {
    id: 'worldcup',
    label: 'World Cup',
    intro: 'I can read live score feeds, fixture context, market routes, and latest World Cup news.',
    icon: Radio,
  },
  {
    id: 'lp-scout',
    label: 'LP Scout',
    intro: 'I can help you choose paid LP Scout access through x402 or a normal USDC access payment.',
    icon: LineChart,
  },
]

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
  const match = clean.match(/\b(?:change|update|correct|set)?\s*(?:purpose|memo|reason|note|description|reference)\s*(?:for\s+(?:the\s+)?(?:payment|paylink|request)\s*)?(?:to|is|=|:)?\s*(?:for\s+)?([^?.!,;]+)/i)?.[1]?.trim()
    ?? clean.match(/\b(?:this|it|that)(?:'s|\s+is)\s+for\s+([^?.!,;]+)/i)?.[1]?.trim()
    ?? clean.match(/\b(?:for|towards?|to\s+cover|covering)\s+([^?.!,;]+)/i)?.[1]?.trim()
    ?? ''
  if (!match) return ''
  return cleanPaymentPurpose(match)
}

function isExplicitDraftCorrection(text: string) {
  return /\b(change|update|edit|correct|set|replace|switch)\s+(?:the\s+)?(?:payer|payer name|purpose|memo|reason|amount|network|chain|wallet|address|receive wallet|receive address)\b|\b(?:payer|purpose|memo|reason|amount|network|chain|wallet|address|receive wallet|receive address)\s*(?:to|is|=|:)\b/i.test(text)
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
  return isSavedWalletChoiceIntent(text)
}

type PocketSupportCase = {
  id: string
  status: 'open' | 'assigned' | 'waiting_user' | 'resolved'
  customer?: { fullName: string; email: string; pocketId: string }
  messages: Array<{ id: string; author: 'user' | 'agent' | 'staff'; kind?: 'automatic_reminder' | 'automatic_resolution' | 'transaction_report'; text: string; createdAt: number }>
  unreadCount?: number
}

async function readPocketSupportResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(response.status >= 500
      ? 'Pocket Support is reconnecting. Please try again in a moment.'
      : 'Pocket Support returned an unexpected response. Please try again.')
  }
  try {
    return await response.json() as T
  } catch {
    throw new Error('Pocket Support returned an incomplete response. Please try again.')
  }
}

function wantsNewWallet(text: string) {
  const normalized = text.trim().toLowerCase().replace(/[.!?]+$/g, '')
  if (/^(use\s+)?(?:a\s+)?(?:new|another|different)(?:\s+(?:wallet|account|address|one))?$/.test(normalized)) return true
  return /\b(?:use|add|send|provide|choose|switch\s+to|continue\s+with)\s+(?:a\s+)?(?:new|another|different)\s+(?:receive\s+)?(?:wallet|account|address)\b/i.test(text)
    || /\b(?:new|another|different)\s+(?:receive\s+)?(?:wallet|account|address)\b/i.test(text)
}

function extractNairaAmount(text: string) {
  return extractNairaPaymentAmount(text)
}

function bankPaylinkMissingFields(draft: BankPaylinkDraft) {
  return [
    !draft.target && 'payer name',
    !draft.amountNgn && 'amount in Naira',
    !draft.label && 'purpose',
  ].filter(Boolean) as string[]
}

function buildBankPaylinkDraft(text: string, existing?: BankPaylinkDraft | null): BankPaylinkDraft {
  const targetFromText = extractTarget(text, 'person') || (!existing?.target ? extractInlinePayerName(text, 'person') : '')
  const target = targetFromText || existing?.target || ''
  const amountNgn = extractNairaAmount(text) || existing?.amountNgn || ''
  let label = extractPurpose(text) || existing?.label || ''
  if (existing && !existing.label && !extractNairaAmount(text) && !targetFromText && !inferPaymentCreationLane(text)) {
    label = cleanPaymentPurpose(text)
  }
  return { ...existing, target, amountNgn, label }
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
    !draft.amount && 'amount in USDC',
    !draft.label && 'purpose',
    !draft.network && 'network',
    !draft.wallet && !savedWallet && 'receive wallet',
  ].filter(Boolean)
  return missing as string[]
}

function isSignedInStatusMessage(text: string) {
  return /\b(i am|i'm|im|already|currently)\s+(?:signed|logged)\s+in\b|\bmy account is (?:signed|logged) in\b/i.test(text)
}

function pocketSupportEscalation(text: string) {
  const value = text.toLowerCase()
  if (/\b(change|correct|update|unlock)\b.*\b(bank|verified)\b.*\b(name|identity)\b|\b(bank|verified)\b.*\b(name|identity)\b.*\b(change|wrong|incorrect)\b/.test(value)) return { category: 'bank_identity', priority: 'high' } as const
  if (/\b(bank payment|bank payout|bank transfer|withdrawal|settlement)\b.*\b(stuck|pending|missing|failed|not received|taking too long)\b|\b(stuck|pending|missing|failed)\b.*\b(bank payment|bank payout|bank transfer|withdrawal|settlement)\b/.test(value)) return { category: 'bank_payment', priority: 'high' } as const
  if (/\b(transaction|payment|transfer|receipt)\b.*\b(stuck|pending|missing|failed|not showing|not received)\b|\b(stuck|pending|missing|failed)\b.*\b(transaction|payment|transfer|receipt)\b/.test(value)) return { category: 'stuck_transaction', priority: 'high' } as const
  if (/\b(human|human support|support agent|talk to someone|speak to someone|contact support)\b/.test(value)) return { category: 'other', priority: 'normal' } as const
  return null
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

export function friendlyName(value: string) {
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

export function usableHelperName(value: string) {
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
  return /\b(what'?s|what is|tell me)\s+my\s+name\b|\bdo you (?:still )?(?:know|remember) my name\b|\b(?:can|will) you remember my name\b|\bwho am i\b|\bwhat do you call me\b/i.test(text)
}

function extractRememberedName(text: string) {
  return usableHelperName(extractAgentHashRememberedName(text))
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
  initialSupportCaseId = '',
  onRecoverTelegramName,
  onBack,
  lockedHelperMode = '',
  welcomeText,
  inputPlaceholder,
  polyDeskResetSignal = 0,
  helperBackSignal = 0,
  onPolyDeskSubModeChange,
  fillAvailableHeight = false,
  onComposerFocusChange,
}: {
  telegramName: string
  ownerKey: string
  telegramId: string
  fallbackOwner: string
  initialEventId: string
  initialPayer: string
  initialHelperMode?: HelperMode | ''
  initialPolyDeskSubMode?: PolyDeskSubMode | ''
  initialSupportCaseId?: string
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
  fillAvailableHeight?: boolean
  onComposerFocusChange?: (focused: boolean) => void
}) {
  const navigate = useNavigate()
  const browserProfileSession = useMemo(() => getCirclePocketBrowserSession(), [])
  const cleanTelegramName = telegramName === 'there' ? '' : telegramName
  const helperSessionKeyBase = (ownerKey || telegramId || initialPayer || cleanTelegramName || 'local-helper').trim().toLowerCase()
  const helperModeStorageKey = `hashpaylink-helper-active-mode:${helperSessionKeyBase}`
  const paymentDraftStorageKey = `${helperModeStorageKey}:circle-pocket-payment-draft`
  const storedHelperMode = (() => {
    if (lockedHelperMode) return lockedHelperMode
    if (initialHelperMode) return initialHelperMode
    const stored = window.localStorage.getItem(helperModeStorageKey)
    const saved = stored === 'payments' ? 'circle-pocket' : stored
    return helperModes.some(mode => mode.id === saved && mode.available !== false) ? saved as HelperMode : ''
  })()
  const storedPolyDeskSubMode = (() => {
    if (initialPolyDeskSubMode) return initialPolyDeskSubMode
    if (lockedHelperMode === 'polydesk') return ''
    if (storedHelperMode !== 'polydesk') return ''
    const saved = window.localStorage.getItem(`${helperModeStorageKey}:polydesk`)
    return polyDeskSubModes.some(mode => mode.id === saved) ? saved as PolyDeskSubMode : ''
  })()
  const storedPaymentConversation = (() => {
    try {
      const parsed = JSON.parse(window.sessionStorage.getItem(paymentDraftStorageKey) || 'null') as {
        paylinkDraft?: HelperPaylinkDraft | null
        bankPaylinkDraft?: BankPaylinkDraft | null
        posTerminalDraft?: PosTerminalDraft | null
        paymentLanePromptPending?: boolean
        pendingPaymentRequestText?: string
      } | null
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      window.sessionStorage.removeItem(paymentDraftStorageKey)
      return null
    }
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
      actionLink: { label: 'Portfolio', url: '/polydesk?service=portfolio' },
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
  const [profile, setProfile] = useState<HelperProfile | null>(null)
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [memoryDraft, setMemoryDraft] = useState('')
  const [paylinkDraft, setPaylinkDraft] = useState<HelperPaylinkDraft | null>(() => storedPaymentConversation?.paylinkDraft ?? null)
  const [lastPaylinkDraft, setLastPaylinkDraft] = useState<HelperPaylinkDraft | null>(null)
  const [paymentLanePromptPending, setPaymentLanePromptPending] = useState(() => Boolean(storedPaymentConversation?.paymentLanePromptPending))
  const [pendingPaymentRequestText, setPendingPaymentRequestText] = useState(() => String(storedPaymentConversation?.pendingPaymentRequestText ?? '').slice(0, 500))
  const [bankPaylinkDraft, setBankPaylinkDraft] = useState<BankPaylinkDraft | null>(() => storedPaymentConversation?.bankPaylinkDraft ?? null)
  const [posTerminalDraft, setPosTerminalDraft] = useState<PosTerminalDraft | null>(() => storedPaymentConversation?.posTerminalDraft ?? null)
  const [polyPortfolioFundingDraft, setPolyPortfolioFundingDraft] = useState<PolyPortfolioFundingDraft | null>(null)
  const [checkpointBusy, setCheckpointBusy] = useState(false)
  const [supportReplyCaseId, setSupportReplyCaseId] = useState('')
  const [humanSupportOpen, setHumanSupportOpen] = useState(Boolean(initialSupportCaseId))
  const [humanSupportMessages, setHumanSupportMessages] = useState<HelperMessage[]>([])
  const [supportUnreadCount, setSupportUnreadCount] = useState(0)
  const [humanSupportBusy, setHumanSupportBusy] = useState(false)
  const helperScrollRef = useRef<HTMLDivElement | null>(null)
  const helperAbortRef = useRef<AbortController | null>(null)
  const initialRouteAppliedRef = useRef(Boolean(initialNotice || initialHelperMode || initialPolyDeskSubMode))
  const helperFirstScrollRef = useRef(true)
  const helperIdentityResetMountedRef = useRef(false)
  const suppressThreadHydrationRef = useRef(false)
  const freshThreadIdsRef = useRef<Set<string>>(new Set())
  const helperIdentityKey = (ownerKey || telegramId || payer || cleanTelegramName || 'local-helper').trim().toLowerCase()
  const agentRequestPayer = payer.trim() || helperName || cleanTelegramName || ownerKey || fallbackOwner || 'anonymous-helper'
  const activeHelperThreadId = `mode:${helperMode || 'general'}${helperMode === 'polydesk' && polyDeskSubMode ? `:${polyDeskSubMode}` : ''}`
  const { ready: helperAuthReady, authenticated: helperAuthenticated, getAccessToken: getHelperAccessToken } = usePrivy()

  async function helperProfileHeaders(includeJson = false) {
    return circlePocketAgentHeaders({
      authenticated: helperAuthenticated,
      getAccessToken: getHelperAccessToken,
      json: includeJson,
    })
  }

  useEffect(() => {
    if (lockedHelperMode && helperMode !== lockedHelperMode) {
      setHelperMode(lockedHelperMode)
    }
  }, [helperMode, lockedHelperMode])

  useEffect(() => {
    if (!paylinkDraft && !bankPaylinkDraft && !posTerminalDraft && !paymentLanePromptPending) {
      window.sessionStorage.removeItem(paymentDraftStorageKey)
      return
    }
    window.sessionStorage.setItem(paymentDraftStorageKey, JSON.stringify({
      paylinkDraft,
      bankPaylinkDraft,
      posTerminalDraft,
      paymentLanePromptPending,
      pendingPaymentRequestText,
    }))
  }, [bankPaylinkDraft, paylinkDraft, paymentDraftStorageKey, paymentLanePromptPending, pendingPaymentRequestText, posTerminalDraft])

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

  useLayoutEffect(() => {
    if (!fillAvailableHeight) return
    const node = helperScrollRef.current
    if (!node) return

    let frame = 0
    const anchorToLatest = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        node.scrollTop = node.scrollHeight
      })
    }
    anchorToLatest()
    const observer = new ResizeObserver(anchorToLatest)
    observer.observe(node)
    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
    }
  }, [fillAvailableHeight])

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
    if (!helperIdentityResetMountedRef.current) {
      helperIdentityResetMountedRef.current = true
      return
    }
    if (initialRouteAppliedRef.current) {
      initialRouteAppliedRef.current = false
      return
    }
    setMessages([])
    setPaylinkDraft(null)
    setBankPaylinkDraft(null)
    setPosTerminalDraft(null)
    setPaymentLanePromptPending(false)
    setPendingPaymentRequestText('')
    setPolyPortfolioFundingDraft(null)
    setHelperMode('')
    setPolyDeskSubMode('')
    setAskError('')
  }, [eventId, payer])

  useEffect(() => {
    if (!helperAuthReady) return
    let cancelled = false
    setProfileBusy(true)
    setProfileError('')
    const profileParams = new URLSearchParams()
    if (helperMode) profileParams.set('threadId', activeHelperThreadId)
    helperProfileHeaders()
      .then(headers => fetch(`/api/helper-profile?${profileParams.toString()}`, { headers }))
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
  }, [activeHelperThreadId, helperAuthReady, helperAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (lockedHelperMode !== 'circle-pocket' || !helperAuthReady || !helperAuthenticated) return
    let cancelled = false
    const syncSupport = async () => {
      try {
        const response = await fetch(pocketApiUrl('/api/pocket/support/cases?action=list-mine'), {
          cache: 'no-store', headers: await helperProfileHeaders(),
        })
        const data = await readPocketSupportResponse<{ ok?: boolean; cases?: PocketSupportCase[] }>(response)
        if (cancelled || !response.ok || !data.ok) return
        const rows = data.cases || []
        const active = initialSupportCaseId ? rows.find(item=>item.id===initialSupportCaseId) : rows.find(item => item.status !== 'resolved') || rows[0]
        setSupportReplyCaseId(active?.id || '')
        const unreadCount = rows.reduce((total, item) => total + Number(item.unreadCount || 0), 0)
        setSupportUnreadCount(humanSupportOpen ? 0 : unreadCount)
        if (humanSupportOpen && active) {
          setHumanSupportMessages(active.messages
            .filter(message => message.author === 'user' || message.author === 'staff' || message.kind)
            .map(message => message.author === 'user'
              ? { id: `support-${message.id}`, question: message.text }
              : { id: `support-${message.id}`, answer: message.text }))
          if (Number(active.unreadCount || 0) > 0) {
            await markPocketSupportRead(active.id).catch(() => undefined)
          }
        }
      } catch { /* The next background sync retries without interrupting chat. */ }
    }
    void syncSupport()
    const timer = window.setInterval(() => void syncSupport(), 12000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [helperAuthReady, helperAuthenticated, humanSupportOpen, lockedHelperMode, initialSupportCaseId]) // eslint-disable-line react-hooks/exhaustive-deps

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
        headers: await helperProfileHeaders(true),
        body: JSON.stringify({
          action: 'append-thread',
          payer: agentRequestPayer,
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
    if (!selected || selected.available === false || asking) return
    setHelperMode(mode)
    setPolyDeskSubMode('')
    setPaylinkDraft(null)
    setBankPaylinkDraft(null)
    setPosTerminalDraft(null)
    setPaymentLanePromptPending(false)
    setPendingPaymentRequestText('')
    setPolyPortfolioFundingDraft(null)
    setQuestion('')
    setAskError('')
    suppressThreadHydrationRef.current = true
    freshThreadIdsRef.current.add(`mode:${mode}`)
    setMessages([{ question: selected.label, answer: selected.intro, acceptedModeLabel: selected.label }])
    window.setTimeout(() => {
      document.querySelector<HTMLInputElement>('[data-agent-hash-input="true"]')?.focus()
    }, 40)
  }

  function resetPolyDeskLane() {
    setPolyDeskSubMode('')
    onPolyDeskSubModeChange?.('')
    window.localStorage.removeItem(`${helperModeStorageKey}:polydesk`)
    setMessages([])
    setPaylinkDraft(null)
    setBankPaylinkDraft(null)
    setPosTerminalDraft(null)
    setPaymentLanePromptPending(false)
    setPendingPaymentRequestText('')
    setPolyPortfolioFundingDraft(null)
    setQuestion('')
    setAskError('')
  }

  async function createPocketSupportCase(nextQuestion: string, escalation: { category: string; priority: string }) {
    const transcript = messages.slice(-8).flatMap(message => [
      ...(message.question ? [{ author: 'user', text: message.question }] : []),
      ...(message.answer ? [{ author: 'agent', text: message.answer }] : []),
    ])
    const response = await fetch(pocketApiUrl('/api/pocket/support/cases'), {
      method: 'POST',
      headers: await helperProfileHeaders(true),
      body: JSON.stringify({
        action: 'create',
        category: escalation.category,
        priority: escalation.priority,
        summary: nextQuestion,
        messages: [...transcript, { author: 'user', text: nextQuestion }],
      }),
    })
    const data = await readPocketSupportResponse<{ ok?: boolean; case?: { id?: string }; error?: string }>(response)
    if (!response.ok || !data.ok || !data.case?.id) throw new Error(data.error || 'Could not open a support case.')
    return data.case.id
  }

  async function replyToPocketSupport(caseId: string, text: string) {
    const response = await fetch(pocketApiUrl('/api/pocket/support/cases'), {
      method: 'POST', headers: await helperProfileHeaders(true),
      body: JSON.stringify({ action: 'reply', caseId, message: text }),
    })
    const data = await readPocketSupportResponse<{ ok?: boolean; error?: string }>(response)
    if (!response.ok || !data.ok) throw new Error(data.error || 'Could not send your reply to Pocket Support.')
  }

  async function markPocketSupportRead(caseId: string) {
    const response = await fetch(pocketApiUrl('/api/pocket/support/cases'), {
      method: 'POST', headers: await helperProfileHeaders(true),
      body: JSON.stringify({ action: 'mark-read', caseId }),
    })
    const data = await readPocketSupportResponse<{ ok?: boolean; error?: string }>(response)
    if (!response.ok || !data.ok) throw new Error(data.error || 'Could not update support messages.')
  }

  async function startHumanSupport() {
    if (humanSupportBusy || !helperAuthReady) return
    if (!helperAuthenticated) {
      setAskError('Sign in to Pocket before starting a private human-support chat.')
      return
    }
    if (initialSupportCaseId) {
      setHumanSupportOpen(true)
      setAskError('')
      return
    }
    setHumanSupportBusy(true)
    setAskError('')
    try {
      const response = await fetch(pocketApiUrl('/api/pocket/support/cases'), {
        method: 'POST', headers: await helperProfileHeaders(true),
        body: JSON.stringify({ action: 'create', entrypoint: 'human_chat', category: 'account', priority: 'normal', summary: 'Human support requested' }),
      })
      const data = await readPocketSupportResponse<{ ok?: boolean; case?: PocketSupportCase; error?: string }>(response)
      if (!response.ok || !data.ok || !data.case?.id) throw new Error(data.error || 'Could not start human support.')
      setSupportReplyCaseId(data.case.id)
      setHumanSupportMessages(data.case.messages
        .filter(message => message.author === 'user' || message.author === 'staff' || message.kind)
        .map(message => message.author === 'user'
          ? { id: `support-${message.id}`, question: message.text }
          : { id: `support-${message.id}`, answer: message.text }))
      setHumanSupportOpen(true)
      setSupportUnreadCount(0)
      await markPocketSupportRead(data.case.id).catch(() => undefined)
    } catch (error) {
      setAskError(error instanceof Error ? error.message : 'Could not start human support.')
    } finally { setHumanSupportBusy(false) }
  }

  function resetHelperMode() {
    if (helperMode === 'polydesk' && (polyDeskSubMode || lockedHelperMode === 'polydesk')) {
      resetPolyDeskLane()
      return
    }
    if (lockedHelperMode) {
      setMessages([])
      setPaylinkDraft(null)
      setBankPaylinkDraft(null)
      setPosTerminalDraft(null)
      setPaymentLanePromptPending(false)
      setPendingPaymentRequestText('')
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
    setBankPaylinkDraft(null)
    setPosTerminalDraft(null)
    setPaymentLanePromptPending(false)
    setPendingPaymentRequestText('')
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
    setMessages([{ question: selected.label, answer: selected.intro, acceptedModeLabel: selected.label }])
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
    const cleanPayer = (payer || helperName || helperNameDraft || cleanTelegramName || extra.displayName || 'anonymous-helper').trim()
    setProfileBusy(true)
    setProfileError('')
    try {
      const res = await fetch('/api/helper-profile', {
        method: 'POST',
        headers: await helperProfileHeaders(true),
        body: JSON.stringify({
          action: 'save',
          payer: cleanPayer,
          displayName: extra.displayName ?? (helperName || helperNameDraft || cleanPayer),
          accessPayer: extra.accessPayer,
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
        headers: await helperProfileHeaders(true),
        body: JSON.stringify({
          action: 'checkpoint',
          payer: cleanPayer,
          displayName: helperName || helperNameDraft || cleanPayer,
          accessPayer: profile?.accessPayer,
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
    // Pocket already has a precise local acknowledgement; no legacy AI call is needed.
    if (helperMode === 'circle-pocket') return fallback
    try {
      const res = await fetch('/api/agent-ask', {
        method: 'POST',
        headers: await helperProfileHeaders(true),
        signal: helperAbortRef.current?.signal,
        body: JSON.stringify({
          eventId: eventId.trim(),
          payer: agentRequestPayer,
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

  async function linkedCircleReceiveWallet(network: RequestNetwork | '') {
    if (!helperAuthenticated || !network || network === 'all') return ''
    try {
      const accessToken = await getHelperAccessToken()
      if (!accessToken) return ''
      const linked = await readPocketWallet({ accessToken, network })
      return linked?.wallet.address.trim() || ''
    } catch {
      return ''
    }
  }

  async function handleCirclePocketBalanceQuestion(text: string) {
    if (!/\b(?:current\s+)?(?:circle\s+)?smart[ -]?wallet balance\b|\b(?:current\s+)?circle wallet balance\b|\b(?:check|show|what(?:'s| is))\s+my\s+(?:current\s+)?wallet balance\b/i.test(text)) return false
    if (/\b(?:x402|service balance|paid service)\b/i.test(text)) return false
    if (!helperAuthReady) {
      finishHelperMessage(text, { answer: 'I am still checking your Circle Pocket session. Ask for the balance again in a moment.' })
      return true
    }
    if (!helperAuthenticated) {
      finishHelperMessage(text, { answer: 'Sign in to Circle Pocket so I can verify and read your live USDC balance.' })
      return true
    }

    const requestedNetwork = extractNetwork(text)
    const preferredNetwork = profile?.preferredPaymentNetwork
    const network: Exclude<RequestNetwork, 'all'> = requestedNetwork && requestedNetwork !== 'all'
      ? requestedNetwork
      : preferredNetwork === 'arc' || preferredNetwork === 'solana' || preferredNetwork === 'arbitrum' || preferredNetwork === 'base'
        ? preferredNetwork
        : 'base'
    const wallet = preferredWalletFor(network) || await linkedCircleReceiveWallet(network)
    if (!wallet) {
      finishHelperMessage(text, {
        answer: `No ${requestNetworkLabels[network]} Pocket wallet is connected to this signed-in account yet. Open Pocket to create or connect it.`,
        actionLink: { label: 'Open Circle Pocket', url: '/move/usdc' },
      })
      return true
    }

    setThinkingState('payment-draft')
    setAgentStatus('Reading live wallet balance...')
    try {
      const res = await fetch(network === 'solana' ? '/api/solana-balance' : '/api/evm-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(network === 'solana'
          ? { accountAddress: wallet }
          : { chain: network, address: wallet }),
      })
      const data = await res.json() as { ok?: boolean; balance?: string; error?: string }
      if (!res.ok || !data.ok || data.balance === undefined) throw new Error(data.error || 'Balance unavailable.')
      const amount = network === 'solana'
        ? Number(BigInt(data.balance || '0')) / 1_000_000
        : Number(data.balance)
      const formatted = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 6 }).format(amount)
      finishHelperMessage(text, {
        answer: `Your ${requestNetworkLabels[network]} Pocket balance is ${formatted} USDC.`,
      })
    } catch (error) {
      finishHelperMessage(text, {
        answer: error instanceof Error && error.message
          ? error.message
          : 'I could not read the live Pocket balance right now. Try again shortly.',
      })
    }
    return true
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
    const explicitPurpose = mode === 'group'
      ? extractCollectionLabel(text) || extractPurpose(text)
      : extractPurpose(text)
    const standalonePurpose = existing && !existing.label && !explicitPurpose
      && isStandalonePaymentPurposeReply(text)
      && !extractAmount(text) && !extractNetwork(text) && !extractWallet(text)
      && !extractPayerCorrection(text) && !isPaymentRequestIntent(text)
      && !inferPaymentCreationLane(text) && !wantsSavedWallet(text) && !wantsNewWallet(text)
      && !isPaylinkDraftSideQuestion(text) && !isPaymentCreationConfirmIntent(text)
      ? cleanPaymentPurpose(text)
      : ''
    const purposeFromText = explicitPurpose || standalonePurpose
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
      awaitingConfirmation: false,
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
    const res = await fetch(pocketApiUrl('/api/pocket/paylink-requests'), {
      method: 'POST',
      headers: {
        ...await helperProfileHeaders(true),
        'Idempotency-Key': draft.idempotencyKey || window.crypto.randomUUID(),
      },
      body: JSON.stringify({ ...request, idempotencyKey: draft.idempotencyKey }),
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
    const memoryLine = `Connected payment receive wallet is ${shortAddress(savedWallet)} on ${requestNetworkLabels[network]}. Offer it for compatible PayLink requests, but confirm the user's wallet choice before creating a link.`
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

  async function savedBankReceiveProfile() {
    if (!helperAuthenticated) return null
    const res = await fetch('/api/ng-pos', {
      method: 'POST',
      headers: await helperProfileHeaders(true),
      body: JSON.stringify({ action: 'savedBankReceiveProfile' }),
    })
    const data = await res.json().catch(() => undefined) as {
      ok?: boolean
      error?: string
      profile?: { bank_name?: string; bank_last4?: string; bank_account_name?: string }
    } | undefined
    if (res.status === 404) return null
    if (!res.ok || !data?.ok || !data.profile) throw new Error(data?.error || 'Could not check your saved bank account.')
    return data.profile
  }

  async function createBankReceiveFromDraft(draft: BankPaylinkDraft) {
    const idempotencyKey = draft.idempotencyKey || window.crypto.randomUUID()
    const res = await fetch('/api/ng-pos', {
      method: 'POST',
      headers: {
        ...await helperProfileHeaders(true),
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        action: 'createBankReceive',
        display_name: draft.label,
        amount: draft.amountNgn,
        flexible_amount: false,
        use_saved_bank: true,
        client_origin: window.location.origin,
      }),
    })
    const data = await res.json().catch(() => undefined) as {
      ok?: boolean
      error?: string
      link?: { payment_url?: string; dashboard_url?: string }
    } | undefined
    if (!res.ok || !data?.ok || !data.link?.payment_url) {
      throw new Error(data?.error || 'Could not create the Receive to Bank PayLink.')
    }
    return data.link
  }

  function posTerminalNameFromText(text: string, existing?: PosTerminalDraft | null) {
    return extractPosTerminalName(text, existing?.displayName || '')
  }

  function buildPosTerminalDraft(text: string, existing?: PosTerminalDraft | null): PosTerminalDraft {
    const settlement = extractPosSettlementChoice(text) || existing?.settlement || ''
    const extractedNetwork = extractNetwork(text)
    const network = settlement === 'INSTANT_FIAT'
      ? 'base'
      : extractedNetwork && extractedNetwork !== 'all'
        ? extractedNetwork
        : existing?.network || ''
    const pastedWallet = extractWallet(text)
    const keepWallet = Boolean(existing?.wallet && (!network || walletMatchesNetwork(existing.wallet, network)))
    return {
      displayName: posTerminalNameFromText(text, existing),
      settlement,
      network,
      wallet: pastedWallet || (keepWallet ? existing?.wallet || '' : ''),
      offeredSavedWallet: existing?.offeredSavedWallet,
      awaitingConfirmation: false,
      idempotencyKey: existing?.idempotencyKey,
      destinationLabel: existing?.destinationLabel,
    }
  }

  async function createPosTerminalFromDraft(draft: PosTerminalDraft) {
    const idempotencyKey = draft.idempotencyKey || window.crypto.randomUUID()
    const res = await fetch('/api/ng-pos', {
      method: 'POST',
      headers: {
        ...await helperProfileHeaders(true),
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        action: 'createMerchant',
        display_name: draft.displayName,
        payout_preference: draft.settlement,
        supported_networks: [draft.network || 'base'],
        circle_smart_wallet_address: draft.network === 'solana' ? '' : draft.wallet,
        solana_wallet_address: draft.network === 'solana' ? draft.wallet : '',
        use_saved_bank: draft.settlement === 'INSTANT_FIAT',
      }),
    })
    const data = await res.json().catch(() => undefined) as {
      ok?: boolean
      error?: string
      merchant?: { merchant_id?: string }
    } | undefined
    if (!res.ok || !data?.ok || !data.merchant?.merchant_id) {
      throw new Error(data?.error || 'Could not create the POS terminal.')
    }
    return {
      merchantId: data.merchant.merchant_id,
      terminalUrl: `/pos/ng?merchant_id=${encodeURIComponent(data.merchant.merchant_id)}&manage=1`,
    }
  }

  async function handlePaylinkConversation(nextQuestion: string) {
    const posSettlementReply = posTerminalDraft ? extractPosSettlementChoice(nextQuestion) : ''
    const requestedLane = posTerminalDraft && posSettlementReply && !/\bpaylink|payment link|receive to bank\b/i.test(nextQuestion)
      ? 'pos'
      : inferPaymentCreationLane(nextQuestion)
    const hasOpenPaymentFlow = Boolean(paylinkDraft || bankPaylinkDraft || posTerminalDraft || paymentLanePromptPending)
    if (hasOpenPaymentFlow && (isPaymentFlowCancelIntent(nextQuestion) || isNewPaymentFlowIntent(nextQuestion))) {
      setPaylinkDraft(null)
      setBankPaylinkDraft(null)
      setPosTerminalDraft(null)
      setPaymentLanePromptPending(false)
      setPendingPaymentRequestText('')
      finishHelperMessage(nextQuestion, {
        answer: isNewPaymentFlowIntent(nextQuestion) || /start over|restart|reset/i.test(nextQuestion)
          ? 'Draft cleared. Which should I create next: a direct USDC PayLink, a Receive to Bank PayLink, or a POS contactless terminal?'
          : 'Payment draft cancelled.',
      })
      return true
    }
    if (!hasOpenPaymentFlow && isOutboundTransferIntent(nextQuestion)) {
      finishHelperMessage(nextQuestion, {
        answer: 'Are you trying to send money from your wallet, or request that person to pay you? I will not create a receive PayLink until you confirm.',
        actionLink: { label: 'Open Circle Pocket', url: '/move/usdc' },
      })
      return true
    }
    if (!hasOpenPaymentFlow && !requestedLane && !isPaymentRequestIntent(nextQuestion)) return false
    const paymentContextText = paymentLanePromptPending && pendingPaymentRequestText
      ? `${pendingPaymentRequestText} ${nextQuestion}`
      : nextQuestion

    if ((posTerminalDraft && requestedLane !== 'usdc' && requestedLane !== 'bank') || requestedLane === 'pos') {
      setPaymentLanePromptPending(false)
      setPendingPaymentRequestText('')
      setPaylinkDraft(null)
      setBankPaylinkDraft(null)
      const confirmingDraft = Boolean(posTerminalDraft?.awaitingConfirmation && isPaymentCreationConfirmIntent(nextQuestion))
      let draft = buildPosTerminalDraft(paymentContextText, posTerminalDraft)
      if (!draft.displayName) {
        setPosTerminalDraft(draft)
        finishHelperMessage(nextQuestion, { answer: 'POS selected. What should this terminal or store be called?' })
        return true
      }
      if (!draft.settlement) {
        setPosTerminalDraft(draft)
        finishHelperMessage(nextQuestion, { answer: `How should ${draft.displayName} settle: keep USDC in a wallet, or receive Naira in your verified bank account?` })
        return true
      }
      if (!helperAuthenticated) {
        setPosTerminalDraft(draft)
        finishHelperMessage(nextQuestion, {
          answer: 'Sign in first so I can securely use your connected wallet or verified bank details.',
          actionLink: { label: 'Open POS', url: '/?product=payment&tab=pos' },
        })
        return true
      }
      if (draft.settlement === 'INSTANT_FIAT') {
        let savedBank
        try {
          savedBank = await savedBankReceiveProfile()
        } catch (error) {
          setPosTerminalDraft(draft)
          finishHelperMessage(nextQuestion, { answer: error instanceof Error ? error.message : 'Could not check your saved bank account.' })
          return true
        }
        if (!savedBank) {
          setPosTerminalDraft(draft)
          finishHelperMessage(nextQuestion, {
            answer: 'No verified bank account is saved yet. Verify one first, then return to finish this terminal.',
            actionLink: { label: 'Verify bank account', url: '/?product=payment&tab=bank' },
          })
          return true
        }
        draft = {
          ...draft,
          network: 'base',
          wallet: '',
          destinationLabel: `${savedBank.bank_name || 'Verified bank'}${savedBank.bank_last4 ? ` ending ${savedBank.bank_last4}` : ''}`,
        }
      } else {
        if (!draft.network) {
          setPosTerminalDraft(draft)
          finishHelperMessage(nextQuestion, { answer: 'Which USDC network should this terminal accept: Base, Arbitrum, Arc, or Solana?' })
          return true
        }
        const posNetwork = draft.network
        if (!draft.wallet) {
          const savedWallet = preferredWalletFor(posNetwork) || await linkedCircleReceiveWallet(posNetwork)
          if (savedWallet && wantsSavedWallet(nextQuestion)) {
            draft = { ...draft, wallet: savedWallet, offeredSavedWallet: true, destinationLabel: shortAddress(savedWallet) }
          } else if (savedWallet && !draft.offeredSavedWallet && !wantsNewWallet(nextQuestion)) {
            setPosTerminalDraft({ ...draft, offeredSavedWallet: true, destinationLabel: shortAddress(savedWallet) })
            finishHelperMessage(nextQuestion, {
              answer: `Use your connected ${requestNetworkLabels[posNetwork]} wallet ${shortAddress(savedWallet)}, or use another wallet?`,
            })
            return true
          } else {
            setPosTerminalDraft({ ...draft, offeredSavedWallet: true })
            finishHelperMessage(nextQuestion, { answer: `Paste the ${requestNetworkLabels[posNetwork]} wallet that should receive this terminal's USDC.` })
            return true
          }
        }
        if (!walletMatchesNetwork(draft.wallet, posNetwork)) {
          setPosTerminalDraft({ ...draft, wallet: '' })
          finishHelperMessage(nextQuestion, { answer: `That wallet does not match ${requestNetworkLabels[posNetwork]}. Paste a compatible address or choose another network.` })
          return true
        }
        draft = { ...draft, destinationLabel: shortAddress(draft.wallet) }
      }

      if (confirmingDraft) {
        setThinkingState('paylink-build')
        setAgentStatus('Creating POS terminal...')
        try {
          const terminal = await createPosTerminalFromDraft(draft)
          setPosTerminalDraft(null)
          finishHelperMessage(nextQuestion, {
            answer: `${draft.displayName} is ready. It accepts ${requestNetworkLabels[draft.network || 'base']} USDC and settles to ${draft.destinationLabel}.`,
            actionLink: { label: 'Open POS Terminal', url: terminal.terminalUrl },
          })
        } catch (error) {
          setPosTerminalDraft(draft)
          finishHelperMessage(nextQuestion, {
            answer: error instanceof Error ? error.message : 'Could not create the POS terminal.',
            actionLink: { label: 'Review POS setup', url: '/?product=payment&tab=pos' },
          })
        }
        return true
      }

      const reviewDraft: PosTerminalDraft = {
        ...draft,
        awaitingConfirmation: true,
        idempotencyKey: window.crypto.randomUUID(),
      }
      setPosTerminalDraft(reviewDraft)
      finishHelperMessage(nextQuestion, {
        answer: `Ready to create ${draft.displayName}: ${draft.settlement === 'INSTANT_FIAT' ? 'Naira bank settlement' : 'USDC wallet settlement'} on ${requestNetworkLabels[draft.network || 'base']}, to ${draft.destinationLabel}. This is a reusable contactless terminal; the amount is entered at checkout. Reply “confirm” to create it, or tell me what to change.`,
      })
      return true
    }

    if (requestedLane === 'usdc') {
      if (bankPaylinkDraft) setBankPaylinkDraft(null)
      if (posTerminalDraft) setPosTerminalDraft(null)
    }

    if ((bankPaylinkDraft && requestedLane !== 'usdc') || requestedLane === 'bank') {
      if (requestedLane === 'bank') {
        setPaylinkDraft(null)
        setPosTerminalDraft(null)
      }
      const confirmingDraft = Boolean(bankPaylinkDraft?.awaitingConfirmation && isPaymentCreationConfirmIntent(nextQuestion))
      const draft = buildBankPaylinkDraft(paymentContextText, bankPaylinkDraft)
      const missing = bankPaylinkMissingFields(draft)
      setPaymentLanePromptPending(false)
      setPendingPaymentRequestText('')
      if (missing.length) {
        setThinkingState('payment-draft')
        setBankPaylinkDraft(draft)
        finishHelperMessage(nextQuestion, {
          answer: `Receive to Bank selected. Send ${missing.join(', ')}. One line is fine.`,
        })
        return true
      }

      if (!helperAuthenticated) {
        setBankPaylinkDraft({ ...draft, awaitingConfirmation: false })
        finishHelperMessage(nextQuestion, {
          answer: 'Sign in first so I can use your verified bank account without asking you to share bank details in chat.',
          actionLink: { label: 'Open Receive to Bank', url: '/?product=payment&tab=bank' },
        })
        return true
      }

      if (confirmingDraft) {
        setThinkingState('paylink-build')
        setAgentStatus('Creating Receive to Bank PayLink...')
        try {
          const link = await createBankReceiveFromDraft(draft)
          setBankPaylinkDraft(null)
          const bankPaylink: SavedRequest = {
            kind: 'bank-receive',
            mode: 'person',
            wallet: draft.savedBankLabel || 'Verified bank account',
            network: 'base',
            label: draft.label,
            target: draft.target,
            amount: draft.amountNgn,
            payUrl: link.payment_url,
            dashboardUrl: link.dashboard_url,
            currency: 'NGN',
            recipientLabel: draft.savedBankLabel || 'Verified bank account',
          }
          finishHelperMessage(nextQuestion, {
            answer: `Receive to Bank PayLink created for ${friendlyName(draft.target)}: NGN ${Number(draft.amountNgn).toLocaleString('en-NG')} for ${draft.label}.`,
            paylink: bankPaylink,
          })
        } catch (error) {
          setBankPaylinkDraft(draft)
          finishHelperMessage(nextQuestion, {
            answer: error instanceof Error ? error.message : 'Could not create the Receive to Bank PayLink.',
            actionLink: { label: 'Review bank setup', url: '/?product=payment&tab=bank' },
          })
        }
        return true
      }

      let savedBank
      try {
        savedBank = await savedBankReceiveProfile()
      } catch (error) {
        setBankPaylinkDraft({ ...draft, awaitingConfirmation: false })
        finishHelperMessage(nextQuestion, {
          answer: error instanceof Error ? error.message : 'Could not check your saved bank account.',
        })
        return true
      }
      if (!savedBank) {
        setBankPaylinkDraft({ ...draft, awaitingConfirmation: false })
        finishHelperMessage(nextQuestion, {
          answer: 'No verified bank account is saved yet. Verify one in Receive to Bank, then return and confirm this request.',
          actionLink: { label: 'Verify bank account', url: '/?product=payment&tab=bank' },
        })
        return true
      }
      const bankLabel = `${savedBank.bank_name || 'Verified bank'}${savedBank.bank_last4 ? ` ending ${savedBank.bank_last4}` : ''}`
      const reviewDraft: BankPaylinkDraft = {
        ...draft,
        awaitingConfirmation: true,
        idempotencyKey: window.crypto.randomUUID(),
        savedBankLabel: bankLabel,
      }
      setBankPaylinkDraft(reviewDraft)
      finishHelperMessage(nextQuestion, {
        answer: `Ready to create a Receive to Bank PayLink for ${friendlyName(draft.target)}: NGN ${Number(draft.amountNgn).toLocaleString('en-NG')} for ${draft.label}, settling to ${bankLabel}. Reply “confirm” to create it, or tell me what to change.`,
      })
      return true
    }

    if (!paylinkDraft && requestedLane !== 'usdc') {
      setPaymentLanePromptPending(true)
      if (!paymentLanePromptPending) setPendingPaymentRequestText(nextQuestion)
      finishHelperMessage(nextQuestion, {
        answer: 'Which payment flow should I create: a direct USDC PayLink, a Receive to Bank PayLink in Naira, or a POS contactless terminal?',
      })
      return true
    }

    setPaymentLanePromptPending(false)
    setPendingPaymentRequestText('')
    const revisionBase = !paylinkDraft && lastPaylinkDraft && isPaylinkRevisionIntent(nextQuestion) ? lastPaylinkDraft : null
    if (!paylinkDraft && !revisionBase && requestedLane !== 'usdc' && !isPaymentRequestIntent(paymentContextText)) return false
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
    const confirmingDraft = Boolean(activeDraft?.awaitingConfirmation && isPaymentCreationConfirmIntent(nextQuestion))
    let draft = confirmingDraft && activeDraft
      ? { ...activeDraft, awaitingConfirmation: false }
      : buildDraftFromText(paymentContextText, activeDraft)
    const profileWallet = preferredWalletFor(draft.network)
    const linkedWallet = !draft.wallet && !profileWallet
      ? await linkedCircleReceiveWallet(draft.network)
      : ''
    const savedWallet = profileWallet || linkedWallet

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

    if (!draft.wallet && savedWallet && !draft.offeredSavedWallet && wantsNewWallet(nextQuestion)) {
      setThinkingState('payment-wallet')
      setPaylinkDraft({ ...draft, offeredSavedWallet: true, offeredSavedWalletNetwork: draft.network })
      finishHelperMessage(nextQuestion, {
        answer: 'Send the new receive wallet. I will use it for this PayLink.',
      })
      return true
    }

    if (!draft.wallet && savedWallet && !wantsSavedWallet(nextQuestion) && !wantsNewWallet(nextQuestion)) {
      setThinkingState('payment-wallet')
      draft = { ...draft, offeredSavedWallet: true, offeredSavedWalletNetwork: draft.network }
      setPaylinkDraft(draft)
      const savedWalletNetwork = draft.network ? requestNetworkLabels[draft.network] : walletNetworkLabel(savedWallet)
      const missingDetails = describeMissingDraftFields(draft, savedWallet)
      const detailsPrompt = missingDetails.length ? ` Also send ${missingDetails.join(', ')}.` : ''
      const fallbackAnswer = `Use your connected ${savedWalletNetwork} wallet ${compactSavedWallet(savedWallet)}, or use another wallet?${detailsPrompt}`
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
      const fallbackAnswer = missingNetworkOnly
        ? draft.wallet?.startsWith('0x')
          ? `Which EVM network should ${missingTarget} use: Base, Arbitrum, or Arc?`
          : `Which network should ${missingTarget} use: Base, Arc, Arbitrum, Solana, or all networks?`
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

    if (!confirmingDraft) {
      const reviewDraft = { ...draft, awaitingConfirmation: true, idempotencyKey: draft.idempotencyKey || window.crypto.randomUUID() }
      setThinkingState('payment-draft')
      setPaylinkDraft(reviewDraft)
      const target = draft.mode === 'group' ? draft.target || 'Group collection' : friendlyName(draft.target)
      finishHelperMessage(nextQuestion, {
        answer: `Ready to create: ${draft.amount} USDC from ${target} on ${requestNetworkLabels[draft.network || 'base']} for ${draft.label}. Reply “confirm” to create it, or tell me what to change.`,
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
    const standaloneService = service === 'poly-portfolio'
      ? 'portfolio'
      : service === 'poly-stream'
        ? 'worldcup-scores'
        : service === 'poly-worldcup-news'
          ? 'worldcup-news'
          : service === 'lp-scout'
            ? 'lp-scout'
            : 'worldcup'
    const params = new URLSearchParams()
    params.set('service', standaloneService)
    return `${shareOrigin()}/polydesk?${params.toString()}`
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
    if (!helperAuthenticated) {
      return {
        answer: 'Open PolyDesk Portfolio and sign in to connect your Polymarket profile first.',
        actionLink: { label: 'Portfolio', url: portfolioUrl },
      }
    }
    const token = await getHelperAccessToken()
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

  async function clearCurrentHelperThread() {
    try {
      const response = await fetch('/api/helper-profile', {
        method: 'POST',
        headers: await helperProfileHeaders(true),
        body: JSON.stringify({
          action: 'clear-thread',
          payer: agentRequestPayer,
          threadId: activeHelperThreadId,
        }),
      })
      return response.ok
    } catch {
      return false
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

    if (humanSupportOpen && supportReplyCaseId) {
      setAsking(true)
      setHumanSupportMessages(current => [...current, { id: `support-local-${Date.now()}`, question: nextQuestion }])
      try {
        await replyToPocketSupport(supportReplyCaseId, nextQuestion)
      } catch (error) {
        setAskError(error instanceof Error ? error.message : 'Your support reply could not be sent just now.')
      } finally {
        setAsking(false)
      }
      return
    }

    if (isClearAgentHashChatCommand(nextQuestion)) {
      const clearedRemotely = await clearCurrentHelperThread()
      setPaylinkDraft(null)
      setLastPaylinkDraft(null)
      setBankPaylinkDraft(null)
      setPosTerminalDraft(null)
      setPaymentLanePromptPending(false)
      setPendingPaymentRequestText('')
      setMessages([{
        answer: clearedRemotely
          ? 'Chat cleared. Your saved profile, wallet preferences, and memory are still here.'
          : 'Chat cleared on this device, but I could not sync the deletion. Try “clear chat” again when you are online.',
      }])
      return
    }

    setAsking(true)
    setThinkingState('light')
    const abortController = new AbortController()
    helperAbortRef.current = abortController
    queueHelperMessage(nextQuestion)
    try {
      const isPaylinkFlow = helperMode === 'circle-pocket' && Boolean(paylinkDraft || bankPaylinkDraft || posTerminalDraft || paymentLanePromptPending || isPaymentRequestIntent(nextQuestion) || inferPaymentCreationLane(nextQuestion))
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
        await saveProfile({ displayName: cleanName, memorySummary: nextMemory })
        finishHelperMessage(nextQuestion, {
          answer: `Got it. I'll call you ${cleanName}.`,
        })
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
        const answer = knownName && knownName !== 'there'
          ? `You're ${friendlyName(knownName)}.`
          : "I don't know your preferred name yet. Tell me what to call you and I'll remember it."
        finishHelperMessage(nextQuestion, {
          answer,
        })
        return
      }
      const supportEscalation = helperMode === 'circle-pocket' ? pocketSupportEscalation(nextQuestion) : null
      if (supportEscalation) {
        setAgentStatus('Opening a secure support case...')
        try {
          const caseId = await createPocketSupportCase(nextQuestion, supportEscalation)
          setSupportReplyCaseId(caseId)
          finishHelperMessage(nextQuestion, {
            answer: 'I have handed this to Pocket Support as case ' + caseId + '. A human can review the account and payment context and reply here. Do not send another payment while a stuck transaction is under review.',
          })
        } catch (error) {
          finishHelperMessage(nextQuestion, {
            answer: error instanceof Error ? error.message : 'I could not open the support case just now. Please try again shortly.',
          })
        }
        return
      }
      if (helperMode === 'circle-pocket' && isSignedInStatusMessage(nextQuestion)) {
        const answer = !helperAuthReady
          ? 'I am still checking your account session. Try that request again in a moment.'
          : helperAuthenticated
            ? 'You are signed in. I can use your verified Pocket context for wallet and payment actions.'
            : 'I cannot confirm an active sign-in on this session yet. Sign in here, then I can use your verified Pocket context.'
        finishHelperMessage(nextQuestion, { answer })
        return
      }
      if (helperMode === 'circle-pocket' && await handleCirclePocketBalanceQuestion(nextQuestion)) return
      if (helperMode !== 'circle-pocket' && isPaymentRequestIntent(nextQuestion)) {
        finishHelperMessage(nextQuestion, {
          answer: 'That sounds like a Pocket request. Open Pocket Support and I will prepare it cleanly.',
        })
        return
      }
      if (helperMode === 'circle-pocket' && await handlePaylinkConversation(nextQuestion)) return
      if (helperMode === 'circle-pocket') {
        setThinkingState('light')
        setAgentStatus('Checking Pocket...')
        const accessToken = await getHelperAccessToken()
        if (!accessToken) throw new Error('Sign in again to continue with Pocket Support.')
        const pocketAnswer = await askPocketAgent({
          accessToken,
          threadId: activeHelperThreadId,
          message: nextQuestion,
          locale: navigator.language,
          signal: abortController.signal,
        })
        const action = pocketAnswer.actions?.[0]
        finishHelperMessage(nextQuestion, {
          answer: pocketAnswer.answer,
          ...(action?.href ? { actionLink: { label: action.label, url: action.href } } : {}),
        })
        return
      }
      if (helperMode === 'polydesk' && await handlePolyDeskConversation(nextQuestion)) return
      setThinkingState(isDeepResearch ? 'deep-research' : 'light')
      setAgentStatus(isDeepResearch ? 'Running deeper research... this might take a little time.' : 'Asking ZeroScout...')
      const res = await fetch('/api/agent-ask', {
        method: 'POST',
        headers: await helperProfileHeaders(true),
        signal: abortController.signal,
        body: JSON.stringify({
          eventId: eventId.trim(),
          payer: agentRequestPayer,
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
        suggestedAction?: { label: string; url: string }
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
        throw new Error(data.error ?? 'No helper response returned.')
      }
      setThinkingState('proof')
      setAgentStatus('Securing proof...')
      finishHelperMessage(nextQuestion, {
        answer: data.answer!,
        proof: data.proof,
        zeroscoutSponsorship: data.zeroscoutSponsorship,
        actionLink: data.suggestedAction,
      })
      void saveProfile({ question: nextQuestion, answer: data.answer } as Partial<HelperProfile>)
      if (!memoryDraft.trim()) {
        setMemoryDraft(`User is known as ${helperName || payer}. They use Hash PayLink Agent Helper from Telegram and may ask about payments, Polymarket, agents, research, planning, and daily questions.`)
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
    <div className={cn(fillAvailableHeight && 'flex min-h-0 flex-1 flex-col')}>
      <div className={cn('space-y-3', fillAvailableHeight && 'flex min-h-0 flex-1 flex-col space-y-0')}>
        <div className={cn('overflow-hidden', fillAvailableHeight && 'flex min-h-0 flex-1 flex-col')}>
              {helperMode && !lockedHelperMode && (
                <div className="shrink-0 px-3 pb-2">
                  <div className="flex items-center justify-between gap-3 rounded-full border border-gray-200/90 bg-gray-50/95 px-3 py-2 shadow-[0_4px_16px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/[0.06] dark:shadow-none">
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-bold text-gray-800 dark:text-gray-100">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                      <span className="truncate">{helperModes.find(mode => mode.id === helperMode)?.label ?? 'Agent Hash'} selected</span>
                    </span>
                    {!lockedHelperMode && (
                      <button
                        type="button"
                        onClick={resetHelperMode}
                        className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-500 shadow-sm transition hover:text-gray-900 dark:bg-white/[0.08] dark:text-gray-300 dark:hover:text-white"
                      >
                        Change mode
                      </button>
                    )}
                  </div>
                </div>
              )}
              <div
                ref={helperScrollRef}
                className={cn(
                  'space-y-3 overflow-y-auto p-3 scroll-smooth transition-[height] duration-300 ease-out [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                  fillAvailableHeight
                    ? 'min-h-0 flex-1'
                    : helperMode
                    ? 'min-h-[340px] sm:min-h-[380px]'
                    : 'max-h-[360px] min-h-[220px]',
                )}
                style={helperMode && !fillAvailableHeight
                  ? { height: 'clamp(420px, calc(100dvh - 230px), 680px)' }
                  : undefined}
              >
                <div className="max-w-[86%] break-words rounded-[20px] rounded-bl-[6px] bg-[#f3f3f4] px-3 py-2 text-[13px] leading-[1.45] text-gray-900 shadow-[0_8px_24px_rgba(15,23,42,0.06)] dark:bg-white/[0.075] dark:text-gray-100 dark:shadow-[0_10px_28px_rgba(0,0,0,0.18)]">
                  <p>{humanSupportOpen ? 'Pocket Support'+(supportReplyCaseId?' - '+supportReplyCaseId:'') : welcomeText ?? `Welcome back, ${helperName || cleanTelegramName || 'there'}. Ask me about payments, Polymarket funding, agent setup, research, planning, or daily questions.`}</p>
                  {lockedHelperMode === 'circle-pocket' && (humanSupportOpen
                    ? <button type="button" onClick={() => { setHumanSupportOpen(false); setAskError('') }} className="mt-2 inline-flex items-center rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-gray-700 dark:border-white/10 dark:bg-white/[0.07] dark:text-gray-200">Back to Agent Hash</button>
                    : <div className="mt-2 flex flex-wrap items-center gap-1.5"><button type="button" onClick={() => void startHumanSupport()} disabled={humanSupportBusy} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-gray-700 transition hover:border-gray-300 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.07] dark:text-gray-200"><MessageCircle className="h-3 w-3" />{humanSupportBusy ? 'Opening support…' : 'Chat with a human'}</button>{supportUnreadCount > 0 && <button type="button" onClick={() => void startHumanSupport()} className="rounded-full bg-red-600 px-2.5 py-1 text-[10px] font-bold text-white">{supportUnreadCount} support {supportUnreadCount === 1 ? 'reply' : 'replies'}</button>}</div>)}
                  {!humanSupportOpen && <div className="mt-1.5"><ZeroScoutPowerBadge compact /></div>}
                </div>

                {!helperMode && !lockedHelperMode && (
                  <div className="max-w-[94%] rounded-[20px] rounded-bl-[6px] bg-[#f3f3f4] px-3 py-2.5 text-[13px] leading-[1.4] text-gray-900 shadow-[0_8px_24px_rgba(15,23,42,0.06)] dark:bg-white/[0.075] dark:text-gray-100 dark:shadow-[0_10px_28px_rgba(0,0,0,0.18)]">
                    <p className="mb-2 font-semibold tracking-[-0.01em]">Choose how Agent Hash should help.</p>
                    <div className="flex flex-wrap gap-1.5">
                      {helperModes.map(mode => {
                        const unavailable = mode.available === false
                        return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => chooseHelperMode(mode.id)}
                          disabled={unavailable}
                          aria-disabled={unavailable}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold leading-none transition',
                            unavailable
                              ? 'cursor-not-allowed border-gray-200/70 bg-gray-100/80 text-gray-400 shadow-none dark:border-white/[0.06] dark:bg-white/[0.035] dark:text-gray-500'
                              : 'border-gray-200/90 bg-white/90 text-gray-800 shadow-[0_2px_8px_rgba(15,23,42,0.04)] hover:border-gray-300 hover:bg-white active:scale-[0.97] dark:border-white/10 dark:bg-white/[0.07] dark:text-gray-100 dark:shadow-none dark:hover:bg-white/[0.12]',
                          )}
                        >
                          <span>{mode.label}</span>
                          {unavailable && <span className="text-[9px] font-bold uppercase tracking-[0.08em]">Soon</span>}
                        </button>
                        )
                      })}
                    </div>
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
                      onClick={resetPolyDeskLane}
                      className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-semibold text-gray-600 shadow-sm transition hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]"
                    >
                      Desk Agent / {polyDeskSubModes.find(mode => mode.id === polyDeskSubMode)?.label}
                    </button>
                  </div>
                )}

                {(humanSupportOpen ? humanSupportMessages : messages).map((message, index) => (
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
                                      target={!sameOriginHelperPath(link.url) && /^https?:\/\//i.test(link.url) ? '_blank' : undefined}
                                      rel={!sameOriginHelperPath(link.url) && /^https?:\/\//i.test(link.url) ? 'noreferrer' : undefined}
                                      onClick={event => {
                                        const internalPath = sameOriginHelperPath(link.url)
                                        if (internalPath) {
                                          event.preventDefault()
                                          navigate(internalPath)
                                        }
                                      }}
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-800 transition hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.08] dark:text-gray-100 dark:hover:bg-white/[0.12]"
                                    >
                                      {sameOriginHelperPath(link.url) ? <ArrowRight className="h-3 w-3" /> : <ExternalLink className="h-3 w-3" />}
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

                {asking && !humanSupportOpen && <HelperThinkingIndicator statusText={agentStatus} state={thinkingState} />}
                {helperToast && (
                  <p className="w-fit rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 shadow-sm dark:border-white/10 dark:bg-white/[0.08] dark:text-gray-200">{helperToast}</p>
                )}
                {askError && (
                  <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">{askError}</p>
                )}
              </div>

              <div className="bg-white p-3 dark:bg-[#111114]">
                <div className="relative">
                  <input
                    data-agent-hash-input="true"
                    value={question}
                    onChange={event => setQuestion(event.target.value)}
                    onKeyDown={event => event.key === 'Enter' && !event.shiftKey && !asking && askHelper()}
                    onFocus={() => {
                      onComposerFocusChange?.(true)
                      window.requestAnimationFrame(() => {
                        const node = helperScrollRef.current
                        if (node) node.scrollTop = node.scrollHeight
                      })
                    }}
                    onBlur={() => onComposerFocusChange?.(false)}
                    placeholder={humanSupportOpen ? 'Message Pocket Support…' : helperMode === 'polydesk' && !polyDeskSubMode ? 'Choose a Desk Agent lane' : helperMode ? inputPlaceholder ?? 'Ask Hash...' : 'Choose a mode to start'}
                    disabled={!helperMode || (helperMode === 'polydesk' && !polyDeskSubMode)}
                    className="h-14 w-full min-w-0 rounded-[28px] border border-gray-200 bg-gray-50 py-3 pl-4 pr-[4.25rem] text-sm text-gray-900 outline-none transition-shadow placeholder:text-gray-400 focus:border-gray-300 focus:ring-2 focus:ring-gray-200/80 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.05] dark:text-white dark:focus:border-white/20 dark:focus:ring-white/10"
                  />
                  <DynamicSendButton
                    inputText={question}
                    isLoading={asking}
                    onSend={askHelper}
                    onStop={stopHelperResponse}
                    onAddAttachment={() => document.querySelector<HTMLInputElement>('[data-agent-hash-input="true"]')?.focus()}
                    disabled={!asking && (!helperMode || (helperMode === 'polydesk' && !polyDeskSubMode))}
                    className="absolute bottom-1 right-1"
                  />
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
  const isBankReceive = request.kind === 'bank-receive'
  const url = request.payUrl || buildRequestPayLink(request)
  const shareUrl = url.startsWith('http') ? url : `${PUBLIC_PAYLINK_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`
  const dashboardUrl = request.mode === 'group' ? request.dashboardUrl || buildRequestDashboardLink(request) : ''
  const amountLine = request.amount
    ? isBankReceive
      ? `NGN ${Number(request.amount).toLocaleString('en-NG')}`
      : `${request.amount} USDC`
    : 'Flexible amount'
  const target = friendlyName(request.target)
  const recipient = request.recipientLabel || request.wallet || request.evmWallet || request.solanaWallet
  const shareText = [
    isPolymarketFunding ? 'Polymarket funding checkout' : isBankReceive ? 'Receive to Bank PayLink' : request.mode === 'group' ? 'Hash PayLink collection' : 'Hash PayLink payment request',
    `${request.label} - ${amountLine}`,
    isPolymarketFunding ? `Profile: ${request.polymarketWallet ? shortAddress(request.polymarketWallet) : target}` : request.mode === 'group' ? `Collection: ${target}` : `Payer: ${target}`,
    isPolymarketFunding
      ? 'Open the checkout to fund the saved Polymarket profile through the bridge.'
      : isBankReceive
      ? 'Open the PayLink to pay Base USDC and settle the Naira amount to the verified bank account.'
      : request.mode === 'group'
      ? 'Open the link, enter your name, and contribute securely.'
      : 'Please share the receipt after payment is confirmed.',
  ].join('\n')

  async function shareLink() {
    const title = isPolymarketFunding ? 'Polymarket funding checkout' : isBankReceive ? 'Receive to Bank PayLink' : request.mode === 'group' ? 'Hash PayLink collection' : 'Hash PayLink payment request'
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
            {isPolymarketFunding ? 'Polymarket funding ready' : isBankReceive ? 'Bank PayLink ready' : request.mode === 'group' ? 'Collection ready' : 'Payment request ready'}
          </p>
          <p className="truncate text-[11px] text-emerald-700/80 dark:text-emerald-100/75">
            {amountLine} on {requestNetworkLabels[network]}
          </p>
        </div>
      </div>
      <div className="mt-2 grid gap-1 rounded-xl bg-white/80 p-2 text-xs dark:bg-white/[0.06]">
        {[
          ['Amount', amountLine],
          [isBankReceive ? 'Payer network' : 'Network', requestNetworkLabels[network]],
          ['Purpose', request.label || 'Payment'],
          [isPolymarketFunding ? 'Bridge' : isBankReceive ? 'Settlement' : 'Recipient', recipient ? (isBankReceive ? recipient : shortAddress(recipient)) : 'Not set'],
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
        title={isPolymarketFunding ? 'Share funding link' : isBankReceive ? 'Share bank PayLink' : request.mode === 'group' ? 'Share collection link' : 'Share payment link'}
        subtitle="Send it through your preferred app."
        emailSubject={isPolymarketFunding ? 'Polymarket funding checkout' : isBankReceive ? 'Receive to Bank PayLink' : request.mode === 'group' ? 'Hash PayLink collection' : 'Hash PayLink payment request'}
        onCopy={copyShareLink}
        onClose={() => setShareOpen(false)}
      />
    </div>
  )
}

export type LpScoutOption = {
  id: LpScoutMode
  title: string
  body: string
  amount: string
  icon: typeof LineChart
  inputLabel?: string
  inputPlaceholder?: string
}

export const lpScoutOptions: LpScoutOption[] = [
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

export type PolyWorldCupArticle = {
  title: string
  description: string
  source: string
  image: string
  url: string
  publishedAt: string
  tag: string
}

export type PolyWorldCupFeed = {
  ok?: boolean
  providerConfigured?: boolean
  source?: string
  updatedAt?: string
  articles?: PolyWorldCupArticle[]
}

export type PolyStreamMatch = {
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

export type PolyStreamTradeOption = {
  label: string
  outcome: 'home' | 'draw' | 'away'
  tokenId: string
  price?: string
  conditionId?: string
  tickSize?: number
  minSize?: number
  negRisk?: boolean
}

export type PolyStreamFeed = {
  ok: boolean
  providerConfigured: boolean
  source: string
  providerStatus?: string
  updatedAt: string
  matches: PolyStreamMatch[]
}

export type MatchEventDetail = {
  text: string
  kind: 'sub' | 'yellow' | 'red' | 'yellow-red' | 'event'
}

export function hasMatchScore(match: PolyStreamMatch) {
  const home = String(match.homeScore ?? '').trim().toLowerCase()
  const away = String(match.awayScore ?? '').trim().toLowerCase()
  return Boolean(home && away && home !== 'undefined' && away !== 'undefined' && home !== 'null' && away !== 'null')
}

export function splitFixtureTitle(title: string) {
  if (!title.includes(' vs ')) return [title, ''] as const
  const [home, away] = title.split(' vs ', 2)
  return [home.trim(), away.trim()] as const
}

export function matchDisplayState(match: PolyStreamMatch) {
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

export function formatGoalScorer(value: string, home: string, away: string) {
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

export function formatMatchEvent(value: string, home: string, away: string): MatchEventDetail | null {
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

export function buildPolymarketPayLink({
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

export function buildRequestPayLink(request: SavedRequest) {
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

export function inferRequestNetwork(request: Pick<SavedRequest, 'wallet'>): RequestNetwork {
  return request.wallet.trim().startsWith('0x') ? 'base' : 'solana'
}

export function isLocalhost() {
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
}

export function shareOrigin() {
  return isLocalhost() ? PUBLIC_PAYLINK_ORIGIN : window.location.origin
}

export type PolymarketBridgeNetwork = 'base' | 'arbitrum' | 'solana'

export type PolymarketProfile = {
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

export type PolymarketPosition = {
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

export function formatUsd(value: unknown, fallback = '—') {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  if (Math.abs(n) >= 10_000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function normalizePortfolioValue(value: unknown) {
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

export function numberOrNull(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

export function isClaimablePosition(position: PolymarketPosition) {
  if (position.redeemable !== true) return false
  const value = numberOrNull(position.currentValue)
  if (value !== null) return value > 0
  const size = numberOrNull(position.size)
  return size === null ? true : size > 0
}

export function isActiveOpenPosition(position: PolymarketPosition) {
  if (isClaimablePosition(position)) return false
  if (position.redeemable === true) return false
  if (position.closed === true || position.archived === true) return false
  const status = `${position.status ?? ''} ${position.marketStatus ?? ''}`.toLowerCase()
  if (/(resolved|closed|settled|final|ended|archived)/.test(status)) return false
  const value = numberOrNull(position.currentValue)
  const size = numberOrNull(position.size)
  if ((value ?? 0) > 0 || (size ?? 0) > 0) return true
  if (value !== null || size !== null) return (value ?? 0) > 0 || (size ?? 0) > 0
  return true
}

export async function readPolyDeskJson<T>(res: Response, fallbackMessage: string): Promise<T> {
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
