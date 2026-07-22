import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams, Link, useOutletContext, useNavigate } from 'react-router-dom'
import type { LayoutOutletContext } from '../Layout'
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useDisconnect,
  useSendTransaction,
  useSendCalls,
  useWaitForCallsStatus,
  useWaitForTransactionReceipt,
  useSignTypedData,
  useReadContract,
  useWalletClient,
} from 'wagmi'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import {
  parseUnits,
  formatUnits,
  isAddress,
  encodeFunctionData,
  parseSignature,
  concat,
} from 'viem'

// ─── Base Builder Code (ERC-8021) ─────────────────────────────────────────────
// Appended to calldata on Base Mainnet transactions only. Hex of "bc_8qtb7tny".
const BASE_BUILDER_CODE = '0x62635f3871746237746e79' as `0x${string}`
const BASE_PAYMASTER_URL = import.meta.env.VITE_BASE_PAYMASTER_URL as string | undefined
import {
  ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, AlertCircle, Loader2, ArrowLeftRight,
  RefreshCw, Copy, CheckCheck, Wallet, ChevronDown,
  AlertTriangle, Radio, Bot, Banknote, Lock,
} from 'lucide-react'
import {
  CHAIN_META, PLATFORM_FEE_BPS, EVM_TREASURY, type ChainKey,
} from '../lib/chains'
import {
  EVM_CLIENTS,
  ERC20_TRANSFER_ABI,
  ERC20_BALANCE_OF_ABI,
  FACTORY_V2_ADDRESSES,
} from '../lib/router'
import { useSolana }   from '../lib/SolanaContext'
import { cn, truncateAddress, formatAmount, formatNgnAmount, memoToHex, copyToClipboard } from '../lib/utils'
import { getFxMeta, formatLocalAmt, fetchFxRate } from '../lib/fx'
import { getCirclePaymasterConfig } from '../lib/circlePaymaster'
import { sendCirclePaymasterPayment } from '../lib/circlePaymasterPayment'
import { canUseCirclePasskeyPayments, prepareCirclePasskeyWallet, sendCirclePasskeyPayment } from '../lib/circlePasskeyPayment'
import { canUseCircleEvmEmailWallet, connectCircleEvmEmailWallet, sendCircleEvmEmailPayment } from '../lib/circleEvmEmailWallet'
import { canUseCircleSolanaEmailWallet, connectCircleSolanaEmailWallet, signCircleSolanaTransaction } from '../lib/circleSolanaEmailWallet'
import { getSponsoredGasRecoveryUnits } from '../lib/gasRecovery'
import { isValidSolanaAddress } from '../lib/solanaAddress'
import { getPaylinkParam, hasPaylinkFlag, isTelegramSourceParam } from '../lib/paylinkParams'
import { hostedCheckoutPresentation, resolveHostedCheckoutKind } from '../lib/hostedCheckout'
import { PRIVY_AUTH_ENABLED } from '../lib/authMode'
import { PrivyConnectButton } from '../lib/PrivyConnectButton'
import { PrivyWalletConnectButton } from '../lib/PrivyWalletConnectButton'
import UnifiedReceipt from '../components/UnifiedReceipt'
import SlideAction, { type SlideActionStatus } from '../components/SlideAction'
import PocketStatusCheck from '../pocket/components/PocketStatusCheck'
import PocketSelect from '../pocket/components/PocketSelect'
import { linkPocketWallet, readPocketWallet } from '../pocket/api/pocketWalletLinkClient'
import { type PaylinkReceipt, type ReceiptLookupResponse } from '../lib/paymentReceiptPdf'

type CircleSolanaSession = Awaited<ReturnType<typeof connectCircleSolanaEmailWallet>>
type CircleEvmEmailSession = Awaited<ReturnType<typeof connectCircleEvmEmailWallet>>
type PaycrestCheckoutOrder = {
  intent_id: string
  paycrest_order_id: string
  amount_ngn: string
  amount_usdc: string
  receive_address: string
  refund_address: string
  status: string
  tx_hash?: string
  valid_until?: string
  bank_name?: string
  bank_last4?: string
  bank_account_name?: string
  destination_network?: string
  destination_address?: string
  provider_institution?: string
  provider_account_identifier?: string
  provider_account_name?: string
  provider_amount_to_transfer?: string
  provider_amount_paid?: string
  provider_amount_returned?: string
  provider_percent_settled?: string
  provider_currency?: string
}
type PaycrestInstitution = {
  code: string
  name: string
  type?: string
}
type BankSendQuote = {
  amount_ngn: string
  amount_usdc: string
  fx_rate_ngn_per_usdc: string
  fx_source?: string
  destination_network?: string
}
const CHAINS: ChainKey[] = ['base', 'solana', 'arbitrum']
const HOSTED_CHECKOUT_CHAINS: ChainKey[] = ['base', 'arbitrum', 'arc']
const POLYMARKET_SIGNUP_URL = 'https://polymarket.com'
const POLYMARKET_LOGO = '/brand/polymarket-logo.png'
type SupportedEvmPayChain = 'base' | 'arc' | 'arbitrum'

function isSupportedEvmPayChain(value: ChainKey): value is SupportedEvmPayChain {
  return value === 'base' || value === 'arc' || value === 'arbitrum'
}

function CheckoutTrustLine() {
  return (
    <div className="mt-3 space-y-3 text-center text-[11px] font-medium text-gray-400 dark:text-gray-500">
      <p>Hash PayLink checkout</p>
      <p className="inline-flex items-center justify-center gap-1">
        <span>Secure</span>
        <Lock className="h-2.5 w-2.5" strokeWidth={1.8} />
      </p>
    </div>
  )
}

function agentAvatarHue(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return hash % 360
}

function agentDisplayNameFromMemo(memo: string, slug: string) {
  const fromMemo = memo.replace(/^Fund agent wallet:\s*/i, '').trim()
  if (fromMemo) return fromMemo
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase()) || 'Agent Wallet'
}

const CHAIN_DISPLAY_NAMES: Record<number, string> = {
  1:       'Ethereum',
  10:      'Optimism',
  56:      'BNB Chain',
  137:     'Polygon',
  177:     'HashKey',
  8453:    'Base',
  42161:   'Arbitrum',
  43114:   'Avalanche',
  5042002: 'Arc',
}

// ─── Multicall3 ──────────────────────────────────────────────────────────────
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as `0x${string}`

const MULTICALL3_AGGREGATE3_ABI = [{
  name: 'aggregate3', type: 'function' as const, stateMutability: 'payable' as const,
  inputs: [{ name: 'calls', type: 'tuple[]', components: [
    { name: 'target',       type: 'address' },
    { name: 'allowFailure', type: 'bool'    },
    { name: 'callData',     type: 'bytes'   },
  ]}],
  outputs: [{ name: 'returnData', type: 'tuple[]', components: [
    { name: 'success',    type: 'bool'  },
    { name: 'returnData', type: 'bytes' },
  ]}],
}] as const

const MULTICALL3_AGGREGATE3VALUE_ABI = [{
  name: 'aggregate3Value', type: 'function' as const, stateMutability: 'payable' as const,
  inputs: [{ name: 'calls', type: 'tuple[]', components: [
    { name: 'target',       type: 'address' },
    { name: 'allowFailure', type: 'bool'    },
    { name: 'value',        type: 'uint256' },
    { name: 'callData',     type: 'bytes'   },
  ]}],
  outputs: [{ name: 'returnData', type: 'tuple[]', components: [
    { name: 'success',    type: 'bool'  },
    { name: 'returnData', type: 'bytes' },
  ]}],
}] as const

const ERC20_PERMIT_ABI = [{
  name: 'permit', type: 'function' as const, stateMutability: 'nonpayable' as const,
  inputs: [
    { name: 'owner',    type: 'address' },
    { name: 'spender',  type: 'address' },
    { name: 'value',    type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'v',        type: 'uint8'   },
    { name: 'r',        type: 'bytes32' },
    { name: 's',        type: 'bytes32' },
  ],
  outputs: [],
}] as const

const ERC20_TRANSFER_FROM_ABI = [{
  name: 'transferFrom', type: 'function' as const, stateMutability: 'nonpayable' as const,
  inputs: [
    { name: 'from',   type: 'address' },
    { name: 'to',     type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
  outputs: [{ type: 'bool' }],
}] as const

const NONCES_ABI = [{
  name: 'nonces', type: 'function' as const, stateMutability: 'view' as const,
  inputs:  [{ name: 'owner', type: 'address' }],
  outputs: [{ name: '',      type: 'uint256' }],
}] as const

const ERC20_PERMIT_DOMAIN_ABI = [
  { name: 'name',    type: 'function' as const, stateMutability: 'view' as const, inputs: [], outputs: [{ name: '', type: 'string' }] },
  { name: 'version', type: 'function' as const, stateMutability: 'view' as const, inputs: [], outputs: [{ name: '', type: 'string' }] },
] as const


// ─── Error message normaliser ─────────────────────────────────────────────────
async function readApiJson<T>(res: Response, label: string): Promise<T> {
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    const body = await res.text().catch(() => '')
    const htmlHint = body.trim().startsWith('<') ? ' HTML' : ''
    throw new Error(`${label} returned${htmlHint} HTTP ${res.status}. Refresh and try again.`)
  }
  return res.json() as Promise<T>
}

function friendlyErrorMsg(raw: string): string {
  const s = raw.toLowerCase()
  if (s.startsWith('insufficient usdc on')) return raw.slice(0, 180)
  if (s.includes('user rejected') || s.includes('user denied') || s.includes('rejected the request') || s.includes('user cancelled'))
    return 'Transaction cancelled in wallet.'
  if ((s.includes('gas') || s.includes('transaction cost') || s.includes('intrinsic')) && (s.includes('insufficient') || s.includes('exceeds')))
    return 'Insufficient Base ETH for gas. Add a small amount of ETH on Base, or try another payment method.'
  if (s.includes('transfer amount exceeds') || s.includes('exceeds balance') || s.includes('exceeds the balance') || s.includes('insufficient usdc'))
    return 'Insufficient USDC on this wallet for the requested payment amount.'
  if (s.includes('insufficient') || s.includes('not enough'))
    return 'Insufficient funds. Check Base USDC for the payment amount and Base ETH if gas sponsorship is unavailable.'
  if (s.includes('reverted') || s.includes('execution reverted'))
    return 'Transaction reverted. Check USDC balance, permit expiry, and whether the wallet changed networks before retrying.'
  if (s.includes('nonce') || s.includes('already known'))
    return 'Nonce conflict — please wait a moment and try again.'
  return raw.slice(0, 120)
}

function readableErrorMsg(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    const json = JSON.stringify(err)
    return json && json !== '{}' ? json : fallback
  } catch {
    return fallback
  }
}

function isInvalidRpcParams(err: unknown) {
  const msg = readableErrorMsg(err, '').toLowerCase()
  return msg.includes('invalid parameters') || msg.includes('invalid params') || msg.includes('code') && msg.includes('-32602')
}

function emailFromPrivyUser(user: unknown) {
  if (!user || typeof user !== 'object') return ''
  const directEmail = (user as { email?: { address?: unknown } }).email?.address
  if (typeof directEmail === 'string') return directEmail
  const linkedAccounts = (user as { linkedAccounts?: unknown }).linkedAccounts
  if (!Array.isArray(linkedAccounts)) return ''
  for (const account of linkedAccounts) {
    if (!account || typeof account !== 'object') continue
    const record = account as { type?: unknown; address?: unknown; email?: unknown }
    if (record.type === 'email' && typeof record.address === 'string') return record.address
    if (record.type === 'google_oauth' && typeof record.email === 'string') return record.email
    if (typeof record.email === 'string') return record.email
  }
  return ''
}

// ─── Component ───────────────────────────────────────────────────────────────
const SMART_WALLET_FUNDING_ERROR = 'Add USDC to Smart wallet to continue.'
const SMART_WALLET_AMOUNT_ERROR = 'Enter an amount to continue.'
const SMART_WALLET_CANCELLED_MESSAGE = 'Payment cancelled. Try again.'

function isSmartWalletBalanceError(msg: string | null) {
  if (!msg) return false
  const s = msg.toLowerCase()
  return msg === SMART_WALLET_FUNDING_ERROR || msg === SMART_WALLET_AMOUNT_ERROR || s.includes('insufficient usdc')
}

function telegramReturnUrl(params: URLSearchParams) {
  if (!isTelegramSourceParam(params)) return ''
  const raw = getPaylinkParam(params, 'return', 'r').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' && url.hostname === 't.me' ? url.toString() : ''
  } catch {
    return ''
  }
}

function trustedPolydeskOrigin(raw: string) {
  if (!raw) return ''
  try {
    const url = new URL(raw)
    const isTrustedHost =
      url.hostname === 'polydesk-i96m.onrender.com' ||
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1'
    if ((url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1') && isTrustedHost) {
      return url.origin
    }
  } catch {
    return ''
  }
  return ''
}

export default function PaymentPage() {
  const [searchParams] = useSearchParams()
  const checkoutPresentation = hostedCheckoutPresentation(resolveHostedCheckoutKind(searchParams))
  const navigate = useNavigate()
  const { onPayChainChange, onPayWalletStateChange, onPaySuccessVisibleChange } = useOutletContext<LayoutOutletContext>()

  const evmParam    = getPaylinkParam(searchParams, 'evm', 'e') || searchParams.get('to') || ''
  const hostedEvmRecipients: Partial<Record<Extract<ChainKey, 'base' | 'arbitrum' | 'arc'>, string>> = {
    base: (searchParams.get('e_base') ?? '').trim(),
    arbitrum: (searchParams.get('e_arbitrum') ?? '').trim(),
    arc: (searchParams.get('e_arc') ?? '').trim(),
  }
  const hasScopedEvmRecipients = Object.values(hostedEvmRecipients).some(Boolean)
  const evmRecipientForChain = (candidate: ChainKey) =>
    candidate === 'solana' ? '' : hasScopedEvmRecipients ? hostedEvmRecipients[candidate] || '' : evmParam
  const hasEvmRecipient = (['base', 'arbitrum', 'arc'] as const).some(candidate => isAddress(evmRecipientForChain(candidate)))
  const amt         = getPaylinkParam(searchParams, 'amt', 'a')
  const memo        = getPaylinkParam(searchParams, 'memo', 'm')
  const legacyChain = searchParams.get('chain')  as ChainKey | null
  const netParam    = (getPaylinkParam(searchParams, 'net', 'n') || null) as ChainKey | null
  const isTelegramSource = isTelegramSourceParam(searchParams)
  const isNgPosSource = searchParams.get('src') === 'ngpos' || searchParams.get('src') === 'bank-receive' || searchParams.get('src') === 'bank-send'
  const ngPosBackMerchantId = searchParams.get('merchant') ?? ''
  const ngPosBackUrl = ngPosBackMerchantId ? `/pos/ng?merchant_id=${encodeURIComponent(ngPosBackMerchantId)}` : '/'
  const isPolymarketFunding = searchParams.get('brand') === 'polymarket' || searchParams.get('pm') === '1'
  const polymarketBridgeParam = searchParams.get('bridge') ?? ''
  const polymarketWalletParam = (searchParams.get('pmw') || '').trim()
  const polymarketFundingLabel = (searchParams.get('funding') || searchParams.get('payer') || '').trim() || 'Self funding'
  const polymarketFundingRequestId = (searchParams.get('pmr') || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
  const polymarketReturnTarget = searchParams.get('return') ?? ''
  const polymarketReturnToPortfolio = polymarketReturnTarget === 'poly-portfolio'
  const polymarketReturnToStandalonePortfolio = polymarketReturnTarget === 'polydesk-portfolio'
  const polymarketReturnToAgentHash = polymarketReturnTarget === 'agent-hash-polydesk-portfolio'
  const isPolymarketBridge = isPolymarketFunding && (
    polymarketBridgeParam === 'polymarket' ||
    polymarketReturnToPortfolio ||
    polymarketReturnToStandalonePortfolio ||
    polymarketReturnToAgentHash
  )
  const isPolyDeskCheckout = polymarketReturnToStandalonePortfolio || polymarketReturnToAgentHash
  const polymarketHelperOwner = (searchParams.get('helperOwner') || '').trim().slice(0, 160)
  const polymarketStandaloneOrigin = trustedPolydeskOrigin(searchParams.get('polyOrigin') || '')
  const telegramUrl = telegramReturnUrl(searchParams)
  const polymarketPortfolioTradingUrl = '/telegram/payment-links?section=market-tools&service=poly-portfolio&notice=polymarket-funding-complete&portfolio=trading&wallet=balance'
  const polymarketStandalonePortfolioTradingPath = '/polydesk?service=portfolio&notice=polymarket-funding-complete&portfolio=trading&wallet=balance'
  const polymarketStandalonePortfolioTradingUrl = polymarketStandaloneOrigin
    ? `${polymarketStandaloneOrigin}${polymarketStandalonePortfolioTradingPath}`
    : polymarketStandalonePortfolioTradingPath
  const polymarketAgentHashUrl = (() => {
    const params = new URLSearchParams({
      section: 'market-tools',
      service: 'hashpaylink-helper',
      open: '1',
      mode: 'polydesk',
      poly: 'portfolio',
      notice: 'polymarket-funding-complete',
      portfolio: 'trading',
      wallet: 'balance',
    })
    if (polymarketHelperOwner) params.set('helperOwner', polymarketHelperOwner)
    params.set('back', `${window.location.pathname}${window.location.search}${window.location.hash}`)
    return `/telegram/payment-links?${params.toString()}`
  })()
  const polymarketBridgeReturnUrl = polymarketReturnToAgentHash
    ? polymarketAgentHashUrl
    : polymarketReturnToStandalonePortfolio
    ? polymarketStandalonePortfolioTradingUrl
    : polymarketPortfolioTradingUrl

  const resolvedSolana = getPaylinkParam(searchParams, 'sol', 's').trim()
  const isMultiChain   = hasPaylinkFlag(searchParams, 'multi', 'x')
  const hasHostedCheckoutParam = /^chk_[a-zA-Z0-9]{8,40}$/.test(getPaylinkParam(searchParams, 'checkout', 'checkout'))
  const isFlex         = hasPaylinkFlag(searchParams, 'flex', 'f')
  const earlyAgentFundingSlug = getPaylinkParam(searchParams, 'agentSlug', 'agent')
  const isWalletManagerFundingLink =
    getPaylinkParam(searchParams, 'src', 'src') === 'agent' &&
    searchParams.get('walletManager') === 'service' &&
    !earlyAgentFundingSlug
  // Pocket always supplies an explicit network. Preserve Arc for older wallet
  // manager links that predate the network parameter, but never override an
  // explicit Base request.
  const walletManagerFundingChain: ChainKey = netParam === 'base' ? 'base' : 'arc'

  function goBackFromCheckout() {
    if (isHostedService && hostedReturnUrl) {
      window.location.assign(hostedReturnUrl)
      return
    }
    if (isPolymarketBridge) {
      window.location.assign(polymarketBridgeReturnUrl)
      return
    }
    if (window.history.length > 1) {
      window.history.back()
      return
    }
    if (isHelperAccess && agentUrl) {
      try {
        const url = new URL(agentUrl, window.location.origin)
        if (url.origin === window.location.origin) {
          window.location.assign(`${url.pathname}${url.search}${url.hash}`)
          return
        }
      } catch {
        if (agentUrl.startsWith('/')) {
          window.location.assign(agentUrl)
          return
        }
      }
    }
    if (isAgentOrWalletFunding) {
      window.location.assign(agentFundingBackUrl)
      return
    }
    window.location.assign(ngPosBackUrl)
  }

  // netParam (from new link format) takes priority; legacy chain param as fallback
  const [chain, setChain] = useState<ChainKey>(() => {
    if (isWalletManagerFundingLink) return walletManagerFundingChain
    if (netParam === 'base' || netParam === 'arc' || netParam === 'solana' || netParam === 'arbitrum') return netParam
    if (legacyChain === 'base' || legacyChain === 'arc' || legacyChain === 'arbitrum' || legacyChain === 'solana') return legacyChain
    if (isValidSolanaAddress(resolvedSolana) && !hasEvmRecipient) return 'solana'
    return 'base'
  })
  const [hostedLockedNetwork, setHostedLockedNetwork] = useState<ChainKey | null>(null)

  // Normal multi-chain links can switch chains; Telegram links are intentionally
  // locked to the bot-selected network so a Base request stays Base-only.
  const netLocked = isWalletManagerFundingLink || !!hostedLockedNetwork || (!!netParam && (!isMultiChain || isTelegramSource))
  const availableChains = isWalletManagerFundingLink
    ? [walletManagerFundingChain]
    : netLocked
    ? [chain]
    : (hasHostedCheckoutParam ? HOSTED_CHECKOUT_CHAINS : CHAINS).filter(c =>
        (c === 'solana' && isValidSolanaAddress(resolvedSolana)) ||
        (c !== 'solana' && isAddress(evmRecipientForChain(c))),
      )
  const resolvedEvm = evmRecipientForChain(chain)
  const hostedCheckoutNetworkOptions = [
    ...availableChains.map(value => ({
      value,
      label: value === 'arc' ? 'Arc Test' : CHAIN_META[value].label,
    })),
    { value: 'solana', label: 'Solana Soon', disabled: true },
  ]

  // Sync header pill with initial chain on mount
  useEffect(() => { onPayChainChange(chain) }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Flexible amount (payer-entered) ──────────────────────────────────────
  const [flexAmt,     setFlexAmt]     = useState('')
  const [flexMemo,    setFlexMemo]    = useState('')
  const [fxInputMode, setFxInputMode] = useState<'usdc' | 'local'>('usdc')
  const [localAmt,    setLocalAmt]    = useState('')

  // ── UI state ──────────────────────────────────────────────────────────────
  const [addrCopied,        setAddrCopied]        = useState(false)
  const [agentLinkCopied,   setAgentLinkCopied]   = useState(false)
  const [paymentReceiptId,  setPaymentReceiptId]  = useState('')
  const [paymentReceipt,    setPaymentReceipt]    = useState<PaylinkReceipt | null>(null)
  const [receiptPollAttempts, setReceiptPollAttempts] = useState(0)
  const [receiptArchiveTimedOut, setReceiptArchiveTimedOut] = useState(false)
  const [manualPayDetected, setManualPayDetected] = useState(false)
  const [paymentAttemptStarted, setPaymentAttemptStarted] = useState(false)
  const [manualTxHash,      setManualTxHash]      = useState<`0x${string}` | null>(null)
  const [receivedAmount,    setReceivedAmount]    = useState<bigint | null>(null)
  const [showCheckButton,   setShowCheckButton]   = useState(false)
  const [isManualChecking,  setIsManualChecking]  = useState(false)
  const [txSyncTick,        setTxSyncTick]        = useState(0)
  const [circleEvmAcceptedPending, setCircleEvmAcceptedPending] = useState(false)
  const [polymarketBridgeStatus, setPolymarketBridgeStatus] = useState<'idle' | 'checking' | 'waiting' | 'pending' | 'complete' | 'error'>('idle')
  const [polymarketBridgeStatusText, setPolymarketBridgeStatusText] = useState('')
  const [polymarketBridgeLatestTx, setPolymarketBridgeLatestTx] = useState('')

  // ── Event mode ─────────────────────────────────────────────────────────────
  // Capture event params from the INITIAL URL at mount — before the direct-send
  // V2 flow can overwrite ?id= via window.history.replaceState.
  const [initParams] = useState(() => new URLSearchParams(window.location.search))
  const isEventMode      = hasPaylinkFlag(initParams, 'event', 'v')
  const eventId          = initParams.get('id') ?? ''
  const agentUrl         = getPaylinkParam(initParams, 'agent', 'g')
  const hostedCheckoutId = getPaylinkParam(initParams, 'checkout', 'checkout')
  const hostedAttemptId  = getPaylinkParam(initParams, 'attempt', 'attempt')
  const isHostedCheckout = /^chk_[a-zA-Z0-9]{8,40}$/.test(hostedCheckoutId)
  const hostedKind = getPaylinkParam(initParams, 'hostedKind', 'hostedKind')
  const hostedSettlementMode = getPaylinkParam(initParams, 'settlementMode', 'settlementMode')
  const isHostedNairaSettlement = isHostedCheckout && hostedSettlementMode === 'ngn'
  const isHostedService = isHostedCheckout && (getPaylinkParam(initParams, 'src', 'src') === 'service' || hostedKind === 'service')
  const [hostedIntentStatus, setHostedIntentStatus] = useState<'idle' | 'checking' | 'verified' | 'error'>(() => isHostedCheckout ? 'checking' : 'idle')
  const [hostedIntentError, setHostedIntentError] = useState('')
  const [hostedConfirmationStatus, setHostedConfirmationStatus] = useState<'idle' | 'checking' | 'processing' | 'verified' | 'error'>('idle')
  const [hostedConfirmationError, setHostedConfirmationError] = useState('')
  const [hostedReturnUrl, setHostedReturnUrl] = useState('')
  const resolvedPolymarketReturnUrl = isHostedService && hostedReturnUrl ? hostedReturnUrl : polymarketBridgeReturnUrl
  const hostedMerchantName = getPaylinkParam(initParams, 'merchantName', 'merchantName').slice(0, 80)
  const hostedMerchantLogo = getPaylinkParam(initParams, 'merchantLogo', 'merchantLogo').slice(0, 400)
  const polymarketReturnLabel = isHostedService ? (hostedMerchantName || 'the platform') : 'PolyDesk'
  const hostedCheckoutTitle = getPaylinkParam(initParams, 'checkoutTitle', 'checkoutTitle').slice(0, 100)
  const autoAccessRedirect = getPaylinkParam(initParams, 'ad', 'autoRedirect') === '1'
  const isHelperAccess   = getPaylinkParam(initParams, 'src', 'src') === 'telegram-helper' && !!agentUrl
  const agentFundingSlug = getPaylinkParam(initParams, 'agentSlug', 'agent')
  const isAgentFunding   = getPaylinkParam(initParams, 'src', 'src') === 'agent' && !!agentFundingSlug
  const isWalletManagerFunding = getPaylinkParam(initParams, 'src', 'src') === 'agent' && getPaylinkParam(initParams, 'walletManager') === 'service' && !agentFundingSlug
  const isAgentOrWalletFunding = isAgentFunding || isWalletManagerFunding
  const agentFundingBackUrl = (() => {
    const raw = getPaylinkParam(initParams, 'return', 'g').trim()
    if (raw) {
      try {
        const url = new URL(raw, window.location.origin)
        if (url.origin === window.location.origin) return `${url.pathname}${url.search}${url.hash}`
        if (isWalletManagerFunding && trustedPolydeskOrigin(url.origin)) {
          return `${url.origin}${url.pathname}${url.search}${url.hash}`
        }
      } catch {
        if (raw.startsWith('/')) return raw
      }
    }
    if (isWalletManagerFunding) return '/agent?profile=agent&walletManager=service'
    return `/agent?profile=agent&agent=${encodeURIComponent(agentFundingSlug || 'hashpaylink-agent')}`
  })()
  const agentFundingName = isWalletManagerFunding ? 'Pocket Wallet' : isAgentFunding ? agentDisplayNameFromMemo(memo, agentFundingSlug) : ''
  const agentFundingHue = agentAvatarHue(`${agentFundingSlug}:${agentFundingName}`)
  useEffect(() => {
    if (!isWalletManagerFunding || chain === walletManagerFundingChain) return
    setChain(walletManagerFundingChain)
    onPayChainChange(walletManagerFundingChain)
  }, [isWalletManagerFunding, chain, onPayChainChange, walletManagerFundingChain])
  const paySource        = getPaylinkParam(initParams, 'src', 'src')
  const isNgPosPayment   = paySource === 'ngpos' || paySource === 'bank-receive'
  const isBankReceivePayment = paySource === 'bank-receive'
  const isBankSendPayment = paySource === 'bank-send'
  const bankSendLinkId = (initParams.get('bankSend') ?? '').trim().replace(/[^a-zA-Z0-9_-]/g, '')
  const bankSendDestinationNetwork = (initParams.get('destNet') ?? initParams.get('n') ?? 'base').trim().toLowerCase()
  const ngPosMerchantId  = (initParams.get('merchant') ?? '').trim().replace(/[^a-zA-Z0-9_-]/g, '')
  const ngPosEventId     = ngPosMerchantId ? `ngpos-${ngPosMerchantId}` : ''
  const ngPosSettlement  = (initParams.get('settlement') ?? '').trim()
  const ngPosAmountNgn   = (initParams.get('ngn') ?? '').trim()
  const ngPosOfframpProvider = (initParams.get('offramp') ?? '').trim()
  const ngPosPaycrestIntentId = (initParams.get('intent') ?? '').trim().replace(/[^a-zA-Z0-9_-]/g, '')
  const ngPosBankName = (initParams.get('bank') ?? '').trim()
  const ngPosBankAccount = (initParams.get('acct') ?? '').trim()
  const ngPosBankAccountName = (initParams.get('acctName') ?? '').trim()
  const isNgPosPaycrestOfframp = isNgPosPayment && ngPosSettlement === 'instant_fiat' && ngPosOfframpProvider === 'paycrest'
  const smartWalletOnlyFunding = isPolymarketFunding || isAgentOrWalletFunding || isHelperAccess || isNgPosPaycrestOfframp || isBankSendPayment
  const isMainHashPaylinkPayment = !isTelegramSource && !smartWalletOnlyFunding
  const [attendeeName,   setAttendeeName]   = useState(() => initParams.get('payer') ?? '')
  const [eventRegStatus, setEventRegStatus] = useState<'idle' | 'pending' | 'ok' | 'error'>('idle')
  const eventRegistered  = useRef(false)
  const ordinaryReceiptRegistered = useRef(false)
  const accessRedirected = useRef(false)
  const polymarketBridgeWaitStartedAtRef = useRef(0)
  const polymarketFundingMarkRef = useRef('')
  const polymarketFundingMarkInFlightRef = useRef('')
  const ngPosRegistered  = useRef(false)
  const ngPosRegisteredTx = useRef('')
  const ngPosOfframpMarkedRef = useRef(false)
  const lastCirclePaymentUnitsRef = useRef<bigint | null>(null)
  const paymentVerificationStartBlockRef = useRef<bigint | null>(null)
  const [paycrestOrder, setPaycrestOrder] = useState<PaycrestCheckoutOrder | null>(null)
  const [paycrestPreparing, setPaycrestPreparing] = useState(false)
  const [paycrestStatusText, setPaycrestStatusText] = useState('')
  const [bankSendInstitutions, setBankSendInstitutions] = useState<PaycrestInstitution[]>([])
  const [bankSendBanksBusy, setBankSendBanksBusy] = useState(false)
  const [bankSendBankCode, setBankSendBankCode] = useState('')
  const [bankSendBankName, setBankSendBankName] = useState('')
  const [bankSendAccount, setBankSendAccount] = useState('')
  const [bankSendAccountName, setBankSendAccountName] = useState('')
  const [bankSendBankVerified, setBankSendBankVerified] = useState(false)
  const [bankSendBankBusy, setBankSendBankBusy] = useState(false)
  const [bankSendError, setBankSendError] = useState('')
  const [bankSendStatus, setBankSendStatus] = useState<'idle' | 'waiting' | 'pending' | 'settled' | 'expired' | 'refunding' | 'error'>('idle')
  const [bankSendQuote, setBankSendQuote] = useState<BankSendQuote | null>(null)
  const [bankSendQuoteBusy, setBankSendQuoteBusy] = useState(false)
  const requiresAttendeeName = (isEventMode || isNgPosPayment) && !isPolymarketFunding && !isAgentOrWalletFunding && !isHelperAccess

  useEffect(() => {
    if (!isHostedCheckout) return
    let cancelled = false
    setHostedIntentStatus('checking')
    setHostedIntentError('')
    void fetch(`/api/v2/checkouts?id=${encodeURIComponent(hostedCheckoutId)}&attempt=${encodeURIComponent(hostedAttemptId)}&purpose=return`, { cache: 'no-store' })
      .then(async response => {
        const body = await response.json().catch(() => undefined) as {
          ok?: boolean
          paymentUrl?: string
          returnUrl?: string
          checkout?: { checkoutMode?: string; paymentAttempt?: { id?: string; status?: string; network?: string; transaction?: string; receiptId?: string } }
          error?: string
        } | undefined
        if (!response.ok || !body?.ok || !body.paymentUrl?.startsWith('/pay?')) {
          throw new Error(body?.error || 'This hosted checkout could not be verified.')
        }
        if (body.checkout?.checkoutMode && body.checkout.checkoutMode !== 'human') {
          throw new Error('This checkout only accepts agentic payment.')
        }
        if (isHostedService && !body.returnUrl) throw new Error('This service checkout has no verified return destination.')
        const expected = new URL(body.paymentUrl, window.location.origin)
        const current = new URL(window.location.href)
        if (expected.pathname !== current.pathname || expected.search !== current.search) {
          window.location.replace(`${expected.pathname}${expected.search}`)
          return
        }
        if (!cancelled) {
          setHostedReturnUrl(body.returnUrl || '')
          setHostedIntentStatus('verified')
          const attempt = body.checkout?.paymentAttempt
          if (attempt?.network === 'base' || attempt?.network === 'arbitrum' || attempt?.network === 'arc') {
            setHostedLockedNetwork(attempt.network)
          }
          if (attempt?.receiptId) setPaymentReceiptId(attempt.receiptId)
          if (attempt?.transaction && /^0x[a-fA-F0-9]{64}$/.test(attempt.transaction)) {
            setManualTxHash(attempt.transaction as `0x${string}`)
          }
          if (attempt?.status === 'paid') {
            setManualPayDetected(true)
            setHostedConfirmationStatus('verified')
          } else if (attempt?.status === 'processing') {
            setHostedConfirmationStatus('processing')
          }
        }
      })
      .catch(error => {
        if (cancelled) return
        setHostedIntentStatus('error')
        setHostedIntentError(error instanceof Error ? error.message : 'This hosted checkout could not be verified.')
      })
    return () => { cancelled = true }
  }, [hostedAttemptId, hostedCheckoutId, isHostedCheckout, isHostedService])

  useEffect(() => {
    if (isFlex && isBankReceivePayment && isNgPosPaycrestOfframp) setFxInputMode('local')
  }, [isFlex, isBankReceivePayment, isNgPosPaycrestOfframp])

  useEffect(() => {
    if (!isBankSendPayment) return
    setBankSendBanksBusy(true)
    fetch('/api/ng-pos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'institutions', currency: 'NGN' }),
    })
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok || !data.ok) throw new Error(data.error ?? 'Could not load banks.')
        setBankSendInstitutions(Array.isArray(data.institutions) ? data.institutions : [])
      })
      .catch((error) => {
        setBankSendInstitutions([])
        setBankSendError(error instanceof Error ? error.message.replaceAll('Paycrest ', '') : 'Could not load banks.')
      })
      .finally(() => setBankSendBanksBusy(false))
  }, [isBankSendPayment])

  // ── FX display (event mode only — reads params baked into the URL at link creation) ──
  const fxCurrency  = isEventMode ? getPaylinkParam(initParams, 'fx', 'fx') : ''
  const fxShow      = isEventMode && hasPaylinkFlag(initParams, 'fxshow', 'fs') && !!fxCurrency
  const fxSrc       = getPaylinkParam(initParams, 'fxsrc', 'xs') === 'custom' ? 'custom' : 'live'
  const fxCustomVal = parseFloat(getPaylinkParam(initParams, 'fxrate', 'xr') || '0') || 0

  const [fxRate,    setFxRate]    = useState<number | null>(fxSrc === 'custom' && fxCustomVal > 0 ? fxCustomVal : null)
  const [fxLoading, setFxLoading] = useState(false)
  const [fxStale,   setFxStale]   = useState(false)

  const refreshFxRate = useCallback(async () => {
    if (!fxCurrency || fxSrc === 'custom') return
    setFxLoading(true)
    try {
      const d = await fetchFxRate(fxCurrency)
      if (d.ok && d.rate) { setFxRate(d.rate); setFxStale(d.stale ?? false) }
    } catch { /* ignore */ }
    finally { setFxLoading(false) }
  }, [fxCurrency, fxSrc])

  useEffect(() => { if (fxShow && fxSrc === 'live') refreshFxRate() }, [fxShow, fxSrc, refreshFxRate])

  // Flex USDC amount — when payer types in local currency, convert to USDC here
  const flexAmtInUsdc = fxInputMode === 'local' && fxRate && parseFloat(localAmt) > 0
    ? (parseFloat(localAmt) / fxRate).toFixed(6)
    : flexAmt

  // effectiveAmt: always USDC
  const effectiveAmt = isFlex ? flexAmtInUsdc : amt
  const payableAmt = isNgPosPaycrestOfframp && paycrestOrder?.amount_usdc ? paycrestOrder.amount_usdc : effectiveAmt
  const paycrestNeedsPreparation = isNgPosPaycrestOfframp && !paycrestOrder
  const effectiveAmtNumber = parseFloat(effectiveAmt || '0') || 0
  const flexLocalCurrencyLabel = isNgPosPaycrestOfframp && isBankReceivePayment ? 'NGN' : (getFxMeta(fxCurrency)?.symbol ?? fxCurrency)

  // flexPayDisabled: accounts for USDC and local-currency input modes
  const flexPayDisabled = isFlex && (
    isNgPosPaycrestOfframp && isBankReceivePayment
      ? (!localAmt || parseFloat(localAmt) <= 0)
      : fxInputMode === 'local'
      ? (!localAmt || parseFloat(localAmt) <= 0 || !fxRate)
      : (!flexAmt  || parseFloat(flexAmt)  <= 0)
  )
  const paymentAmountBlocked = flexPayDisabled || (isHostedCheckout && hostedIntentStatus !== 'verified')

  // ── Direct Send state (shared across Base, Arc, and Arbitrum) ─────────────
  // Circle Smart Wallet is the only public checkout rail. Keep the legacy
  // direct-send implementation isolated for now, but never expose or select it.
  const [payMode] = useState<'wallet' | 'direct'>('wallet')
  const [directLinkId,     setDirectLinkId]     = useState<string | null>(null)
  // EVM chains (Base / Arc): the CREATE2 ghost vault address
  const [directVault,      setDirectVault]      = useState<`0x${string}` | null>(null)
  const [directStatus,     setDirectStatus]     = useState<'idle' | 'waiting' | 'relaying' | 'success' | 'error'>('idle')
  const [directTxHash,     setDirectTxHash]     = useState<string | null>(null)
  const [directError,      setDirectError]      = useState<string | null>(null)
  const [directAddrCopied, setDirectAddrCopied] = useState(false)
  const [directHashCopied, setDirectHashCopied] = useState(false)
  const directRelayedRef = useRef(false)
  const directPollRef    = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Router state (predicted via public RPC, no wallet needed) ─────────────

  // ── Stale-closure guards ─────────────────────────────────────────────────
  const detectedRef = useRef(false)
  useEffect(() => { detectedRef.current = manualPayDetected }, [manualPayDetected])

  // ── EVM wallet hooks ──────────────────────────────────────────────────────
  const { isConnected, address, connector } = useAccount()
  const chainId                  = useChainId()
  const { switchChain, switchChainAsync, isPending: isSwitching } = useSwitchChain()
  const { disconnect: disconnectEvm } = useDisconnect()
  const { authenticated: privyAuthenticated, user: privyUser, getAccessToken } = usePrivy()
  const { wallets: privyWallets } = useWallets()
  const privyEmail = emailFromPrivyUser(privyUser).toLowerCase()
  const previousPrivySessionRef = useRef({ authenticated: privyAuthenticated, email: privyEmail })
  const connectedPrivyWallet = PRIVY_AUTH_ENABLED && address
    ? privyWallets.find(wallet => wallet.address?.toLowerCase() === address.toLowerCase())
    : undefined
  const hasExternalPrivyEvmWallet = !!connectedPrivyWallet && connectedPrivyWallet.walletClientType !== 'privy'
  const isPrivyEmbeddedWalletConnected = connectedPrivyWallet?.walletClientType === 'privy'
  const { data: walletClient }   = useWalletClient({
    chainId: chain === 'base' ? CHAIN_META.base.chainId : chain === 'arc' ? CHAIN_META.arc.chainId : chain === 'arbitrum' ? CHAIN_META.arbitrum.chainId : CHAIN_META.base.chainId,
  })

  const {
    sendTransaction, data: evmTxHash,
    isPending: isEvmWalletPending, isError: isEvmSendError,
    error: evmSendError, reset: resetEvmSend,
  } = useSendTransaction()

  const {
    sendCallsAsync: sendSponsoredCallsAsync,
    isPending: isBasePaymasterPending,
  } = useSendCalls()
  const [basePaymasterCallId, setBasePaymasterCallId] = useState<string | null>(null)
  const [basePaymasterTxHash, setBasePaymasterTxHash] = useState<`0x${string}` | null>(null)
  const [basePaymasterError, setBasePaymasterError] = useState<string | null>(null)
  const [basePaymasterAvailable, setBasePaymasterAvailable] = useState(false)
  const [circlePaymasterPending, setCirclePaymasterPending] = useState(false)
  const [circlePaymasterTxHash, setCirclePaymasterTxHash] = useState<`0x${string}` | null>(null)
  const [circlePaymasterError, setCirclePaymasterError] = useState<string | null>(null)
  const [circleEmail, setCircleEmail] = useState('')
  const [circlePasskeyPending, setCirclePasskeyPending] = useState(false)
  const [circlePasskeyError, setCirclePasskeyError] = useState<string | null>(null)
  const [circleSmartAccount, setCircleSmartAccount] = useState<`0x${string}` | null>(null)
  const [circleEvmEmailSession, setCircleEvmEmailSession] = useState<CircleEvmEmailSession | null>(null)
  const [circleEvmPaymentProcessing, setCircleEvmPaymentProcessing] = useState(false)
  const [circleWalletCopied, setCircleWalletCopied] = useState(false)
  const circleWalletDetailsRef = useRef<HTMLDetailsElement | null>(null)
  const [privyCircleLinkError, setPrivyCircleLinkError] = useState<string | null>(null)
  const [privyCircleLinkLoading, setPrivyCircleLinkLoading] = useState(false)

  const disconnectCirclePayWallets = useCallback(() => {
    setCircleSmartAccount(null)
    setCircleEvmEmailSession(null)
    setCirclePasskeyPending(false)
    setCircleEvmPaymentProcessing(false)
    setCircleEvmAcceptedPending(false)
    setCircleWalletCopied(false)
    setCirclePasskeyError(null)
    setPrivyCircleLinkError(null)
    setCircleSolanaSession(null)
    setCircleSolanaAddress('')
    setCircleSolanaBalance(null)
    setCircleSolanaBalanceError(false)
    setCircleSolanaCopied(false)
    setCircleSolanaError(null)
  }, [])

  const { isLoading: isEvmConfirming, isSuccess: isEvmConfirmed, isError: isEvmReverted } =
    useWaitForTransactionReceipt({ hash: evmTxHash })
  const { isLoading: isCirclePaymasterConfirming, isSuccess: isCirclePaymasterConfirmed } =
    useWaitForTransactionReceipt({
      hash: circlePaymasterTxHash ?? undefined,
      chainId: chain === 'base' ? CHAIN_META.base.chainId : chain === 'arc' ? CHAIN_META.arc.chainId : chain === 'arbitrum' ? CHAIN_META.arbitrum.chainId : CHAIN_META.base.chainId,
    })
  const {
    data: basePaymasterStatus,
    isLoading: isBasePaymasterConfirming,
    isError: isBasePaymasterStatusError,
    error: basePaymasterStatusError,
  } = useWaitForCallsStatus({
    id: basePaymasterCallId ?? '',
    pollingInterval: 2_000,
    query: { enabled: !!basePaymasterCallId && !basePaymasterTxHash },
  })

  useEffect(() => {
    const receiptHash = basePaymasterStatus?.receipts?.[0]?.transactionHash
    if (receiptHash) setBasePaymasterTxHash(receiptHash as `0x${string}`)
  }, [basePaymasterStatus])

  useEffect(() => {
    if (!BASE_PAYMASTER_URL) return
    let cancelled = false
    fetch(BASE_PAYMASTER_URL)
      .then(r => r.json())
      .then((d: { configured?: boolean }) => { if (!cancelled) setBasePaymasterAvailable(!!d.configured) })
      .catch(() => { if (!cancelled) setBasePaymasterAvailable(false) })
    return () => { cancelled = true }
  }, [])

  // ── Arbitrum USDC relay state — relayer submits tx on payer's behalf ──────
  const [arbitrumRelayHash,    setArbitrumRelayHash]    = useState<`0x${string}` | undefined>(undefined)
  const [arbitrumRelayPending, setArbitrumRelayPending] = useState(false)
  const [arbitrumRelayError,   setArbitrumRelayError]   = useState<string | null>(null)
  const [arbitrumGasEstimate,  setArbitrumGasEstimate]  = useState<bigint>(0n)

  const { isLoading: isArbitrumRelayConfirming, isSuccess: isArbitrumRelayConfirmed } =
    useWaitForTransactionReceipt({ hash: arbitrumRelayHash, chainId: 42161 })

  const { signTypedDataAsync, isPending: isSignPending, reset: resetPermitSign } = useSignTypedData()

  const { data: permitNonce } = useReadContract({
    address: chain === 'base'
      ? CHAIN_META.base.tokenAddress
      : chain === 'arbitrum'
      ? CHAIN_META.arbitrum.tokenAddress
      : CHAIN_META.arc.tokenAddress,
    abi: NONCES_ABI,
    functionName: 'nonces',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: (chain === 'base'
      ? CHAIN_META.base.chainId
      : chain === 'arbitrum'
      ? CHAIN_META.arbitrum.chainId
      : CHAIN_META.arc.chainId) as number,
    query: { enabled: (chain === 'base' || chain === 'arc' || chain === 'arbitrum') && !!address },
  })
  const permitTokenAddress = chain === 'base'
    ? CHAIN_META.base.tokenAddress
    : chain === 'arbitrum'
    ? CHAIN_META.arbitrum.tokenAddress
    : CHAIN_META.arc.tokenAddress
  const permitChainId = (chain === 'base'
    ? CHAIN_META.base.chainId
    : chain === 'arbitrum'
    ? CHAIN_META.arbitrum.chainId
    : CHAIN_META.arc.chainId) as number
  const { data: permitTokenName } = useReadContract({
    address: permitTokenAddress,
    abi: ERC20_PERMIT_DOMAIN_ABI,
    functionName: 'name',
    chainId: permitChainId,
    query: { enabled: (chain === 'base' || chain === 'arc' || chain === 'arbitrum') && !!address },
  })
  const { data: permitTokenVersion } = useReadContract({
    address: permitTokenAddress,
    abi: ERC20_PERMIT_DOMAIN_ABI,
    functionName: 'version',
    chainId: permitChainId,
    query: { enabled: (chain === 'base' || chain === 'arc' || chain === 'arbitrum') && !!address },
  })
  const {
    data: circleWalletBalance,
    isFetching: isCircleWalletBalanceFetching,
    refetch: refetchCircleWalletBalance,
  } = useReadContract({
    address: chain === 'arc'
      ? CHAIN_META.arc.tokenAddress
      : chain === 'arbitrum'
      ? CHAIN_META.arbitrum.tokenAddress
      : CHAIN_META.base.tokenAddress,
    abi: ERC20_BALANCE_OF_ABI,
    functionName: 'balanceOf',
    args: [circleSmartAccount ?? '0x0000000000000000000000000000000000000000'],
    chainId: chain === 'arc'
      ? CHAIN_META.arc.chainId
      : chain === 'arbitrum'
      ? CHAIN_META.arbitrum.chainId
      : CHAIN_META.base.chainId,
    query: {
      enabled: !!circleSmartAccount && (chain === 'base' || chain === 'arc' || chain === 'arbitrum'),
      refetchInterval: 3_000,
    },
  })


  // ── Solana ────────────────────────────────────────────────────────────────
  const {
    address: solanaWalletAddr,
    isConnecting: isSolanaConnecting,
    connect: connectSolana,
    disconnect: disconnectSolana,
    signTransaction: signSolanaTransaction,
  } = useSolana()
  const [solanaTxHash,         setSolanaTxHash]         = useState<string | null>(null)
  const [isSolanaPending,      setIsSolanaPending]      = useState(false)
  const [isSolanaConfirming,   setIsSolanaConfirming]   = useState(false)
  const [isSolanaConfirmed,    setIsSolanaConfirmed]    = useState(false)
  const [solanaError,          setSolanaError]          = useState<string | null>(null)
  // Solana Send-via-Address
  const [solanaLinkId,         setSolanaLinkId]         = useState<string | null>(null)
  const [solanaVaultAddr,      setSolanaVaultAddr]      = useState<string | null>(null)
  const [solanaDirectStatus,   setSolanaDirectStatus]   = useState<'idle' | 'waiting' | 'relaying' | 'success' | 'error'>('idle')
  const [solanaDirectTxHash,   setSolanaDirectTxHash]   = useState<string | null>(null)
  const [solanaDirectError,    setSolanaDirectError]    = useState<string | null>(null)
  const [solanaAddrCopied,     setSolanaAddrCopied]     = useState(false)
  const [solanaDirHashCopied,  setSolanaDirHashCopied]  = useState(false)
  const [circleSolanaEmail,    setCircleSolanaEmail]    = useState('')
  const [circleSolanaSession,  setCircleSolanaSession]  = useState<CircleSolanaSession | null>(null)
  const [circleSolanaAddress,  setCircleSolanaAddress]  = useState('')
  const [circleSolanaPending,  setCircleSolanaPending]  = useState(false)
  const [circleSolanaError,    setCircleSolanaError]    = useState<string | null>(null)
  const [circleSolanaBalance,  setCircleSolanaBalance]  = useState<bigint | null>(null)
  const [circleSolanaBalanceError, setCircleSolanaBalanceError] = useState(false)
  const [circleSolanaFetching, setCircleSolanaFetching] = useState(false)
  const [circleSolanaCopied,   setCircleSolanaCopied]   = useState(false)
  const circleSolanaDetailsRef = useRef<HTMLDetailsElement | null>(null)

  useEffect(() => {
    const connected = !!circleSmartAccount || !!circleEvmEmailSession || !!circleSolanaSession || !!circleSolanaAddress
    onPayWalletStateChange({
      connected,
      disconnect: connected ? disconnectCirclePayWallets : undefined,
    })
    return () => onPayWalletStateChange({ connected: false })
  }, [
    circleSmartAccount,
    circleEvmEmailSession,
    circleSolanaSession,
    circleSolanaAddress,
    disconnectCirclePayWallets,
    onPayWalletStateChange,
  ])

  // ── Derived ───────────────────────────────────────────────────────────────
  const isEvmChain    = chain !== 'solana'
  const meta          = CHAIN_META[chain]
  const targetChainId =
    chain === 'base'     ? CHAIN_META.base.chainId     :
    chain === 'arc'      ? CHAIN_META.arc.chainId      :
    chain === 'arbitrum' ? CHAIN_META.arbitrum.chainId :
    CHAIN_META.base.chainId
  const isCorrectNetwork = isEvmChain ? chainId === targetChainId : true
  const hashPaylinkFeeBps = isNgPosPaycrestOfframp || isBankSendPayment ? 0 : PLATFORM_FEE_BPS
  const feeAmount        = (parseFloat(payableAmt) || 0) * (hashPaylinkFeeBps / 10_000)

  const activeRecipient = isNgPosPaycrestOfframp && paycrestOrder?.receive_address
    ? paycrestOrder.receive_address
    : chain === 'solana' ? resolvedSolana
    : resolvedEvm
  const displayAddress  = activeRecipient
  const consumerNetworkName =
    chain === 'base' ? 'Base' :
    chain === 'arbitrum' ? 'Arbitrum' :
    chain === 'solana' ? 'Solana' :
    chain === 'arc' ? 'Arc' :
    meta.label
  const pocketFundingNetworkName = chain === 'arc' ? 'Arc Testnet' : 'Base'
  const bankSendDestinationLabel = bankSendDestinationNetwork === 'base' ? 'Base' : 'Polygon'
  const circlePaymasterConfig = getCirclePaymasterConfig(chain)
  const showCirclePaymasterButton = !!circlePaymasterConfig && (chain === 'base' || chain === 'arbitrum')
  const showCircleEvmEmailPay = canUseCircleEvmEmailWallet(chain)
  const showCirclePasskeyPay = canUseCirclePasskeyPayments(chain)
  const showCircleEmailPay = showCircleEvmEmailPay || showCirclePasskeyPay
  const showCircleSolanaEmailPay = chain === 'solana' && canUseCircleSolanaEmailWallet()
  const usePrivyCircleCheckout = PRIVY_AUTH_ENABLED && showCircleEvmEmailPay && (chain === 'base' || chain === 'arbitrum' || chain === 'arc')
  const usePrivyCircleSolanaCheckout = PRIVY_AUTH_ENABLED && showCircleSolanaEmailPay && chain === 'solana'
  const showLegacyCircleEmailPay = !PRIVY_AUTH_ENABLED && showCircleEmailPay
  const showPrivyCircleEmailPay = usePrivyCircleCheckout && privyAuthenticated && !hasExternalPrivyEvmWallet
  const showPrivyCircleSolanaEmailPay = usePrivyCircleSolanaCheckout && privyAuthenticated
  const showCircleEmailBridgePay = showLegacyCircleEmailPay || showPrivyCircleEmailPay
  const showCircleSolanaEmailBridgePay = (!PRIVY_AUTH_ENABLED && showCircleSolanaEmailPay) || showPrivyCircleSolanaEmailPay
  const smartCheckoutOwnsWalletCta =
    !manualPayDetected &&
    (showCircleEmailBridgePay ||
      showCircleSolanaEmailBridgePay ||
      showCirclePaymasterButton ||
      !!circleSmartAccount ||
      !!circleEvmEmailSession ||
      !!circleSolanaSession ||
      !!circleSolanaAddress)

  const refreshPolymarketBridgeStatus = useCallback(async () => {
    if (!isPolymarketBridge || !activeRecipient) return
    const bridgeWaitStartedAt = polymarketBridgeWaitStartedAtRef.current
    setPolymarketBridgeStatus('checking')
    setPolymarketBridgeStatusText('Checking Polymarket Bridge...')
    try {
      const response = await fetch('/api/polymarket-bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status', depositAddress: activeRecipient }),
      })
      const data = await response.json().catch(() => ({})) as {
        ok?: boolean
        transactions?: Array<{ status?: string; txHash?: string; createdTimeMs?: number }>
        latest?: { status?: string; txHash?: string } | null
        error?: string
      }
      if (!response.ok || !data.ok) throw new Error(data.error || 'Bridge status unavailable')
      const currentTransactions = Array.isArray(data.transactions)
        ? data.transactions
            .filter((transaction) => {
              const createdTimeMs = Number(transaction.createdTimeMs || 0)
              if (!createdTimeMs) return false
              return !bridgeWaitStartedAt || createdTimeMs >= bridgeWaitStartedAt
            })
            .sort((a, b) => Number(b.createdTimeMs || 0) - Number(a.createdTimeMs || 0))
        : []
      const completedTransaction = currentTransactions.find((transaction) => {
        const status = String(transaction.status || '').toUpperCase()
        return status === 'COMPLETED' || status === 'COMPLETE'
      })
      const latest = completedTransaction ?? currentTransactions[0] ?? null
      const latestStatus = String(latest?.status || '').toUpperCase()
      setPolymarketBridgeLatestTx(latest?.txHash || '')
      if (latestStatus === 'COMPLETED' || latestStatus === 'COMPLETE') {
        setPolymarketBridgeStatus('complete')
        setPolymarketBridgeStatusText('Bridge complete. Portfolio will refresh when you return.')
      } else if (latestStatus) {
        setPolymarketBridgeStatus('pending')
        setPolymarketBridgeStatusText(`Bridge ${latestStatus.toLowerCase()}. Polymarket credit can take a few minutes.`)
      } else {
        setPolymarketBridgeStatus('waiting')
        setPolymarketBridgeStatusText('Payment confirmed. Waiting for the current bridge settlement.')
      }
    } catch (err) {
      setPolymarketBridgeStatus('error')
      setPolymarketBridgeStatusText(readableErrorMsg(err, 'Bridge status unavailable. Keep the tx hash for support.'))
    }
  }, [activeRecipient, isPolymarketBridge])

  const showArbitrumRelayCost =
    chain === 'arbitrum' &&
    payMode === 'wallet' &&
    !showCircleEmailBridgePay &&
    !showCirclePaymasterButton
  const walletConnectBlocked = isNgPosPaycrestOfframp || (smartWalletOnlyFunding && !PRIVY_AUTH_ENABLED)
  const grossUpPlatformCharges = true
  const grossUpEvmPlatformCharges = grossUpPlatformCharges && (chain === 'base' || chain === 'arc' || chain === 'arbitrum')
  const grossUpSolanaPlatformCharges = grossUpPlatformCharges && chain === 'solana'

  function evmPaymentBreakdown(totalUnits: bigint, decimals = meta.decimals) {
    const feeUnits = totalUnits * BigInt(hashPaylinkFeeBps) / 10_000n
    const gasRecoveryUnits = hashPaylinkFeeBps === 0 ? 0n : getSponsoredGasRecoveryUnits(chain, totalUnits, feeUnits, decimals)
    const sponsoredTreasuryUnits = feeUnits + gasRecoveryUnits
    if (grossUpEvmPlatformCharges) {
      return {
        feeUnits,
        gasRecoveryUnits,
        treasuryUnits: feeUnits,
        sponsoredTreasuryUnits,
        recipientUnits: totalUnits,
        sponsoredRecipientUnits: totalUnits,
        requiredUnits: totalUnits + sponsoredTreasuryUnits,
      }
    }
    return {
      feeUnits,
      gasRecoveryUnits,
      treasuryUnits: feeUnits,
      sponsoredTreasuryUnits,
      recipientUnits: totalUnits - feeUnits,
      sponsoredRecipientUnits: totalUnits - sponsoredTreasuryUnits,
      requiredUnits: totalUnits,
    }
  }

  function solanaPaymentRequiredUnits(totalUnits: bigint) {
    const feeUnits = totalUnits * BigInt(hashPaylinkFeeBps) / 10_000n
    const gasRecoveryUnits = hashPaylinkFeeBps === 0 ? 0n : getSponsoredGasRecoveryUnits('solana', totalUnits, feeUnits, CHAIN_META.solana.decimals)
    return totalUnits + feeUnits + gasRecoveryUnits
  }

  const circleRequiredUnits = (() => {
    if (paycrestNeedsPreparation) return 0n
    try {
      const totalUnits = parseUnits(payableAmt || '0', meta.decimals)
      if (grossUpSolanaPlatformCharges) return solanaPaymentRequiredUnits(totalUnits)
      return grossUpEvmPlatformCharges ? evmPaymentBreakdown(totalUnits).requiredUnits : totalUnits
    } catch {
      return 0n
    }
  })()
  const circleWalletHasEnough =
    typeof circleWalletBalance === 'bigint' &&
    circleRequiredUnits > 0n &&
    circleWalletBalance >= circleRequiredUnits
  const circleWalletNeedsFunds =
    !!circleSmartAccount &&
    typeof circleWalletBalance === 'bigint' &&
    circleRequiredUnits > 0n &&
    circleWalletBalance < circleRequiredUnits
  const circleEvmWalletUnlocked = !!circleEvmEmailSession && circleEvmEmailSession.chain === chain
  const circleEvmWalletChecking = circleEvmWalletUnlocked && circleRequiredUnits > 0n && typeof circleWalletBalance !== 'bigint'
  const circleEvmEmailMerchantUnits = (() => {
    if (!showCircleEvmEmailPay || circleRequiredUnits <= 0n || (chain !== 'base' && chain !== 'arbitrum')) return null
    const totalUnits = parseUnits(payableAmt || '0', meta.decimals)
    const merchantUnits = evmPaymentBreakdown(totalUnits).sponsoredRecipientUnits
    return merchantUnits > 0n ? merchantUnits : null
  })()
  const circleSolanaHasEnough =
    circleSolanaBalance !== null &&
    circleRequiredUnits > 0n &&
    circleSolanaBalance >= circleRequiredUnits
  const circleSolanaNeedsFunds =
    (!!circleSolanaSession || !!circleSolanaAddress) &&
    circleSolanaBalance !== null &&
    circleRequiredUnits > 0n &&
    circleSolanaBalance < circleRequiredUnits
  const circleSolanaWalletChecking = !!circleSolanaSession && circleRequiredUnits > 0n && circleSolanaBalance === null && !circleSolanaBalanceError

  function openCircleWalletPanel() {
    window.requestAnimationFrame(() => {
      const details = circleWalletDetailsRef.current
      if (!details) return
      details.open = true
      details.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }

  function openCircleSolanaPanel() {
    window.requestAnimationFrame(() => {
      const details = circleSolanaDetailsRef.current
      if (!details) return
      details.open = true
      details.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }

  function expectedEvmRecipientUnits() {
    const totalUnits = parseUnits(payableAmt || '0', meta.decimals)
    if (totalUnits <= 0n) return 0n
    const { feeUnits, gasRecoveryUnits, sponsoredRecipientUnits } = evmPaymentBreakdown(totalUnits)
    const conservativeUnits = totalUnits - feeUnits - gasRecoveryUnits
    return grossUpEvmPlatformCharges ? totalUnits : (sponsoredRecipientUnits > 0n ? sponsoredRecipientUnits : totalUnits - feeUnits)
  }

  async function beginPaymentVerificationWindow() {
    paymentVerificationStartBlockRef.current = null
    if (!isSupportedEvmPayChain(chain)) return
    try {
      const latestBlock = await EVM_CLIENTS[chain].getBlockNumber()
      // The current block existed before this payment attempt. Only a transfer
      // mined in a later block is valid fallback proof for this checkout.
      paymentVerificationStartBlockRef.current = latestBlock + 1n
    } catch {
      // A submitted transaction hash can still be verified by its receipt.
      // Without either proof, funding remains in the confirming state.
    }
  }

  const validSolanaRecipient = isValidSolanaAddress(resolvedSolana)
  const missingSolana  = chain === 'solana' && !resolvedSolana
  const effectiveMemo  = requiresAttendeeName ? attendeeName : (isFlex ? (flexMemo || memo) : memo)

  const hasPaycrestMerchantRecipient = isNgPosPaycrestOfframp && !!ngPosMerchantId
  const hasBankSendRecipient =
    isBankSendPayment &&
    !!bankSendLinkId &&
    isAddress(resolvedEvm) &&
    (isFlex || (!Number.isNaN(Number.parseFloat(ngPosAmountNgn)) && Number.parseFloat(ngPosAmountNgn) > 0))
  const bankSendRequestedNgn = isBankSendPayment ? (isFlex ? localAmt.trim() : ngPosAmountNgn.trim()) : ''
  const bankSendRequestedNgnLabel = formatNgnAmount(bankSendRequestedNgn)
  const bankSendDisplayUsdc = paycrestOrder?.amount_usdc || bankSendQuote?.amount_usdc || ''
  const bankSendProviderStatus = String(paycrestOrder?.status || '').trim().toLowerCase()
  const bankSendPaymentDetected =
    Boolean(paycrestOrder?.tx_hash) ||
    ['deposited', 'fulfilling', 'fulfilled', 'settling', 'settled', 'validated'].includes(bankSendProviderStatus)
  const bankSendExpectedTransfer = Number.parseFloat(paycrestOrder?.provider_amount_to_transfer || paycrestOrder?.amount_ngn || '')
  const bankSendAmountPaid = Number.parseFloat(paycrestOrder?.provider_amount_paid || '')
  const bankSendAmountReturned = Number.parseFloat(paycrestOrder?.provider_amount_returned || '')
  const bankSendAmountDelta =
    Number.isFinite(bankSendExpectedTransfer) && Number.isFinite(bankSendAmountPaid)
      ? bankSendAmountPaid - bankSendExpectedTransfer
      : 0
  const bankSendHasAmountMismatch =
    Number.isFinite(bankSendExpectedTransfer) &&
    Number.isFinite(bankSendAmountPaid) &&
    bankSendAmountPaid > 0 &&
    Math.abs(bankSendAmountDelta) >= 0.01
  const bankSendMismatchLabel = bankSendAmountDelta > 0 ? 'Overpaid' : 'Underpaid'
  const bankSendStatusLabel =
    bankSendStatus === 'idle'
      ? 'ready'
      : bankSendStatus === 'waiting'
      ? 'waiting'
      : bankSendStatus === 'pending' && bankSendPaymentDetected
      ? 'settling'
      : bankSendStatus === 'pending'
      ? 'verifying'
      : bankSendStatus
  const selectedRecipientValid = chain === 'solana'
    ? validSolanaRecipient
    : isAddress(resolvedEvm) || hasPaycrestMerchantRecipient
  const isValidParams =
    hasBankSendRecipient ||
    (
      (isFlex || (!isNaN(parseFloat(amt)) && parseFloat(amt) > 0)) &&
      selectedRecipientValid
    )

  useEffect(() => {
    if (!isBankSendPayment || paycrestOrder || !bankSendLinkId) {
      setBankSendQuote(null)
      setBankSendQuoteBusy(false)
      return
    }
    const amount = Number.parseFloat(bankSendRequestedNgn)
    if (!Number.isFinite(amount) || amount <= 0) {
      setBankSendQuote(null)
      setBankSendQuoteBusy(false)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      setBankSendQuoteBusy(true)
      try {
        const response = await fetch('/api/ng-pos', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'bankSendQuote',
            link_id: bankSendLinkId,
            amount: amount.toFixed(2),
          }),
        })
        const data = await response.json().catch(() => ({})) as { ok?: boolean; quote?: BankSendQuote }
        if (!cancelled) setBankSendQuote(response.ok && data.ok && data.quote ? data.quote : null)
      } catch {
        if (!cancelled) setBankSendQuote(null)
      } finally {
        if (!cancelled) setBankSendQuoteBusy(false)
      }
    }, 450)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [bankSendLinkId, bankSendRequestedNgn, isBankSendPayment, paycrestOrder])

  useEffect(() => {
    const previous = previousPrivySessionRef.current
    const sessionChanged = previous.authenticated !== privyAuthenticated || previous.email !== privyEmail
    previousPrivySessionRef.current = { authenticated: privyAuthenticated, email: privyEmail }
    if (sessionChanged && circlePasskeyError === SMART_WALLET_CANCELLED_MESSAGE) {
      setCirclePasskeyError(null)
    }
  }, [privyAuthenticated, privyEmail, circlePasskeyError])

  useEffect(() => {
    if (!hasExternalPrivyEvmWallet || (!circleSmartAccount && !circleEvmEmailSession)) return
    setCircleSmartAccount(null)
    setCircleEvmEmailSession(null)
    setCirclePasskeyPending(false)
    setCircleEvmPaymentProcessing(false)
    setCircleEvmAcceptedPending(false)
    setCircleWalletCopied(false)
    setShowCheckButton(false)
    setPrivyCircleLinkError(null)
  }, [hasExternalPrivyEvmWallet, circleSmartAccount, circleEvmEmailSession])

  useEffect(() => {
    if (!circleSmartAccount || typeof circleWalletBalance !== 'bigint') return
    if (circleRequiredUnits <= 0n) {
      if (isSmartWalletBalanceError(circlePasskeyError)) setCirclePasskeyError(null)
      return
    }
    if (circleWalletNeedsFunds) {
      if (isSmartWalletBalanceError(circlePasskeyError)) setCirclePasskeyError(null)
      return
    }
    if (isSmartWalletBalanceError(circlePasskeyError)) setCirclePasskeyError(null)
  }, [
    circleSmartAccount,
    circleWalletBalance,
    circleRequiredUnits,
    circleWalletNeedsFunds,
    circlePasskeyPending,
    circleEvmPaymentProcessing,
    circlePasskeyError,
  ])

  useEffect(() => {
    if (!showPrivyCircleEmailPay) return
    let cancelled = false
    if (privyEmail) setCircleEmail(current => current || privyEmail)

    async function resolveLinkedCircleWallet() {
      setPrivyCircleLinkLoading(true)
      setPrivyCircleLinkError(null)
      try {
        const token = await getAccessToken()
        if (!token) throw new Error('Privy session is not ready yet. Sign in again and retry.')
        const linked = await readPocketWallet({
          accessToken: token,
          network: chain as 'base' | 'arbitrum' | 'arc',
        })
        if (cancelled) return
        if (linked?.wallet.address) {
          if (isConnected) disconnectEvm()
          if (isAddress(linked.wallet.address)) {
            setCircleSmartAccount(linked.wallet.address)
          }
        }
      } catch (err) {
        if (cancelled) return
        console.warn('[PayLink] Privy Circle wallet link restore failed', err)
        setPrivyCircleLinkError(null)
      } finally {
        if (!cancelled) setPrivyCircleLinkLoading(false)
      }
    }

    void resolveLinkedCircleWallet()
    return () => {
      cancelled = true
    }
  }, [showPrivyCircleEmailPay, chain, privyEmail, getAccessToken, isConnected, disconnectEvm])

  useEffect(() => {
    if (!showPrivyCircleSolanaEmailPay) return
    let cancelled = false
    if (privyEmail) setCircleSolanaEmail(current => current || privyEmail)

    async function resolveLinkedCircleSolanaWallet() {
      setPrivyCircleLinkLoading(true)
      setPrivyCircleLinkError(null)
      try {
        const token = await getAccessToken()
        if (!token) throw new Error('Privy session is not ready yet. Sign in again and retry.')
        const linked = await readPocketWallet({
          accessToken: token,
          network: 'solana',
        })
        if (cancelled) return
        if (linked?.wallet.address) {
          if (solanaWalletAddr) disconnectSolana()
          setCircleSolanaAddress(linked.wallet.address)
        }
      } catch (err) {
        if (cancelled) return
        console.warn('[PayLink] Privy Circle Solana wallet link restore failed', err)
        setPrivyCircleLinkError(null)
      } finally {
        if (!cancelled) setPrivyCircleLinkLoading(false)
      }
    }

    void resolveLinkedCircleSolanaWallet()
    return () => {
      cancelled = true
    }
  }, [showPrivyCircleSolanaEmailPay, privyEmail, getAccessToken, solanaWalletAddr, disconnectSolana])

  useEffect(() => {
    if (!circleSolanaSession || circleSolanaBalance === null) return
    if (circleRequiredUnits <= 0n) {
      if (isSmartWalletBalanceError(circleSolanaError)) setCircleSolanaError(null)
      return
    }
    if (circleSolanaNeedsFunds) {
      if (isSmartWalletBalanceError(circleSolanaError)) setCircleSolanaError(null)
      return
    }
    if (isSmartWalletBalanceError(circleSolanaError)) setCircleSolanaError(null)
  }, [
    circleSolanaSession,
    circleSolanaBalance,
    circleRequiredUnits,
    circleSolanaNeedsFunds,
    circleSolanaPending,
    isSolanaConfirming,
    circleSolanaError,
  ])

  // ── Step 1: Predict router address + check deployment ────────────────────
  // ── Step 2: Real-time payment listener ───────────────────────────────────
  useEffect(() => {
    const evmRecipient = isAddress(activeRecipient) ? activeRecipient as `0x${string}` : null
    const payerCandidate = circleEvmEmailSession?.wallet.address || circleSmartAccount || address || ''
    const expectedPayer = isAddress(payerCandidate) ? payerCandidate as `0x${string}` : null
    if (manualPayDetected || payMode !== 'wallet' || !paymentAttemptStarted || !expectedPayer || !isSupportedEvmPayChain(chain) || !evmRecipient) return

    const evmChain = chain
    const client   = EVM_CLIENTS[evmChain]

    let unwatchTransfer: (() => void) | undefined
    const tokenAddress = CHAIN_META[evmChain].tokenAddress

      const isCircleEmailEvmWatch =
        payMode === 'wallet' &&
        showCircleEvmEmailPay &&
        !!circleEvmEmailSession &&
        circleEvmEmailMerchantUnits != null &&
        (chain === 'base' || chain === 'arbitrum')
      const watchTarget = evmRecipient
      const requestedUnits =
        isCircleEmailEvmWatch && circleEvmEmailMerchantUnits
          ? circleEvmEmailMerchantUnits
          : parseUnits(effectiveAmt || '0', meta.decimals)

    unwatchTransfer = client.watchContractEvent({
        address:         tokenAddress,
        abi:             ERC20_TRANSFER_ABI,
        eventName:       'Transfer',
        args:            { from: expectedPayer, to: watchTarget },
        pollingInterval: 2_000,
        onLogs(logs) {
          if (detectedRef.current) return
          const log   = logs[0]
          if (!log)   return
          const value = (log.args as { value?: bigint }).value ?? 0n
          if (value >= (isHostedCheckout ? requestedUnits : requestedUnits * 99n / 100n)) {
            setReceivedAmount(
              isCircleEmailEvmWatch
                ? circleRequiredUnits
                : value,
            )
            setManualTxHash(log.transactionHash ?? null)
            setCirclePasskeyError(null)
            setCircleEvmPaymentProcessing(false)
            setCircleEvmAcceptedPending(false)
            setManualPayDetected(true)
          }
        },
    })

    return () => {
      unwatchTransfer?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chain,
    activeRecipient,
    manualPayDetected,
    amt,
    effectiveAmt,
    payMode,
    paymentAttemptStarted,
    address,
    circleSmartAccount,
    showCircleEvmEmailPay,
    circleEvmEmailSession?.wallet.address,
    circleEvmEmailMerchantUnits?.toString(),
  ])

  // ── Auto-sweep keeper ─────────────────────────────────────────────────────
  useEffect(() => {
    setPaymentAttemptStarted(false)
    paymentVerificationStartBlockRef.current = null
  }, [chain, payMode])

  // ── V2 EVM: Generate linkId + compute ghost vault address ─────────────────
  useEffect(() => {
    if (payMode !== 'direct') return
    if (!isSupportedEvmPayChain(chain)) return
    const factoryAddr = FACTORY_V2_ADDRESSES[chain]
    if (!factoryAddr) {
      setDirectError('Direct payment is not configured for this network.')
      setDirectStatus('error')
      return
    }
    const evmRecipient = isAddress(activeRecipient) ? activeRecipient as `0x${string}` : null
    if (!evmRecipient) return

    const params  = new URLSearchParams(window.location.search)
    const idParam = params.get('id')
    let linkId: `0x${string}`
    if (idParam && /^0x[0-9a-fA-F]{64}$/.test(idParam)) {
      linkId = idParam as `0x${string}`
    } else {
      const bytes = crypto.getRandomValues(new Uint8Array(32))
      linkId = ('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`
      params.set('id', linkId)
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
    }
    setDirectLinkId(linkId)

    const client = EVM_CLIENTS[chain]
    let cancelled = false
    client.readContract({
      address:      factoryAddr,
      abi:          [{ name: 'getVaultAddress', type: 'function' as const, stateMutability: 'view' as const,
        inputs: [{ name: 'linkId', type: 'bytes32' as const }, { name: 'recipient', type: 'address' as const }],
        outputs: [{ name: '', type: 'address' as const }],
      }],
      functionName: 'getVaultAddress',
      args:         [linkId, resolvedEvm as `0x${string}`],
    }).then(addr => {
      if (!cancelled) {
        setDirectVault(addr as `0x${string}`)
        setDirectStatus('waiting')
        directRelayedRef.current = false
      }
    }).catch(() => {})
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payMode, resolvedEvm, chain])

  // ── V2 EVM: Poll balance at ghost vault; trigger relay on arrival ─────────
  // Base/Arc/Arbitrum: polls ERC-20 USDC balance.
  useEffect(() => {
    if (directStatus !== 'waiting' || !directVault || !directLinkId) return
    if (!isSupportedEvmPayChain(chain)) return

    const evmChain  = chain
    const client    = EVM_CLIENTS[evmChain]
    const token     = CHAIN_META[evmChain].tokenAddress as `0x${string}`

    const check = async () => {
      if (directRelayedRef.current) return
      try {
        let balance: bigint
        balance = await client.readContract({
          address:      token,
          abi:          ERC20_BALANCE_OF_ABI,
          functionName: 'balanceOf',
          args:         [directVault],
        }) as bigint

        if (balance > 0n && !directRelayedRef.current) {
          directRelayedRef.current = true
          if (directPollRef.current) clearInterval(directPollRef.current)
          setReceivedAmount(balance)
          setDirectStatus('relaying')
          fetch('/api/relay-v2', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ linkId: directLinkId, recipient: resolvedEvm, chain: evmChain }),
          })
            .then(r => r.json())
            .then((data: { ok: boolean; txHash?: string; error?: string }) => {
              if (data.ok && data.txHash) {
                setDirectTxHash(data.txHash)
                setDirectStatus('success')
              } else {
                setDirectError(data.error ?? 'Relay failed')
                setDirectStatus('error')
              }
            })
            .catch((e: Error) => {
              setDirectError(e.message ?? 'Relay failed')
              setDirectStatus('error')
            })
        }
      } catch { /* ignore poll errors — retry next tick */ }
    }

    directPollRef.current = setInterval(check, 3000)
    check()
    return () => { if (directPollRef.current) clearInterval(directPollRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directStatus, directVault, directLinkId, chain])


  // ── Solana Send-via-Address: generate linkId + fetch vault ATA ───────────
  useEffect(() => {
    if (chain !== 'solana' || payMode !== 'direct' || !resolvedSolana) return
    const params    = new URLSearchParams(window.location.search)
    const idParam   = params.get('sid')
    let linkId: string
    if (idParam) {
      linkId = idParam
    } else {
      const bytes = crypto.getRandomValues(new Uint8Array(16))
      linkId = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
      params.set('sid', linkId)
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
    }
    setSolanaLinkId(linkId)
    setSolanaVaultAddr(null)
    setSolanaDirectStatus('idle')
    fetch(`/api/solana-vault?linkId=${encodeURIComponent(linkId)}&recipient=${encodeURIComponent(resolvedSolana)}`)
      .then(r => r.json())
      .then((data: { ok: boolean; vaultAddress?: string; error?: string }) => {
        if (data.ok && data.vaultAddress) {
          setSolanaVaultAddr(data.vaultAddress)
          setSolanaDirectStatus('waiting')
        } else {
          setSolanaDirectError(data.error ?? 'Could not derive vault address')
          setSolanaDirectStatus('error')
        }
      })
      .catch(() => {
        setSolanaDirectError('Network error — could not reach relay server')
        setSolanaDirectStatus('error')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, payMode, resolvedSolana])

  // ── Solana Send-via-Address: poll server for sweep ────────────────────────
  useEffect(() => {
    if (solanaDirectStatus !== 'waiting' || !solanaLinkId || !resolvedSolana || chain !== 'solana') return
    let cancelled = false

    const check = async () => {
      if (cancelled) return
      try {
        const res = await fetch('/api/solana-sweep', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ linkId: solanaLinkId, recipient: resolvedSolana }),
        })
        const data = await res.json() as { ok: boolean; status?: string; txHash?: string; recipientAmount?: string; error?: string }
        if (data.ok && data.status === 'swept' && data.txHash) {
          if (data.recipientAmount) setReceivedAmount(BigInt(data.recipientAmount))
          setSolanaDirectTxHash(data.txHash)
          setSolanaDirectStatus('success')
          setSolanaLinkId(null)
        } else if (res.status === 503 || (data.error && data.status !== 'waiting')) {
          // Hard error (relay not configured, tx failure) — stop polling, show error
          setSolanaDirectError(data.error ?? 'Relay unavailable')
          setSolanaDirectStatus('error')
        }
        // status==='waiting' → no USDC yet, keep polling silently
      } catch { /* network hiccup — retry next tick */ }
    }

    const timer = setInterval(check, 3000)
    check()
    return () => { cancelled = true; clearInterval(timer) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solanaDirectStatus, solanaLinkId, resolvedSolana, chain])

  // ── Solana: mark confirmed when direct send succeeds ─────────────────────
  useEffect(() => {
    if (solanaDirectStatus === 'success') setIsSolanaConfirmed(true)
  }, [solanaDirectStatus])

  // ── Manual claim fallback ─────────────────────────────────────────────────
  // ── "Check Status" button ─────────────────────────────────────────────────
  useEffect(() => {
    if (manualPayDetected || chain === 'solana' || !resolvedEvm || payMode !== 'wallet') {
      setShowCheckButton(false)
      return
    }
    const alreadyConfirmed =
      isEvmConfirmed ||
      isCirclePaymasterConfirmed ||
      basePaymasterStatus?.status === 'success'
    const submittedOrFinalizing =
      circleEvmPaymentProcessing ||
      circlePasskeyPending ||
      circlePaymasterPending ||
      circleEvmAcceptedPending ||
      isEvmConfirming ||
      isCirclePaymasterConfirming ||
      isBasePaymasterConfirming ||
      !!evmTxHash ||
      !!circlePaymasterTxHash ||
      !!basePaymasterTxHash ||
      !!basePaymasterCallId
    if (alreadyConfirmed || !submittedOrFinalizing) {
      setShowCheckButton(false)
      return
    }
    setShowCheckButton(false)
    const timer = setTimeout(() => setShowCheckButton(true), 12_000)
    return () => clearTimeout(timer)
  }, [
    manualPayDetected,
    chain,
    resolvedEvm,
    payMode,
    isEvmConfirmed,
    isCirclePaymasterConfirmed,
    basePaymasterStatus?.status,
    circleEvmPaymentProcessing,
    circlePasskeyPending,
    circlePaymasterPending,
    circleEvmAcceptedPending,
    isEvmConfirming,
    isCirclePaymasterConfirming,
    isBasePaymasterConfirming,
    evmTxHash,
    circlePaymasterTxHash,
    basePaymasterTxHash,
    basePaymasterCallId,
  ])

  useEffect(() => {
    if ((!circlePasskeyPending && !circleEvmPaymentProcessing) || manualPayDetected) return
    const timer = window.setTimeout(() => {
      if (manualPayDetected || circlePaymasterTxHash) return
      setCirclePasskeyPending(false)
      setCircleEvmPaymentProcessing(false)
      setCircleEvmAcceptedPending(false)
      setShowCheckButton(false)
      setCirclePasskeyError('Circle Smart Wallet confirmation did not finish. Please retry.')
    }, 125_000)
    return () => window.clearTimeout(timer)
  }, [circlePasskeyPending, circleEvmPaymentProcessing, manualPayDetected, circlePaymasterTxHash])

  async function handleManualCheck() {
    const evmRecipient = isAddress(activeRecipient) ? activeRecipient as `0x${string}` : null
    const payerCandidate = circleEvmEmailSession?.wallet.address || circleSmartAccount || address || ''
    const expectedPayer = isAddress(payerCandidate) ? payerCandidate as `0x${string}` : null
    if (!evmRecipient || !expectedPayer || !paymentAttemptStarted) return
    if (isManualChecking) return
    setIsManualChecking(true)
    try {
      if (!isSupportedEvmPayChain(chain)) return
      const evmChain = chain
      const client   = EVM_CLIENTS[evmChain]
      const knownTxHash = (circlePaymasterTxHash ?? basePaymasterTxHash ?? evmTxHash) as `0x${string}` | null
      if (knownTxHash) {
        try {
          const receipt = await client.getTransactionReceipt({ hash: knownTxHash })
          if (receipt.status === 'success') {
            setManualTxHash(knownTxHash)
            setReceivedAmount(expectedEvmRecipientUnits())
            setCircleEvmPaymentProcessing(false)
            setCirclePasskeyPending(false)
            setCircleEvmAcceptedPending(false)
            setCirclePasskeyError(null)
            setManualPayDetected(true)
            setShowCheckButton(false)
            return
          }
        } catch { /* receipt may not be indexed yet; fall through to transfer scan */ }
      }
      {
        const tokenAddress = CHAIN_META[evmChain].tokenAddress
        const target = evmRecipient
        const expectedUnits = expectedEvmRecipientUnits()
        const scanUnits = receivedAmount != null && receivedAmount > 0n ? receivedAmount : expectedUnits
        const latestBlock = await client.getBlockNumber()
        const paymentStartBlock = paymentVerificationStartBlockRef.current
        if (paymentStartBlock == null) return
        const fromBlock = paymentStartBlock
        if (fromBlock > latestBlock) return
        type TransferLog = {
          args: { value?: bigint }
          transactionHash?: `0x${string}` | null
        }
        const getTransferLogs = client.getLogs as unknown as (args: {
          address: `0x${string}`
          abi: typeof ERC20_TRANSFER_ABI
          eventName: 'Transfer'
          args: { from: `0x${string}`; to: `0x${string}` }
          fromBlock: bigint
          toBlock: bigint
        }) => Promise<TransferLog[]>
        const logs = await getTransferLogs({
          address: tokenAddress,
          abi: ERC20_TRANSFER_ABI,
          eventName: 'Transfer',
          args: { from: expectedPayer, to: target },
          fromBlock,
          toBlock: latestBlock,
        })
        const match = [...logs].reverse().find(log => {
          const value = (log.args as { value?: bigint }).value ?? 0n
          return value >= (isHostedCheckout ? scanUnits : scanUnits * 98n / 100n)
        })
        if (match?.transactionHash) {
          const value = (match.args as { value?: bigint }).value ?? scanUnits
          setReceivedAmount(value)
          setManualTxHash(match.transactionHash)
          setCircleEvmPaymentProcessing(false)
          setCirclePasskeyPending(false)
          setCircleEvmAcceptedPending(false)
          setCirclePasskeyError(null)
          setManualPayDetected(true)
          setShowCheckButton(false)
        }
      }
    } catch { /* ignore */ }
    finally {
      setIsManualChecking(false)
    }
  }

  async function lookupPaymentTxHash() {
    const evmRecipient = isAddress(activeRecipient) ? activeRecipient as `0x${string}` : null
    const payerCandidate = circleEvmEmailSession?.wallet.address || circleSmartAccount || address || ''
    const expectedPayer = isAddress(payerCandidate) ? payerCandidate as `0x${string}` : null
    const paymentStartBlock = paymentVerificationStartBlockRef.current
    if (!evmRecipient || !expectedPayer || paymentStartBlock == null || manualTxHash || chain === 'solana') return
    const recoveryLookup = txSyncTick >= 30
    const amountUnits = receivedAmount != null && receivedAmount > 0n
      ? receivedAmount
      : expectedEvmRecipientUnits()
    if (amountUnits <= 0n) return
    try {
      const res = await fetch('/api/payment-tx-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chain,
          payer: expectedPayer,
          recipient: evmRecipient,
          amountUnits: amountUnits.toString(),
          recovery: recoveryLookup,
          strict: isNgPosPayment || isHostedCheckout,
          fromBlock: paymentStartBlock.toString(),
        }),
      })
      const data = await res.json() as {
        ok?: boolean
        found?: boolean
        txHash?: `0x${string}`
        amountUnits?: string
      }
      if (data.ok && data.found && data.txHash) {
        setManualTxHash(data.txHash)
        if (data.amountUnits) {
          try {
            setReceivedAmount(BigInt(data.amountUnits))
          } catch { /* keep existing detected amount */ }
        }
        setCircleEvmPaymentProcessing(false)
        setCirclePasskeyPending(false)
        setCircleEvmAcceptedPending(false)
        setCirclePasskeyError(null)
        setShowCheckButton(false)
      }
    } catch { /* retry on next poll */ }
  }

  useEffect(() => {
    if (!circleEvmAcceptedPending || manualPayDetected || chain === 'solana' || payMode !== 'wallet') return
    const timer = setInterval(() => {
      if (!isManualChecking) void handleManualCheck()
    }, 5_000)
    return () => clearInterval(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circleEvmAcceptedPending, manualPayDetected, chain, payMode, isManualChecking])

  useEffect(() => {
    if (!manualPayDetected || manualTxHash || chain === 'solana' || !isAddress(activeRecipient)) return
    const first = setTimeout(() => {
      void lookupPaymentTxHash()
    }, 2_000)
    const timer = setInterval(() => {
      void lookupPaymentTxHash()
    }, 5_000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualPayDetected, manualTxHash, chain, activeRecipient, effectiveAmt, receivedAmount?.toString()])

  useEffect(() => {
    if (!isNgPosPaycrestOfframp || !paycrestOrder || manualTxHash || !manualPayDetected) return
    let cancelled = false
    let attempts = 0

    async function syncPaycrestOrderTx() {
      attempts += 1
      try {
        const res = await fetch('/api/ng-pos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'offrampStatus',
            intent_id: paycrestOrder?.intent_id,
            order_id: paycrestOrder?.paycrest_order_id,
            refresh: true,
          }),
        })
        const data = await res.json().catch(() => undefined) as {
          ok?: boolean
          order?: PaycrestCheckoutOrder
          receipt?: { receiptId?: string; receiptUrl?: string }
        } | undefined
        if (cancelled || !data?.ok || !data.order) return
        setPaycrestOrder(data.order)
        if (data.receipt?.receiptId) {
          setPaymentReceiptId(data.receipt.receiptId)
          setEventRegStatus('ok')
        }
        const nextHash = data.order.tx_hash
        if (nextHash && /^0x[a-fA-F0-9]{64}$/.test(nextHash)) {
          setManualTxHash(nextHash as `0x${string}`)
          try {
            setReceivedAmount(parseUnits(data.order.amount_usdc || payableAmt || '0', meta.decimals))
          } catch { /* keep existing detected amount */ }
          setPaycrestStatusText('Payment detected. Preparing receipt.')
          return
        }
      } catch {
        // Keep the local tx scanner running; Paycrest status polling is a second recovery path.
      }
      if (!cancelled && attempts < 60 && !manualTxHash) {
        window.setTimeout(syncPaycrestOrderTx, attempts < 20 ? 2_000 : 5_000)
      }
    }

    void syncPaycrestOrderTx()
    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNgPosPaycrestOfframp, manualPayDetected, manualTxHash, paycrestOrder?.intent_id, paycrestOrder?.paycrest_order_id])

  useEffect(() => {
    if (!isBankSendPayment || !paycrestOrder?.intent_id) return
    let cancelled = false
    let attempts = 0

    function classifyStatus(value: string | undefined): typeof bankSendStatus {
      const status = String(value || '').trim().toLowerCase()
      if (status === 'settled' || status === 'validated') return 'settled'
      if (status === 'expired') return 'expired'
      if (status === 'refunding' || status === 'refunded') return 'refunding'
      if (['pending', 'deposited', 'fulfilling', 'fulfilled', 'settling'].includes(status)) return 'pending'
      return 'waiting'
    }

    async function syncBankSendOrderStatus() {
      attempts += 1
      try {
        const res = await fetch('/api/ng-pos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'offrampStatus',
            intent_id: paycrestOrder.intent_id,
            order_id: paycrestOrder.paycrest_order_id,
            refresh: true,
          }),
        })
        const data = await res.json().catch(() => undefined) as {
          ok?: boolean
          order?: PaycrestCheckoutOrder
          receipt?: { receiptId?: string; receiptUrl?: string }
          error?: string
        } | undefined
        if (cancelled) return
        if (!res.ok || !data?.ok || !data.order) throw new Error(data?.error || 'Could not refresh bank transfer status.')
        setPaycrestOrder(data.order)
        if (data.receipt?.receiptId) setPaymentReceiptId(data.receipt.receiptId)
        const nextStatus = classifyStatus(data.order.status)
        setBankSendStatus(nextStatus)
        if (nextStatus === 'settled') {
          setPaycrestStatusText('USDC settlement confirmed.')
          return
        }
        if (nextStatus === 'expired') {
          setPaycrestStatusText('')
          setBankSendError('This bank transfer instruction expired. Create a new transfer instruction before paying.')
          return
        }
        if (nextStatus === 'refunding') {
          setPaycrestStatusText('Refund is in progress or completed. Your verified refund account will be used where a refund is required.')
          return
        }
        const providerStatus = String(data.order.status || '').trim().toLowerCase()
        const detected =
          Boolean(data.order.tx_hash) ||
          ['deposited', 'fulfilling', 'fulfilled', 'settling'].includes(providerStatus)
        const expectedTransfer = Number.parseFloat(data.order.provider_amount_to_transfer || data.order.amount_ngn || '')
        const amountPaid = Number.parseFloat(data.order.provider_amount_paid || '')
        const amountDelta =
          Number.isFinite(expectedTransfer) && Number.isFinite(amountPaid)
            ? amountPaid - expectedTransfer
            : 0
        const hasAmountMismatch =
          Number.isFinite(expectedTransfer) &&
          Number.isFinite(amountPaid) &&
          amountPaid > 0 &&
          Math.abs(amountDelta) >= 0.01
        setPaycrestStatusText(
          hasAmountMismatch
            ? `${amountDelta > 0 ? 'Overpayment' : 'Underpayment'} detected: expected ${formatAmount(expectedTransfer, 2)} NGN and received ${formatAmount(amountPaid, 2)} NGN. Waiting for settlement or refund update.`
            : detected
            ? 'Transfer received. USDC settlement is in progress.'
            : 'Waiting for bank transfer confirmation. Keep this page open; settlement can take a few minutes after your bank sends the money.',
        )
      } catch (error) {
        if (!cancelled) {
          setBankSendStatus('error')
          setBankSendError(readableErrorMsg(error, 'Could not refresh bank transfer status.'))
        }
      }
      if (!cancelled && attempts < 120) {
        window.setTimeout(syncBankSendOrderStatus, attempts < 30 ? 5_000 : 15_000)
      }
    }

    setBankSendStatus(classifyStatus(paycrestOrder.status))
    void syncBankSendOrderStatus()
    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBankSendPayment, paycrestOrder?.intent_id])

  useEffect(() => {
    if (manualTxHash || !manualPayDetected || chain === 'solana') return
    const timer = setInterval(() => setTxSyncTick(tick => tick + 1), 1_000)
    return () => clearInterval(timer)
  }, [manualTxHash, manualPayDetected, chain])

  // ── Auto-switch network when wallet connects ──────────────────────────────
  useEffect(() => {
    if (isEvmChain && isConnected && !isCorrectNetwork && !isSwitching)
      switchChain({ chainId: targetChainId })
  }, [isEvmChain, isConnected, isCorrectNetwork, isSwitching, switchChain, targetChainId])

  // ── Chain switch ──────────────────────────────────────────────────────────
  function handleChainSwitch(c: ChainKey) {
    if (c === chain) return
    // Chains that don't support Send via Address — fall back to wallet connect
    // Auto-disconnect: switching TO Solana drops EVM; switching AWAY from Solana drops Solana
    if (c === 'solana' && isConnected) disconnectEvm()
    if (c !== 'solana' && solanaWalletAddr) disconnectSolana()
    onPayChainChange(c)   // mirror in header pill (non-interactive, display only)
    setChain(c)
    resetEvmSend()
    resetPermitSign()
    setIsSolanaPending(false); setIsSolanaConfirming(false); setIsSolanaConfirmed(false)
    setSolanaError(null); setSolanaTxHash(null)
    setSolanaLinkId(null); setSolanaVaultAddr(null)
    setSolanaDirectStatus('idle'); setSolanaDirectTxHash(null); setSolanaDirectError(null)
    setCircleSolanaPending(false); setCircleSolanaError(null); setCircleSolanaBalance(null); setCircleSolanaBalanceError(false)
    setCircleSolanaSession(null); setCircleSolanaAddress(''); setCircleSolanaCopied(false)
    setManualPayDetected(false); setManualTxHash(null); setReceivedAmount(null)
    setPaymentReceiptId(''); setPaymentReceipt(null)
    ordinaryReceiptRegistered.current = false
    setCirclePaymasterPending(false); setCirclePaymasterTxHash(null); setCirclePaymasterError(null)
    setCirclePasskeyPending(false); setCirclePasskeyError(null); setCircleSmartAccount(null); setCircleEvmEmailSession(null); setCircleEvmPaymentProcessing(false); setCircleEvmAcceptedPending(false); setCircleWalletCopied(false)
    setShowCheckButton(false)
    // Reset direct send state
    setDirectLinkId(null); setDirectVault(null)
    setDirectStatus('idle'); setDirectTxHash(null); setDirectError(null)
    directRelayedRef.current = false
    if (directPollRef.current) { clearInterval(directPollRef.current); directPollRef.current = null }
    if (isConnected && isSupportedEvmPayChain(c)) {
      const cid =
        c === 'base'    ? CHAIN_META.base.chainId    :
        c === 'arc'     ? CHAIN_META.arc.chainId     :
        CHAIN_META.arbitrum.chainId
      switchChain({ chainId: cid })
    }
  }

  // ── Copy handlers ─────────────────────────────────────────────────────────
  async function handleCopyAddress() {
    if (!displayAddress) return
    await copyToClipboard(displayAddress)
    setAddrCopied(true)
    setTimeout(() => setAddrCopied(false), 3000)
  }

  async function handleCopyCircleWallet() {
    if (!circleSmartAccount) return
    await copyToClipboard(circleSmartAccount)
    setCircleWalletCopied(true)
    setTimeout(() => setCircleWalletCopied(false), 2200)
  }

  async function handleCopyCircleSolanaWallet() {
    const walletAddress = circleSolanaSession?.wallet.address || circleSolanaAddress
    if (!walletAddress) return
    await copyToClipboard(walletAddress)
    setCircleSolanaCopied(true)
    setTimeout(() => setCircleSolanaCopied(false), 2200)
  }

  // ── Fetch Arbitrum USDC gas estimate when Arbitrum chain is active ───────
  useEffect(() => {
    if (chain !== 'arbitrum') return
    fetch('/api/relay-arbitrum-usdc')
      .then(r => r.json())
      .then((d: { ok: boolean; gasReimbUsdc?: string }) => {
        if (d.gasReimbUsdc) setArbitrumGasEstimate(BigInt(d.gasReimbUsdc))
      })
      .catch(() => {})
  }, [chain])

  // ── Arbitrum USDC relay pay — relayer submits tx, payer only signs ───────
  async function handleArbitrumRelayPay() {
    if (!address || !activeRecipient) return
    setArbitrumRelayError(null)
    setArbitrumRelayPending(true)

    const tokenAddress = CHAIN_META.arbitrum.tokenAddress
    const totalUnits   = parseUnits(effectiveAmt || '0', CHAIN_META.arbitrum.decimals)
    const deadline     = BigInt(Math.floor(Date.now() / 1000) + 3600)
    const nonce        = permitNonce ?? 0n
    let gasReimbUnitsForPermit = arbitrumGasEstimate ?? 0n

    // Refresh gas estimate just before signing so it's accurate
    try {
      const est = await fetch('/api/relay-arbitrum-usdc').then(r => r.json()) as { ok: boolean; gasReimbUsdc?: string }
      if (est.gasReimbUsdc) {
        gasReimbUnitsForPermit = BigInt(est.gasReimbUsdc)
        setArbitrumGasEstimate(gasReimbUnitsForPermit)
      }
    } catch { /* use cached */ }
    const feeUnitsForPermit = totalUnits * BigInt(PLATFORM_FEE_BPS) / 10_000n
    const permitUnits = grossUpEvmPlatformCharges
      ? totalUnits + feeUnitsForPermit + gasReimbUnitsForPermit
      : totalUnits

    try {
      const sig = await signTypedDataAsync({
        domain: { name: 'USD Coin', version: '2', chainId: 42161, verifyingContract: tokenAddress },
        types: {
          Permit: [
            { name: 'owner',    type: 'address' },
            { name: 'spender',  type: 'address' },
            { name: 'value',    type: 'uint256' },
            { name: 'nonce',    type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
          ],
        },
        primaryType: 'Permit',
        message: { owner: address, spender: MULTICALL3_ADDRESS, value: permitUnits, nonce, deadline },
      })

      const { v, r, s } = parseSignature(sig)

      const relayRes = await fetch('/api/relay-arbitrum-usdc', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner:     address,
          recipient: activeRecipient,
          amount:    totalUnits.toString(),
          feeMode:   grossUpEvmPlatformCharges ? 'gross' : 'net',
          deadline:  deadline.toString(),
          v:         Number(v),
          r,
          s,
        }),
      })
      const data = await relayRes.json() as { ok: boolean; txHash?: `0x${string}`; error?: string }
      if (!data.ok || !data.txHash) throw new Error(data.error ?? 'Relay failed')
      setArbitrumRelayHash(data.txHash)
    } catch (err) {
      setArbitrumRelayError(err instanceof Error ? friendlyErrorMsg(err.message) : 'Relay failed')
    } finally {
      setArbitrumRelayPending(false)
    }
  }

  // ── Payment handlers ──────────────────────────────────────────────────────
  function blockedAmountError() {
    return SMART_WALLET_AMOUNT_ERROR
  }

  async function lockHostedCheckoutNetwork() {
    if (!isHostedCheckout) return true
    try {
      const response = await fetch(`/api/v2/checkouts?id=${encodeURIComponent(hostedCheckoutId)}&attempt=${encodeURIComponent(hostedAttemptId)}&action=select-network`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ network: chain }),
      })
      const body = await response.json().catch(() => undefined) as { ok?: boolean; paymentAttempt?: { network?: string }; error?: string } | undefined
      if (!response.ok || !body?.ok || body.paymentAttempt?.network !== chain) {
        throw new Error(body?.error || 'The selected payment network could not be secured.')
      }
      setHostedLockedNetwork(chain)
      return true
    } catch (error) {
      setHostedIntentStatus('error')
      setHostedIntentError(error instanceof Error ? error.message : 'The selected payment network could not be secured.')
      return false
    }
  }

  async function handlePay() {
    if (!activeRecipient) return
    if (!await lockHostedCheckoutNetwork()) return
    setPaymentAttemptStarted(true)
    await beginPaymentVerificationWindow()
    if (chain === 'arbitrum') await handleArbitrumPay()
    else if (chain === 'base' || chain === 'arc') await handleEvmPermitPay()
    else await handleSolanaPay()
  }

  async function refreshCircleSolanaBalance(walletAddress = circleSolanaSession?.wallet.address || circleSolanaAddress) {
    if (!walletAddress) return
    setCircleSolanaFetching(true)
    setCircleSolanaBalanceError(false)
    try {
      const res = await fetch('/api/solana-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountAddress: walletAddress }),
      })
      const data = await res.json() as { ok: boolean; balance?: string; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Solana balance unavailable')
      setCircleSolanaBalance(BigInt(data.balance ?? '0'))
    } catch {
      setCircleSolanaBalance(null)
      setCircleSolanaBalanceError(true)
    } finally {
      setCircleSolanaFetching(false)
    }
  }

  useEffect(() => {
    const walletAddress = circleSolanaSession?.wallet.address || circleSolanaAddress
    if (!walletAddress || chain !== 'solana') return
    void refreshCircleSolanaBalance(walletAddress)
    const timer = setInterval(() => {
      void refreshCircleSolanaBalance(walletAddress)
    }, 4_000)
    return () => clearInterval(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circleSolanaSession?.wallet.address, circleSolanaAddress, chain])

  async function handleCircleSolanaEmailPay() {
    if (!resolvedSolana || !showCircleSolanaEmailPay) return
    if (!isValidSolanaAddress(resolvedSolana)) {
      setCircleSolanaError('Recipient Solana address is invalid. Ask the organizer for a new payment link.')
      return
    }
    if (paymentAmountBlocked || !effectiveAmt || parseFloat(effectiveAmt) <= 0) {
      setCircleSolanaError(blockedAmountError())
      return
    }
    const email = (showPrivyCircleSolanaEmailPay ? privyEmail : circleSolanaEmail).trim()
    if (!email && !circleSolanaSession) {
      setCircleSolanaError(showPrivyCircleSolanaEmailPay ? 'Sign in with a Privy email account to use Circle Smart Wallet.' : 'Enter your email to continue with Smart wallet.')
      return
    }

    if (!await lockHostedCheckoutNetwork()) return
    setPaymentAttemptStarted(true)
    setCircleSolanaPending(true)
    setCircleSolanaError(null)
    let wasConnecting = false
    try {
      let session = circleSolanaSession
      if (!session) {
        wasConnecting = true
        session = await connectCircleSolanaEmailWallet(email)
        setCircleSolanaSession(session)
        setCircleSolanaAddress(session.wallet.address)
        if (solanaWalletAddr) disconnectSolana()
        if (PRIVY_AUTH_ENABLED && privyAuthenticated) {
          try {
            const token = await getAccessToken()
            if (token) {
              await linkPocketWallet({
                accessToken: token,
                network: 'solana',
                circleUserToken: session.userToken,
                wallet: {
                  id: session.wallet.id,
                  address: session.wallet.address,
                  blockchain: session.wallet.blockchain,
                },
              })
              setPrivyCircleLinkError(null)
            }
          } catch (err) {
            console.warn('[PayLink] Privy Circle Solana wallet link save failed', err)
            setPrivyCircleLinkError(readableErrorMsg(err, 'Circle wallet connected, but Privy linking was not saved.'))
          }
        }
        await refreshCircleSolanaBalance(session.wallet.address)
        return
      }

      if (circleSolanaBalance !== null && !circleSolanaHasEnough) {
        setCircleSolanaError(SMART_WALLET_FUNDING_ERROR)
        return
      }

      const buildRes = await fetch('/api/solana-build-tx', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          from: session.wallet.address,
          to: resolvedSolana,
          amount: effectiveAmt,
          feeMode: grossUpSolanaPlatformCharges ? 'gross' : 'net',
        }),
      })
      const buildData = await readApiJson<{ ok: boolean; tx?: string; lastValidBlockHeight?: number; error?: string }>(buildRes, 'Solana build')
      if (!buildData.ok || !buildData.tx || !buildData.lastValidBlockHeight) throw new Error(buildData.error ?? 'Failed to build transaction')

      const signedB64 = await signCircleSolanaTransaction({
        session,
        rawTransaction: buildData.tx,
        memo: `Hash PayLink ${formatAmount(effectiveAmt, 6)} USDC`,
      })

      setIsSolanaPending(false)
      setIsSolanaConfirming(true)
      const relayRes = await fetch('/api/solana-relay', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tx: signedB64, lastValidBlockHeight: buildData.lastValidBlockHeight }),
      })
      const relayData = await readApiJson<{ ok: boolean; txHash?: string; error?: string }>(relayRes, 'Solana relay')
      if (!relayData.ok || !relayData.txHash) throw new Error(relayData.error ?? 'Relay failed')
      setSolanaTxHash(relayData.txHash)
      setIsSolanaConfirming(false)
      setIsSolanaConfirmed(true)
      void refreshCircleSolanaBalance(session.wallet.address)
    } catch (err) {
      console.error('[circle-solana-email] payment failed:', err)
      const msg = readableErrorMsg(err, 'Circle Solana wallet payment failed.')
      if (wasConnecting) setCircleSolanaSession(null)
      setCircleSolanaError(msg.slice(0, 160))
      setIsSolanaConfirming(false)
    } finally {
      setCircleSolanaPending(false)
    }
  }

  async function handleSolanaPay() {
    if (!isValidSolanaAddress(resolvedSolana)) {
      setSolanaError('Recipient Solana address is invalid. Ask the organizer for a new payment link.')
      return
    }
    if (!solanaWalletAddr) {
      setSolanaError('Sign in with a Solana wallet to continue.')
      return
    }
    setIsSolanaPending(true); setSolanaError(null)
    try {
      const buildRes = await fetch('/api/solana-build-tx', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          from: solanaWalletAddr,
          to: resolvedSolana,
          amount: effectiveAmt,
          feeMode: grossUpSolanaPlatformCharges ? 'gross' : 'net',
        }),
      })
      const buildData = await readApiJson<{ ok: boolean; tx?: string; lastValidBlockHeight?: number; error?: string }>(buildRes, 'Solana build')
      if (!buildData.ok || !buildData.tx || !buildData.lastValidBlockHeight) throw new Error(buildData.error ?? 'Failed to build transaction')

      const { Transaction } = await import('@solana/web3.js')
      const txBytes = Uint8Array.from(atob(buildData.tx), c => c.charCodeAt(0))
      const tx = Transaction.from(txBytes)
      const signedTx = await signSolanaTransaction(tx)

      const bytes = (signedTx as { serialize: () => Uint8Array }).serialize()
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const signedB64 = btoa(binary)

      setIsSolanaPending(false); setIsSolanaConfirming(true)

      const relayRes = await fetch('/api/solana-relay', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tx: signedB64, lastValidBlockHeight: buildData.lastValidBlockHeight }),
      })
      const relayData = await readApiJson<{ ok: boolean; txHash?: string; error?: string }>(relayRes, 'Solana relay')
      if (!relayData.ok || !relayData.txHash) throw new Error(relayData.error ?? 'Relay failed')

      setSolanaTxHash(relayData.txHash)
      setIsSolanaConfirming(false); setIsSolanaConfirmed(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction rejected'
      setSolanaError(msg.slice(0, 160))
      setIsSolanaPending(false); setIsSolanaConfirming(false)
    }
  }

  function isUserRejected(err: unknown) {
    const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
    return msg.includes('user rejected') || msg.includes('user denied') || msg.includes('rejected the request')
  }

  function isCircleSmartWalletCancelled(message: string) {
    const msg = message.toLowerCase()
    return (
      msg.includes('cancel') ||
      msg.includes('user denied') ||
      msg.includes('user rejected') ||
      msg.includes('circle wallet action did not complete') ||
      msg.includes('circle smart wallet confirmation did not finish') ||
      msg.includes('email verification was cancelled or expired')
    )
  }

  function resetCircleSmartWalletPending() {
    setCirclePasskeyPending(false)
    setCircleEvmPaymentProcessing(false)
    setCircleEvmAcceptedPending(false)
    setShowCheckButton(false)
  }

  function isSendCallsUnavailable(err: unknown) {
    const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
    return msg.includes('wallet_sendcalls') && (
      msg.includes('does not exist') ||
      msg.includes('not available') ||
      msg.includes('unsupported') ||
      msg.includes('not supported')
    )
  }

  async function tryBasePaymasterCall(data: `0x${string}`): Promise<'sent' | 'failed' | 'unavailable'> {
    if (chain !== 'base' || !address || !BASE_PAYMASTER_URL || !basePaymasterAvailable) return 'unavailable'

    try {
      setBasePaymasterError(null)
      setBasePaymasterTxHash(null)
      setBasePaymasterCallId(null)
      const result = await sendSponsoredCallsAsync({
        account: address,
        chainId: CHAIN_META.base.chainId,
        calls: [{ to: MULTICALL3_ADDRESS, value: 0n, data }],
        capabilities: {
          paymasterService: {
            url: BASE_PAYMASTER_URL,
          },
        },
      })
      setBasePaymasterCallId(result.id)
      return 'sent'
    } catch (err) {
      if (isSendCallsUnavailable(err)) return 'unavailable'

      const fallbackMessage = isMainHashPaylinkPayment
        ? 'Sponsored Base transaction was not accepted. Use Coinbase Smart Wallet/Base Account, or pay from an exchange or another wallet.'
        : 'Sponsored Base transaction was not accepted. Try again or use another available payment method.'
      if (isUserRejected(err)) {
        setBasePaymasterError('Sponsored transaction rejected in wallet.')
      } else {
        const msg = err instanceof Error ? err.message : String(err)
        setBasePaymasterError(msg ? msg.slice(0, 160) : fallbackMessage)
      }
      return 'failed'
    }
  }

  async function tryCirclePaymasterTransfer(
    recipientUnits: bigint,
    feeUnits: bigint,
    opts: { surfaceUnavailable?: boolean } = {},
  ): Promise<'sent' | 'failed' | 'unavailable'> {
    const config = getCirclePaymasterConfig(chain)
    if (!config || !address || !walletClient || !activeRecipient) {
      if (opts.surfaceUnavailable) {
        setCirclePaymasterError(isMainHashPaylinkPayment
          ? 'USDC gas is unavailable. Pay from an exchange or another wallet, or continue with ETH gas.'
          : 'USDC gas is unavailable. Try again or continue with ETH gas.')
      }
      return 'unavailable'
    }

    setCirclePaymasterPending(true)
    setCirclePaymasterError(null)
    setCirclePaymasterTxHash(null)
    try {
      const result = await sendCirclePaymasterPayment({
        chain,
        walletClient,
        payer: address,
        recipient: activeRecipient as `0x${string}`,
        treasury: EVM_TREASURY,
        recipientUnits,
        feeUnits,
      })
      if (result.status === 'sent') {
        setCirclePaymasterTxHash(result.txHash)
        return 'sent'
      }
      if (result.status === 'unavailable') {
        if (opts.surfaceUnavailable) {
          setCirclePaymasterError(isMainHashPaylinkPayment
            ? 'USDC gas is unavailable for this wallet. Pay from an exchange or another wallet, or continue with ETH gas.'
            : 'USDC gas is unavailable for this wallet. Try again or continue with ETH gas.')
        }
        return 'unavailable'
      }
      setCirclePaymasterError(result.reason)
      return 'failed'
    } finally {
      setCirclePaymasterPending(false)
    }
  }

  async function handleArbitrumPay() {
    await handleArbitrumRelayPay()
  }

  async function handleCirclePaymasterPay() {
    if (!address || !activeRecipient || !showCirclePaymasterButton) return
    const decimals = chain === 'arbitrum' ? CHAIN_META.arbitrum.decimals : CHAIN_META.base.decimals
    const totalUnits = parseUnits(effectiveAmt || '0', decimals)
    const { sponsoredRecipientUnits, sponsoredTreasuryUnits } = evmPaymentBreakdown(totalUnits, decimals)
    await tryCirclePaymasterTransfer(sponsoredRecipientUnits, sponsoredTreasuryUnits, { surfaceUnavailable: true })
  }

  async function prepareNgPosPaycrestOrder(session: CircleEvmEmailSession) {
    if (!isNgPosPaycrestOfframp) return null
    if (paycrestOrder?.receive_address && paycrestOrder.amount_usdc) return paycrestOrder
    let settlementIntentId = ngPosPaycrestIntentId
    setPaycrestPreparing(true)
    setPaycrestStatusText('Preparing Naira payout...')
    try {
      if (!settlementIntentId) {
        const amountNgn = localAmt.trim()
        if (!isFlex || !ngPosMerchantId || !amountNgn || Number.parseFloat(amountNgn) <= 0) {
          throw new Error('Enter the Naira amount before preparing payout.')
        }
        const quoteResponse = await fetch('/api/ng-pos', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'quote',
            merchant_id: ngPosMerchantId,
            settlement_type: 'INSTANT_FIAT',
            amount_currency: 'NGN',
            amount: amountNgn,
            network: 'base',
            client_origin: window.location.origin,
          }),
        })
        const quoteData = await quoteResponse.json().catch(() => ({})) as {
          ok?: boolean
          quote?: { intent_id?: string; amount_usdc?: string; amount_ngn?: string }
          error?: string
        }
        if (!quoteResponse.ok || !quoteData.ok || !quoteData.quote?.intent_id) {
          throw new Error(quoteData.error || 'Could not prepare Naira quote.')
        }
        settlementIntentId = quoteData.quote.intent_id
      }
      const response = await fetch('/api/ng-pos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'createOfframpOrder',
          intent_id: settlementIntentId,
          refund_address: session.wallet.address,
          payer_wallet: session.wallet.address,
          payer_email: (showPrivyCircleEmailPay ? privyEmail : circleEmail).trim(),
          payer_name: attendeeName.trim(),
        }),
      })
      const data = await response.json().catch(() => ({})) as { ok?: boolean; order?: PaycrestCheckoutOrder; error?: string }
      if (!response.ok || !data.ok || !data.order) throw new Error(data.error || 'Could not prepare Naira payout.')
      setPaycrestOrder(data.order)
      setPaycrestStatusText('Naira payout ready. Review the bank account, then pay.')
      await refetchCircleWalletBalance()
      return data.order
    } catch (err) {
      setPaycrestStatusText('')
      setCirclePasskeyError(readableErrorMsg(err, 'Could not prepare Naira payout.'))
      return null
    } finally {
      setPaycrestPreparing(false)
    }
  }

  async function verifyBankSendRefundAccount() {
    setBankSendBankBusy(true)
    setBankSendError('')
    setBankSendBankVerified(false)
    setBankSendAccountName('')
    try {
      const response = await fetch('/api/ng-pos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'verifyAccount',
          bank_code: bankSendBankCode,
          bank_name: bankSendBankName,
          account_number: bankSendAccount,
        }),
      })
      const data = await response.json().catch(() => ({})) as { ok?: boolean; account_name?: string; bank_code?: string; error?: string }
      if (!response.ok || !data.ok) throw new Error(data.error || 'Account verification failed.')
      if (data.bank_code) setBankSendBankCode(String(data.bank_code).trim())
      setBankSendAccountName(String(data.account_name || '').trim())
      setBankSendBankVerified(true)
    } catch (error) {
      setBankSendError(readableErrorMsg(error, 'Account verification failed.'))
    } finally {
      setBankSendBankBusy(false)
    }
  }

  async function prepareBankSendPaycrestOrder() {
    if (!isBankSendPayment || paycrestOrder) return
    const amountNgn = isFlex ? localAmt.trim() : ngPosAmountNgn.trim()
    if (!bankSendLinkId) {
      setBankSendError('This bank-to-USDC link is missing its reference.')
      return
    }
    if (!amountNgn || Number.parseFloat(amountNgn) <= 0) {
      setBankSendError('Enter the Naira amount before continuing.')
      return
    }
    if (!bankSendBankVerified || !bankSendAccountName) {
      setBankSendError('Verify your refund bank account first.')
      return
    }
    setPaycrestPreparing(true)
    setBankSendError('')
    setPaycrestStatusText('Preparing bank transfer details...')
    try {
      const response = await fetch('/api/ng-pos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'createBankSendOrder',
          link_id: bankSendLinkId,
          amount: amountNgn,
          refund_bank_name: bankSendBankName,
          refund_bank_code: bankSendBankCode,
          refund_account_number: bankSendAccount,
          refund_account_name: bankSendAccountName,
          payer_email: circleEmail.trim(),
          payer_name: attendeeName.trim(),
        }),
      })
      const data = await response.json().catch(() => ({})) as { ok?: boolean; order?: PaycrestCheckoutOrder; error?: string }
      if (!response.ok || !data.ok || !data.order) throw new Error(data.error || 'Could not prepare bank transfer.')
      setPaycrestOrder(data.order)
      setBankSendStatus('waiting')
      setPaycrestStatusText('Bank transfer details ready. Send the exact amount before the deadline.')
    } catch (error) {
      setPaycrestStatusText('')
      setBankSendError(readableErrorMsg(error, 'Could not prepare bank transfer.'))
    } finally {
      setPaycrestPreparing(false)
    }
  }

  async function handleCirclePasskeyPay() {
    if (!showCircleEmailPay) return
    if (!paycrestNeedsPreparation && (!activeRecipient || !isAddress(activeRecipient))) return
    if (paymentAmountBlocked || (!paycrestNeedsPreparation && (!payableAmt || parseFloat(payableAmt) <= 0))) {
      setCirclePasskeyError(blockedAmountError())
      return
    }
    if (!paycrestNeedsPreparation && circleEvmWalletUnlocked && (circleWalletNeedsFunds || (circleSmartAccount && typeof circleWalletBalance === 'bigint' && !circleWalletHasEnough))) {
      resetCircleSmartWalletPending()
      setCirclePasskeyError(SMART_WALLET_FUNDING_ERROR)
      return
    }
    const email = (showPrivyCircleEmailPay ? privyEmail : circleEmail).trim()
    if (!email) {
      setCirclePasskeyError(showPrivyCircleEmailPay ? 'Sign in with a Privy email account to use Circle Smart Wallet.' : 'Enter your email to continue with Smart wallet.')
      return
    }

    if (!await lockHostedCheckoutNetwork()) return
    setPaymentAttemptStarted(true)
    setCirclePasskeyPending(true)
    setCirclePasskeyError(null)
    setCirclePaymasterTxHash(null)
    let wasConnecting = false
    try {
      if (showCircleEvmEmailPay) {
        let session = circleEvmEmailSession
        if (!session || session.chain !== chain) {
          wasConnecting = true
          session = await connectCircleEvmEmailWallet(email, chain)
          if (isConnected) disconnectEvm()
          setCircleEvmEmailSession(session)
          setCircleSmartAccount(session.wallet.address)
          if (PRIVY_AUTH_ENABLED && privyAuthenticated && (chain === 'base' || chain === 'arbitrum' || chain === 'arc')) {
            try {
              const token = await getAccessToken()
              if (token) {
                await linkPocketWallet({
                  accessToken: token,
                  network: chain,
                  circleUserToken: session.userToken,
                  wallet: session.wallet,
                })
                setPrivyCircleLinkError(null)
              }
            } catch (err) {
              console.warn('[PayLink] Privy Circle wallet link save failed', err)
              setPrivyCircleLinkError(readableErrorMsg(err, 'Circle wallet connected, but Privy linking was not saved.'))
            }
          }
          await refetchCircleWalletBalance()
          return
        }

        let preparedPaycrestOrder: PaycrestCheckoutOrder | null = null
        if (isNgPosPaycrestOfframp) {
          preparedPaycrestOrder = await prepareNgPosPaycrestOrder(session)
          if (!preparedPaycrestOrder) return
        }

        const paymentRecipient = preparedPaycrestOrder?.receive_address ?? activeRecipient
        const paymentAmount = preparedPaycrestOrder?.amount_usdc ?? payableAmt
        const paymentRequiredUnits = parseUnits(paymentAmount || '0', meta.decimals)
        lastCirclePaymentUnitsRef.current = paymentRequiredUnits

        if (!paymentRecipient || !isAddress(paymentRecipient) || !paymentAmount || parseFloat(paymentAmount) <= 0) {
          setCirclePasskeyError('Naira payout is not ready yet. Prepare the payout, then try again.')
          return
        }

        if (circleWalletBalance !== undefined && circleWalletBalance !== null && circleWalletBalance < paymentRequiredUnits) {
          resetCircleSmartWalletPending()
          setCirclePasskeyError(SMART_WALLET_FUNDING_ERROR)
          return
        }

        setCircleEvmPaymentProcessing(true)
        setCircleEvmAcceptedPending(false)
        await beginPaymentVerificationWindow()
        const txHash = await sendCircleEvmEmailPayment({
          session,
          recipient: paymentRecipient as `0x${string}`,
          amount: paymentAmount,
          feeMode: grossUpEvmPlatformCharges ? 'gross' : 'net',
          feeBps: hashPaylinkFeeBps,
        })
        if (txHash) {
          setCirclePaymasterTxHash(txHash)
        } else {
          setCircleEvmAcceptedPending(true)
          setShowCheckButton(true)
        }
        setCircleEvmPaymentProcessing(false)
        void refetchCircleWalletBalance()
        return
      }

      if (!circleSmartAccount) {
        const wallet = await prepareCirclePasskeyWallet(chain, email)
        if (wallet.status === 'ready') {
          if (isConnected) disconnectEvm()
          setCircleSmartAccount(wallet.smartAccount)
        } else {
          setCirclePasskeyError(wallet.reason)
        }
        return
      }

      await beginPaymentVerificationWindow()
      const result = await sendCirclePasskeyPayment({
        chain,
        email,
        recipient: activeRecipient as `0x${string}`,
        amount: payableAmt,
        feeMode: grossUpEvmPlatformCharges ? 'gross' : 'net',
        feeBps: hashPaylinkFeeBps,
      })
      if (result.smartAccount) {
        if (isConnected) disconnectEvm()
        setCircleSmartAccount(result.smartAccount)
      }
      if (result.status === 'sent') {
        setCirclePaymasterTxHash(result.txHash)
      } else {
        if (!circleWalletHasEnough) setCirclePasskeyError(result.reason)
      }
    } catch (err) {
      resetCircleSmartWalletPending()
      const message = readableErrorMsg(err, 'Circle email wallet payment failed.').slice(0, 160)
      if (isCircleSmartWalletCancelled(message)) {
        if (wasConnecting) {
          setCircleEvmEmailSession(null)
          setCircleSmartAccount(null)
        }
        setCirclePasskeyError(SMART_WALLET_CANCELLED_MESSAGE)
        return
      }
      if (message.toLowerCase().includes('transaction hash is not available yet')) {
        setCirclePasskeyError(null)
        setCircleEvmAcceptedPending(true)
        setCircleEvmPaymentProcessing(false)
        setReceivedAmount(null)
        setManualTxHash(null)
        setManualPayDetected(false)
        setShowCheckButton(true)
        void refetchCircleWalletBalance()
        return
      }
      if (wasConnecting) {
        setCircleEvmEmailSession(null)
        setCircleSmartAccount(null)
      }
      setCirclePasskeyError(message === 'Circle email wallet request failed.'
        ? 'Smart wallet setup failed. Try again.'
        : message)
    } finally {
      setCirclePasskeyPending(false)
      if (!manualPayDetected) setCircleEvmPaymentProcessing(false)
    }
  }

  async function handleEvmPermitPay() {
    if (isPrivyEmbeddedWalletConnected) {
      setBasePaymasterError('This Privy email wallet is not your Circle Smart Wallet. Open Pocket Wallet, or connect an external wallet.')
      return
    }
    if (!address) {
      setBasePaymasterError('Wallet is not connected. Sign in again and retry payment.')
      return
    }
    if (chainId !== targetChainId) {
      setBasePaymasterError(`Switch your wallet to ${meta.label}, then retry payment.`)
      try {
        await switchChainAsync({ chainId: targetChainId })
      } catch (err) {
        console.error('[PayLink] wallet chain switch failed', err)
        setBasePaymasterError(readableErrorMsg(err, `Could not switch wallet to ${meta.label}.`))
      }
      return
    }
    let providerChainId: number | undefined
    if (walletClient) {
      providerChainId = Number(await walletClient.request({ method: 'eth_chainId' }))
      if (providerChainId !== targetChainId) {
        setBasePaymasterError(`Rabby is still on ${CHAIN_DISPLAY_NAMES[providerChainId] ?? `Chain ${providerChainId}`}. Switch to ${meta.label}, then retry payment.`)
        try {
          await switchChainAsync({ chainId: targetChainId })
        } catch (err) {
          console.error('[PayLink] provider chain switch failed', err)
          setBasePaymasterError(readableErrorMsg(err, `Could not switch Rabby to ${meta.label}.`))
        }
        return
      }
    }
    const meta_       = chain === 'arc' ? CHAIN_META.arc : chain === 'arbitrum' ? CHAIN_META.arbitrum : CHAIN_META.base
    const tokenAddress = meta_.tokenAddress
    const deadline     = BigInt(Math.floor(Date.now() / 1000) + 3600)
    const totalUnits   = parseUnits(effectiveAmt || '0', meta_.decimals)
    const {
      feeUnits,
      treasuryUnits,
      sponsoredTreasuryUnits,
      recipientUnits,
      sponsoredRecipientUnits,
      requiredUnits,
    } = evmPaymentBreakdown(totalUnits, meta_.decimals)
    try {
      const tokenClient = EVM_CLIENTS[chain as 'base' | 'arc' | 'arbitrum']
      const payerBalance = await tokenClient.readContract({
        address: tokenAddress,
        abi: ERC20_BALANCE_OF_ABI,
        functionName: 'balanceOf',
        args: [address],
      })
      if (payerBalance < requiredUnits) {
        setBasePaymasterError(
          `Insufficient USDC on ${meta.label}. Need ${formatUnits(requiredUnits, meta_.decimals)} USDC; wallet has ${formatUnits(payerBalance, meta_.decimals)} USDC.`,
        )
        return
      }
    } catch (err) {
      console.warn('[PayLink] payer USDC balance preflight failed', err)
    }
    let livePermitName = permitTokenName
    let livePermitVersion = permitTokenVersion
    let livePermitNonce = permitNonce
    if (!livePermitName || !livePermitVersion || livePermitNonce == null) {
      try {
        const tokenClient = EVM_CLIENTS[chain as 'base' | 'arc' | 'arbitrum']
        const [name, version, freshNonce] = await Promise.all([
          tokenClient.readContract({
            address: tokenAddress,
            abi: ERC20_PERMIT_DOMAIN_ABI,
            functionName: 'name',
          }),
          tokenClient.readContract({
            address: tokenAddress,
            abi: ERC20_PERMIT_DOMAIN_ABI,
            functionName: 'version',
          }),
          tokenClient.readContract({
            address: tokenAddress,
            abi: NONCES_ABI,
            functionName: 'nonces',
            args: [address],
          }),
        ])
        livePermitName = name
        livePermitVersion = version
        livePermitNonce = freshNonce
      } catch (err) {
        console.error('[PayLink] permit metadata read failed', err)
        setBasePaymasterError(`USDC permit metadata could not be loaded: ${readableErrorMsg(err, 'Token read failed.')}`)
        return
      }
    }
    const nonce        = livePermitNonce
    const permitDomain = { name: livePermitName, version: livePermitVersion, chainId: targetChainId, verifyingContract: tokenAddress }
    const permitTypes = {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Permit: [
        { name: 'owner',    type: 'address' },
        { name: 'spender',  type: 'address' },
        { name: 'value',    type: 'uint256' },
        { name: 'nonce',    type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    } as const
    const permitMessage = { owner: address, spender: MULTICALL3_ADDRESS, value: requiredUnits, nonce, deadline } as const
    setBasePaymasterError(null)
    setCirclePaymasterError(null)
    resetEvmSend()
    let phase = 'sign permit'
    try {
      const rawPermitTypedData = {
        domain: permitDomain,
        types: permitTypes,
        primaryType: 'Permit',
        message: {
          owner: address,
          spender: MULTICALL3_ADDRESS,
          value: requiredUnits.toString(),
          nonce: nonce.toString(),
          deadline: deadline.toString(),
        },
      }
      console.info('[PayLink] signing permit', {
        chain,
        targetChainId,
        providerChainId,
        walletChainId: chainId,
        tokenAddress,
        tokenName: livePermitName,
        tokenVersion: livePermitVersion,
        owner: address,
        spender: MULTICALL3_ADDRESS,
      })
      let sig: `0x${string}`
      try {
        const matchingPrivyWallet = PRIVY_AUTH_ENABLED
          ? privyWallets.find(wallet => wallet.address?.toLowerCase() === address.toLowerCase())
          : undefined
        if (matchingPrivyWallet && matchingPrivyWallet.walletClientType !== 'privy') {
          await matchingPrivyWallet.switchChain(targetChainId)
          const privyProvider = await matchingPrivyWallet.getEthereumProvider()
          sig = await privyProvider.request({
            method: 'eth_signTypedData_v4',
            params: [address, JSON.stringify(rawPermitTypedData)],
          }) as `0x${string}`
        } else if (walletClient) {
          sig = await walletClient.signTypedData({
              account: address,
              domain: permitDomain,
              types: permitTypes,
              primaryType: 'Permit',
              message: permitMessage,
            } as never)
        } else {
          sig = await signTypedDataAsync({
              account: address,
              domain: permitDomain,
              types: permitTypes,
              primaryType: 'Permit',
              message: permitMessage,
            } as never)
        }
      } catch (err) {
        if (!isInvalidRpcParams(err)) throw err
        let connectorProvider: unknown = null
        if (!walletClient && connector) {
          try {
            connectorProvider = await connector.getProvider()
          } catch (providerErr) {
            console.warn('[PayLink] connector provider unavailable for raw signTypedData retry', {
              connectorName: connector.name,
              providerErr,
            })
          }
        }
        const rawProvider = walletClient ?? connectorProvider
        const request = (rawProvider as { request?: (args: { method: string; params?: unknown[] }) => Promise<unknown> } | null)?.request
        if (!request) throw err
        console.warn('[PayLink] viem signTypedData rejected by wallet, retrying raw eth_signTypedData_v4', {
          hasWalletClient: !!walletClient,
          hasConnector: !!connector,
          connectorName: connector?.name,
          err,
        })
        sig = await request({
          method: 'eth_signTypedData_v4',
          params: [address, JSON.stringify(rawPermitTypedData)],
        }) as `0x${string}`
      }
      const { v, r, s } = parseSignature(sig)
      const baseCallData = encodeFunctionData({
        abi: MULTICALL3_AGGREGATE3_ABI, functionName: 'aggregate3',
        args: [[
          { target: tokenAddress, allowFailure: false, callData: encodeFunctionData({
              abi: ERC20_PERMIT_ABI, functionName: 'permit',
              args: [address, MULTICALL3_ADDRESS, requiredUnits, deadline, Number(v), r, s],
          })},
          { target: tokenAddress, allowFailure: false, callData: encodeFunctionData({
              abi: ERC20_TRANSFER_FROM_ABI, functionName: 'transferFrom',
              args: [address, activeRecipient as `0x${string}`, recipientUnits],
          })},
          { target: tokenAddress, allowFailure: false, callData: encodeFunctionData({
              abi: ERC20_TRANSFER_FROM_ABI, functionName: 'transferFrom',
              args: [address, EVM_TREASURY, treasuryUnits],
          })},
        ]],
      })
      const sponsoredBaseCallData = encodeFunctionData({
        abi: MULTICALL3_AGGREGATE3_ABI, functionName: 'aggregate3',
        args: [[
          { target: tokenAddress, allowFailure: false, callData: encodeFunctionData({
              abi: ERC20_PERMIT_ABI, functionName: 'permit',
              args: [address, MULTICALL3_ADDRESS, requiredUnits, deadline, Number(v), r, s],
          })},
          { target: tokenAddress, allowFailure: false, callData: encodeFunctionData({
              abi: ERC20_TRANSFER_FROM_ABI, functionName: 'transferFrom',
              args: [address, activeRecipient as `0x${string}`, sponsoredRecipientUnits],
          })},
          { target: tokenAddress, allowFailure: false, callData: encodeFunctionData({
              abi: ERC20_TRANSFER_FROM_ABI, functionName: 'transferFrom',
              args: [address, EVM_TREASURY, sponsoredTreasuryUnits],
          })},
        ]],
      })
      if (chain === 'base') {
        phase = 'sponsored transaction'
        const sponsored = await tryBasePaymasterCall(concat([sponsoredBaseCallData, BASE_BUILDER_CODE]))
        if (sponsored !== 'unavailable') return
      }
      phase = 'submit transaction'
      sendTransaction({
        to: MULTICALL3_ADDRESS, value: 0n,
        // Append Base Builder Code on Base Mainnet only (ERC-8021)
        data: chain === 'base' ? concat([baseCallData, BASE_BUILDER_CODE]) : baseCallData,
      })
    } catch (err) {
      if (isUserRejected(err)) {
        setBasePaymasterError('Payment request rejected in wallet.')
        return
      }
      console.error(`[PayLink] ${phase} failed`, err)
      setBasePaymasterError(`${phase}: ${readableErrorMsg(err, 'Payment request failed before it reached the wallet.')}`)
    }
  }

  // ── Unified aliases ───────────────────────────────────────────────────────
  // directStatus === 'success' is included so EVM Send-via-Address relay
  // immediately transitions to the full-screen success card (same as Solana).
  const isBasePaymasterConfirmed = !!basePaymasterTxHash && basePaymasterStatus?.status === 'success'
  const isBasePaymasterFailed = basePaymasterStatus?.status === 'failure'
  const txHash          = directStatus === 'success'   ? (directTxHash as `0x${string}` | null)
                        : manualPayDetected            ? (manualTxHash ?? circlePaymasterTxHash ?? basePaymasterTxHash ?? evmTxHash ?? directTxHash ?? null)
                        : chain === 'solana'           ? solanaTxHash
                        : chain === 'arbitrum'         ? (circlePaymasterTxHash ?? arbitrumRelayHash ?? null)
                        : (circlePaymasterTxHash ?? basePaymasterTxHash ?? evmTxHash)
  const receiptConfirmed = chain === 'solana'
    ? isSolanaConfirmed
    : chain === 'arbitrum'
      ? (isArbitrumRelayConfirmed || isCirclePaymasterConfirmed)
      : (isEvmConfirmed || isBasePaymasterConfirmed || isCirclePaymasterConfirmed)
  const paymentConfirmed = receiptConfirmed || manualPayDetected || directStatus === 'success'
  // Funding requires mined on-chain proof. A submitted hash, wallet acceptance,
  // balance movement, or SDK timeout must never enter success by itself.
  const fundingTransferLogConfirmed = manualPayDetected && Boolean(manualTxHash)
  const fundingProofConfirmed = receiptConfirmed || fundingTransferLogConfirmed || directStatus === 'success'
  const isConfirmed = isAgentOrWalletFunding ? fundingProofConfirmed : paymentConfirmed
  const isWalletPending = chain === 'solana' ? (isSolanaPending || circleSolanaPending)   : chain === 'arbitrum' ? (arbitrumRelayPending || circlePaymasterPending || circlePasskeyPending || circleEvmPaymentProcessing || isSignPending) : isEvmWalletPending || circlePaymasterPending || circlePasskeyPending || circleEvmPaymentProcessing || isSignPending || isBasePaymasterPending
  const isConfirming    = chain === 'solana' ? isSolanaConfirming : chain === 'arbitrum' ? (isArbitrumRelayConfirming || isCirclePaymasterConfirming) : (isEvmConfirming || isBasePaymasterConfirming || isCirclePaymasterConfirming)
  const isSendError     = chain === 'solana' ? !!solanaError : chain === 'arbitrum' ? (!!arbitrumRelayError || !!circlePaymasterError) : (isEvmSendError || isEvmReverted || isBasePaymasterStatusError || isBasePaymasterFailed || !!basePaymasterError || !!circlePaymasterError)
  const checkoutSlideStatus: SlideActionStatus = isConfirmed
    ? 'successful'
    : isSendError
      ? 'error'
    : isConfirming || Boolean(txHash) || circleEvmAcceptedPending
      ? 'submitted'
      : isWalletPending
        ? 'pending'
        : 'idle'
  const checkoutSlideLabels = {
    idle: checkoutPresentation.action,
    disabled: paymentAmountBlocked ? 'Enter payment amount' : 'Complete payment details',
    pending: checkoutPresentation.pending,
    submitted: checkoutPresentation.submitted,
    successful: checkoutPresentation.successful,
    error: 'Payment failed',
  }
  function resetCheckoutError() {
    setPaymentAttemptStarted(false)
    setShowCheckButton(false)
    if (chain === 'solana') {
      setSolanaError(null)
      setIsSolanaPending(false)
      setIsSolanaConfirming(false)
      return
    }
    resetEvmSend()
    resetPermitSign()
    setArbitrumRelayError(null)
    setBasePaymasterError(null)
    setCirclePaymasterError(null)
  }
  // The Circle challenge is still interactive while the wallet SDK call is in
  // progress. Keep the checkout intact until that challenge has been accepted;
  // only then replace the amount panel with on-chain confirmation progress.
  const walletFundingConfirming = isWalletManagerFunding && !isConfirmed && (
    circleEvmAcceptedPending ||
    Boolean(txHash) ||
    manualPayDetected
  )
  const sendErrorMsg    = chain === 'solana'   ? solanaError
                        : chain === 'arbitrum' ? (circlePaymasterError ?? arbitrumRelayError)
                        : isBasePaymasterStatusError
                          ? (basePaymasterStatusError?.message ?? basePaymasterError ?? 'Sponsored transaction failed').slice(0, 140)
                        : isBasePaymasterFailed
                          ? 'Sponsored transaction failed on Base.'
                        : circlePaymasterError
                          ? circlePaymasterError
                        : basePaymasterError
                          ? basePaymasterError
                        : isEvmReverted
                          ? 'Transaction reverted. The permit may have expired or your USDC balance was insufficient.'
                          : (evmSendError?.message ?? 'An unknown error occurred').slice(0, 140)
  const polymarketBridgeComplete = isPolymarketBridge && polymarketBridgeStatus === 'complete'
  const polymarketBridgePending = isPolymarketBridge && !polymarketBridgeComplete
  const polymarketBridgeAwaitingTx = isPolymarketBridge && isConfirmed && !txHash
  const polymarketBridgeProgressText = polymarketBridgeComplete
    ? 'Polymarket funding complete.'
    : polymarketBridgeAwaitingTx
      ? 'Confirming payment...'
      : polymarketBridgeStatusText || 'Confirming Polymarket bridge...'

  useEffect(() => {
    onPaySuccessVisibleChange(isConfirmed)
    return () => onPaySuccessVisibleChange(false)
  }, [isConfirmed, onPaySuccessVisibleChange])

  useEffect(() => {
    if (!isPolymarketBridge || !activeRecipient) {
      polymarketBridgeWaitStartedAtRef.current = 0
      return
    }
    if (!polymarketBridgeWaitStartedAtRef.current) {
      polymarketBridgeWaitStartedAtRef.current = Date.now()
    }
  }, [activeRecipient, isPolymarketBridge])

  useEffect(() => {
    const bankSendSettled = isBankSendPayment && bankSendStatus === 'settled'
    if ((!isConfirmed && !bankSendSettled) || !isPolymarketBridge || polymarketBridgeComplete) return
    void refreshPolymarketBridgeStatus()
    const timer = window.setInterval(() => void refreshPolymarketBridgeStatus(), 5_000)
    return () => window.clearInterval(timer)
  }, [bankSendStatus, isBankSendPayment, isConfirmed, isPolymarketBridge, polymarketBridgeComplete, refreshPolymarketBridgeStatus])

  // ── Direct Send display address ───────────────────────────────────────────
  const directDisplayAddr = directVault

  // ── Event mode: register payment after confirmation ───────────────────────
  async function doRegister(name: string) {
    // In Send-via-Address mode the payer never connects a wallet so address is
    // undefined. Fall back to the vault address as the payer identifier.
    const payer  = chain === 'solana' ? (circleSolanaSession?.wallet.address ?? solanaWalletAddr ?? solanaVaultAddr ?? '')
      : (address ?? circleEvmEmailSession?.wallet.address ?? circleSmartAccount ?? directVault ?? '')
    const txH    = manualPayDetected ? (manualTxHash ?? circlePaymasterTxHash ?? basePaymasterTxHash ?? evmTxHash ?? directTxHash ?? null)
                 : chain === 'solana'   ? (solanaTxHash ?? solanaDirectTxHash)
                 : chain === 'arbitrum' ? (circlePaymasterTxHash ?? arbitrumRelayHash ?? directTxHash ?? null)
                 : (circlePaymasterTxHash ?? basePaymasterTxHash ?? evmTxHash ?? directTxHash ?? null)
    if (isAgentOrWalletFunding && !txH) {
      eventRegistered.current = false
      return
    }
    const txHash = txH ?? `manual_${Date.now()}`
    const actualAmt = receivedAmount != null
      ? formatUnits(receivedAmount, meta.decimals)
      : effectiveAmt
    const payload = {
      eventId,
      txHash,
      chain,
      payer,
      memo: name || memo || 'Agent wallet funding',
      amount: actualAmt,
      agentSlug: agentFundingSlug || undefined,
      contextLabel: memo || eventId,
    }
    setEventRegStatus('pending')
    try {
      const res  = await fetch('/api/event-register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const data = await res.json() as { ok: boolean; error?: string; receiptId?: string }
      if (data.ok && data.receiptId) setPaymentReceiptId(data.receiptId)
      setEventRegStatus(data.ok ? 'ok' : 'error')
    } catch (err) {
      console.error('[EventReg] fetch failed:', err)
      setEventRegStatus('error')
    }
  }

  function amountCoversRequest(actual: string, requested: string) {
    const actualNum = Number.parseFloat(actual)
    const requestedNum = Number.parseFloat(requested)
    if (!Number.isFinite(actualNum) || !Number.isFinite(requestedNum) || requestedNum <= 0) return true
    const smallestUnit = 1 / Math.pow(10, meta.decimals)
    return actualNum + smallestUnit / 2 >= requestedNum
  }

  function expectedNgPosSettlementAmount() {
    if (isNgPosPaycrestOfframp && paycrestOrder?.amount_usdc) return paycrestOrder.amount_usdc
    if (!isNgPosPayment || !isEvmChain) return effectiveAmt
    try {
      const units = expectedEvmRecipientUnits()
      if (units <= 0n) return effectiveAmt
      return formatUnits(units, meta.decimals)
    } catch {
      return effectiveAmt
    }
  }

  function formatPaymentAmountDisplay(value: number, decimals: number) {
    if (value > 0 && value < 0.0001) return '<0.0001'
    return value.toFixed(decimals <= 6 ? 4 : 6)
  }

  function currentNgPosTxHash() {
    if (manualPayDetected) return manualTxHash ?? circlePaymasterTxHash ?? basePaymasterTxHash ?? evmTxHash ?? directTxHash ?? null
    if (chain === 'solana') return solanaTxHash ?? solanaDirectTxHash
    if (chain === 'arbitrum') return circlePaymasterTxHash ?? arbitrumRelayHash ?? directTxHash ?? null
    return circlePaymasterTxHash ?? basePaymasterTxHash ?? evmTxHash ?? directTxHash ?? null
  }

  async function doRegisterNgPos() {
    if (!ngPosEventId || !ngPosMerchantId) return
    const payerName = attendeeName.trim()
    if (!payerName) return
    const payer  = chain === 'solana' ? (circleSolanaSession?.wallet.address ?? solanaWalletAddr ?? solanaVaultAddr ?? '')
      : (address ?? circleEvmEmailSession?.wallet.address ?? circleSmartAccount ?? directVault ?? '')
    const txH = currentNgPosTxHash()
    if (!txH) return
    const txHash = txH
    const actualAmt = receivedAmount != null
      ? formatUnits(receivedAmount, meta.decimals)
      : payableAmt
    const expectedSettlementAmt = expectedNgPosSettlementAmount()
    if (!amountCoversRequest(actualAmt, expectedSettlementAmt)) {
      console.warn('[NgPosReg] skipped underpaid POS payment:', { actualAmt, requestedAmount: effectiveAmt, expectedSettlementAmount: expectedSettlementAmt })
      return
    }
    const payload = {
      eventId: ngPosEventId,
      txHash,
      chain,
      payer: payer || 'POS payer',
      memo: payerName,
      amount: actualAmt,
      source: isBankReceivePayment ? 'bank-receive' : 'ngpos',
      merchantId: ngPosMerchantId,
      contextLabel: memo || (isBankReceivePayment ? 'Bank receive' : ngPosMerchantId),
      settlementType: ngPosSettlement,
      amountNgn: ngPosAmountNgn,
      requestedAmount: expectedSettlementAmt,
      intentId: paycrestOrder?.intent_id ?? ngPosPaycrestIntentId,
    }
    try {
      if (isNgPosPaycrestOfframp && paycrestOrder && txH && !String(txH).startsWith('manual_') && !ngPosOfframpMarkedRef.current) {
        ngPosOfframpMarkedRef.current = true
        const markResponse = await fetch('/api/ng-pos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'markOfframpPaid',
            intent_id: paycrestOrder.intent_id,
            order_id: paycrestOrder.paycrest_order_id,
            tx_hash: txH,
            payer_wallet: payer,
            payer_email: (showPrivyCircleEmailPay ? privyEmail : circleEmail).trim(),
          }),
        })
        const markData = await markResponse.json().catch(() => undefined) as { ok?: boolean; order?: PaycrestCheckoutOrder } | undefined
        if (markData?.order) {
          setPaycrestOrder(markData.order)
          setPaycrestStatusText('Payment detected. Paycrest is confirming the Naira payout.')
        }
      }
      if (isHostedCheckout) {
        ngPosRegistered.current = true
        ngPosRegisteredTx.current = txHash
        return
      }
      const res = await fetch('/api/event-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => undefined) as { ok?: boolean; receiptId?: string } | undefined
      if (data?.ok) {
        ngPosRegistered.current = true
        ngPosRegisteredTx.current = txHash
        if (data.receiptId) setPaymentReceiptId(data.receiptId)
      }
    } catch (err) {
      console.error('[NgPosReg] fetch failed:', err)
    }
  }

  async function registerOrdinaryReceipt() {
    if (!txHash || txHash.startsWith('manual_')) return
    const payer = chain === 'solana' ? (circleSolanaSession?.wallet.address ?? solanaWalletAddr ?? solanaVaultAddr ?? '')
      : (address ?? circleEvmEmailSession?.wallet.address ?? circleSmartAccount ?? directVault ?? '')
    const actualAmt = receivedAmount != null
      ? formatUnits(receivedAmount, meta.decimals)
      : effectiveAmt
    const hosted = isHostedCheckout
    if (hosted) {
      setHostedConfirmationStatus('checking')
      setHostedConfirmationError('')
    }
    const payload = {
      eventId: hosted ? `hosted-${hostedCheckoutId}` : `paylink-${chain}-${txHash}`,
      txHash,
      chain,
      payer: payer || activeRecipient || 'Hash PayLink payer',
      memo: hosted ? (hostedCheckoutTitle || memo || 'Hosted checkout') : (memo || 'Hash PayLink payment'),
      amount: actualAmt,
      requestedAmount: effectiveAmt,
      source: hosted ? 'hosted-checkout' : 'paylink',
      merchantId: hosted ? hostedCheckoutId : activeRecipient,
      contextLabel: hosted ? (hostedMerchantName || 'Hosted checkout') : (memo || activeRecipient),
      settlementType: hosted ? 'hosted_payment' : 'payment',
    }
    let lastError = ''
    const attempts = hosted ? 4 : 1
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const res = await fetch('/api/event-register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json().catch(() => undefined) as { ok?: boolean; receiptId?: string; error?: string } | undefined
        if (!res.ok || !data?.ok) throw new Error(data?.error || 'Checkout verification is still pending.')
        if (data.receiptId) setPaymentReceiptId(data.receiptId)
        if (hosted) setHostedConfirmationStatus(isHostedNairaSettlement ? 'processing' : 'verified')
        return
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Checkout verification is still pending.'
        if (attempt + 1 < attempts) {
          await new Promise(resolve => window.setTimeout(resolve, 1_500 * (attempt + 1)))
        }
      }
    }
    if (hosted) {
      setHostedConfirmationStatus('error')
      setHostedConfirmationError(lastError || 'Checkout verification is still pending.')
    }
    // Ordinary pay-link receipt registration stays non-blocking after on-chain confirmation.
  }

  async function registerPolymarketFundingReceipt() {
    if (!txHash || txHash.startsWith('manual_')) return
    const payer = chain === 'solana' ? (circleSolanaSession?.wallet.address ?? solanaWalletAddr ?? solanaVaultAddr ?? '')
      : (address ?? circleEvmEmailSession?.wallet.address ?? circleSmartAccount ?? directVault ?? '')
    const actualAmt = receivedAmount != null
      ? formatUnits(receivedAmount, meta.decimals)
      : effectiveAmt
    try {
      const res = await fetch('/api/event-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: `polymarket-funding-${chain}-${txHash}`,
          txHash,
          chain,
          payer: payer || 'Polymarket funder',
          memo: polymarketFundingLabel || 'Polymarket funding',
          amount: actualAmt,
          requestedAmount: effectiveAmt,
          source: 'polymarket-funding',
          merchantId: polymarketWalletParam || activeRecipient,
          contextLabel: polymarketWalletParam ? `Polymarket ${truncateAddress(polymarketWalletParam, 8)}` : 'Polymarket funding',
          settlementType: 'polymarket_bridge',
        }),
      })
      const data = await res.json().catch(() => undefined) as { ok?: boolean; receiptId?: string } | undefined
      if (data?.ok && data.receiptId) setPaymentReceiptId(data.receiptId)
    } catch {
      // Receipt registration is non-blocking; the funding transfer is already confirmed.
    }
  }

  async function markPolymarketFundingComplete(status: 'confirmed' | 'complete') {
    if (!txHash || !isPolymarketFunding || !privyAuthenticated) return false
    const token = await getAccessToken().catch(() => null)
    if (!token) return false
    const res = await fetch('/api/polymarket-portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        action: 'complete-funding',
        requestId: polymarketFundingRequestId,
        network: chain,
        amount: effectiveAmt,
        status,
        bridgeStatus: status,
        txHash,
        depositAddress: activeRecipient,
        polymarketWallet: polymarketWalletParam,
      }),
    }).catch(() => undefined)
    return Boolean(res?.ok)
  }

  useEffect(() => {
    if (!isConfirmed || !isEventMode || !eventId || eventRegistered.current) return
    const name = isAgentOrWalletFunding ? (memo || (isWalletManagerFunding ? 'x402 wallet funding' : 'Agent wallet funding')) : attendeeName.trim()
    if (!name) return
    eventRegistered.current = true
    void doRegister(name)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, attendeeName, isAgentOrWalletFunding, isWalletManagerFunding, memo])

  useEffect(() => {
    if (!isConfirmed || !isNgPosPayment || !ngPosEventId) return
    if (!attendeeName.trim()) return
    const nextTx = currentNgPosTxHash()
    const canUpgradeManualReceipt = Boolean(nextTx) && ngPosRegistered.current && ngPosRegisteredTx.current.startsWith('manual_')
    if (ngPosRegistered.current && !canUpgradeManualReceipt) return
    void doRegisterNgPos()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, attendeeName, manualPayDetected, manualTxHash, chain, circlePaymasterTxHash, basePaymasterTxHash, evmTxHash, directTxHash])

  useEffect(() => {
    if (!isConfirmed || !txHash || !isHostedCheckout || !isNgPosPayment || ordinaryReceiptRegistered.current) return
    ordinaryReceiptRegistered.current = true
    void registerOrdinaryReceipt()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, txHash, isHostedCheckout, isNgPosPayment])

  useEffect(() => {
    if (!isHostedNairaSettlement || hostedConfirmationStatus !== 'processing') return
    let cancelled = false
    let timer: number | undefined
    async function pollSettlement() {
      try {
        const response = await fetch(`/api/v2/checkouts?id=${encodeURIComponent(hostedCheckoutId)}`, { cache: 'no-store' })
        const data = await response.json().catch(() => undefined) as { checkout?: { status?: string } } | undefined
        if (!cancelled && response.ok) {
          if (data?.checkout?.status === 'paid') {
            setHostedConfirmationStatus('verified')
            return
          }
          if (data?.checkout?.status === 'failed') {
            setHostedConfirmationError('Bank settlement was not completed. Do not pay again; check the refund wallet or contact support.')
            setHostedConfirmationStatus('error')
            return
          }
        }
      } catch { /* Paycrest webhook or a later poll can still complete settlement. */ }
      if (!cancelled) timer = window.setTimeout(pollSettlement, 3_000)
    }
    void pollSettlement()
    return () => { cancelled = true; if (timer) window.clearTimeout(timer) }
  }, [hostedCheckoutId, hostedConfirmationStatus, isHostedNairaSettlement])

  // Fallback: also register when Send-via-Address relay succeeds (directStatus='success')
  // in case the Transfer event watcher hasn't set manualPayDetected yet.
  useEffect(() => {
    if (directStatus !== 'success' || !isEventMode || !eventId || eventRegistered.current) return
    const name = isAgentOrWalletFunding ? (memo || (isWalletManagerFunding ? 'x402 wallet funding' : 'Agent wallet funding')) : attendeeName.trim()
    if (!name) return
    eventRegistered.current = true
    void doRegister(name)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directStatus, attendeeName, isAgentOrWalletFunding, isWalletManagerFunding, memo])

  // Fallback: register when Solana direct-send sweep succeeds.
  useEffect(() => {
    if (solanaDirectStatus !== 'success' || !isEventMode || !eventId || eventRegistered.current) return
    const name = isAgentOrWalletFunding ? (memo || (isWalletManagerFunding ? 'x402 wallet funding' : 'Agent wallet funding')) : attendeeName.trim()
    if (!name) return
    eventRegistered.current = true
    void doRegister(name)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solanaDirectStatus, attendeeName, isAgentOrWalletFunding, isWalletManagerFunding, memo])

  useEffect(() => {
    if (!isConfirmed || !txHash || ordinaryReceiptRegistered.current) return
    const isReceiptablePaylinkPayment = isMainHashPaylinkPayment || isTelegramSource
    if (!isReceiptablePaylinkPayment || isEventMode || isNgPosPayment || isPolymarketFunding || isAgentOrWalletFunding || isHelperAccess) return
    ordinaryReceiptRegistered.current = true
    void registerOrdinaryReceipt()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, txHash])

  useEffect(() => {
    if (!isConfirmed || !txHash || !isPolymarketFunding || ordinaryReceiptRegistered.current) return
    ordinaryReceiptRegistered.current = true
    void registerPolymarketFundingReceipt()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, txHash])

  useEffect(() => {
    if (!isConfirmed || !txHash || !isPolymarketFunding || !privyAuthenticated) return
    const status = polymarketBridgeStatus === 'complete' ? 'complete' : 'confirmed'
    const markKey = `${txHash}:${status}`
    if (polymarketFundingMarkRef.current === markKey || polymarketFundingMarkInFlightRef.current === markKey) return
    polymarketFundingMarkInFlightRef.current = markKey
    void markPolymarketFundingComplete(status)
      .then((ok) => {
        if (ok) polymarketFundingMarkRef.current = markKey
      })
      .finally(() => {
        if (polymarketFundingMarkInFlightRef.current === markKey) polymarketFundingMarkInFlightRef.current = ''
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, txHash, isPolymarketFunding, polymarketBridgeStatus, privyAuthenticated])

  useEffect(() => {
    if (!paymentReceiptId) return
    let cancelled = false
    let timer: number | undefined
    let attempts = 0
    setReceiptPollAttempts(0)
    setReceiptArchiveTimedOut(false)

    async function loadReceipt() {
      attempts += 1
      if (!cancelled) setReceiptPollAttempts(attempts)
      try {
        const res = await fetch(`/api/receipt?id=${encodeURIComponent(paymentReceiptId)}`)
        const data = await res.json().catch(() => undefined) as ReceiptLookupResponse | undefined
        if (!cancelled && data?.ok && data.receipt) {
          setPaymentReceipt(data.receipt)
          if (data.receipt.proof?.ogTxHash || data.receipt.proof?.ogExplorer) {
            setReceiptArchiveTimedOut(false)
            return
          }
        }
      } catch {
        // Receipt polling should not affect the already-confirmed payment state.
      }
      if (!cancelled && attempts < 40) timer = window.setTimeout(loadReceipt, 5_000)
      if (!cancelled && attempts >= 40) setReceiptArchiveTimedOut(true)
    }

    void loadReceipt()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [paymentReceiptId])

  useEffect(() => {
    if (!autoAccessRedirect || accessRedirected.current || !isEventMode || !agentUrl || eventRegStatus !== 'ok') return
    const payerName = isAgentOrWalletFunding ? (memo || (isWalletManagerFunding ? 'x402 wallet funding' : 'Agent wallet funding')) : attendeeName.trim()
    if (!eventId || (!payerName && !isAgentOrWalletFunding)) return
    accessRedirected.current = true
    const timer = window.setTimeout(() => {
      try {
        const next = new URL(agentUrl, window.location.origin)
        next.searchParams.set('eventId', eventId)
        if (payerName) next.searchParams.set('payer', payerName)
        window.location.assign(next.toString())
      } catch {
        accessRedirected.current = false
      }
    }, isAgentOrWalletFunding ? 6000 : 900)
    return () => window.clearTimeout(timer)
  }, [autoAccessRedirect, isEventMode, agentUrl, eventRegStatus, eventId, attendeeName, isAgentOrWalletFunding, isWalletManagerFunding, memo])

  // ────────────────────────────────────────────────────────────────────────────
  //  INVALID PARAMS
  // ────────────────────────────────────────────────────────────────────────────
  if (!isValidParams) {
    return (
      <div className="mx-auto max-w-md animate-fade-in">
        <div className="overflow-hidden rounded-2xl border border-red-100 bg-white shadow-card">
          <div className="bg-red-50 p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
              <AlertCircle className="h-7 w-7 text-red-500" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Invalid Payment Link</h2>
            <p className="mt-1 text-sm text-gray-500">This link is missing required parameters or contains invalid data.</p>
          </div>
          <div className="p-6 text-center">
            <p className="mb-4 text-xs text-gray-400">
              A valid link looks like:{' '}
              <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">
                /pay?e=0x…&amp;a=10&amp;m=Coffee
              </code>
            </p>
            <Link to="/" className="inline-flex items-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-all">
              <ArrowLeft className="h-4 w-4" />
              Create a valid link
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  SUCCESS STATE
  // ────────────────────────────────────────────────────────────────────────────
  if (isConfirmed && !isWalletManagerFunding) {
    const explorerTxUrl    = txHash      ? `${meta.explorerUrl}/tx/${txHash}`      : null
    void explorerTxUrl

    const paycrestConfirmedAmount = isNgPosPaycrestOfframp && paycrestOrder?.amount_usdc
      ? Number.parseFloat(paycrestOrder.amount_usdc)
      : null
    const recipientAmt = paycrestConfirmedAmount != null && Number.isFinite(paycrestConfirmedAmount) && paycrestConfirmedAmount > 0
      ? paycrestConfirmedAmount
      : receivedAmount != null
      ? Number(receivedAmount) / Math.pow(10, meta.decimals)
      : null
    const requested = parseFloat(payableAmt)
    const expectedSettlement = isNgPosPayment
      ? Number.parseFloat(expectedNgPosSettlementAmount())
      : requested
    const comparisonAmount = Number.isFinite(expectedSettlement) && expectedSettlement > 0
      ? expectedSettlement
      : requested
    const shouldCompareFixedAmount = !isFlex && !isPolymarketFunding
    const isOver    = recipientAmt != null && shouldCompareFixedAmount && recipientAmt > comparisonAmount * 1.001
    const isUnder   = recipientAmt != null && shouldCompareFixedAmount && recipientAmt < comparisonAmount * 0.99
    const shortfall = isUnder
      ? (comparisonAmount - (recipientAmt ?? 0)).toFixed(meta.decimals <= 6 ? 4 : 6)
      : null

    const primaryExplorerUrl = txHash ? `${meta.explorerUrl}/tx/${txHash}` : null
    const ogExplorerUrl = paymentReceipt?.proof?.ogExplorer || (paymentReceipt?.proof?.ogTxHash ? `https://chainscan.0g.ai/tx/${paymentReceipt.proof.ogTxHash}` : '')
    const ogProofValue = paymentReceipt?.proof?.ogTxHash || paymentReceipt?.proof?.ogRootHash || ''
    const receiptReady = Boolean(paymentReceipt)
    const payoutAmountNgn = Number.parseFloat(paycrestOrder?.amount_ngn || ngPosAmountNgn || '0')
    const payoutLabel = Number.isFinite(payoutAmountNgn) && payoutAmountNgn > 0
      ? `NGN ${payoutAmountNgn.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`
      : 'Naira payout'
    const payoutBankLabel = [
      paycrestOrder?.bank_name || ngPosBankName,
      paycrestOrder?.bank_last4 ? `****${paycrestOrder.bank_last4}` : '',
    ].filter(Boolean).join(' ')
    const archivePendingLabel = receiptArchiveTimedOut
      ? 'Background'
      : paymentReceipt
      ? 'Background'
      : 'Preparing'

    return (
      <div className="mx-auto max-w-md animate-scale-in">
        <div
          className={cn(
            'overflow-hidden rounded-[1.75rem] border bg-white shadow-[0_24px_70px_rgba(15,23,42,0.10)] dark:bg-[#111216]',
            isUnder ? 'border-red-200 dark:border-red-400/25' : 'border-gray-200 dark:border-white/10',
          )}
        >
          <div className={cn(
            'p-8 text-center',
            isUnder ? 'bg-red-50 dark:bg-red-400/10' : 'bg-gray-50/80 dark:bg-white/[0.025]',
          )}>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center animate-bounce-in">
              {isUnder
                ? <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-red-500 shadow-sm ring-1 ring-red-100 dark:bg-white/10 dark:ring-red-400/20"><AlertCircle className="h-8 w-8" /></span>
                : polymarketBridgePending
                ? <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-100 dark:bg-white/10 dark:ring-white/10"><Loader2 className="h-8 w-8 animate-spin text-gray-700 dark:text-white" /></span>
                : <PocketStatusCheck className="h-16 w-16" />
              }
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {isUnder ? 'Underpayment Detected'
               : polymarketBridgePending ? 'Confirming funding'
               : isHostedNairaSettlement && hostedConfirmationStatus === 'processing' ? 'Sending Naira'
               : isHostedCheckout && hostedConfirmationStatus !== 'verified' ? 'Payment received'
               : checkoutPresentation.successful}
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {recipientAmt != null ? (
                <>
                  <span className={cn('font-semibold', isUnder ? 'text-amber-700' : 'text-gray-900')}>
                    {formatPaymentAmountDisplay(recipientAmt, meta.decimals)} {meta.asset}
                  </span>
                  {!isPolymarketFunding && (
                    <>
                      {' '}
                      {isUnder ? 'received - ' : isNgPosPaycrestOfframp ? 'sent for Naira payout' : 'received by recipient'}
                    </>
                  )}
                  {isUnder && (
                    <span className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      'bg-red-100 text-red-700',
                    )}>
                      {isNgPosPayment
                          ? `${shortfall} ${meta.asset} short of expected settlement`
                          : `${shortfall} ${meta.asset} short of requested ${requested.toFixed(meta.decimals <= 6 ? 2 : 4)}`}
                    </span>
                  )}
                  {isOver && (
                    <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      Overpayment processed
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="font-semibold text-gray-900">
                    {formatAmount(effectiveAmt, meta.decimals)} {meta.asset}
                  </span>
                  {!isPolymarketFunding && (
                    <>
                      {' '}
                      {manualPayDetected && directStatus !== 'success'
                        ? 'received by recipient'
                        : 'delivered successfully'}
                    </>
                  )}
                </>
              )}
            </p>
          </div>

          <div className="p-6 space-y-4">
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-gray-50/60 overflow-hidden">
              <Row label="Amount"    value={isBankSendPayment ? `${bankSendRequestedNgnLabel || 'Enter amount'} NGN` : `${formatAmount(payableAmt, meta.decimals)} ${meta.asset}`} mono={false} />
              {isNgPosPaycrestOfframp && (
                <Row label="Payout" value={payoutBankLabel ? `${payoutLabel} - ${payoutBankLabel}` : payoutLabel} mono={false} />
              )}
              <Row label="Network"   value={meta.label} mono={false} />
              {isPolymarketBridge && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-gray-500">For</span>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                    <img src={POLYMARKET_LOGO} alt="" className="h-4 w-4 invert dark:invert-0" />
                    <span>Polymarket funding</span>
                  </span>
                </div>
              )}
              {!isPolymarketBridge && !isNgPosPaycrestOfframp && <Row label="Recipient" value={truncateAddress(activeRecipient, 4)} mono />}
              {!isPolymarketBridge && memo && <Row label={isPolymarketFunding ? 'Funding' : 'For'} value={isPolymarketFunding ? polymarketFundingLabel : memo} mono={false} />}
              {txHash && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-gray-500">Tx</span>
                  <div className="flex items-center gap-2">
                    {primaryExplorerUrl ? (
                      <a
                        href={primaryExplorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-gray-700 transition-colors hover:text-blue-600"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {truncateAddress(txHash, 4)}
                      </a>
                    ) : (
                      <span className="font-mono text-xs text-gray-700">{truncateAddress(txHash, 4)}</span>
                    )}
                  </div>
                </div>
              )}
              {isPolymarketBridge && polymarketBridgeLatestTx && polymarketBridgeLatestTx !== txHash && (
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-sm text-gray-500">Bridge Tx</span>
                  <span className="truncate font-mono text-xs font-semibold text-gray-700" title={polymarketBridgeLatestTx}>
                    {truncateAddress(polymarketBridgeLatestTx, 6)}
                  </span>
                </div>
              )}
              {!txHash && manualPayDetected && chain !== 'solana' && !isNgPosPaycrestOfframp && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-gray-500">Tx</span>
                  <span className="text-xs font-medium text-gray-400">
                    {txSyncTick >= 90 ? 'Confirmed' : `Please wait${'.'.repeat((txSyncTick % 3) + 1)}`}
                  </span>
                </div>
              )}
              {!txHash && manualPayDetected && chain !== 'solana' && isNgPosPaycrestOfframp && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-gray-500">Tx</span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {txSyncTick >= 90 ? 'Still checking' : `Please wait${'.'.repeat((txSyncTick % 3) + 1)}`}
                  </span>
                </div>
              )}
              {paymentReceiptId && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-gray-500">0G</span>
                  {ogProofValue ? (
                    <a
                      href={ogExplorerUrl || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-purple-700 transition-colors',
                        ogExplorerUrl ? 'hover:text-purple-900' : 'pointer-events-none',
                      )}
                    >
                      <img src="/brand/0g-logo.jpeg" alt="0G" className="h-3.5 w-3.5 rounded-full object-contain" />
                      {truncateAddress(ogProofValue, 4)}
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400">
                      {receiptArchiveTimedOut || paymentReceipt ? (
                        <AlertCircle className="h-3.5 w-3.5" />
                      ) : (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      )}
                      {archivePendingLabel}
                    </span>
                  )}
                </div>
              )}
            </div>

            {receiptReady && !isPolymarketBridge && !polymarketReturnToAgentHash && (
              <div className="grid gap-2">
                <UnifiedReceipt receipt={paymentReceipt!} />
                {!ogProofValue && (
                  <p className="text-center text-[11px] font-medium text-gray-400">
                    Receipt is ready. 0G archive continues in background and will attach when confirmed.
                  </p>
                )}
              </div>
            )}
            {paymentReceiptId && !paymentReceipt && !isPolymarketBridge && (
              <p className="text-center text-[11px] font-medium text-gray-400">
                Preparing receipt...
              </p>
            )}

            {/* Only surface registration errors — success/pending/idle are silent */}
            {isEventMode && !agentUrl && eventRegStatus === 'error' && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-600">
                <span>Failed to log payment — tap Retry</span>
                <button
                  onClick={() => { eventRegistered.current = false; void doRegister(attendeeName.trim()) }}
                  className="shrink-0 rounded-lg bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-200 transition-colors"
                >
                  Retry
                </button>
              </div>
            )}

            {/* ── Access link (Access mode only) ───────────────────────── */}
            {isEventMode && agentUrl && attendeeName.trim() && eventRegStatus === 'ok' && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-gray-600">Your access link is ready</p>
                <button
                  onClick={async () => {
                    const link = `${agentUrl}?eventId=${encodeURIComponent(eventId)}&payer=${encodeURIComponent(attendeeName.trim())}`
                    await copyToClipboard(link)
                    setAgentLinkCopied(true)
                    setTimeout(() => setAgentLinkCopied(false), 2500)
                  }}
                  className="shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors active:scale-[0.98] text-purple-600 hover:bg-purple-50 border border-purple-200"
                >
                  {agentLinkCopied
                    ? <><CheckCheck className="h-3 w-3" /> Copied!</>
                    : <><Copy className="h-3 w-3" /> Copy</>}
                </button>
              </div>
            )}

            {isHostedCheckout && !isPolymarketBridge ? (
              <div className="space-y-2">
                {hostedConfirmationStatus === 'verified' ? (
                  <p className="text-center text-[11px] font-medium text-gray-400">
                    {isHostedService
                      ? `Checkout verified. Continue to ${hostedMerchantName || 'the platform'} when you are ready.`
                      : 'Checkout verified and receipt recorded.'}
                  </p>
                ) : hostedConfirmationStatus === 'processing' ? (
                  <p className="flex items-center justify-center gap-2 text-center text-[11px] font-medium text-gray-500 dark:text-gray-300">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    USDC confirmed. Bank delivery is processing.
                  </p>
                ) : hostedConfirmationStatus === 'error' ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center dark:border-amber-300/20 dark:bg-amber-300/10">
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">Payment is on-chain; checkout verification is pending. Do not pay again.</p>
                    <p className="mt-1 text-[11px] text-amber-700/80 dark:text-amber-200/70">{hostedConfirmationError}</p>
                  </div>
                ) : (
                  <p className="flex items-center justify-center gap-2 text-center text-[11px] font-medium text-gray-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Verifying checkout securely…
                  </p>
                )}
                {isHostedService && hostedConfirmationStatus === 'verified' && hostedReturnUrl && (
                  <a
                    href={hostedReturnUrl}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                  >
                    Continue to {hostedMerchantName || 'platform'}
                  </a>
                )}
                {hostedConfirmationStatus === 'error' && (
                  <button
                    type="button"
                    onClick={() => void registerOrdinaryReceipt()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                  >
                    Retry verification
                  </button>
                )}
              </div>
            ) : isAgentOrWalletFunding ? (
              <div className="space-y-2">
                <p className="flex items-center justify-center gap-1 text-center text-[11px] font-medium text-gray-400">
                  Redirecting in a few seconds
                  <span className="inline-flex w-5 items-center justify-start gap-0.5">
                    <span className="h-1 w-1 animate-pulse rounded-full bg-gray-300" />
                    <span className="h-1 w-1 animate-pulse rounded-full bg-gray-300 [animation-delay:120ms]" />
                    <span className="h-1 w-1 animate-pulse rounded-full bg-gray-300 [animation-delay:240ms]" />
                  </span>
                </p>
                <a
                  href={agentFundingBackUrl}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-gray-800 active:scale-[0.98]"
                >
                  Tap to redirect
                </a>
              </div>
            ) : isPolymarketBridge && polymarketReturnToAgentHash ? (
              <div className="space-y-2">
                <p className="flex items-center justify-center gap-1.5 text-center text-[11px] font-medium text-gray-400">
                  {polymarketBridgeComplete ? 'Polymarket funding complete.' : polymarketBridgeProgressText}
                  {!polymarketBridgeComplete && <Loader2 className="h-3 w-3 animate-spin" />}
                </p>
                {polymarketBridgeComplete && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {paymentReceiptId ? (
                      <a href={`/receipt/${encodeURIComponent(paymentReceiptId)}`} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98]">
                        <ExternalLink className="h-3.5 w-3.5" /> Share receipt
                      </a>
                    ) : (
                      <span className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-5 py-2.5 text-sm font-medium text-gray-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing receipt
                      </span>
                    )}
                    <a href={polymarketAgentHashUrl} className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-gray-800 active:scale-[0.98]">
                      Return to Agent Hash
                    </a>
                  </div>
                )}
              </div>
            ) : isPolymarketBridge ? (
              <div className="space-y-2">
                <p className="flex items-center justify-center gap-1.5 text-center text-[11px] font-medium text-gray-400">
                  {polymarketBridgeComplete ? 'Polymarket funding complete.' : polymarketBridgeProgressText}
                  {!polymarketBridgeComplete && <Loader2 className="h-3 w-3 animate-spin" />}
                </p>
                {polymarketBridgeComplete && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {paymentReceiptId ? (
                      <a href={`/receipt/${encodeURIComponent(paymentReceiptId)}`} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98]">
                        <ExternalLink className="h-3.5 w-3.5" /> Share receipt
                      </a>
                    ) : (
                      <span className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-5 py-2.5 text-sm font-medium text-gray-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing receipt
                      </span>
                    )}
                    <a href={resolvedPolymarketReturnUrl} className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-gray-800 active:scale-[0.98]">
                      {isHostedService ? `Return to ${polymarketReturnLabel}` : 'Return to PolyDesk'}
                    </a>
                  </div>
                )}
              </div>
            ) : isPolymarketFunding ? (
              <p className="text-center text-[11px] font-medium text-gray-400">Funding complete.</p>
            ) : telegramUrl ? (
              <a href={telegramUrl} className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-all active:scale-[0.98]">
                Create with Telegram
              </a>
            ) : (
              <Link to="/" className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-all active:scale-[0.98]">
                Create your own Hash PayLink
              </Link>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  MAIN PAYMENT UI
  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-md animate-slide-up">
      {isNgPosSource || isPolymarketFunding || isAgentOrWalletFunding || isHelperAccess || isHostedService ? (
        <button
          type="button"
          onClick={goBackFromCheckout}
          className="mb-5 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {isPolyDeskCheckout ? 'Back to PolyDesk' : 'Back'}
        </button>
      ) : (
        <Link to="/" className="mb-5 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" />
          Create a link
        </Link>
      )}

      <div
        className="overflow-visible rounded-[1.35rem] border border-gray-200/80 bg-white shadow-[0_18px_60px_-32px_rgba(15,23,42,0.42)] transition-all duration-300 dark:border-white/10 dark:bg-[#101114]"
        style={{ boxShadow: `0 18px 60px -32px rgba(15,23,42,0.42), ${meta.glowStyle}`, borderColor: meta.accentColor + '24' }}
      >
        {/* ── Payment network ──────────────────────────────────────────── */}
        {!isBankSendPayment && isHostedCheckout && (
          <div className="px-4 pb-0 pt-4">
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
              Payment network
            </p>
            <PocketSelect
              value={chain}
              options={hostedCheckoutNetworkOptions}
              onChange={value => handleChainSwitch(value as ChainKey)}
              disabled={netLocked}
              ariaLabel="Payment network"
              buttonClassName="min-h-11 rounded-2xl px-3.5 shadow-none"
            />
          </div>
        )}

        {!isBankSendPayment && !isHostedCheckout && <div className="flex justify-center px-4 pb-0 pt-4">
          <div className={cn(
            'flex items-center justify-center overflow-x-auto',
            availableChains.length === 1
              ? 'w-fit gap-0 rounded-lg border-0 bg-transparent p-0'
              : 'w-full gap-0.5 rounded-xl border border-gray-200 bg-gray-100/80 p-1 sm:w-auto sm:gap-1',
          )}>
            {availableChains.map((c) => {
              const m          = CHAIN_META[c]
              const isActive   = chain === c
              const unavailable = c === 'solana'
                ? !isValidSolanaAddress(resolvedSolana)
                : !isAddress(evmRecipientForChain(c))
              return (
                <div key={c} className="relative">
                  <button
                    onClick={() => !unavailable && !netLocked && handleChainSwitch(c)}
                    disabled={(unavailable && !isActive) || (netLocked && !isActive)}
                    className={cn(
                      'flex shrink-0 items-center gap-1 sm:gap-1.5 rounded-lg px-1.5 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-semibold transition-all duration-150',
                      isActive                  ? m.toggleActive
                      : unavailable || netLocked ? 'cursor-not-allowed text-gray-300'
                      : 'cursor-pointer text-gray-500 hover:text-gray-800',
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full transition-colors',
                      isActive ? 'bg-white/80' : unavailable ? 'bg-gray-200' : m.dotColor,
                    )} />
                    {m.label}
                    {c === 'arc' && <span className="text-[8px] font-bold uppercase opacity-70">Test</span>}
                  </button>
                </div>
              )
            })}
          </div>
        </div>}

        {/* ── Amount header ─────────────────────────────────────────────── */}
        <div className={cn('mt-3 border-b border-gray-100 bg-gradient-to-br p-5 text-center dark:border-white/10', meta.headerBg, 'dark:from-gray-800 dark:to-gray-900')}>
          {isWalletManagerFunding && isConfirmed ? (
            <div className="flex min-h-[190px] flex-col items-center justify-center py-2">
              <div className="flex h-24 w-24 items-center justify-center rounded-full border border-emerald-200/80 bg-white shadow-[0_16px_40px_-18px_rgba(16,185,129,0.7)] animate-bounce-in dark:border-emerald-400/20 dark:bg-white/[0.08]">
                <CheckCircle2 className="h-12 w-12 text-emerald-500" strokeWidth={2.2} />
              </div>
              <h2 className="mt-5 text-xl font-black tracking-tight text-gray-950 dark:text-white">Funded</h2>
              <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                {formatAmount(receivedAmount != null ? formatUnits(receivedAmount, meta.decimals) : effectiveAmt, meta.decimals)} {meta.asset}
              </p>
            </div>
          ) : walletFundingConfirming ? (
            <div className="flex min-h-[190px] flex-col items-center justify-center py-2">
              <div className="relative flex h-24 w-24 items-center justify-center">
                <span className="absolute inset-0 rounded-full border-[3px] border-gray-200/80 dark:border-white/10" />
                <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-blue-500 border-r-blue-500" />
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/80 shadow-sm dark:bg-white/[0.06]">
                  <Loader2 className="h-7 w-7 animate-spin text-blue-500" strokeWidth={1.8} />
                </span>
              </div>
              <p className="mt-5 text-xl font-black tracking-tight text-gray-950 dark:text-white">Confirming</p>
              <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                Waiting for {pocketFundingNetworkName} on-chain confirmation
              </p>
            </div>
          ) : isFlex ? (
            <div className="flex flex-col items-center gap-2">
              {isAgentOrWalletFunding ? (
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center justify-center gap-2">
                    <span
                      className={cn(
                        'flex items-center justify-center',
                        isWalletManagerFunding
                          ? 'h-5 w-5 text-gray-800 dark:text-gray-100'
                          : 'h-7 w-7 rounded-lg border border-white/70 text-white shadow-sm',
                      )}
                      style={isWalletManagerFunding ? undefined : {
                        background: `linear-gradient(135deg, hsl(${agentFundingHue} 72% 42%), hsl(${(agentFundingHue + 44) % 360} 72% 34%))`,
                      }}
                    >
                      {isWalletManagerFunding ? <Bot className="h-3.5 w-3.5" /> : <Bot className="h-4 w-4" />}
                    </span>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-300">{isWalletManagerFunding ? 'Pocket Wallet Funding' : 'Agent Funding'}</p>
                  </div>
                  <p className="max-w-[15rem] truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {isWalletManagerFunding ? 'Pocket Wallet' : agentFundingName}
                  </p>
                  {isWalletManagerFunding && chain === 'arc' && (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                      Arc Testnet
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-300">Enter Amount</p>
              )}

              {/* Input centered exactly under label; asset label floats right via absolute */}
              <div className="relative flex justify-center">
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={fxInputMode === 'local' ? localAmt : flexAmt}
                  onChange={e => fxInputMode === 'local' ? setLocalAmt(e.target.value) : setFlexAmt(e.target.value)}
                  className="w-40 text-center text-[2.75rem] font-bold leading-none tracking-tight text-gray-900 dark:text-white bg-transparent border-b-2 border-gray-300 dark:border-white/30 focus:border-gray-500 dark:focus:border-white/60 outline-none"
                />
                <span className="absolute left-full top-1/2 -translate-y-1/2 pl-2 text-xl font-semibold text-gray-400 dark:text-gray-300 whitespace-nowrap">
                  {fxInputMode === 'local' ? flexLocalCurrencyLabel : meta.asset}
                </span>
              </div>

              {/* Swap button — only when FX rate is ready */}
              {fxShow && fxRate ? (
                <button
                  type="button"
                  onClick={() => {
                    if (fxInputMode === 'usdc') {
                      if (flexAmt && parseFloat(flexAmt) > 0) {
                        const m = getFxMeta(fxCurrency)
                        setLocalAmt(formatLocalAmt(parseFloat(flexAmt), fxRate, m?.decimals ?? 2))
                      }
                      setFxInputMode('local')
                    } else {
                      if (localAmt && parseFloat(localAmt) > 0)
                        setFlexAmt((parseFloat(localAmt) / fxRate).toFixed(4).replace(/\.?0+$/, ''))
                      setFxInputMode('usdc')
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-white/20 bg-white/60 dark:bg-white/10 px-3 py-1 text-[11px] font-medium text-gray-500 dark:text-gray-300 hover:bg-white dark:hover:bg-white/20 hover:text-gray-700 dark:hover:text-white transition-all"
                >
                  <ArrowLeftRight className="h-3 w-3" />
                  {fxInputMode === 'local' ? `Switch to ${meta.asset}` : `Switch to ${fxCurrency}`}
                </button>
              ) : null}
            </div>
          ) : isHostedService ? (
            <div className="mb-2 flex items-center justify-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
                <img
                  src={hostedMerchantLogo || '/hash-logo-transparent.png'}
                  alt=""
                  className={cn('h-4 w-4 object-contain', !hostedMerchantLogo && 'invert dark:invert-0')}
                  onError={event => {
                    event.currentTarget.onerror = null
                    event.currentTarget.src = '/hash-logo-transparent.png'
                    event.currentTarget.className = 'h-4 w-4 object-contain invert dark:invert-0'
                  }}
                />
              </span>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">{hostedMerchantName || 'Verified service'}</p>
            </div>
          ) : chain === 'arc' ? (
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-600 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">Testnet</span>
            </div>
          ) : isHelperAccess ? (
            <div className="mb-2 flex items-center justify-center">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Helper Access</p>
            </div>
          ) : isPolymarketFunding ? (
            <div className="mb-2 flex items-center justify-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
                <img src={POLYMARKET_LOGO} alt="" className="h-4 w-4 invert dark:invert-0" />
              </span>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Polymarket Funding</p>
            </div>
          ) : isAgentOrWalletFunding ? (
            <div className="mb-2 flex items-center justify-center gap-2">
              <span
                className={cn(
                  'flex items-center justify-center',
                  isWalletManagerFunding
                    ? 'h-5 w-5 text-gray-800 dark:text-gray-100'
                    : 'h-7 w-7 rounded-lg border border-white/70 text-white shadow-sm',
                )}
                style={isWalletManagerFunding ? undefined : {
                  background: `linear-gradient(135deg, hsl(${agentFundingHue} 72% 42%), hsl(${(agentFundingHue + 44) % 360} 72% 34%))`,
                }}
              >
                {isWalletManagerFunding ? <Bot className="h-3.5 w-3.5" /> : <Bot className="h-4 w-4" />}
              </span>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{isWalletManagerFunding ? 'Pocket Wallet Funding' : 'Agent Funding'}</p>
            </div>
          ) : (
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400">Payment Request</p>
          )}
          {(!isFlex || isBankSendPayment) && (
            <>
              {isBankSendPayment ? (
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-[2.75rem] font-bold leading-none tracking-tight text-gray-900 dark:text-white">{bankSendRequestedNgnLabel || 'Enter amount'}</span>
                  <span className="text-xl font-semibold text-gray-400">NGN</span>
                </div>
              ) : (
                <div className="flex justify-center">
                  <span className="relative text-[2.75rem] font-bold leading-none tracking-tight text-gray-900 dark:text-white">
                    {formatAmount(payableAmt, meta.decimals)}
                    <span className="absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap text-xl font-semibold text-gray-400 dark:text-gray-300">{meta.asset}</span>
                  </span>
                </div>
              )}
              {isBankSendPayment && (
                <div className="mt-2 flex items-center justify-center gap-1.5">
                  {bankSendQuoteBusy && !bankSendDisplayUsdc ? (
                    <>
                      <RefreshCw className="h-2.5 w-2.5 animate-spin text-gray-300" />
                      <span className="text-[11px] text-gray-400">Fetching USDC quote...</span>
                    </>
                  ) : bankSendDisplayUsdc ? (
                    <span className="text-[11px] text-gray-400">
                      ≈ {formatAmount(bankSendDisplayUsdc, 6)} USDC
                    </span>
                  ) : null}
                </div>
              )}
              {memo && !isAgentOrWalletFunding && (
                <p className="mt-1 text-sm font-medium text-gray-500 dark:text-gray-300">
                  {isHostedService ? (
                    hostedCheckoutTitle || memo
                  ) : isHelperAccess ? (
                    'Hash PayLink Agent Helper'
                  ) : isPolymarketFunding ? (
                    polymarketFundingLabel
                  ) : (
                    <>For {memo}</>
                  )}
                </p>
              )}
              {isWalletManagerFunding && (
                <p className="mt-1 text-sm font-medium text-gray-500 dark:text-gray-300">
                  Return to Pocket to add these funds to App Pay.
                </p>
              )}
            </>
          )}
          {isFlex && memo && isPolymarketFunding && (
            <div className="mt-2.5 flex justify-center">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-300">{polymarketFundingLabel}</span>
            </div>
          )}

          {/* ── FX indicator — event mode only ─────────────────────────── */}
          {fxShow && fxCurrency && (() => {
            const fxMeta = getFxMeta(fxCurrency)
            const rate   = fxRate ?? null

            // Local-currency mode: show the USDC the payer will actually pay
            if (fxInputMode === 'local') {
              const usdcOut = rate && parseFloat(localAmt) > 0
                ? (parseFloat(localAmt) / rate).toFixed(4).replace(/\.?0+$/, '')
                : null
              return (
                <div className="mt-2 flex items-center justify-center gap-1">
                  {usdcOut ? (
                    <span className="text-[11px] text-gray-400">You will pay ≈ {usdcOut} USDC</span>
                  ) : rate ? (
                    <span className="text-[11px] text-gray-400">
                      1 {fxCurrency} = {(1 / rate).toFixed(6).replace(/\.?0+$/, '')} USDC
                    </span>
                  ) : null}
                </div>
              )
            }

            // USDC mode: show local-currency equivalent
            const usdcAmt = parseFloat(effectiveAmt) || 0
            return (
              <div className="mt-3 flex items-center justify-center gap-1.5">
                {fxLoading ? (
                  <RefreshCw className="h-2.5 w-2.5 animate-spin text-gray-300" />
                ) : rate && usdcAmt > 0 ? (
                  <>
                    <span className="text-[11px] text-gray-400 leading-none">
                      ≈ {formatLocalAmt(usdcAmt, rate, fxMeta?.decimals ?? 2)} {fxCurrency}
                      {' · '}1 USDC = {rate.toFixed(2)} {fxCurrency}
                    </span>
                    {fxSrc === 'live' && (
                      <button onClick={refreshFxRate} title="Refresh rate" className="text-gray-300 hover:text-gray-500 transition-colors focus:outline-none">
                        <RefreshCw className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </>
                ) : rate ? (
                  <span className="text-[11px] text-gray-400">
                    1 USDC = {rate.toFixed(2)} {fxCurrency}
                    {fxSrc === 'live' && (
                      <button onClick={refreshFxRate} className="ml-1 text-gray-300 hover:text-gray-500 transition-colors">
                        <RefreshCw className="inline h-2.5 w-2.5" />
                      </button>
                    )}
                  </span>
                ) : fxSrc === 'live' ? (
                  <span className="text-[11px] text-gray-400 flex items-center gap-1">
                    Rate unavailable
                    <button onClick={refreshFxRate} title="Retry" className="text-gray-300 hover:text-gray-500 transition-colors">
                      <RefreshCw className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ) : null}
              </div>
            )
          })()}
        </div>

        {/* ── Live rates banner ─────────────────────────────────────────── */}
        {fxShow && fxCurrency && (
          <div className="px-5 pt-3">
            <p className="text-center text-[10px] text-gray-400 leading-relaxed">
              Pricing in {meta.asset} · Shown in {getFxMeta(fxCurrency)?.name ?? fxCurrency} at live market rates
              {fxStale && ' · ⚠ Rate may be outdated'}
            </p>
          </div>
        )}

        <div className="space-y-4 p-5">
          {/* Payment details */}
          {isHostedCheckout ? (
            (feeAmount > 0 && effectiveAmt) || showArbitrumRelayCost ? (
              <div className="space-y-1 text-center text-[11px] font-medium text-slate-400">
                {feeAmount > 0 && effectiveAmt && <p>Fee {formatAmount(feeAmount.toString(), 6)} {meta.asset}</p>}
                {showArbitrumRelayCost && arbitrumGasEstimate > 0n && (
                  <p>Network fee ~{formatAmount(formatUnits(arbitrumGasEstimate, 6), 6)} USDC</p>
                )}
              </div>
            ) : null
          ) : <div className="space-y-1.5 text-center">
            <div className="flex items-center justify-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-gray-100">
              <span>
                {isBankSendPayment
                  ? 'Paying by NGN bank transfer'
                  : isWalletManagerFunding
                  ? `Funding Pocket wallet on ${pocketFundingNetworkName}`
                  : `Paying on ${consumerNetworkName}`}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {isBankSendPayment
                ? `Recipient receives ${bankSendDestinationLabel} USDC after your bank transfer is confirmed.`
                : isWalletManagerFunding
                ? <>Pocket Wallet receives USDC on {pocketFundingNetworkName}. Platform fee: {feeAmount > 0 && effectiveAmt ? `${feeAmount.toFixed(meta.decimals <= 6 ? 4 : 6)} ${meta.asset}` : 'not applied'}</>
                : <>Platform fee: {feeAmount > 0 && effectiveAmt ? `${feeAmount.toFixed(meta.decimals <= 6 ? 4 : 6)} ${meta.asset}` : 'not applied'}</>}
            </p>
            {isWalletManagerFunding && (walletFundingConfirming || isConfirmed) ? (
              <p className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-[11px] font-medium text-gray-500 dark:bg-white/[0.07] dark:text-gray-300">
                {eventRegStatus === 'ok' ? (
                  <>Redirecting back in 6 seconds...</>
                ) : eventRegStatus === 'error' ? (
                  <button
                    type="button"
                    onClick={() => {
                      eventRegistered.current = false
                      void doRegister(memo || 'x402 wallet funding')
                    }}
                    className="font-semibold text-red-600 underline decoration-red-300 underline-offset-2 dark:text-red-300"
                  >
                    Funding confirmed. Retry Activity sync.
                  </button>
                ) : (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Funds detected. Verifying transaction...</>
                )}
              </p>
            ) : isAgentFunding && manualPayDetected && !txHash && (
              <p className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-[11px] font-medium text-gray-500 dark:bg-white/[0.07] dark:text-gray-300">
                <Loader2 className="h-3 w-3 animate-spin" />
                Payment detected. Verifying transaction...
              </p>
            )}
            {showArbitrumRelayCost && (
              <div className="flex items-center justify-between bg-gray-50/60 px-4 py-2 border-t border-dashed border-gray-100">
                <span className="text-[11px] font-normal text-slate-400 tracking-wide">Gas reimb (relayer pays ETH)</span>
                <span className="font-mono text-[11px] text-slate-400">
                  {arbitrumGasEstimate > 0n
                    ? `~${(Number(arbitrumGasEstimate) / 1e6).toFixed(4)} USDC`
                    : '…'}
                </span>
              </div>
            )}
          </div>}

          {/* ── Attendee name (event mode) ───────────────────────────────── */}
          {isNgPosPaycrestOfframp && (
            <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Naira payout</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                    {paycrestOrder?.bank_account_name || ngPosBankAccountName || 'Verified merchant bank'}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {paycrestOrder?.bank_name || ngPosBankName || 'Nigerian bank'} {paycrestOrder?.bank_last4 ? `****${paycrestOrder.bank_last4}` : ngPosBankAccount}
                  </p>
                </div>
                <Banknote className="h-4 w-4 shrink-0 text-gray-400" />
              </div>
              <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-[11px] font-medium text-gray-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-300">
                {paycrestOrder
                  ? <>Ready: pay {formatAmount(paycrestOrder.amount_usdc, meta.decimals)} Base USDC from your Circle wallet.</>
                  : <>Open Circle Pocket, enter your name, then pay from your Circle wallet.</>}
              </div>
              {paycrestStatusText && (
                <p className="mt-2 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">{paycrestStatusText}</p>
              )}
            </div>
          )}

          {isBankSendPayment && (
            <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Bank transfer funding</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Send Naira from your bank. The recipient receives USDC on {bankSendDestinationLabel} after confirmation.
                  </p>
                </div>
                <Banknote className="h-4 w-4 shrink-0 text-gray-400" />
              </div>

              {isFlex && !paycrestOrder && (
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">Naira amount</label>
                  <input
                    value={localAmt}
                    onChange={(event) => setLocalAmt(event.target.value.replace(/[^\d.]/g, ''))}
                    inputMode="decimal"
                    placeholder="Enter amount"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-all focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:bg-white/[0.06]"
                  />
                </div>
              )}

              {!paycrestOrder && (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr]">
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Refund bank</span>
                      <PocketSelect
                        value={bankSendBankCode}
                        options={bankSendInstitutions.map(institution => ({ value: institution.code, label: institution.name }))}
                        onChange={(code) => {
                          const selected = bankSendInstitutions.find((institution) => institution.code === code)
                          setBankSendBankCode(code)
                          setBankSendBankName(selected?.name || '')
                          setBankSendBankVerified(false)
                          setBankSendAccountName('')
                        }}
                        disabled={bankSendBanksBusy}
                        placeholder={bankSendBanksBusy ? 'Loading banks...' : 'Select bank'}
                        ariaLabel="Select refund bank"
                        buttonClassName="min-h-[42px] bg-gray-50/60 shadow-none dark:bg-white/[0.04]"
                      />
                    </div>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Account number</span>
                      <input
                        value={bankSendAccount}
                        onChange={(event) => {
                          setBankSendAccount(event.target.value.replace(/\D/g, '').slice(0, 10))
                          setBankSendBankVerified(false)
                          setBankSendAccountName('')
                        }}
                        inputMode="numeric"
                        placeholder="10 digits"
                        className="w-full rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-all focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                      />
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={verifyBankSendRefundAccount}
                    disabled={bankSendBankBusy || !bankSendBankCode || bankSendAccount.length !== 10}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 transition-all hover:bg-gray-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:hover:bg-white/[0.1]"
                  >
                    {bankSendBankBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : bankSendBankVerified ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Banknote className="h-4 w-4" />}
                    {bankSendBankVerified ? bankSendAccountName : 'Verify refund account'}
                  </button>

                  <button
                    type="button"
                    onClick={prepareBankSendPaycrestOrder}
                    disabled={paycrestPreparing || !bankSendBankVerified || (isFlex ? !localAmt || Number.parseFloat(localAmt) <= 0 : !ngPosAmountNgn)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-gray-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200 dark:disabled:bg-white/10 dark:disabled:text-gray-400"
                  >
                    {paycrestPreparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    {paycrestPreparing ? 'Preparing transfer details' : 'Get transfer details'}
                  </button>
                </div>
              )}

              {paycrestOrder && (
                <div className={cn(
                  'space-y-3 rounded-xl border p-3',
                  bankSendStatus === 'settled'
                    ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-400/20 dark:bg-emerald-400/10'
                    : bankSendStatus === 'expired' || bankSendStatus === 'error'
                    ? 'border-red-200 bg-red-50 dark:border-red-400/20 dark:bg-red-400/10'
                    : 'border-amber-200 bg-amber-50 dark:border-amber-400/20 dark:bg-amber-400/10',
                )}>
                  <div className="flex items-center justify-between gap-3">
                    <p className={cn(
                      'text-xs font-bold uppercase tracking-widest',
                      bankSendStatus === 'settled'
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : bankSendStatus === 'expired' || bankSendStatus === 'error'
                        ? 'text-red-700 dark:text-red-300'
                        : 'text-amber-700 dark:text-amber-300',
                    )}>
                      {bankSendStatus === 'settled'
                        ? 'USDC settled'
                        : bankSendStatus === 'expired'
                        ? 'Instruction expired'
                        : bankSendStatus === 'refunding'
                        ? 'Refund in progress'
                        : bankSendPaymentDetected
                        ? 'Settling USDC'
                        : 'Transfer exactly'}
                    </p>
                    <span className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize',
                      bankSendStatus === 'settled'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200'
                        : bankSendStatus === 'expired' || bankSendStatus === 'error'
                        ? 'bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-200'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200',
                    )}>
                      {bankSendStatus === 'waiting' || bankSendStatus === 'pending' ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      {bankSendStatusLabel}
                    </span>
                  </div>
                  <div className={cn(
                    'overflow-hidden rounded-xl border bg-white dark:bg-white/[0.06]',
                    bankSendStatus === 'settled'
                      ? 'divide-y divide-emerald-200/70 border-emerald-200 dark:divide-emerald-400/10 dark:border-emerald-400/20'
                      : bankSendStatus === 'expired' || bankSendStatus === 'error'
                      ? 'divide-y divide-red-200/70 border-red-200 dark:divide-red-400/10 dark:border-red-400/20'
                      : 'divide-y divide-amber-200/70 border-amber-200 dark:divide-amber-400/10 dark:border-amber-400/20',
                  )}>
                    {bankSendPaymentDetected || bankSendStatus === 'settled' || bankSendStatus === 'refunding' ? (
                      <>
                        <Row label="USDC" value={paycrestOrder.amount_usdc ? `${formatAmount(paycrestOrder.amount_usdc, 6)} USDC` : 'Settlement in progress'} />
                        {Number.isFinite(bankSendAmountPaid) && bankSendAmountPaid > 0 && (
                          <Row label="Paid" value={`${formatAmount(bankSendAmountPaid, 2)} NGN`} />
                        )}
                        {bankSendHasAmountMismatch && (
                          <Row label={bankSendMismatchLabel} value={`${formatAmount(Math.abs(bankSendAmountDelta), 2)} NGN`} />
                        )}
                        {Number.isFinite(bankSendAmountReturned) && bankSendAmountReturned > 0 && (
                          <Row label="Returned" value={`${formatAmount(bankSendAmountReturned, 2)} NGN`} />
                        )}
                        <Row label="To" value={`${bankSendDestinationLabel} USDC`} />
                        {paycrestOrder.tx_hash && <Row label="Tx" value={truncateAddress(paycrestOrder.tx_hash, 6)} mono />}
                      </>
                    ) : (
                      <>
                        <Row label="Amount" value={`${formatAmount(paycrestOrder.provider_amount_to_transfer || paycrestOrder.amount_ngn, 2)} ${paycrestOrder.provider_currency || 'NGN'}`} />
                        {Number.isFinite(bankSendAmountPaid) && bankSendAmountPaid > 0 && (
                          <Row label="Paid" value={`${formatAmount(bankSendAmountPaid, 2)} NGN`} />
                        )}
                        {bankSendHasAmountMismatch && (
                          <Row label={bankSendMismatchLabel} value={`${formatAmount(Math.abs(bankSendAmountDelta), 2)} NGN`} />
                        )}
                        {Number.isFinite(bankSendAmountReturned) && bankSendAmountReturned > 0 && (
                          <Row label="Returned" value={`${formatAmount(bankSendAmountReturned, 2)} NGN`} />
                        )}
                        <Row label="Bank" value={paycrestOrder.provider_institution || 'Transfer bank'} />
                        <Row label="Account" value={paycrestOrder.provider_account_identifier || ''} mono />
                        <Row label="Name" value={paycrestOrder.provider_account_name || ''} />
                        <Row label="To" value={`${bankSendDestinationLabel} USDC`} />
                      </>
                    )}
                  </div>
                  {paycrestOrder.valid_until && (
                    <p className={cn(
                      'text-[11px] font-medium',
                      bankSendStatus === 'expired' || bankSendStatus === 'error'
                        ? 'text-red-700 dark:text-red-300'
                        : 'text-emerald-700 dark:text-emerald-300',
                    )}>
                      {bankSendStatus === 'settled'
                        ? 'The recipient USDC settlement is confirmed.'
                        : bankSendStatus === 'expired'
                        ? 'Do not send money to this account. If you already paid before expiry, your verified refund account will be used where a refund is required.'
                        : bankSendHasAmountMismatch
                        ? `${bankSendMismatchLabel} detected. Do not send another transfer to this account. Wait for settlement or refund, then contact support if this stays pending for more than 10 minutes.`
                        : bankSendPaymentDetected
                        ? 'Transfer received. USDC settlement is in progress.'
                        : `Complete before ${new Date(paycrestOrder.valid_until).toLocaleString()}.`}
                    </p>
                  )}
                  {isPolymarketBridge && polymarketBridgeStatusText && (
                    <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                      {polymarketBridgeStatusText}
                    </p>
                  )}
                  {bankSendStatus === 'settled' && paymentReceiptId && (
                    <Link
                      to={`/receipt/${encodeURIComponent(paymentReceiptId)}`}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-emerald-700 shadow-sm ring-1 ring-emerald-200 transition hover:bg-emerald-50 dark:bg-white/[0.08] dark:text-emerald-200 dark:ring-emerald-400/20 dark:hover:bg-white/[0.12]"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      View receipt
                    </Link>
                  )}
                </div>
              )}

              {(bankSendError || paycrestStatusText) && (
                <p className={cn(
                  'text-[11px] font-medium',
                  bankSendError || bankSendStatus === 'expired' || bankSendStatus === 'error' || bankSendStatus === 'refunding'
                    ? 'text-red-600 dark:text-red-300'
                    : bankSendStatus === 'settled' || bankSendPaymentDetected
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-amber-700 dark:text-amber-300',
                )}>
                  {bankSendError || paycrestStatusText}
                </p>
              )}
            </div>
          )}

          {requiresAttendeeName && (() => {
            const paid = isConfirmed
            return (
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  {isNgPosPayment ? "Payer's name" : 'Your name or handle'}
                  {paid ? (
                    <span className="ml-auto text-[10px] font-semibold text-emerald-600">✓ Saved</span>
                  ) : attendeeName.trim() ? (
                    <span className="ml-auto text-[10px] font-semibold text-emerald-600">
                      Ready
                    </span>
                  ) : (
                    <span className="ml-auto text-[10px] font-medium text-gray-400">
                      Required
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  placeholder={isNgPosPayment ? 'e.g. Chinedu or Table 4' : 'e.g. Nana, @Clinton, or Jane Doe'}
                  value={attendeeName}
                  onChange={e => setAttendeeName(e.target.value)}
                  disabled={paid}
                  maxLength={60}
                  className={`w-full rounded-xl border px-4 py-3 text-sm placeholder:text-gray-400 transition-all ${
                    paid
                      ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800 cursor-not-allowed'
                      : 'border-gray-200 bg-gray-50/60 focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100'
                  }`}
                />
                {!paid && (
                  <p className="text-[11px] text-gray-400 transition-opacity duration-300" style={{ opacity: attendeeName.trim() ? 0.5 : 1 }}>
                    {attendeeName.trim()
                      ? isNgPosPayment ? 'Shown on the merchant receipt.' : 'Shown beside your payment on the organizer dashboard.'
                      : isNgPosPayment ? 'Enter your name to continue.' : 'Enter your name to continue. This helps the organizer track contributions.'}
                  </p>
                )}
              </div>
            )
          })()}

          {/* ── Direct Send panel (Base / Arc / HashKey / Arbitrum) ─────── */}
          {payMode === 'direct' && isSupportedEvmPayChain(chain) && (
            <div className="space-y-3">
              {/* Loading ghost address */}
              {!directDisplayAddr && directStatus !== 'error' ? (
                <div className="h-14 animate-pulse rounded-xl bg-gray-100 dark:bg-white/10" />
              ) : directStatus === 'relaying' ? (
                <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3.5">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
                  <p className="text-sm font-medium text-blue-700">Relaying payment — broadcasting transaction…</p>
                </div>
              ) : directStatus === 'error' ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">Relay Failed</p>
                      <p className="mt-0.5 text-xs text-red-600">{directError}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      directRelayedRef.current = false
                      setDirectStatus('waiting')
                      setDirectError(null)
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 transition-all active:scale-[0.98]"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                /* Waiting for payment */
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                    <div className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    </div>
                    <p className="text-[11px] font-medium text-emerald-700">Monitoring for {meta.asset} — detects in under 3 seconds</p>
                  </div>
                  <p className="text-center text-xs text-gray-500">
                    Pay from an exchange or another wallet by sending {meta.asset} on {meta.label} to this address
                  </p>
                  <div className={cn(
                    'flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 transition-opacity duration-200',
                    requiresAttendeeName && !attendeeName.trim() && 'opacity-40',
                  )}>
                    <p className="min-w-0 flex-1 break-all font-mono text-xs text-gray-800">{directDisplayAddr}</p>
                    <button
                      onClick={() => {
                        if (requiresAttendeeName && !attendeeName.trim()) return
                        navigator.clipboard.writeText(directDisplayAddr!)
                        setDirectAddrCopied(true)
                        setTimeout(() => setDirectAddrCopied(false), 2500)
                      }}
                      className={cn(
                        'ml-2 shrink-0 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-all',
                        requiresAttendeeName && !attendeeName.trim()
                          ? 'cursor-not-allowed'
                          : 'hover:bg-gray-100 active:scale-90',
                      )}
                    >
                      {directAddrCopied
                        ? <><CheckCheck className="h-3.5 w-3.5 text-emerald-500" /> Copied!</>
                        : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Direct Send panel (Solana) ───────────────────────────── */}
          {payMode === 'direct' && chain === 'solana' && (
            <div className="space-y-3">
              {!solanaVaultAddr && solanaDirectStatus !== 'error' ? (
                <div className="animate-pulse h-14 rounded-xl bg-gray-100" />
              ) : solanaDirectStatus === 'success' ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Payment Successful</p>
                  </div>
                  {solanaDirectTxHash && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
                        <p className="min-w-0 flex-1 truncate font-mono text-xs text-gray-600 dark:text-gray-300">{solanaDirectTxHash}</p>
                        <button onClick={() => { navigator.clipboard.writeText(solanaDirectTxHash!); setSolanaDirHashCopied(true); setTimeout(() => setSolanaDirHashCopied(false), 2000) }}>
                          {solanaDirHashCopied ? <CheckCheck className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-gray-400" />}
                        </button>
                      </div>
                      <a href={`${meta.explorerUrl}/tx/${solanaDirectTxHash}`} target="_blank" rel="noopener noreferrer"
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/10">
                        <ExternalLink className="h-4 w-4" />
                        View on {meta.explorerName}
                      </a>
                    </div>
                  )}
                </div>
              ) : solanaDirectStatus === 'relaying' ? (
                <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3.5 dark:border-blue-500/30 dark:bg-blue-500/10">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-200">Relaying payment - broadcasting transaction...</p>
                </div>
              ) : solanaDirectStatus === 'error' ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-500/30 dark:bg-red-500/10">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                    <div>
                      <p className="text-sm font-semibold text-red-800 dark:text-red-200">Relay Failed</p>
                      <p className="mt-0.5 text-xs text-red-600 dark:text-red-300">{solanaDirectError}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setSolanaDirectStatus('waiting'); setSolanaDirectError(null) }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5">
                    <div className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    </div>
                    <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-200">Monitoring for {meta.asset} - detects in under 3 seconds</p>
                  </div>
                  <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                    Pay from an exchange or another wallet by sending {meta.asset} on {meta.label} to this address
                  </p>
                  <div className={cn(
                    'flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 transition-opacity duration-200 dark:border-white/10 dark:bg-white/[0.04]',
                    requiresAttendeeName && !attendeeName.trim() && 'opacity-40',
                  )}>
                    <p className="min-w-0 flex-1 break-all font-mono text-xs text-gray-800 dark:text-gray-200">{solanaVaultAddr}</p>
                    <button
                      onClick={() => {
                        if (requiresAttendeeName && !attendeeName.trim()) return
                        navigator.clipboard.writeText(solanaVaultAddr!)
                        setSolanaAddrCopied(true)
                        setTimeout(() => setSolanaAddrCopied(false), 2500)
                      }}
                      className={cn(
                        'ml-2 flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-all dark:border-white/10 dark:bg-white/10 dark:text-gray-200',
                        requiresAttendeeName && !attendeeName.trim()
                          ? 'cursor-not-allowed'
                          : 'hover:bg-gray-100 active:scale-90 dark:hover:bg-white/15',
                      )}
                    >
                      {solanaAddrCopied
                        ? <><CheckCheck className="h-3.5 w-3.5 text-emerald-500" /> Copied!</>
                        : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tx finalizing indicator — wallet mode only, after tx submitted */}
          {payMode === 'wallet' && evmTxHash && !isEvmConfirmed && (
            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5">
              <div className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </div>
              <p className="text-[11px] font-medium text-emerald-700">Transaction Found! Finalizing…</p>
              <Radio className="ml-auto h-3 w-3 text-emerald-400" />
            </div>
          )}

          {/* Missing Solana address */}
          {missingSolana && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Receiver has not set a Solana address</p>
                <p className="mt-0.5 text-xs text-amber-700">
                  Pay via{' '}
                  <button onClick={() => handleChainSwitch('base')} className="font-semibold underline underline-offset-2">Base</button>
                  {' '}or another supported chain.
                </p>
              </div>
            </div>
          )}

          {/* Wrong network */}
          {isEvmChain && isConnected && !isCorrectNetwork && payMode === 'wallet' && (() => {
            const currentName = CHAIN_DISPLAY_NAMES[chainId] ?? `Chain ${chainId}`
            return (
              <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white dark:border-white/10 dark:bg-white/[0.03]">
                {/* Accent line */}
                <div className="h-[2px] w-full" style={{ background: `linear-gradient(90deg, transparent 0%, ${meta.accentColor}80 30%, ${meta.accentColor} 50%, ${meta.accentColor}80 70%, transparent 100%)` }} />

                <div className="px-4 pb-4 pt-3.5">
                  {/* Chain transition row */}
                  <div className="mb-3 flex items-center gap-2">
                    {/* Current (wrong) chain */}
                    <div className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-100/80 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.06]">
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-gray-500" />
                      <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{currentName}</span>
                    </div>

                    {/* Arrow */}
                    <div className="flex items-center gap-0.5 text-gray-300 dark:text-white/20">
                      <div className="h-px w-3 bg-current" />
                      <ArrowRight className="h-3 w-3" />
                    </div>

                    {/* Target (correct) chain */}
                    <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
                      style={{ backgroundColor: `${meta.accentColor}18`, border: `1px solid ${meta.accentColor}35` }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.accentColor }} />
                      <span className="text-[11px] font-semibold" style={{ color: meta.accentColor }}>{meta.label}</span>
                    </div>
                  </div>

                  <p className="mb-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                    Your wallet is connected to <span className="font-medium text-gray-700 dark:text-gray-300">{currentName}</span>. This payment requires{' '}
                    <span className="font-medium text-gray-700 dark:text-gray-300">{meta.label}</span>.
                  </p>

                  <button
                    onClick={() => switchChain({ chainId: targetChainId })}
                    disabled={isSwitching}
                    className="flex items-center gap-1.5 text-xs font-semibold transition-opacity hover:opacity-70 disabled:opacity-50"
                    style={{ color: meta.accentColor }}>
                    {isSwitching
                      ? <><Loader2 className="h-3 w-3 animate-spin" /> Switching…</>
                      : <><RefreshCw className="h-3 w-3" /> Switch to {meta.label}</>}
                  </button>
                </div>
              </div>
            )
          })()}

          {isHostedCheckout && hostedIntentStatus === 'checking' && (
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-2.5 text-xs font-medium text-gray-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Verifying hosted checkout
            </div>
          )}

          {isHostedCheckout && hostedIntentStatus === 'error' && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 dark:border-red-500/30 dark:bg-red-500/10">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-500" />
              <div>
                <p className="text-xs font-semibold text-red-800 dark:text-red-200">Checkout verification failed</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-red-600 dark:text-red-300">{hostedIntentError}</p>
              </div>
            </div>
          )}

          {/* Send error */}
          {payMode === 'wallet' && isSendError && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800">Transaction Failed</p>
                <p className="mt-0.5 text-xs text-red-600">
                  {friendlyErrorMsg(sendErrorMsg ?? 'An unknown error occurred')}
                </p>
                <button onClick={resetCheckoutError}
                  className="mt-2 text-xs font-bold text-red-700 hover:text-red-900">Try again</button>
              </div>
            </div>
          )}

          {!isConfirmed && payMode === 'wallet' && !isBankSendPayment && (showCircleEmailBridgePay || !!circleSmartAccount || !!circleEvmEmailSession) && chain !== 'solana' && !manualPayDetected && (
            <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
              {!circleSmartAccount && !showPrivyCircleEmailPay && (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.06]">
                  <input
                    type="email"
                    value={circleEmail}
                    onChange={(e) => setCircleEmail(e.target.value)}
                    placeholder="Enter your email"
                    disabled={circlePasskeyPending || circleEvmPaymentProcessing || (requiresAttendeeName && !attendeeName.trim())}
                    className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 outline-none dark:text-white dark:placeholder:text-gray-500"
                  />
                </div>
              )}
              {circleSmartAccount && circleEvmWalletUnlocked && !circleWalletNeedsFunds && (!isNgPosPaycrestOfframp || Boolean(paycrestOrder)) ? (
                <SlideAction
                  status={checkoutSlideStatus}
                  disabled={circlePasskeyPending || circleEvmPaymentProcessing || circleEvmAcceptedPending || privyCircleLinkLoading || paycrestPreparing || circleEvmWalletChecking || (requiresAttendeeName && !attendeeName.trim()) || paymentAmountBlocked}
                  onConfirm={handleCirclePasskeyPay}
                  labels={checkoutSlideLabels}
                />
              ) : (
                <button
                  onClick={() => {
                    if (circleSmartAccount && circleEvmWalletChecking) {
                      void refetchCircleWalletBalance()
                      return
                    }
                    if (circleSmartAccount && circleEvmWalletUnlocked && circleWalletNeedsFunds) {
                      openCircleWalletPanel()
                      if (isSmartWalletBalanceError(circlePasskeyError)) setCirclePasskeyError(null)
                      return
                    }
                    handleCirclePasskeyPay()
                  }}
                  disabled={circlePasskeyPending || circleEvmPaymentProcessing || circleEvmAcceptedPending || privyCircleLinkLoading || paycrestPreparing || circleEvmWalletChecking || (requiresAttendeeName && !attendeeName.trim()) || paymentAmountBlocked}
                  className={cn(
                    'relative flex w-full items-center justify-center gap-1.5 rounded-xl px-6 py-3.5 text-sm font-bold transition-all',
                    circlePasskeyPending || circleEvmPaymentProcessing || circleEvmAcceptedPending || privyCircleLinkLoading || paycrestPreparing || circleEvmWalletChecking || (requiresAttendeeName && !attendeeName.trim()) || paymentAmountBlocked
                      ? 'cursor-not-allowed bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400'
                      : 'bg-black text-white shadow-button hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200',
                  )}
                >
                  {paycrestPreparing
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Preparing payout</>
                    : circlePasskeyPending
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening Smart wallet</>
                      : privyCircleLinkLoading
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking Smart wallet</>
                        : circleSmartAccount && isNgPosPaycrestOfframp && !paycrestOrder
                          ? <><img src="/hash-logo-transparent.png" alt="" className="h-5 w-5 object-contain invert dark:invert-0" /> <span>Prepare naira payout</span></>
                          : circleSmartAccount && circleEvmWalletChecking
                            ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking wallet</>
                            : circleSmartAccount && circleEvmWalletUnlocked && circleWalletNeedsFunds
                              ? <><img src="/pocket-circle.png" alt="" className="h-6 w-6 object-contain invert dark:invert-0" /> <span>Add USDC</span></>
                              : <><img src="/pocket-circle.png" alt="" className="h-6 w-6 object-contain invert dark:invert-0" /> <span>Open Pocket Wallet</span></>}
                </button>
              )}
              {privyCircleLinkError && circleSmartAccount && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  {privyCircleLinkError}
                </p>
              )}
              {circleSmartAccount && circleEvmWalletUnlocked && typeof circleWalletBalance === 'bigint' && (
                <details ref={circleWalletDetailsRef} className="group rounded-lg border border-gray-200 bg-white/60 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[11px] font-medium text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 truncate">
                      {circleWalletNeedsFunds ? `Add ${meta.asset} to ${meta.label}` : `${meta.label} ${meta.asset} wallet ready`}
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-2">
                      <span className="font-mono font-semibold text-gray-600 dark:text-gray-200">
                        {circleWalletBalance == null
                          ? 'Checking...'
                          : `${formatAmount((Number(circleWalletBalance) / Math.pow(10, meta.decimals)).toString(), meta.decimals)} ${meta.asset}`}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 text-gray-400 transition-transform group-open:rotate-180 dark:text-gray-500" />
                    </span>
                  </summary>
                  <div className="mt-2 border-t border-gray-100 pt-2 dark:border-white/10">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Add funds</p>
                        <p className="truncate text-[11px] text-gray-500 dark:text-gray-300">Send {meta.asset} on {meta.label} to this wallet</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyCircleWallet}
                        className="shrink-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-gray-600 transition-all hover:bg-gray-50 active:scale-95 dark:border-white/10 dark:bg-white/[0.08] dark:text-gray-200 dark:hover:bg-white/[0.14]"
                      >
                        {circleWalletCopied ? 'Copied' : 'Copy address'}
                      </button>
                    </div>
                  </div>
                </details>
              )}
              {circlePasskeyError && (
                <p className="text-center text-[11px] font-medium text-red-600 dark:text-red-300">{circlePasskeyError}</p>
              )}
              <CheckoutTrustLine />
            </div>
          )}

          {/* ── Primary CTA (wallet mode only) ────────────────────────── */}
          {payMode === 'wallet' && !isBankSendPayment && missingSolana ? (
            <button disabled className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-gray-100 px-6 py-4 text-sm font-semibold text-gray-400">
              <AlertTriangle className="h-4 w-4" />
              No Solana Address Available
            </button>
          ) : payMode === 'wallet' && !isBankSendPayment && chain === 'solana' && (!usePrivyCircleSolanaCheckout || privyAuthenticated) ? (
              <div className="space-y-2">
                {(showCircleSolanaEmailBridgePay || !!circleSolanaSession || !!circleSolanaAddress) && !manualPayDetected && (
                  <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                    {!circleSolanaSession && !showPrivyCircleSolanaEmailPay && (
                      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.06]">
                        <input
                          type="email"
                          value={circleSolanaEmail}
                          onChange={(e) => setCircleSolanaEmail(e.target.value)}
                          placeholder="Enter your email"
                          disabled={circleSolanaPending || (requiresAttendeeName && !attendeeName.trim())}
                          className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 outline-none dark:text-white dark:placeholder:text-gray-500"
                        />
                      </div>
                    )}
                    {circleSolanaSession && !circleSolanaNeedsFunds ? (
                      <SlideAction
                        status={checkoutSlideStatus}
                        disabled={circleSolanaPending || isSolanaConfirming || privyCircleLinkLoading || circleSolanaWalletChecking || (requiresAttendeeName && !attendeeName.trim()) || paymentAmountBlocked}
                        onConfirm={handleCircleSolanaEmailPay}
                        labels={checkoutSlideLabels}
                      />
                    ) : (
                      <button
                        onClick={() => {
                          if (circleSolanaWalletChecking) {
                            void refreshCircleSolanaBalance()
                            return
                          }
                          if (circleSolanaSession && circleSolanaNeedsFunds) {
                            openCircleSolanaPanel()
                            if (isSmartWalletBalanceError(circleSolanaError)) setCircleSolanaError(null)
                            return
                          }
                          handleCircleSolanaEmailPay()
                        }}
                        disabled={circleSolanaPending || isSolanaConfirming || privyCircleLinkLoading || circleSolanaWalletChecking || (requiresAttendeeName && !attendeeName.trim()) || paymentAmountBlocked}
                        className={cn(
                          'relative flex w-full items-center justify-center gap-1.5 rounded-xl px-6 py-3.5 text-sm font-bold transition-all',
                          circleSolanaPending || isSolanaConfirming || privyCircleLinkLoading || circleSolanaWalletChecking || (requiresAttendeeName && !attendeeName.trim()) || paymentAmountBlocked
                            ? 'cursor-not-allowed bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400'
                            : 'bg-black text-white shadow-button hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200',
                        )}
                      >
                        {circleSolanaPending
                          ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening Smart wallet</>
                          : privyCircleLinkLoading
                            ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking Smart wallet</>
                            : circleSolanaSession && circleSolanaWalletChecking
                              ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking wallet</>
                              : circleSolanaSession && circleSolanaNeedsFunds
                                ? <><img src="/pocket-circle.png" alt="" className="h-6 w-6 object-contain invert dark:invert-0" /> <span>Add USDC</span></>
                                : <><img src="/pocket-circle.png" alt="" className="h-6 w-6 object-contain invert dark:invert-0" /> <span>Open Pocket Wallet</span></>}
                      </button>
                    )}
                    {circleSolanaSession && circleSolanaBalance !== null && (
                      <details ref={circleSolanaDetailsRef} className="group rounded-lg border border-gray-200 bg-white/60 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[11px] font-medium text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 [&::-webkit-details-marker]:hidden">
                          <span className="min-w-0 truncate">
                            {circleSolanaNeedsFunds ? 'Add USDC to Solana' : 'Circle Solana wallet'}
                          </span>
                          <span className="ml-auto flex shrink-0 items-center gap-2">
                            <span className="font-mono font-semibold text-gray-600 dark:text-gray-200">
                              {circleSolanaBalanceError
                                ? 'Unavailable'
                                : circleSolanaBalance == null
                                ? 'Checking...'
                                : `${formatAmount((Number(circleSolanaBalance) / 1_000_000).toString(), 6)} USDC`}
                            </span>
                            <ChevronDown className="h-3.5 w-3.5 text-gray-400 transition-transform group-open:rotate-180 dark:text-gray-500" />
                          </span>
                        </summary>
                        <div className="mt-2 border-t border-gray-100 pt-2 dark:border-white/10">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Add funds</p>
                              <p className="truncate text-[11px] text-gray-500 dark:text-gray-300">Send USDC on Solana to this wallet</p>
                            </div>
                            <button
                              type="button"
                              onClick={handleCopyCircleSolanaWallet}
                              className="shrink-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-gray-600 transition-all hover:bg-gray-50 active:scale-95 dark:border-white/10 dark:bg-white/[0.08] dark:text-gray-200 dark:hover:bg-white/[0.14]"
                            >
                              {circleSolanaCopied ? 'Copied' : 'Copy address'}
                            </button>
                          </div>
                        </div>
                      </details>
                    )}
                    {circleSolanaError && (
                      <p className="text-center text-[11px] font-medium text-red-600 dark:text-red-300">
                        {isSmartWalletBalanceError(circleSolanaError) ? circleSolanaError : `Transaction failed: ${circleSolanaError}`}
                      </p>
                    )}
                    {privyCircleLinkError && (circleSolanaSession || circleSolanaAddress) && (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                        {privyCircleLinkError}
                      </p>
                    )}
                    <CheckoutTrustLine />
                  </div>
                )}
                {!smartWalletOnlyFunding && !showCircleSolanaEmailBridgePay && !walletConnectBlocked && !isTelegramSource && !solanaWalletAddr ? (
                  <div className="space-y-2">
                <button
                  onClick={() => connectSolana()}
                  disabled={isSolanaConnecting || (requiresAttendeeName && !attendeeName.trim())}
                  className={cn(
                    'flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold shadow-button transition-all active:scale-[0.98] disabled:opacity-60',
                    showCircleSolanaEmailBridgePay && !manualPayDetected
                      ? 'border border-gray-200 bg-white text-gray-800 hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:hover:bg-white/[0.1]'
                      : 'bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200',
                  )}
                >
                  {isSolanaConnecting
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing in...</>
                    : <><Wallet className="h-4 w-4" /> {showCircleSolanaEmailBridgePay && !manualPayDetected ? 'Continue with Circle' : 'Sign in with Solana'}</>}
                </button>
                <CheckoutTrustLine />
                <p className="text-center text-xs text-gray-400">
                  {showCircleSolanaEmailBridgePay && !manualPayDetected
                    ? 'Use Phantom, Solflare, Backpack, or WalletConnect'
                    : 'Privy opens Phantom, Solflare, Backpack, or WalletConnect'}
                </p>
                  </div>
                ) : !smartWalletOnlyFunding && !showCircleSolanaEmailBridgePay && !walletConnectBlocked && !isTelegramSource ? (
              <div className="space-y-2">
              <SlideAction
                status={checkoutSlideStatus}
                disabled={isSolanaPending || isSolanaConfirming || (requiresAttendeeName && !attendeeName.trim()) || paymentAmountBlocked}
                onConfirm={handlePay}
                labels={checkoutSlideLabels}
              />
              <CheckoutTrustLine />
              </div>
                ) : null}
              </div>
          ) : !isConfirmed && payMode === 'wallet' && !isBankSendPayment && (usePrivyCircleCheckout || usePrivyCircleSolanaCheckout) && !privyAuthenticated && !manualPayDetected ? (
            <div className={cn(
              'flex flex-col items-center gap-1.5',
              requiresAttendeeName && !attendeeName.trim() && 'pointer-events-none opacity-50 select-none',
            )}>
              <PrivyConnectButton className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-6 py-3.5 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200">
                <Wallet className="h-4 w-4" />
                Sign in to pay
              </PrivyConnectButton>
              <CheckoutTrustLine />
            </div>
          ) : payMode === 'wallet' && !isBankSendPayment && !smartWalletOnlyFunding && !smartCheckoutOwnsWalletCta && (!usePrivyCircleCheckout || hasExternalPrivyEvmWallet) && !walletConnectBlocked && !isTelegramSource && !isConnected ? (
            <div className={cn(
              'flex flex-col items-center gap-1.5',
              requiresAttendeeName && !attendeeName.trim() && 'pointer-events-none opacity-50 select-none',
            )}>
              <PrivyWalletConnectButton
                options={{ walletChainType: 'ethereum-only' }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-6 py-3.5 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
              >
                <Wallet className="h-4 w-4" />
                {showCircleEmailPay ? 'Connect EOA Wallet' : 'Connect Wallet to Pay'}
              </PrivyWalletConnectButton>
              <CheckoutTrustLine />
              {showLegacyCircleEmailPay && (
                <p className="text-center text-xs text-gray-400">Gas in ETH</p>
              )}
            </div>
          ) : payMode === 'wallet' && !isBankSendPayment && !smartWalletOnlyFunding && !smartCheckoutOwnsWalletCta && (!usePrivyCircleCheckout || hasExternalPrivyEvmWallet) && !walletConnectBlocked && !isTelegramSource && isConnected && !isPrivyEmbeddedWalletConnected && !isCorrectNetwork ? (
            <div className="space-y-2">
            <button onClick={() => switchChain({ chainId: targetChainId })} disabled={isSwitching}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-6 py-4 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200 dark:disabled:bg-white/10 dark:disabled:text-gray-400">
              {isSwitching
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Switching…</>
                : <><RefreshCw className="h-4 w-4" /> Switch to {meta.label}</>}
            </button>
            <CheckoutTrustLine />
            </div>
          ) : payMode === 'wallet' && !isBankSendPayment && !smartWalletOnlyFunding && !smartCheckoutOwnsWalletCta && (!usePrivyCircleCheckout || hasExternalPrivyEvmWallet) && !walletConnectBlocked && !isTelegramSource && isConnected && !isPrivyEmbeddedWalletConnected ? (
            <div className="space-y-2">
              <SlideAction
                status={checkoutSlideStatus}
                disabled={isWalletPending || isConfirming || (requiresAttendeeName && !attendeeName.trim()) || paymentAmountBlocked}
                onConfirm={handlePay}
                labels={checkoutSlideLabels}
              />
              <CheckoutTrustLine />
            </div>
          ) : payMode === 'wallet' && !isBankSendPayment && !smartWalletOnlyFunding && !smartCheckoutOwnsWalletCta && !walletConnectBlocked && !isTelegramSource && isPrivyEmbeddedWalletConnected ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center text-xs font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              Privy email is signed in, but its embedded wallet is not your Circle Smart Wallet. Add the Circle wallet app id to enable Circle Smart Wallet payments, or connect an external wallet.
            </div>
          ) : null /* direct mode — no CTA button, address panel above handles it */ }

        </div>
      </div>

      {/* Pending tx banner */}
      {txHash && !isConfirmed && !isSendError && !isWalletManagerFunding && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 animate-slide-up">
          <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-blue-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-blue-800">Transaction Submitted</p>
            <p className="truncate font-mono text-xs text-blue-600">{txHash}</p>
          </div>
          <a href={`${meta.explorerUrl}/tx/${txHash}`} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 text-blue-400 hover:text-blue-700 transition-colors" />
          </a>
        </div>
      )}

      {/* Manual check button */}
      {showCheckButton && !isConfirmed && !isBankSendPayment && !manualPayDetected && chain !== 'solana' && payMode === 'wallet' && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={handleManualCheck}
            disabled={isManualChecking}
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isManualChecking && 'animate-spin')} />
            {isManualChecking ? 'Checking…' : 'Check Payment Status'}
          </button>
        </div>
      )}

      {!isNgPosPaycrestOfframp && (
        <div className="mt-10 animate-fade-in">
          <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            How it works
          </p>
          <div className="grid grid-cols-3 gap-3">
            {(isHelperAccess ? [
            { n: '1', title: 'Ask Hash', body: 'Open helper access from Telegram or the agent page' },
            { n: '2', title: 'Verify access', body: 'Hash PayLink confirms the payment receipt' },
            { n: '3', title: 'Open helper', body: 'Return to Telegram with access unlocked' },
          ] : isPolymarketFunding && isBankSendPayment ? [
            { n: '1', title: 'Verify refund bank' },
            { n: '2', title: 'Send Naira' },
            { n: '3', title: 'Settle to PolyDesk' },
          ] : isPolymarketFunding ? [
            { n: '1', title: 'Review wallet' },
            { n: '2', title: 'Fund with USDC' },
            { n: '3', title: isHostedService ? `Continue to ${polymarketReturnLabel}` : 'Return to PolyDesk' },
          ] : isWalletManagerFunding ? [
            { n: '1', title: 'Fund Pocket Wallet' },
            { n: '2', title: 'Activate x402' },
            { n: '3', title: 'Return to PolyDesk' },
          ] : isAgentFunding ? [
            { n: '1', title: 'Fund treasury', body: 'Add USDC to this agent wallet' },
            { n: '2', title: 'Use for actions', body: 'Treasury can support services, tips, and x402 activation' },
            { n: '3', title: 'Track receipts', body: 'Return to the agent dashboard for balances and receipts' },
          ] : [
            { n: '1', title: 'Check the request', body: "Confirm the amount and who it's for" },
            { n: '2', title: 'Choose how to pay', body: 'Use the gasless wallet, your wallet, or an exchange' },
            { n: '3', title: 'Get confirmation', body: "We'll confirm when the payment is complete" },
            ]).map(({ n, title, body }) => (
              <div key={n} className="rounded-xl border border-gray-100 bg-white p-4 text-center shadow-sm">
                <div className="mx-auto mb-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                  {n}
                </div>
                <p className="text-xs font-semibold text-gray-800">{title}</p>
                {body && <p className="mt-0.5 text-xs text-gray-400 leading-relaxed">{body}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Row helper ───────────────────────────────────────────────────────────────
function PolymarketMemoInline() {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white">
      <img src="/brand/polymarket-logo.png" alt="" className="h-4 w-4 invert dark:invert-0" />
      Polymarket
    </span>
  )
}

function PolymarketMemoPill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-900 shadow-sm dark:border-white/10 dark:bg-white/[0.08] dark:text-white">
      <img src="/brand/polymarket-logo.png" alt="" className="h-4 w-4 invert dark:invert-0" />
      Polymarket
    </span>
  )
}

function Row({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between bg-gray-50/60 px-4 py-3">
      <span className="text-sm text-gray-500">{label}</span>
      {typeof value === 'string' ? (
        <span className={cn('text-sm text-gray-800', mono ? 'font-mono text-xs' : 'font-medium')}>{value}</span>
      ) : value}
    </div>
  )
}
