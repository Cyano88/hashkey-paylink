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
  parseEther,
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
  RefreshCw, ShieldCheck, Zap, Copy, CheckCheck, Wallet, ChevronDown,
  AlertTriangle, Radio, Mail, X, Bot, Share2,
} from 'lucide-react'
import {
  CHAIN_META, PLATFORM_FEE_BPS, EVM_TREASURY, STARK_TREASURY, type ChainKey,
} from '../lib/chains'
import {
  EVM_CLIENTS,
  ERC20_TRANSFER_ABI,
  ERC20_BALANCE_OF_ABI,
  FACTORY_V2_ADDRESSES,
} from '../lib/router'
import { useStarknet } from '../lib/StarknetContext'
import { useSolana }   from '../lib/SolanaContext'
import { computeStarkGhostAddress } from '../lib/starknet-ghost'
import { cn, truncateAddress, formatAmount, memoToHex, copyToClipboard } from '../lib/utils'
import { getFxMeta, formatLocalAmt, fetchFxRate } from '../lib/fx'
import { getCirclePaymasterConfig } from '../lib/circlePaymaster'
import { sendCirclePaymasterPayment } from '../lib/circlePaymasterPayment'
import { canUseCirclePasskeyPayments, prepareCirclePasskeyWallet, sendCirclePasskeyPayment } from '../lib/circlePasskeyPayment'
import { canUseCircleEvmEmailWallet, connectCircleEvmEmailWallet, sendCircleEvmEmailPayment, sendCircleEvmEmailWithdraw } from '../lib/circleEvmEmailWallet'
import { canUseCircleSolanaEmailWallet, connectCircleSolanaEmailWallet, signCircleSolanaTransaction } from '../lib/circleSolanaEmailWallet'
import { canUseArgentStarknetEmailWallet, connectArgentStarknetEmailWallet } from '../lib/argentStarknetWallet'
import { getSponsoredGasRecoveryUnits } from '../lib/gasRecovery'
import { isValidSolanaAddress } from '../lib/solanaAddress'
import { getPaylinkParam, hasPaylinkFlag, isTelegramSourceParam } from '../lib/paylinkParams'
import { PRIVY_AUTH_ENABLED } from '../lib/authMode'
import { PrivyConnectButton } from '../lib/PrivyConnectButton'
import { PrivyWalletConnectButton } from '../lib/PrivyWalletConnectButton'
import { ReceiptIcon } from '../components/ReceiptIcon'
import { resolvePrivyCircleLink, savePrivyCircleLink } from '../lib/privyCircleLink'
import {
  compactReceiptAmount,
  createPaymentReceiptPdf,
  paymentReceiptFileName,
  type PaylinkReceipt,
  type ReceiptLookupResponse,
} from '../lib/paymentReceiptPdf'

type CircleSolanaSession = Awaited<ReturnType<typeof connectCircleSolanaEmailWallet>>
type CircleEvmEmailSession = Awaited<ReturnType<typeof connectCircleEvmEmailWallet>>
type ArgentStarknetSession = Awaited<ReturnType<typeof connectArgentStarknetEmailWallet>>

const CHAINS: ChainKey[] = ['base', 'solana', 'arbitrum']
const POLYMARKET_SIGNUP_URL = 'https://polymarket.com'
const POLYMARKET_LOGO = '/brand/polymarket-logo.png'

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

// ─── Starknet RPC ─────────────────────────────────────────────────────────────
const STARKNET_RPC = 'https://rpc.starknet.lava.build'

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

// ─── Starknet helpers ─────────────────────────────────────────────────────────
async function pollStarknetReceipt(txHash: string, signal: AbortSignal): Promise<void> {
  const deadline = Date.now() + 3 * 60_000
  while (Date.now() < deadline && !signal.aborted) {
    await new Promise((r) => setTimeout(r, 4000))
    if (signal.aborted) break
    try {
      const res = await fetch(STARKNET_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'starknet_getTransactionReceipt', params: [txHash], id: 1 }),
        signal,
      })
      const json = await res.json()
      const status: string = json?.result?.finality_status ?? ''
      if (status === 'ACCEPTED_ON_L2' || status === 'ACCEPTED_ON_L1') return
      if (json?.result?.execution_status === 'REVERTED') throw new Error('Transaction reverted on Starknet')
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') break
    }
  }
}

/**
 * Queries USDC balance via our own backend proxy (/api/starknet-balance).
 * Direct browser→Starknet RPC calls are blocked by CORS; the backend proxy has no such restriction.
 */
async function starkUsdcBalance(tokenAddress: string, accountAddress: string): Promise<bigint> {
  const res = await fetch('/api/starknet-balance', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ tokenAddress, accountAddress }),
  })
  const data = await res.json() as { ok: boolean; balance?: string; error?: string }
  if (!data.ok) throw new Error(data.error ?? 'starknet-balance API failed')
  return BigInt(data.balance ?? '0x0')
}

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

export default function PaymentPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { onPayChainChange, onPayWalletStateChange, onPaySuccessVisibleChange } = useOutletContext<LayoutOutletContext>()

  const evmParam    = getPaylinkParam(searchParams, 'evm', 'e') || searchParams.get('to') || ''
  const starkParam  = getPaylinkParam(searchParams, 'stark', 'k')
  const amt         = getPaylinkParam(searchParams, 'amt', 'a')
  const memo        = getPaylinkParam(searchParams, 'memo', 'm')
  const legacyChain = searchParams.get('chain')  as ChainKey | null
  const netParam    = (getPaylinkParam(searchParams, 'net', 'n') || null) as ChainKey | null
  const modeParam   = searchParams.get('mode')
  const isTelegramSource = isTelegramSourceParam(searchParams)
  const isNgPosSource = searchParams.get('src') === 'ngpos'
  const ngPosBackMerchantId = searchParams.get('merchant') ?? ''
  const ngPosBackUrl = ngPosBackMerchantId ? `/pos/ng?merchant_id=${encodeURIComponent(ngPosBackMerchantId)}` : '/'
  const isPolymarketFunding = searchParams.get('brand') === 'polymarket' || searchParams.get('pm') === '1'
  const isPolymarketBridge = isPolymarketFunding && searchParams.get('bridge') === 'polymarket'
  const polymarketWalletParam = (searchParams.get('pmw') || '').trim()
  const polymarketFundingLabel = (searchParams.get('funding') || searchParams.get('payer') || '').trim() || 'Self funding'
  const polymarketFundingRequestId = (searchParams.get('pmr') || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
  const polymarketReturnTarget = searchParams.get('return') ?? ''
  const polymarketReturnToPortfolio = polymarketReturnTarget === 'poly-portfolio'
  const polymarketReturnToAgentHash = polymarketReturnTarget === 'agent-hash-polydesk-portfolio'
  const polymarketHelperOwner = (searchParams.get('helperOwner') || '').trim().slice(0, 160)
  const telegramUrl = telegramReturnUrl(searchParams)
  const polymarketPortfolioUrl = '/telegram/payment-links?section=market-tools&service=poly-portfolio'
  const polymarketAgentHashUrl = (() => {
    const params = new URLSearchParams({
      section: 'market-tools',
      service: 'hashpaylink-helper',
      open: '1',
      mode: 'polydesk',
      poly: 'portfolio',
      notice: 'polymarket-funding-complete',
    })
    if (polymarketHelperOwner) params.set('helperOwner', polymarketHelperOwner)
    return `/telegram/payment-links?${params.toString()}`
  })()

  const resolvedStark  = starkParam || (legacyChain === 'starknet' ? evmParam : '')
  const resolvedEvm    = legacyChain === 'starknet' ? '' : evmParam
  const resolvedSolana = getPaylinkParam(searchParams, 'sol', 's').trim()
  const isMultiChain   = hasPaylinkFlag(searchParams, 'multi', 'x')
  const isFlex         = hasPaylinkFlag(searchParams, 'flex', 'f')

  function goBackFromCheckout() {
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
    if (isPolymarketBridge) {
      window.location.assign(polymarketReturnToAgentHash ? polymarketAgentHashUrl : polymarketPortfolioUrl)
      return
    }
    window.location.assign(ngPosBackUrl)
  }

  // netParam (from new link format) takes priority; legacy chain param as fallback
  const [chain, setChain] = useState<ChainKey>(() => {
    if (netParam === 'base' || netParam === 'starknet' || netParam === 'hashkey' || netParam === 'arc' || netParam === 'solana' || netParam === 'arbitrum') return netParam
    if (legacyChain === 'base' || legacyChain === 'starknet' || legacyChain === 'hashkey' || legacyChain === 'arc') return legacyChain
    if (resolvedStark && !resolvedEvm) return 'starknet'
    if (resolvedSolana && !resolvedEvm && !resolvedStark) return 'solana'
    return 'base'
  })

  // Normal multi-chain links can switch chains; Telegram links are intentionally
  // locked to the bot-selected network so a Base request stays Base-only.
  const netLocked = !!netParam && (!isMultiChain || isTelegramSource)
  const availableChains = netLocked
    ? [chain]
    : CHAINS.filter(c =>
        (c === 'solana' && !!resolvedSolana) ||
        (c !== 'starknet' && c !== 'solana' && !!resolvedEvm),
      )

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
  const [receiptShared,     setReceiptShared]     = useState(false)
  const [paymentReceiptId,  setPaymentReceiptId]  = useState('')
  const [paymentReceipt,    setPaymentReceipt]    = useState<PaylinkReceipt | null>(null)
  const [receiptPollAttempts, setReceiptPollAttempts] = useState(0)
  const [receiptArchiveTimedOut, setReceiptArchiveTimedOut] = useState(false)
  const [manualPayDetected, setManualPayDetected] = useState(false)
  const [manualTxHash,      setManualTxHash]      = useState<`0x${string}` | null>(null)
  const [receivedAmount,    setReceivedAmount]    = useState<bigint | null>(null)
  const [showCheckButton,   setShowCheckButton]   = useState(false)
  const [isManualChecking,  setIsManualChecking]  = useState(false)
  const [txSyncTick,        setTxSyncTick]        = useState(0)
  const [circleEvmAcceptedPending, setCircleEvmAcceptedPending] = useState(false)
  const [polymarketFundingStep, setPolymarketFundingStep] = useState<'choose' | 'fund'>('choose')
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
      } catch {
        if (raw.startsWith('/')) return raw
      }
    }
    if (isWalletManagerFunding) return '/agent?profile=agent&walletManager=service'
    return `/agent?profile=agent&agent=${encodeURIComponent(agentFundingSlug || 'hashpaylink-agent')}`
  })()
  const agentFundingName = isWalletManagerFunding ? 'x402 wallet manager' : isAgentFunding ? agentDisplayNameFromMemo(memo, agentFundingSlug) : ''
  const agentFundingHue = agentAvatarHue(`${agentFundingSlug}:${agentFundingName}`)
  const isNgPosPayment   = getPaylinkParam(initParams, 'src', 'src') === 'ngpos'
  const ngPosMerchantId  = (initParams.get('merchant') ?? '').trim().replace(/[^a-zA-Z0-9_-]/g, '')
  const ngPosEventId     = ngPosMerchantId ? `ngpos-${ngPosMerchantId}` : ''
  const ngPosSettlement  = (initParams.get('settlement') ?? '').trim()
  const ngPosAmountNgn   = (initParams.get('ngn') ?? '').trim()
  const smartWalletOnlyFunding = isPolymarketFunding || isAgentOrWalletFunding || isHelperAccess
  const isMainHashPaylinkPayment = !isTelegramSource && !smartWalletOnlyFunding
  const [attendeeName,   setAttendeeName]   = useState(() => initParams.get('payer') ?? '')
  const [eventRegStatus, setEventRegStatus] = useState<'idle' | 'pending' | 'ok' | 'error'>('idle')
  const eventRegistered  = useRef(false)
  const ordinaryReceiptRegistered = useRef(false)
  const accessRedirected = useRef(false)
  const polymarketReturnRedirected = useRef(false)
  const polymarketAgentNoticeStored = useRef(false)
  const polymarketFundingMarkRef = useRef('')
  const polymarketFundingMarkInFlightRef = useRef('')
  const ngPosRegistered  = useRef(false)
  const requiresAttendeeName = (isEventMode || isNgPosPayment) && !isPolymarketFunding && !isAgentOrWalletFunding && !isHelperAccess

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
  const effectiveAmtNumber = parseFloat(effectiveAmt || '0') || 0

  // flexPayDisabled: accounts for USDC and local-currency input modes
  const flexPayDisabled = isFlex && (
    fxInputMode === 'local'
      ? (!localAmt || parseFloat(localAmt) <= 0 || !fxRate)
      : (!flexAmt  || parseFloat(flexAmt)  <= 0)
  )
  const paymentAmountBlocked = flexPayDisabled

  // ── Direct Send state (shared across Base, Arc, Starknet) ────────────────
  const [payMode,          setPayMode]          = useState<'wallet' | 'direct'>(modeParam === 'direct' && chain !== 'starknet' && isMainHashPaylinkPayment ? 'direct' : 'wallet')
  const [directLinkId,     setDirectLinkId]     = useState<string | null>(null)
  // EVM chains (Base / Arc): the CREATE2 ghost vault address
  const [directVault,      setDirectVault]      = useState<`0x${string}` | null>(null)
  // Starknet: the counterfactual OZ account address
  const [starkDirectAddr,  setStarkDirectAddr]  = useState<string | null>(null)
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
    chainId: chain === 'base' ? CHAIN_META.base.chainId : chain === 'arc' ? CHAIN_META.arc.chainId : chain === 'arbitrum' ? CHAIN_META.arbitrum.chainId : CHAIN_META.hashkey.chainId,
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
  const [circleWalletPanel, setCircleWalletPanel] = useState<'fund' | 'withdraw'>('fund')
  const [circleWithdrawAddress, setCircleWithdrawAddress] = useState('')
  const [circleWithdrawAmount, setCircleWithdrawAmount] = useState('')
  const [circleWithdrawPending, setCircleWithdrawPending] = useState(false)
  const [circleWithdrawError, setCircleWithdrawError] = useState<string | null>(null)
  const [circleWithdrawNotice, setCircleWithdrawNotice] = useState<string | null>(null)
  const [circleWithdrawTxHash, setCircleWithdrawTxHash] = useState<`0x${string}` | null>(null)
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
    setCircleWithdrawError(null)
    setCircleWithdrawNotice(null)
    setCircleWithdrawTxHash(null)
    setCircleWithdrawPending(false)
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
      chainId: chain === 'base' ? CHAIN_META.base.chainId : chain === 'arc' ? CHAIN_META.arc.chainId : chain === 'arbitrum' ? CHAIN_META.arbitrum.chainId : CHAIN_META.hashkey.chainId,
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
  const [ghoRelayHash,    setGhoRelayHash]    = useState<`0x${string}` | undefined>(undefined)
  const [ghoRelayPending, setGhoRelayPending] = useState(false)
  const [ghoRelayError,   setGhoRelayError]   = useState<string | null>(null)
  const [ghoGasEstimate,  setGhoGasEstimate]  = useState<bigint>(0n)

  const { isLoading: isGhoConfirming, isSuccess: isGhoConfirmed } =
    useWaitForTransactionReceipt({ hash: ghoRelayHash, chainId: 42161 })

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
    address: chain === 'arbitrum' ? CHAIN_META.arbitrum.tokenAddress : CHAIN_META.base.tokenAddress,
    abi: ERC20_BALANCE_OF_ABI,
    functionName: 'balanceOf',
    args: [circleSmartAccount ?? '0x0000000000000000000000000000000000000000'],
    chainId: chain === 'arbitrum' ? CHAIN_META.arbitrum.chainId : CHAIN_META.base.chainId,
    query: {
      enabled: !!circleSmartAccount && (chain === 'base' || chain === 'arbitrum'),
      refetchInterval: 3_000,
    },
  })

  // ── Starknet ──────────────────────────────────────────────────────────────
  const { address: starkAccount, isConnecting: isStarkConnecting, connect: connectStarknet } = useStarknet()
  const [starkTxHash,       setStarkTxHash]      = useState<string | null>(null)
  const [isStarkPending,    setIsStarkPending]    = useState(false)
  const [isStarkConfirming, setIsStarkConfirming] = useState(false)
  const [isStarkConfirmed,  setIsStarkConfirmed]  = useState(false)
  const [starkError,        setStarkError]        = useState<string | null>(null)
  const [argentStarkSession, setArgentStarkSession] = useState<ArgentStarknetSession | null>(null)
  const [argentStarkPending, setArgentStarkPending] = useState(false)
  const [argentStarkBalance, setArgentStarkBalance] = useState<bigint | null>(null)
  const [argentStarkFetching, setArgentStarkFetching] = useState(false)
  const [argentStarkCopied, setArgentStarkCopied] = useState(false)
  const [argentStarkError, setArgentStarkError] = useState<string | null>(null)
  const starkPollAbort = useRef<AbortController | null>(null)

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
  const [circleSolanaPanel, setCircleSolanaPanel] = useState<'fund' | 'withdraw'>('fund')
  const [circleSolanaWithdrawAddress, setCircleSolanaWithdrawAddress] = useState('')
  const [circleSolanaWithdrawAmount, setCircleSolanaWithdrawAmount] = useState('')
  const [circleSolanaWithdrawPending, setCircleSolanaWithdrawPending] = useState(false)
  const [circleSolanaWithdrawError, setCircleSolanaWithdrawError] = useState<string | null>(null)
  const [circleSolanaWithdrawNotice, setCircleSolanaWithdrawNotice] = useState<string | null>(null)
  const [circleSolanaWithdrawTxHash, setCircleSolanaWithdrawTxHash] = useState<string | null>(null)

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
  const isEvmChain    = chain !== 'starknet' && chain !== 'solana'
  const isHskOnly     = legacyChain === 'hashkey'
  const meta          = CHAIN_META[chain]
  const targetChainId =
    chain === 'base'     ? CHAIN_META.base.chainId     :
    chain === 'arc'      ? CHAIN_META.arc.chainId      :
    chain === 'arbitrum' ? CHAIN_META.arbitrum.chainId :
    CHAIN_META.hashkey.chainId
  const isCorrectNetwork = isEvmChain ? chainId === targetChainId : true
  const feeAmount        = (parseFloat(effectiveAmt) || 0) * (PLATFORM_FEE_BPS / 10_000)

  const activeRecipient = chain === 'starknet' ? resolvedStark
    : chain === 'solana' ? resolvedSolana
    : resolvedEvm
  const displayAddress  = activeRecipient
  const consumerNetworkName =
    chain === 'base' ? 'Base' :
    chain === 'arbitrum' ? 'Arbitrum' :
    chain === 'solana' ? 'Solana' :
    chain === 'starknet' ? 'Starknet' :
    chain === 'arc' ? 'Arc' :
    meta.label
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
  const showCirclePoweredAttribution =
    payMode === 'wallet' &&
    !manualPayDetected &&
    (showCircleEmailBridgePay || showCircleSolanaEmailBridgePay || showCirclePaymasterButton)

  const refreshPolymarketBridgeStatus = useCallback(async () => {
    if (!isPolymarketBridge || !activeRecipient) return
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
        latest?: { status?: string; txHash?: string } | null
        error?: string
      }
      if (!response.ok || !data.ok) throw new Error(data.error || 'Bridge status unavailable')
      const latestStatus = String(data.latest?.status || '').toUpperCase()
      setPolymarketBridgeLatestTx(data.latest?.txHash || '')
      if (latestStatus === 'COMPLETED') {
        setPolymarketBridgeStatus('complete')
        setPolymarketBridgeStatusText('Bridge complete. Portfolio will refresh when you return.')
      } else if (latestStatus) {
        setPolymarketBridgeStatus('pending')
        setPolymarketBridgeStatusText(`Bridge ${latestStatus.toLowerCase()}. Polymarket credit can take a few minutes.`)
      } else {
        setPolymarketBridgeStatus('waiting')
        setPolymarketBridgeStatusText('Payment confirmed. Waiting for Bridge detection.')
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
  const showArgentStarknetEmailPay = chain === 'starknet' && canUseArgentStarknetEmailWallet()
  const walletConnectBlocked = smartWalletOnlyFunding && !PRIVY_AUTH_ENABLED
  const canStartPolymarketCircleFunding =
    showCircleEvmEmailPay ||
    showCircleSolanaEmailPay ||
    showLegacyCircleEmailPay ||
    showCircleEmailBridgePay ||
    showCircleSolanaEmailBridgePay
  const showPolymarketFundingChoice =
    isPolymarketFunding &&
    payMode === 'wallet' &&
    canStartPolymarketCircleFunding &&
    chain !== 'starknet' &&
    !manualPayDetected &&
    !circleSmartAccount &&
    !circleSolanaSession &&
    polymarketFundingStep === 'choose'
  const grossUpPlatformCharges = true
  const grossUpEvmPlatformCharges = grossUpPlatformCharges && (chain === 'base' || chain === 'arc' || chain === 'arbitrum')
  const grossUpSolanaPlatformCharges = grossUpPlatformCharges && chain === 'solana'

  function evmPaymentBreakdown(totalUnits: bigint, decimals = meta.decimals) {
    const feeUnits = totalUnits * BigInt(PLATFORM_FEE_BPS) / 10_000n
    const gasRecoveryUnits = getSponsoredGasRecoveryUnits(chain, totalUnits, feeUnits, decimals)
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
    const feeUnits = totalUnits * BigInt(PLATFORM_FEE_BPS) / 10_000n
    const gasRecoveryUnits = getSponsoredGasRecoveryUnits('solana', totalUnits, feeUnits, CHAIN_META.solana.decimals)
    return totalUnits + feeUnits + gasRecoveryUnits
  }

  const circleRequiredUnits = (() => {
    try {
      const totalUnits = parseUnits(effectiveAmt || '0', meta.decimals)
      if (grossUpSolanaPlatformCharges) return solanaPaymentRequiredUnits(totalUnits)
      if (chain === 'starknet' && grossUpPlatformCharges) {
        const feeUnits = totalUnits * BigInt(PLATFORM_FEE_BPS) / 10_000n
        return totalUnits + feeUnits
      }
      return grossUpEvmPlatformCharges ? evmPaymentBreakdown(totalUnits).requiredUnits : totalUnits
    } catch {
      return 0n
    }
  })()
  const starkSmartWalletHasEnough =
    argentStarkBalance !== null &&
    circleRequiredUnits > 0n &&
    argentStarkBalance >= circleRequiredUnits
  const starkSmartWalletNeedsFunds = !!argentStarkSession && argentStarkBalance != null && circleRequiredUnits > 0n && argentStarkBalance < circleRequiredUnits
  const circleWalletHasEnough =
    typeof circleWalletBalance === 'bigint' &&
    circleRequiredUnits > 0n &&
    circleWalletBalance >= circleRequiredUnits
  const circleWalletNeedsFunds =
    !!circleSmartAccount &&
    typeof circleWalletBalance === 'bigint' &&
    circleRequiredUnits > 0n &&
    circleWalletBalance < circleRequiredUnits
  const circleEvmEmailMerchantUnits = (() => {
    if (!showCircleEvmEmailPay || circleRequiredUnits <= 0n || (chain !== 'base' && chain !== 'arbitrum')) return null
    const totalUnits = parseUnits(effectiveAmt || '0', meta.decimals)
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

  function expectedEvmRecipientUnits() {
    const totalUnits = parseUnits(effectiveAmt || '0', meta.decimals)
    if (totalUnits <= 0n) return 0n
    const { feeUnits, gasRecoveryUnits, sponsoredRecipientUnits } = evmPaymentBreakdown(totalUnits)
    const conservativeUnits = totalUnits - feeUnits - gasRecoveryUnits
    return grossUpEvmPlatformCharges ? totalUnits : (sponsoredRecipientUnits > 0n ? sponsoredRecipientUnits : totalUnits - feeUnits)
  }

  const missingStark   = chain === 'starknet' && !resolvedStark
  const missingSolana  = chain === 'solana'   && !resolvedSolana
  const effectiveMemo  = requiresAttendeeName ? attendeeName : (isFlex ? (flexMemo || memo) : memo)

  const isValidParams =
    (isFlex || (!isNaN(parseFloat(amt)) && parseFloat(amt) > 0)) &&
    (isAddress(resolvedEvm) || !!resolvedStark || !!resolvedSolana)

  // Whether the secondary direct-pay option should be shown for normal Hash PayLink payments.
  const canDirectSend =
    isMainHashPaylinkPayment &&
    (
      ((chain === 'base' || chain === 'arc' || chain === 'arbitrum') && isAddress(resolvedEvm)) ||
      (chain === 'solana' && !!resolvedSolana)
    )

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
      if (!circlePasskeyPending && !circleEvmPaymentProcessing && circlePasskeyError !== SMART_WALLET_FUNDING_ERROR) {
        setCirclePasskeyError(SMART_WALLET_FUNDING_ERROR)
      }
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
        const data = await resolvePrivyCircleLink({
          accessToken: token,
          chain: chain as 'base' | 'arbitrum' | 'arc',
        })
        if (cancelled) return
        if (data.email) setCircleEmail(current => current || data.email || privyEmail)
        if (data.link?.circleWalletAddress) {
          if (isConnected) disconnectEvm()
          if (isAddress(data.link.circleWalletAddress)) {
            setCircleSmartAccount(data.link.circleWalletAddress)
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
        const data = await resolvePrivyCircleLink({
          accessToken: token,
          chain: 'solana',
        })
        if (cancelled) return
        if (data.email) setCircleSolanaEmail(current => current || data.email || privyEmail)
        if (data.link?.circleWalletAddress) {
          if (solanaWalletAddr) disconnectSolana()
          setCircleSolanaAddress(data.link.circleWalletAddress)
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
      if (!circleSolanaPending && !isSolanaConfirming && circleSolanaError !== SMART_WALLET_FUNDING_ERROR) {
        setCircleSolanaError(SMART_WALLET_FUNDING_ERROR)
      }
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
    if (manualPayDetected || chain === 'starknet' || chain === 'solana' || !resolvedEvm) return

    const evmChain = chain as 'base' | 'hashkey' | 'arc' | 'arbitrum'
    const client   = EVM_CLIENTS[evmChain]

    let unwatchTransfer: (() => void) | undefined
    let hskTimer:        ReturnType<typeof setInterval> | undefined

    if (chain === 'hashkey') {
      let initialBalance: bigint | null = null
      const requestedWei = parseEther(effectiveAmt || '0')

      hskTimer = setInterval(async () => {
        if (detectedRef.current) { clearInterval(hskTimer); return }
        try {
          const bal = await client.getBalance({ address: resolvedEvm as `0x${string}` })
          if (initialBalance === null) { initialBalance = bal; return }
          if (bal > initialBalance && bal >= initialBalance + requestedWei * 99n / 100n) {
            const received = bal - initialBalance
            setReceivedAmount(received)
            setManualTxHash(null)
            setManualPayDetected(true)
          }
        } catch { /* rpc hiccup — retry next tick */ }
      }, 2_000)

    } else {
      const tokenAddress = CHAIN_META[evmChain as 'base' | 'arc' | 'arbitrum'].tokenAddress

      const isCircleEmailEvmWatch =
        payMode === 'wallet' &&
        showCircleEvmEmailPay &&
        !!circleEvmEmailSession &&
        circleEvmEmailMerchantUnits != null &&
        (chain === 'base' || chain === 'arbitrum')
      const watchTarget = resolvedEvm as `0x${string}`
      const requestedUnits =
        isCircleEmailEvmWatch && circleEvmEmailMerchantUnits
          ? circleEvmEmailMerchantUnits
          : parseUnits(effectiveAmt || '0', meta.decimals)

      unwatchTransfer = client.watchContractEvent({
        address:         tokenAddress,
        abi:             ERC20_TRANSFER_ABI,
        eventName:       'Transfer',
        args:            { to: watchTarget },
        pollingInterval: 2_000,
        onLogs(logs) {
          if (detectedRef.current) return
          const log   = logs[0]
          if (!log)   return
          const value = (log.args as { value?: bigint }).value ?? 0n
          if (value >= requestedUnits * 99n / 100n) {
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

    }

    return () => {
      unwatchTransfer?.()
      if (hskTimer) clearInterval(hskTimer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chain,
    resolvedEvm,
    manualPayDetected,
    amt,
    effectiveAmt,
    payMode,
    showCircleEvmEmailPay,
    circleEvmEmailSession?.wallet.address,
    circleEvmEmailMerchantUnits?.toString(),
  ])

  // ── Auto-sweep keeper ─────────────────────────────────────────────────────
  // ── Reset payMode on chain switch: Smart Wallet is primary; direct is explicit ─
  useEffect(() => {
    setPayMode(modeParam === 'direct' && chain !== 'starknet' && isMainHashPaylinkPayment ? 'direct' : 'wallet')
  }, [chain, modeParam, isMainHashPaylinkPayment])

  // ── V2 EVM: Generate linkId + compute ghost vault address ─────────────────
  useEffect(() => {
    if (payMode !== 'direct') return
    if (chain === 'starknet') return
    const factoryAddr = FACTORY_V2_ADDRESSES[chain as 'base' | 'arc' | 'hashkey' | 'arbitrum']
    if (!factoryAddr) {
      setDirectError('Direct payment is not configured for this network.')
      setDirectStatus('error')
      return
    }
    if (!resolvedEvm) return

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

    const client = EVM_CLIENTS[chain as 'base' | 'arc' | 'hashkey' | 'arbitrum']
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
  // Base/Arc: polls ERC-20 USDC balance
  // HashKey:  polls native HSK balance (no ERC-20 token on HashKey)
  useEffect(() => {
    if (directStatus !== 'waiting' || !directVault || !directLinkId) return
    if (chain === 'starknet') return

    const evmChain  = chain as 'base' | 'arc' | 'hashkey' | 'arbitrum'
    const client    = EVM_CLIENTS[evmChain]
    const isNative  = chain === 'hashkey'
    const token     = isNative ? null : (CHAIN_META[evmChain as 'base' | 'arc' | 'arbitrum'].tokenAddress as `0x${string}`)

    const check = async () => {
      if (directRelayedRef.current) return
      try {
        let balance: bigint
        if (isNative) {
          balance = await client.getBalance({ address: directVault! })
        } else {
          balance = await client.readContract({
            address:      token!,
            abi:          ERC20_BALANCE_OF_ABI,
            functionName: 'balanceOf',
            args:         [directVault],
          }) as bigint
        }

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
    if (manualPayDetected || chain === 'starknet' || chain === 'solana' || !resolvedEvm || payMode !== 'wallet') {
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
    if (!resolvedEvm || chain === 'starknet') return
    if (isManualChecking) return
    setIsManualChecking(true)
    try {
      const evmChain = chain as 'base' | 'hashkey' | 'arc' | 'arbitrum'
      const client   = EVM_CLIENTS[evmChain]
      const knownTxHash = (circlePaymasterTxHash ?? basePaymasterTxHash ?? evmTxHash) as `0x${string}` | null
      if (knownTxHash) {
        try {
          const receipt = await client.getTransactionReceipt({ hash: knownTxHash })
          if (receipt.status === 'success') {
            setManualTxHash(knownTxHash)
            setReceivedAmount(chain === 'hashkey' ? parseEther(effectiveAmt || '0') : expectedEvmRecipientUnits())
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
      if (chain === 'hashkey') {
        const bal          = await client.getBalance({ address: resolvedEvm as `0x${string}` })
        const requestedWei = parseEther(effectiveAmt || '0')
        if (bal >= requestedWei * 99n / 100n) {
          setReceivedAmount(bal); setManualTxHash(null); setCircleEvmAcceptedPending(false); setManualPayDetected(true); setShowCheckButton(false)
        }
      } else {
        const tokenAddress = CHAIN_META[evmChain as 'base' | 'arc' | 'arbitrum'].tokenAddress
        const target = resolvedEvm as `0x${string}`
        const expectedUnits = expectedEvmRecipientUnits()
        const scanUnits = receivedAmount != null && receivedAmount > 0n ? receivedAmount : expectedUnits
        const latestBlock = await client.getBlockNumber()
        const fromBlock = latestBlock > 20_000n ? latestBlock - 20_000n : 0n
        type TransferLog = {
          args: { value?: bigint }
          transactionHash?: `0x${string}` | null
        }
        const getTransferLogs = client.getLogs as unknown as (args: {
          address: `0x${string}`
          abi: typeof ERC20_TRANSFER_ABI
          eventName: 'Transfer'
          args: { to: `0x${string}` }
          fromBlock: bigint
          toBlock: bigint
        }) => Promise<TransferLog[]>
        const logs = await getTransferLogs({
          address: tokenAddress,
          abi: ERC20_TRANSFER_ABI,
          eventName: 'Transfer',
          args: { to: target },
          fromBlock,
          toBlock: latestBlock,
        })
        const match = [...logs].reverse().find(log => {
          const value = (log.args as { value?: bigint }).value ?? 0n
          return value >= scanUnits * 98n / 100n
        })
        if (match) {
          const value = (match.args as { value?: bigint }).value ?? scanUnits
          setReceivedAmount(value)
          setManualTxHash(match.transactionHash ?? null)
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
    if (!resolvedEvm || manualTxHash || chain === 'starknet' || chain === 'solana' || chain === 'hashkey') return
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
          recipient: resolvedEvm,
          amountUnits: amountUnits.toString(),
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
    if (!circleEvmAcceptedPending || manualPayDetected || chain === 'starknet' || chain === 'solana' || payMode !== 'wallet') return
    const timer = setInterval(() => {
      if (!isManualChecking) void handleManualCheck()
    }, 5_000)
    return () => clearInterval(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circleEvmAcceptedPending, manualPayDetected, chain, payMode, isManualChecking])

  useEffect(() => {
    if (!manualPayDetected || manualTxHash || chain === 'starknet' || chain === 'solana' || chain === 'hashkey' || !resolvedEvm) return
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
  }, [manualPayDetected, manualTxHash, chain, resolvedEvm, effectiveAmt, receivedAmount?.toString()])

  useEffect(() => {
    if (manualTxHash || !manualPayDetected || chain === 'starknet' || chain === 'solana') return
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
    if (isHskOnly && c !== 'hashkey') return
    if (c === chain) return
    // Chains that don't support Send via Address — fall back to wallet connect
    if (c === 'starknet') setPayMode('wallet')
    // Auto-disconnect: switching TO Solana drops EVM; switching AWAY from Solana drops Solana
    if (c === 'solana' && isConnected) disconnectEvm()
    if (c !== 'solana' && solanaWalletAddr) disconnectSolana()
    onPayChainChange(c)   // mirror in header pill (non-interactive, display only)
    setChain(c)
    resetEvmSend()
    resetPermitSign()
    setStarkTxHash(null); setIsStarkPending(false); setIsStarkConfirming(false)
    setIsStarkConfirmed(false); setStarkError(null)
    starkPollAbort.current?.abort()
    setIsSolanaPending(false); setIsSolanaConfirming(false); setIsSolanaConfirmed(false)
    setSolanaError(null); setSolanaTxHash(null)
    setSolanaLinkId(null); setSolanaVaultAddr(null)
    setSolanaDirectStatus('idle'); setSolanaDirectTxHash(null); setSolanaDirectError(null)
    setCircleSolanaPending(false); setCircleSolanaError(null); setCircleSolanaBalance(null); setCircleSolanaBalanceError(false)
    setCircleSolanaSession(null); setCircleSolanaAddress(''); setCircleSolanaCopied(false)
    setManualPayDetected(false); setManualTxHash(null); setReceivedAmount(null)
    setPaymentReceiptId(''); setPaymentReceipt(null); setReceiptShared(false)
    ordinaryReceiptRegistered.current = false
    setCirclePaymasterPending(false); setCirclePaymasterTxHash(null); setCirclePaymasterError(null)
    setCirclePasskeyPending(false); setCirclePasskeyError(null); setCircleSmartAccount(null); setCircleEvmEmailSession(null); setCircleEvmPaymentProcessing(false); setCircleEvmAcceptedPending(false); setCircleWalletCopied(false)
    setShowCheckButton(false)
    // Reset direct send state
    setDirectLinkId(null); setDirectVault(null); setStarkDirectAddr(null)
    setDirectStatus('idle'); setDirectTxHash(null); setDirectError(null)
    directRelayedRef.current = false
    if (directPollRef.current) { clearInterval(directPollRef.current); directPollRef.current = null }
    if (isConnected && c !== 'starknet' && c !== 'solana') {
      const cid =
        c === 'base'    ? CHAIN_META.base.chainId    :
        c === 'arc'     ? CHAIN_META.arc.chainId     :
        c === 'arbitrum' ? CHAIN_META.arbitrum.chainId :
        CHAIN_META.hashkey.chainId
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

  async function receiptPdfBlob() {
    if (!paymentReceipt) return new Blob([], { type: 'application/pdf' })
    return createPaymentReceiptPdf(paymentReceipt)
  }

  async function openPaymentReceiptPdf() {
    if (!paymentReceipt) return
    const blob = await receiptPdfBlob()
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank', 'noopener,noreferrer')
    if (!win) {
      const link = document.createElement('a')
      link.href = url
      link.download = paymentReceiptFileName(paymentReceipt)
      document.body.appendChild(link)
      link.click()
      link.remove()
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }

  async function downloadPaymentReceiptPdf() {
    if (!paymentReceipt) return
    const blob = await receiptPdfBlob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = paymentReceiptFileName(paymentReceipt)
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  async function sharePaymentReceiptPdf() {
    if (!paymentReceipt) return
    const pdf = await receiptPdfBlob()
    const file = new File([pdf], paymentReceiptFileName(paymentReceipt), { type: 'application/pdf' })
    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean
      share?: (data: ShareData) => Promise<void>
    }
    if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
      await nav.share({
        title: 'Hash PayLink receipt',
        text: `${compactReceiptAmount(paymentReceipt.amount)} ${paymentReceipt.asset} confirmed`,
        files: [file],
      })
      return
    }
    await downloadPaymentReceiptPdf()
    setReceiptShared(true)
    setTimeout(() => setReceiptShared(false), 1800)
  }

  function handleCircleWithdrawMax() {
    if (typeof circleWalletBalance !== 'bigint') return
    setCircleWithdrawAmount(formatUnits(circleWalletBalance, meta.decimals))
  }

  async function handleCircleWithdraw() {
    setCircleWithdrawError(null)
    setCircleWithdrawNotice(null)
    setCircleWithdrawTxHash(null)
    if (chain !== 'base' && chain !== 'arbitrum') {
      setCircleWithdrawError('Withdraw is available on Base and Arbitrum.')
      return
    }
    const recipient = circleWithdrawAddress.trim()
    if (!isAddress(recipient)) {
      setCircleWithdrawError('Enter a valid wallet or exchange address.')
      return
    }
    let amountUnits: bigint
    try {
      amountUnits = parseUnits(circleWithdrawAmount || '0', meta.decimals)
    } catch {
      setCircleWithdrawError('Enter a valid amount.')
      return
    }
    if (amountUnits <= 0n) {
      setCircleWithdrawError('Enter an amount to withdraw.')
      return
    }
    if (typeof circleWalletBalance === 'bigint' && amountUnits > circleWalletBalance) {
      setCircleWithdrawError('Amount is higher than your wallet balance.')
      return
    }

    setCircleWithdrawPending(true)
    try {
      let session = circleEvmEmailSession
      if (!session || session.chain !== chain) {
        const email = (showPrivyCircleEmailPay ? privyEmail : circleEmail).trim()
        if (!email) {
          setCircleWithdrawError(showPrivyCircleEmailPay ? 'Unlock your wallet to withdraw.' : 'Enter your email to unlock this wallet.')
          return
        }
        session = await connectCircleEvmEmailWallet(email, chain)
        if (isConnected) disconnectEvm()
        setCircleEvmEmailSession(session)
        setCircleSmartAccount(session.wallet.address)
      }
      const txHash = await sendCircleEvmEmailWithdraw({
        session,
        recipient,
        amount: circleWithdrawAmount,
      })
      if (txHash) {
        setCircleWithdrawTxHash(txHash)
      } else {
        setCircleWithdrawNotice('Withdraw accepted. Check the destination wallet in a moment.')
      }
      setCircleWithdrawAmount('')
      setCircleWithdrawAddress('')
      void refetchCircleWalletBalance()
    } catch (err) {
      setCircleWithdrawError(readableErrorMsg(err, 'Withdraw failed.'))
    } finally {
      setCircleWithdrawPending(false)
    }
  }

  async function handleCopyCircleSolanaWallet() {
    const walletAddress = circleSolanaSession?.wallet.address || circleSolanaAddress
    if (!walletAddress) return
    await copyToClipboard(walletAddress)
    setCircleSolanaCopied(true)
    setTimeout(() => setCircleSolanaCopied(false), 2200)
  }

  function handleCircleSolanaWithdrawMax() {
    if (circleSolanaBalance === null) return
    setCircleSolanaWithdrawAmount(formatUnits(circleSolanaBalance, 6))
  }

  async function handleCircleSolanaWithdraw() {
    setCircleSolanaWithdrawError(null)
    setCircleSolanaWithdrawNotice(null)
    setCircleSolanaWithdrawTxHash(null)

    const recipient = circleSolanaWithdrawAddress.trim()
    if (!isValidSolanaAddress(recipient)) {
      setCircleSolanaWithdrawError('Enter a valid wallet or exchange address.')
      return
    }

    let amountUnits: bigint
    try {
      amountUnits = parseUnits(circleSolanaWithdrawAmount || '0', 6)
    } catch {
      setCircleSolanaWithdrawError('Enter a valid amount.')
      return
    }
    if (amountUnits <= 0n) {
      setCircleSolanaWithdrawError('Enter an amount to withdraw.')
      return
    }
    if (circleSolanaBalance !== null && amountUnits > circleSolanaBalance) {
      setCircleSolanaWithdrawError('Amount is higher than your wallet balance.')
      return
    }

    setCircleSolanaWithdrawPending(true)
    try {
      let session = circleSolanaSession
      if (!session) {
        const email = (showPrivyCircleSolanaEmailPay ? privyEmail : circleSolanaEmail).trim()
        if (!email) {
          setCircleSolanaWithdrawError(showPrivyCircleSolanaEmailPay ? 'Unlock your wallet to withdraw.' : 'Enter your email to unlock this wallet.')
          return
        }
        session = await connectCircleSolanaEmailWallet(email)
        setCircleSolanaSession(session)
        setCircleSolanaAddress(session.wallet.address)
        if (solanaWalletAddr) disconnectSolana()
      }

      const buildRes = await fetch('/api/solana-build-tx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: session.wallet.address,
          to: recipient,
          amount: circleSolanaWithdrawAmount,
          mode: 'withdraw',
        }),
      })
      const buildData = await readApiJson<{ ok: boolean; tx?: string; lastValidBlockHeight?: number; error?: string }>(buildRes, 'Solana build')
      if (!buildData.ok || !buildData.tx || !buildData.lastValidBlockHeight) throw new Error(buildData.error ?? 'Failed to build withdraw transaction')

      const signedB64 = await signCircleSolanaTransaction({
        session,
        rawTransaction: buildData.tx,
        memo: `Hash PayLink withdraw ${formatAmount(circleSolanaWithdrawAmount, 6)} USDC`,
      })

      const relayRes = await fetch('/api/solana-relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tx: signedB64, lastValidBlockHeight: buildData.lastValidBlockHeight }),
      })
      const relayData = await readApiJson<{ ok: boolean; txHash?: string; error?: string }>(relayRes, 'Solana relay')
      if (!relayData.ok || !relayData.txHash) throw new Error(relayData.error ?? 'Relay failed')

      setCircleSolanaWithdrawTxHash(relayData.txHash)
      setCircleSolanaWithdrawNotice('Withdraw sent. Check the destination wallet in a moment.')
      setCircleSolanaWithdrawAmount('')
      setCircleSolanaWithdrawAddress('')
      void refreshCircleSolanaBalance(session.wallet.address)
    } catch (err) {
      setCircleSolanaWithdrawError(readableErrorMsg(err, 'Withdraw failed.'))
    } finally {
      setCircleSolanaWithdrawPending(false)
    }
  }

  // ── Fetch Arbitrum USDC gas estimate when Arbitrum chain is active ───────
  useEffect(() => {
    if (chain !== 'arbitrum') return
    fetch('/api/relay-gho')
      .then(r => r.json())
      .then((d: { ok: boolean; gasReimbUsdc?: string; gasReimbGho?: string }) => {
        const reimb = d.gasReimbUsdc ?? d.gasReimbGho
        if (reimb) setGhoGasEstimate(BigInt(reimb))
      })
      .catch(() => {})
  }, [chain])

  // ── Arbitrum USDC relay pay — relayer submits tx, payer only signs ───────
  async function handleGhoRelayPay() {
    if (!address || !activeRecipient) return
    setGhoRelayError(null)
    setGhoRelayPending(true)

    const tokenAddress = CHAIN_META.arbitrum.tokenAddress
    const totalUnits   = parseUnits(effectiveAmt || '0', CHAIN_META.arbitrum.decimals)
    const deadline     = BigInt(Math.floor(Date.now() / 1000) + 3600)
    const nonce        = permitNonce ?? 0n
    let gasReimbUnitsForPermit = ghoGasEstimate ?? 0n

    // Refresh gas estimate just before signing so it's accurate
    try {
      const est = await fetch('/api/relay-gho').then(r => r.json()) as { ok: boolean; gasReimbUsdc?: string; gasReimbGho?: string }
      const reimb = est.gasReimbUsdc ?? est.gasReimbGho
      if (reimb) {
        gasReimbUnitsForPermit = BigInt(reimb)
        setGhoGasEstimate(gasReimbUnitsForPermit)
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

      const relayRes = await fetch('/api/relay-gho', {
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
      setGhoRelayHash(data.txHash)
    } catch (err) {
      setGhoRelayError(err instanceof Error ? friendlyErrorMsg(err.message) : 'Relay failed')
    } finally {
      setGhoRelayPending(false)
    }
  }

  // ── Payment handlers ──────────────────────────────────────────────────────
  function blockedAmountError() {
    return SMART_WALLET_AMOUNT_ERROR
  }

  async function handlePay() {
    if (!activeRecipient) return
    if (chain === 'arbitrum') await handleArbitrumPay()
    else if (chain === 'base' || chain === 'arc') await handleEvmPermitPay()
    else if (chain === 'starknet') handleStarknetPay()
    else if (chain === 'solana') await handleSolanaPay()
    else handleHashKeyPay()
  }

  async function refreshArgentStarkBalance(walletAddress = argentStarkSession?.address) {
    if (!walletAddress) return
    setArgentStarkFetching(true)
    try {
      const balance = await starkUsdcBalance(CHAIN_META.starknet.tokenAddress, walletAddress)
      setArgentStarkBalance(balance)
    } catch {
      // Balance polling is advisory; payment submit still validates on-chain.
    } finally {
      setArgentStarkFetching(false)
    }
  }

  useEffect(() => {
    if (!argentStarkSession?.address || chain !== 'starknet') return
    void refreshArgentStarkBalance(argentStarkSession.address)
    const timer = setInterval(() => {
      void refreshArgentStarkBalance(argentStarkSession.address)
    }, 4_000)
    return () => clearInterval(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [argentStarkSession?.address, chain])

  async function handleCopyArgentStarkWallet() {
    if (!argentStarkSession?.address) return
    await copyToClipboard(argentStarkSession.address)
    setArgentStarkCopied(true)
    setTimeout(() => setArgentStarkCopied(false), 2500)
  }

  async function handleArgentStarknetEmailPay() {
    if (!resolvedStark || !showArgentStarknetEmailPay) return
    if (paymentAmountBlocked || !effectiveAmt || parseFloat(effectiveAmt) <= 0) {
      setArgentStarkError(blockedAmountError())
      return
    }

    setArgentStarkPending(true)
    setArgentStarkError(null)
    try {
      let session = argentStarkSession
      if (!session) {
        session = await connectArgentStarknetEmailWallet()
        setArgentStarkSession(session)
        await refreshArgentStarkBalance(session.address)
        return
      }

      if (argentStarkBalance !== null && !starkSmartWalletHasEnough) {
        setArgentStarkError(SMART_WALLET_FUNDING_ERROR)
        return
      }

      await handleStarknetPay(session)
    } catch (err) {
      setArgentStarkError(err instanceof Error ? err.message.slice(0, 140) : 'Smart wallet payment failed.')
    } finally {
      setArgentStarkPending(false)
    }
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
              await savePrivyCircleLink({
                accessToken: token,
                chain: 'solana',
                email,
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
    await handleGhoRelayPay()
  }

  async function handleCirclePaymasterPay() {
    if (!address || !activeRecipient || !showCirclePaymasterButton) return
    const decimals = chain === 'arbitrum' ? CHAIN_META.arbitrum.decimals : CHAIN_META.base.decimals
    const totalUnits = parseUnits(effectiveAmt || '0', decimals)
    const { sponsoredRecipientUnits, sponsoredTreasuryUnits } = evmPaymentBreakdown(totalUnits, decimals)
    await tryCirclePaymasterTransfer(sponsoredRecipientUnits, sponsoredTreasuryUnits, { surfaceUnavailable: true })
  }

  async function handleCirclePasskeyPay() {
    if (!activeRecipient || !showCircleEmailPay || !isAddress(activeRecipient)) return
    if (paymentAmountBlocked || !effectiveAmt || parseFloat(effectiveAmt) <= 0) {
      setCirclePasskeyError(blockedAmountError())
      return
    }
    if (circleWalletNeedsFunds || (circleSmartAccount && typeof circleWalletBalance === 'bigint' && !circleWalletHasEnough)) {
      resetCircleSmartWalletPending()
      setCirclePasskeyError(SMART_WALLET_FUNDING_ERROR)
      return
    }
    const email = (showPrivyCircleEmailPay ? privyEmail : circleEmail).trim()
    if (!email) {
      setCirclePasskeyError(showPrivyCircleEmailPay ? 'Sign in with a Privy email account to use Circle Smart Wallet.' : 'Enter your email to continue with Smart wallet.')
      return
    }

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
                await savePrivyCircleLink({
                  accessToken: token,
                  chain,
                  email,
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

        if (circleWalletBalance !== undefined && circleWalletBalance !== null && !circleWalletHasEnough) {
          resetCircleSmartWalletPending()
          setCirclePasskeyError(SMART_WALLET_FUNDING_ERROR)
          return
        }

        setCircleEvmPaymentProcessing(true)
        setCircleEvmAcceptedPending(false)
        const txHash = await sendCircleEvmEmailPayment({
          session,
          recipient: activeRecipient as `0x${string}`,
          amount: effectiveAmt,
          feeMode: grossUpEvmPlatformCharges ? 'gross' : 'net',
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

      const result = await sendCirclePasskeyPayment({
        chain,
        email,
        recipient: activeRecipient as `0x${string}`,
        amount: effectiveAmt,
        feeMode: grossUpEvmPlatformCharges ? 'gross' : 'net',
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
        setCircleEvmAcceptedPending(false)
        setCircleEvmPaymentProcessing(false)
        setReceivedAmount(expectedEvmRecipientUnits())
        setManualTxHash(null)
        setManualPayDetected(true)
        setShowCheckButton(false)
        void refetchCircleWalletBalance()
        return
      }
      if (wasConnecting) {
        setCircleEvmEmailSession(null)
        setCircleSmartAccount(null)
      }
      setCirclePasskeyError(message === 'Circle email wallet request failed.'
        ? 'Smart wallet setup failed. Try again, or use Pay another way.'
        : message)
    } finally {
      setCirclePasskeyPending(false)
      if (!manualPayDetected) setCircleEvmPaymentProcessing(false)
    }
  }

  async function handleEvmPermitPay() {
    if (isPrivyEmbeddedWalletConnected) {
      setBasePaymasterError('This Privy email wallet is not your Circle Smart Wallet. Use Continue with Circle Smart Wallet, or connect an external wallet.')
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

  function handleHashKeyPay() {
    if (chainId !== CHAIN_META.hashkey.chainId) {
      setBasePaymasterError(`Switch your wallet to ${CHAIN_META.hashkey.label}, then retry payment.`)
      switchChain({ chainId: CHAIN_META.hashkey.chainId })
      return
    }
    const requestedNative = parseEther(effectiveAmt || '0')
    const feeBps          = BigInt(PLATFORM_FEE_BPS)
    const feeNative       = requestedNative * feeBps / 10_000n
    const recipientNative = grossUpPlatformCharges ? requestedNative : requestedNative - feeNative
    const totalNative     = grossUpPlatformCharges ? requestedNative + feeNative : requestedNative
    sendTransaction({
      to: MULTICALL3_ADDRESS, value: totalNative,
      data: encodeFunctionData({
        abi: MULTICALL3_AGGREGATE3VALUE_ABI, functionName: 'aggregate3Value',
        args: [[
          { target: activeRecipient as `0x${string}`, allowFailure: false, value: recipientNative,
            callData: (effectiveMemo.trim() ? memoToHex(effectiveMemo.trim()) : '0x') as `0x${string}` },
          { target: EVM_TREASURY, allowFailure: false, value: feeNative, callData: '0x' },
        ]],
      }),
    })
  }

  async function handleStarknetPay(sessionAccount?: ArgentStarknetSession) {
    const provider = window.starknet
    if (!sessionAccount && !provider?.account) { setStarkError('Wallet not connected.'); return }
    setIsStarkPending(true); setStarkError(null)
    try {
      const totalUnits = BigInt(Math.round(parseFloat(effectiveAmt || '0') * 1e6))
      const feeUnits   = totalUnits * BigInt(PLATFORM_FEE_BPS) / 10_000n
      const recipUnits = grossUpPlatformCharges ? totalUnits : totalUnits - feeUnits
      const toU256 = (n: bigint) => ({
        low:  '0x' + (n & BigInt('0xffffffffffffffffffffffffffffffff')).toString(16),
        high: '0x0',
      })
      const calls = [
        { contractAddress: CHAIN_META.starknet.tokenAddress, entrypoint: 'transfer',
          calldata: [resolvedStark, toU256(recipUnits).low, toU256(recipUnits).high] },
        { contractAddress: CHAIN_META.starknet.tokenAddress, entrypoint: 'transfer',
          calldata: [STARK_TREASURY, toU256(feeUnits).low, toU256(feeUnits).high] },
      ]
      const result = sessionAccount
        ? await sessionAccount.execute(calls)
        : await provider!.account!.execute(calls)
      setStarkTxHash(result.transaction_hash)
      setIsStarkPending(false); setIsStarkConfirming(true)
      const ctrl = new AbortController()
      starkPollAbort.current = ctrl
      await pollStarknetReceipt(result.transaction_hash, ctrl.signal)
      if (!ctrl.signal.aborted) { setIsStarkConfirming(false); setIsStarkConfirmed(true) }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction rejected'
      setStarkError(msg.slice(0, 160))
      setIsStarkPending(false); setIsStarkConfirming(false)
    }
  }

  // ── Unified aliases ───────────────────────────────────────────────────────
  // directStatus === 'success' is included so EVM Send-via-Address relay
  // immediately transitions to the full-screen success card (same as Solana).
  const isBasePaymasterConfirmed = !!basePaymasterTxHash && basePaymasterStatus?.status === 'success'
  const isBasePaymasterFailed = basePaymasterStatus?.status === 'failure'
  const isConfirmed     = (chain === 'starknet' ? isStarkConfirmed : chain === 'solana' ? isSolanaConfirmed : chain === 'arbitrum' ? (isGhoConfirmed || isCirclePaymasterConfirmed) : (isEvmConfirmed || isBasePaymasterConfirmed || isCirclePaymasterConfirmed)) || manualPayDetected || directStatus === 'success'
  const txHash          = directStatus === 'success'   ? (directTxHash as `0x${string}` | null)
                        : manualPayDetected            ? manualTxHash
                        : chain === 'starknet'         ? starkTxHash
                        : chain === 'solana'           ? solanaTxHash
                        : chain === 'arbitrum'         ? (circlePaymasterTxHash ?? ghoRelayHash ?? null)
                        : (circlePaymasterTxHash ?? basePaymasterTxHash ?? evmTxHash)
  const isWalletPending = chain === 'starknet' ? isStarkPending   : chain === 'solana' ? (isSolanaPending || circleSolanaPending)   : chain === 'arbitrum' ? (ghoRelayPending || circlePaymasterPending || circlePasskeyPending || circleEvmPaymentProcessing || isSignPending) : isEvmWalletPending || circlePaymasterPending || circlePasskeyPending || circleEvmPaymentProcessing || isSignPending || isBasePaymasterPending
  const isConfirming    = chain === 'starknet' ? isStarkConfirming : chain === 'solana' ? isSolanaConfirming : chain === 'arbitrum' ? (isGhoConfirming || isCirclePaymasterConfirming) : (isEvmConfirming || isBasePaymasterConfirming || isCirclePaymasterConfirming)
  const isSendError     = chain === 'starknet' ? !!starkError : chain === 'solana' ? !!solanaError : chain === 'arbitrum' ? (!!ghoRelayError || !!circlePaymasterError) : (isEvmSendError || isEvmReverted || isBasePaymasterStatusError || isBasePaymasterFailed || !!basePaymasterError || !!circlePaymasterError)
  const sendErrorMsg    = chain === 'starknet' ? starkError
                        : chain === 'solana'   ? solanaError
                        : chain === 'arbitrum' ? (circlePaymasterError ?? ghoRelayError)
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

  useEffect(() => {
    onPaySuccessVisibleChange(isConfirmed)
    return () => onPaySuccessVisibleChange(false)
  }, [isConfirmed, onPaySuccessVisibleChange])

  useEffect(() => {
    if (!isConfirmed || !isPolymarketBridge) return
    void refreshPolymarketBridgeStatus()
    const timer = window.setTimeout(() => void refreshPolymarketBridgeStatus(), 15_000)
    return () => window.clearTimeout(timer)
  }, [isConfirmed, isPolymarketBridge, refreshPolymarketBridgeStatus])

  // ── Direct Send display address ───────────────────────────────────────────
  const directDisplayAddr = chain === 'starknet' ? starkDirectAddr : directVault

  // ── Event mode: register payment after confirmation ───────────────────────
  async function doRegister(name: string) {
    // In Send-via-Address mode the payer never connects a wallet so address is
    // undefined. Fall back to the vault address as the payer identifier.
    const payer  = chain === 'starknet' ? (argentStarkSession?.address ?? starkAccount ?? '')
      : chain === 'solana' ? (circleSolanaSession?.wallet.address ?? solanaWalletAddr ?? solanaVaultAddr ?? '')
      : (address ?? circleEvmEmailSession?.wallet.address ?? circleSmartAccount ?? directVault ?? '')
    const txH    = manualPayDetected ? manualTxHash
                 : chain === 'starknet' ? starkTxHash
                 : chain === 'solana'   ? (solanaTxHash ?? solanaDirectTxHash)
                 : chain === 'arbitrum' ? (circlePaymasterTxHash ?? ghoRelayHash ?? directTxHash ?? null)
                 : (circlePaymasterTxHash ?? basePaymasterTxHash ?? evmTxHash ?? directTxHash ?? null)
    const txHash = txH ?? `manual_${Date.now()}`
    const actualAmt = receivedAmount != null
      ? (Number(receivedAmount) / Math.pow(10, meta.decimals)).toFixed(meta.decimals <= 6 ? 6 : 8)
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
    console.log('[EventReg] posting:', payload)
    setEventRegStatus('pending')
    try {
      const res  = await fetch('/api/event-register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const data = await res.json() as { ok: boolean; error?: string; receiptId?: string }
      console.log('[EventReg] response:', data)
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
    if (!isNgPosPayment || !isEvmChain) return effectiveAmt
    try {
      const units = expectedEvmRecipientUnits()
      if (units <= 0n) return effectiveAmt
      return (Number(units) / Math.pow(10, meta.decimals)).toFixed(meta.decimals <= 6 ? 6 : 8)
    } catch {
      return effectiveAmt
    }
  }

  function formatPaymentAmountDisplay(value: number, decimals: number) {
    if (value > 0 && value < 0.0001) return '<0.0001'
    return value.toFixed(decimals <= 6 ? 4 : 6)
  }

  async function doRegisterNgPos() {
    if (!ngPosEventId || !ngPosMerchantId) return
    const customerName = attendeeName.trim()
    if (!customerName) return
    const payer  = chain === 'starknet' ? (argentStarkSession?.address ?? starkAccount ?? '')
      : chain === 'solana' ? (circleSolanaSession?.wallet.address ?? solanaWalletAddr ?? solanaVaultAddr ?? '')
      : (address ?? circleEvmEmailSession?.wallet.address ?? circleSmartAccount ?? directVault ?? '')
    const txH    = manualPayDetected ? manualTxHash
                 : chain === 'starknet' ? starkTxHash
                 : chain === 'solana'   ? (solanaTxHash ?? solanaDirectTxHash)
                 : chain === 'arbitrum' ? (circlePaymasterTxHash ?? ghoRelayHash ?? directTxHash ?? null)
                 : (circlePaymasterTxHash ?? basePaymasterTxHash ?? evmTxHash ?? directTxHash ?? null)
    const actualAmt = receivedAmount != null
      ? (Number(receivedAmount) / Math.pow(10, meta.decimals)).toFixed(meta.decimals <= 6 ? 6 : 8)
      : effectiveAmt
    const expectedSettlementAmt = expectedNgPosSettlementAmount()
    if (!amountCoversRequest(actualAmt, expectedSettlementAmt)) {
      console.warn('[NgPosReg] skipped underpaid POS payment:', { actualAmt, requestedAmount: effectiveAmt, expectedSettlementAmount: expectedSettlementAmt })
      return
    }
    const payload = {
      eventId: ngPosEventId,
      txHash: txH ?? `manual_${Date.now()}`,
      chain,
      payer: payer || 'POS payer',
      memo: customerName,
      amount: actualAmt,
      source: 'ngpos',
      merchantId: ngPosMerchantId,
      contextLabel: memo || ngPosMerchantId,
      settlementType: ngPosSettlement,
      amountNgn: ngPosAmountNgn,
      requestedAmount: expectedSettlementAmt,
    }
    try {
      const res = await fetch('/api/event-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => undefined) as { ok?: boolean; receiptId?: string } | undefined
      if (data?.ok && data.receiptId) setPaymentReceiptId(data.receiptId)
    } catch (err) {
      console.error('[NgPosReg] fetch failed:', err)
    }
  }

  async function registerOrdinaryReceipt() {
    if (!txHash || txHash.startsWith('manual_')) return
    const payer = chain === 'starknet' ? (argentStarkSession?.address ?? starkAccount ?? '')
      : chain === 'solana' ? (circleSolanaSession?.wallet.address ?? solanaWalletAddr ?? solanaVaultAddr ?? '')
      : (address ?? circleEvmEmailSession?.wallet.address ?? circleSmartAccount ?? directVault ?? '')
    const actualAmt = receivedAmount != null
      ? (Number(receivedAmount) / Math.pow(10, meta.decimals)).toFixed(meta.decimals <= 6 ? 6 : 8)
      : effectiveAmt
    try {
      const res = await fetch('/api/event-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: `paylink-${chain}-${txHash}`,
          txHash,
          chain,
          payer: payer || activeRecipient || 'Hash PayLink payer',
          memo: memo || 'Hash PayLink payment',
          amount: actualAmt,
          requestedAmount: effectiveAmt,
          source: 'paylink',
          merchantId: activeRecipient,
          contextLabel: memo || activeRecipient,
          settlementType: 'payment',
        }),
      })
      const data = await res.json().catch(() => undefined) as { ok?: boolean; receiptId?: string } | undefined
      if (data?.ok && data.receiptId) setPaymentReceiptId(data.receiptId)
    } catch {
      // Receipt registration is non-blocking; the payment success state is already confirmed.
    }
  }

  async function registerPolymarketFundingReceipt() {
    if (!txHash || txHash.startsWith('manual_')) return
    const payer = chain === 'starknet' ? (argentStarkSession?.address ?? starkAccount ?? '')
      : chain === 'solana' ? (circleSolanaSession?.wallet.address ?? solanaWalletAddr ?? solanaVaultAddr ?? '')
      : (address ?? circleEvmEmailSession?.wallet.address ?? circleSmartAccount ?? directVault ?? '')
    const actualAmt = receivedAmount != null
      ? (Number(receivedAmount) / Math.pow(10, meta.decimals)).toFixed(meta.decimals <= 6 ? 6 : 8)
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
      }),
    }).catch(() => undefined)
    return Boolean(res?.ok)
  }

  useEffect(() => {
    if (!isConfirmed || !isEventMode || !eventId || eventRegistered.current) return
    const name = isAgentOrWalletFunding ? (memo || (isWalletManagerFunding ? 'x402 wallet funding' : 'Agent wallet funding')) : attendeeName.trim()
    console.log('[EventReg] triggered — name:', name, 'eventId:', eventId)
    if (!name) return
    eventRegistered.current = true
    void doRegister(name)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, attendeeName, isAgentOrWalletFunding, isWalletManagerFunding, memo])

  useEffect(() => {
    if (!isConfirmed || !isNgPosPayment || !ngPosEventId || ngPosRegistered.current) return
    if (!attendeeName.trim()) return
    if (manualPayDetected && isEvmChain && !manualTxHash) return
    ngPosRegistered.current = true
    void doRegisterNgPos()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, attendeeName, manualPayDetected, manualTxHash, chain])

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
    }, isAgentOrWalletFunding ? 2600 : 900)
    return () => window.clearTimeout(timer)
  }, [autoAccessRedirect, isEventMode, agentUrl, eventRegStatus, eventId, attendeeName, isAgentOrWalletFunding, isWalletManagerFunding, memo])

  useEffect(() => {
    if (!isConfirmed || !isPolymarketBridge || !polymarketReturnToAgentHash || polymarketReturnRedirected.current) return
    const proofReady = Boolean(paymentReceipt?.proof?.ogTxHash || paymentReceipt?.proof?.ogRootHash)
    if (!proofReady) return
    polymarketReturnRedirected.current = true
    const timer = window.setTimeout(() => {
      window.location.assign(polymarketAgentHashUrl)
    }, 3800)
    return () => window.clearTimeout(timer)
  }, [isConfirmed, isPolymarketBridge, polymarketReturnToAgentHash, polymarketAgentHashUrl, paymentReceipt?.proof?.ogTxHash, paymentReceipt?.proof?.ogRootHash])

  useEffect(() => {
    if (!isConfirmed || !isPolymarketBridge || !polymarketReturnToAgentHash || !polymarketHelperOwner || polymarketAgentNoticeStored.current) return
    const proofReady = Boolean(paymentReceipt?.proof?.ogTxHash || paymentReceipt?.proof?.ogRootHash)
    if (!proofReady) return
    polymarketAgentNoticeStored.current = true
    const actionLinks = [
      paymentReceiptId ? { label: 'Receipt', url: `/receipt/${encodeURIComponent(paymentReceiptId)}` } : null,
      { label: 'Polymarket', url: POLYMARKET_SIGNUP_URL },
    ].filter(Boolean)
    void fetch('/api/helper-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'append-thread',
        owner: polymarketHelperOwner,
        payer: polymarketHelperOwner,
        mode: 'polydesk',
        subMode: 'portfolio',
        threadId: 'mode:polydesk:portfolio',
        id: `polymarket-funding-${chain}-${txHash || paymentReceiptId || Date.now().toString(36)}`,
        answer: 'Funding complete. I can track open positions, claimables, alerts, and portfolio value right now. Idle Polymarket cash balance still needs to be confirmed inside Polymarket.',
        actionLinks,
        receiptId: paymentReceiptId,
        txHash,
      }),
    }).catch(() => {
      polymarketAgentNoticeStored.current = false
    })
  }, [isConfirmed, isPolymarketBridge, polymarketReturnToAgentHash, polymarketHelperOwner, paymentReceipt?.proof?.ogTxHash, paymentReceipt?.proof?.ogRootHash, paymentReceiptId, chain, txHash])

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
  if (isConfirmed) {
    const explorerTxUrl    = txHash      ? `${meta.explorerUrl}/tx/${txHash}`      : null
    void explorerTxUrl

    const recipientAmt = receivedAmount != null
      ? Number(receivedAmount) / Math.pow(10, meta.decimals)
      : null
    const requested = parseFloat(effectiveAmt)
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

    const primaryExplorerUrl = chain === 'hashkey'
      ? (txHash ? `${meta.explorerUrl}/tx/${txHash}` : null)
      : (txHash ? `${meta.explorerUrl}/tx/${txHash}` : null)
    const ogExplorerUrl = paymentReceipt?.proof?.ogExplorer || (paymentReceipt?.proof?.ogTxHash ? `https://chainscan.0g.ai/tx/${paymentReceipt.proof.ogTxHash}` : '')
    const ogProofValue = paymentReceipt?.proof?.ogTxHash || paymentReceipt?.proof?.ogRootHash || ''
    const receiptReady = Boolean(paymentReceipt && txHash)
    const archivePendingLabel = receiptArchiveTimedOut
      ? 'Archive pending'
      : receiptPollAttempts >= 9
      ? 'Still archiving...'
      : 'Archiving...'

    return (
      <div className="mx-auto max-w-md animate-scale-in">
        <div
          className={cn(
            'overflow-hidden rounded-2xl border bg-white shadow-card',
            isUnder ? 'border-red-200' : 'border-emerald-100',
          )}
          style={{ boxShadow: isUnder ? '0 4px 32px -4px rgba(239,68,68,0.15)' : `0 4px 32px -4px rgba(16,185,129,0.18), ${meta.glowStyle}` }}
        >
          <div className={cn(
            'bg-gradient-to-br p-8 text-center',
            isUnder ? 'from-red-50 to-orange-50' : 'from-emerald-50 to-green-50',
          )}>
            <div className={cn(
              'mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm animate-bounce-in',
            )}>
              {isUnder
                ? <AlertCircle  className="h-8 w-8 text-red-500" />
                : <CheckCircle2  className="h-8 w-8 text-emerald-500" />
              }
            </div>
            <h2 className="text-xl font-bold text-gray-900">
              {isUnder ? 'Underpayment Detected'
               : isPolymarketFunding ? 'Funded!'
               : 'Payment Sent!'}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {recipientAmt != null ? (
                <>
                  <span className={cn('font-semibold', isUnder ? 'text-amber-700' : 'text-gray-900')}>
                    {formatPaymentAmountDisplay(recipientAmt, meta.decimals)} {meta.asset}
                  </span>
                  {!isPolymarketFunding && (
                    <>
                      {' '}
                      {isUnder ? 'received - ' : 'received by recipient'}
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
              <Row label="Amount"    value={`${formatAmount(effectiveAmt, meta.decimals)} ${meta.asset}`} mono={false} />
              <Row label="Network"   value={meta.label} mono={false} />
              {isPolymarketBridge && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-gray-500">For</span>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                    <PolymarketMark className="h-5 w-5 text-[#1652f0]" />
                    <span>Polymarket funding</span>
                  </span>
                </div>
              )}
              {!isPolymarketBridge && <Row label="Recipient" value={truncateAddress(activeRecipient, 4)} mono />}
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
              {!txHash && manualPayDetected && chain !== 'starknet' && chain !== 'solana' && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-gray-500">Tx</span>
                  <span className="text-xs font-medium text-gray-400">
                    Syncing{'.'.repeat((txSyncTick % 3) + 1)}
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
                      {receiptArchiveTimedOut ? (
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

            {receiptReady && (!isPolymarketBridge || !polymarketReturnToAgentHash) && (
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={openPaymentReceiptPdf}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-gray-800 active:scale-[0.98]"
                >
                  <ReceiptIcon className="h-4 w-4" />
                  View receipt
                </button>
                <button
                  type="button"
                  onClick={sharePaymentReceiptPdf}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98]"
                >
                  <Share2 className="h-4 w-4" />
                  {receiptShared ? 'Downloaded' : 'Share receipt'}
                </button>
                {!ogProofValue && (
                  <p className="text-center text-[11px] font-medium text-gray-400">
                    Receipt is ready. 0G archive proof will update automatically when finalized.
                  </p>
                )}
                {isPolymarketBridge && (
                  <a
                    href={POLYMARKET_SIGNUP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98]"
                  >
                    <PolymarketMark className="h-5 w-5 text-[#1652f0]" />
                    Trade on Polymarket
                  </a>
                )}
              </div>
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

            {isAgentOrWalletFunding ? (
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
              <p className="flex items-center justify-center gap-1.5 text-center text-[11px] font-medium text-gray-400">
                {ogProofValue ? 'Redirecting back to Agent Hash...' : 'Confirming your payment...'}
                {!ogProofValue && <Loader2 className="h-3 w-3 animate-spin" />}
              </p>
            ) : isPolymarketBridge ? (
              <p className="flex items-center justify-center gap-1.5 text-center text-[11px] font-medium text-gray-400">
                {ogProofValue ? 'Funding complete.' : 'Confirming your payment...'}
                {!ogProofValue && <Loader2 className="h-3 w-3 animate-spin" />}
              </p>
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
      {isNgPosSource || isPolymarketFunding || isAgentOrWalletFunding || isHelperAccess ? (
        <button
          type="button"
          onClick={goBackFromCheckout}
          className="mb-5 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
      ) : (
        <Link to="/" className="mb-5 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" />
          Create a link
        </Link>
      )}

      <div
        className="overflow-hidden rounded-2xl border bg-white transition-all duration-300"
        style={{ boxShadow: `0 4px 24px -4px rgba(0,0,0,0.08), ${meta.glowStyle}`, borderColor: meta.accentColor + '26' }}
      >
        {/* ── Chain toggle ─────────────────────────────────────────────── */}
        <div className="flex justify-center pt-5 pb-0 px-4">
          <div className="flex items-center justify-center gap-0.5 sm:gap-1 rounded-xl border border-gray-200 bg-gray-100/80 p-1 overflow-x-auto w-full sm:w-auto">
            {availableChains.map((c) => {
              const m          = CHAIN_META[c]
              const isActive   = chain === c
              const hskLocked  = isHskOnly && c !== 'hashkey'
              const unavailable = isMultiChain
                ? (c === 'starknet' && !resolvedStark) ||
                  (c === 'solana'   && !resolvedSolana) ||
                  (c !== 'starknet' && c !== 'solana' && !resolvedEvm)
                : hskLocked ||
                  (c === 'starknet' && !resolvedStark) ||
                  (c === 'solana'   && !resolvedSolana) ||
                  (c !== 'starknet' && c !== 'solana' && !resolvedEvm)
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
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Pay mode toggle (Base, Arc USDC, Starknet) ───────────────── */}
        {canDirectSend && (
          <div className="flex justify-center px-4 pt-3">
            <div className="flex rounded-xl border border-gray-200 bg-gray-100/80 p-0.5 text-xs font-semibold">
              <button
                onClick={() => setPayMode('wallet')}
                className={cn(
                  'rounded-lg px-4 py-1.5 transition-all duration-150',
                  payMode === 'wallet'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                Smart Wallet
              </button>
              <button
                onClick={() => setPayMode('direct')}
                className={cn(
                  'rounded-lg px-4 py-1.5 transition-all duration-150',
                  payMode === 'direct'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                Pay another way
              </button>
            </div>
          </div>
        )}

        {/* ── Amount header ─────────────────────────────────────────────── */}
        <div className={cn('border-b border-gray-100 dark:border-white/10 bg-gradient-to-br p-6 text-center mt-4', meta.headerBg, 'dark:from-gray-800 dark:to-gray-900')}>
          {isFlex ? (
            <div className="flex flex-col items-center gap-2">
              {isAgentOrWalletFunding ? (
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center justify-center gap-2">
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/70 text-white shadow-sm"
                      style={{
                        background: `linear-gradient(135deg, hsl(${agentFundingHue} 72% 42%), hsl(${(agentFundingHue + 44) % 360} 72% 34%))`,
                      }}
                    >
                      <Bot className="h-4 w-4" />
                    </span>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-300">{isWalletManagerFunding ? 'x402 Wallet Funding' : 'Agent Funding'}</p>
                  </div>
                  <p className="max-w-[15rem] truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {agentFundingName}
                  </p>
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
                  {fxInputMode === 'local' ? (getFxMeta(fxCurrency)?.symbol ?? fxCurrency) : meta.asset}
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
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/70 text-white shadow-sm"
                style={{
                  background: `linear-gradient(135deg, hsl(${agentFundingHue} 72% 42%), hsl(${(agentFundingHue + 44) % 360} 72% 34%))`,
                }}
              >
                <Bot className="h-4 w-4" />
              </span>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{isWalletManagerFunding ? 'x402 Wallet Funding' : 'Agent Funding'}</p>
            </div>
          ) : (
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400">Payment Request</p>
          )}
          {!isFlex && (
            <>
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-[2.75rem] font-bold leading-none tracking-tight text-gray-900 dark:text-white">{formatAmount(effectiveAmt, meta.decimals)}</span>
                <span className="text-xl font-semibold text-gray-400">{meta.asset}</span>
              </div>
              {memo && !isAgentOrWalletFunding && (
                <p className="mt-1 text-sm font-medium text-gray-500 dark:text-gray-300">
                  {isHelperAccess ? (
                    'Hash PayLink Agent Helper'
                  ) : isPolymarketFunding ? (
                    polymarketFundingLabel
                  ) : (
                    <>For {memo}</>
                  )}
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
          <div className="px-6 pt-4">
            <p className="text-center text-[10px] text-gray-400 leading-relaxed">
              Pricing in {meta.asset} · Shown in {getFxMeta(fxCurrency)?.name ?? fxCurrency} at live market rates
              {fxStale && ' · ⚠ Rate may be outdated'}
            </p>
          </div>
        )}

        <div className="p-6 space-y-5">
          {/* Payment details */}
          <div className="space-y-1.5 text-center">
            <div className="flex items-center justify-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-gray-100">
              <span>Paying on {consumerNetworkName}</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Platform fee: {feeAmount > 0 && effectiveAmt ? `${feeAmount.toFixed(meta.decimals <= 6 ? 4 : 6)} ${meta.asset}` : '—'}
            </p>
            {showArbitrumRelayCost && (
              <div className="flex items-center justify-between bg-gray-50/60 px-4 py-2 border-t border-dashed border-gray-100">
                <span className="text-[11px] font-normal text-slate-400 tracking-wide">Gas reimb (relayer pays ETH)</span>
                <span className="font-mono text-[11px] text-slate-400">
                  {ghoGasEstimate > 0n
                    ? `~${(Number(ghoGasEstimate) / 1e6).toFixed(4)} USDC`
                    : '…'}
                </span>
              </div>
            )}
          </div>

          {/* ── Attendee name (event mode) ───────────────────────────────── */}
          {requiresAttendeeName && (() => {
            const paid = isConfirmed
            return (
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  {isNgPosPayment ? 'Customer name' : 'Your name or handle'}
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
          {payMode === 'direct' && (chain === 'base' || chain === 'arc' || chain === 'hashkey' || chain === 'arbitrum') && (
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
          {payMode === 'wallet' && evmTxHash && !isEvmConfirmed && chain !== 'starknet' && (
            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5">
              <div className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </div>
              <p className="text-[11px] font-medium text-emerald-700">Transaction Found! Finalizing…</p>
              <Radio className="ml-auto h-3 w-3 text-emerald-400" />
            </div>
          )}

          {/* Missing Starknet address */}
          {missingStark && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Receiver has not set a Starknet address</p>
                <p className="mt-0.5 text-xs text-amber-700">
                  Pay via{' '}
                  <button onClick={() => handleChainSwitch('base')} className="font-semibold underline underline-offset-2">Base</button>
                  {' '}or{' '}
                  <button onClick={() => handleChainSwitch('hashkey')} className="font-semibold underline underline-offset-2">HashKey</button>.
                </p>
              </div>
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
          {isEvmChain && isConnected && !isCorrectNetwork && !missingStark && payMode === 'wallet' && (() => {
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

          {/* Send error */}
          {payMode === 'wallet' && isSendError && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800">Transaction Failed</p>
                <p className="mt-0.5 text-xs text-red-600">
                  {friendlyErrorMsg(sendErrorMsg ?? 'An unknown error occurred')}
                </p>
                <button onClick={() => { resetEvmSend(); setStarkError(null); setBasePaymasterError(null); setCirclePaymasterError(null) }}
                  className="mt-2 text-xs font-bold text-red-700 hover:text-red-900">Try again</button>
              </div>
            </div>
          )}

          {showPolymarketFundingChoice && (
            <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
              <div className="px-1 text-center">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Add USDC to your Polymarket funding wallet</p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Review the wallet, then continue with Circle USDC checkout.</p>
              </div>
              <button
                type="button"
                onClick={() => setPolymarketFundingStep('fund')}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-6 py-3.5 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
              >
                <Wallet className="h-4 w-4" />
                Continue to funding
              </button>
              <p className="text-center text-[11px] font-medium text-gray-400 dark:text-gray-500">
                Not on Polymarket yet?
              </p>
              <a
                href={POLYMARKET_SIGNUP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full flex-col items-center justify-center gap-1 rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-gray-800 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:hover:bg-white/[0.1]"
              >
                <span className="inline-flex items-center gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Create Polymarket account
                </span>
                <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500">
                  For best experience, sign up with email
                </span>
              </a>
            </div>
          )}

          {payMode === 'wallet' && showCircleEmailBridgePay && chain !== 'starknet' && chain !== 'solana' && !manualPayDetected && (!isPolymarketFunding || polymarketFundingStep === 'fund' || !!circleSmartAccount) && (
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
              <button
                onClick={handleCirclePasskeyPay}
                disabled={circlePasskeyPending || circleEvmPaymentProcessing || circleEvmAcceptedPending || privyCircleLinkLoading || circleWalletNeedsFunds || (requiresAttendeeName && !attendeeName.trim()) || paymentAmountBlocked}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold transition-all',
                  circlePasskeyPending || circleEvmPaymentProcessing || circleEvmAcceptedPending || privyCircleLinkLoading || circleWalletNeedsFunds
                    ? 'cursor-not-allowed bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400'
                    : 'bg-black text-white shadow-button hover:bg-gray-800 active:scale-[0.98] dark:bg-[#111113] dark:text-white dark:ring-1 dark:ring-white/10 dark:hover:bg-[#1c1c20]',
                )}
              >
                {circleEvmPaymentProcessing || circleEvmAcceptedPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Payment processing</>
                  : circlePasskeyPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> {circleSmartAccount ? 'Confirming payment' : 'Opening Smart wallet'}</>
                  : privyCircleLinkLoading
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking Smart wallet</>
                  : circleSmartAccount
                    ? <><img src="/hash-logo-transparent.png" alt="" className="h-5 w-5 object-contain invert mix-blend-screen" /> Pay {formatAmount(effectiveAmt, meta.decimals)} {meta.asset}</>
                    : <><img src="/hash-logo-transparent.png" alt="" className="h-5 w-5 object-contain invert mix-blend-screen" /> Continue</>}
              </button>
              {!circleSmartAccount && (
                <p className="text-center text-[11px] font-medium text-gray-400 dark:text-gray-500">
                  Smart wallet payment
                </p>
              )}
              {privyCircleLinkError && circleSmartAccount && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  {privyCircleLinkError}
                </p>
              )}
              {circleSmartAccount && (
                <details className="group rounded-lg border border-gray-200 bg-white/60 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[11px] font-medium text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 truncate">{circleWalletNeedsFunds ? `Add ${meta.label} ${meta.asset} to continue` : `${meta.label} ${meta.asset} wallet ready`}</span>
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
                    <div className="mb-2 grid grid-cols-2 rounded-md bg-gray-100 p-0.5 text-[10px] font-semibold dark:bg-white/[0.06]">
                      {(['fund', 'withdraw'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setCircleWalletPanel(mode)}
                          className={cn(
                            'rounded px-2 py-1 capitalize transition-colors',
                            circleWalletPanel === mode
                              ? 'bg-white text-gray-900 shadow-sm dark:bg-white/15 dark:text-white'
                              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
                          )}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>

                    {circleWalletPanel === 'fund' ? (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                              Gasless wallet
                            </p>
                            <p className="truncate text-[11px] text-gray-500 dark:text-gray-300">
                              {circleWalletNeedsFunds ? `Fund with ${meta.label} ${meta.asset}` : `${meta.label} ${meta.asset} ready`}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleCopyCircleWallet}
                            className="shrink-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-gray-600 transition-all hover:bg-gray-50 active:scale-95 dark:border-white/10 dark:bg-white/[0.08] dark:text-gray-200 dark:hover:bg-white/[0.14]"
                          >
                            {circleWalletCopied ? 'Copied' : 'Copy address'}
                          </button>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[11px]">
                          <span className="text-gray-400 dark:text-gray-500">{meta.label} balance</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-gray-700 dark:text-gray-100">
                              {circleWalletBalance == null
                                ? 'Checking...'
                                : `${formatAmount((Number(circleWalletBalance) / Math.pow(10, meta.decimals)).toString(), meta.decimals)} ${meta.asset}`}
                            </span>
                            <button
                              type="button"
                              onClick={() => refetchCircleWalletBalance()}
                              className="rounded-md p-1 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-700 active:scale-95 dark:text-gray-500 dark:hover:bg-white/10 dark:hover:text-gray-200"
                              aria-label="Refresh smart wallet balance"
                              title="Refresh balance"
                            >
                              <RefreshCw className={cn('h-3 w-3', isCircleWalletBalanceFetching && 'animate-spin')} />
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-[1fr_72px] gap-2">
                          <input
                            value={circleWithdrawAddress}
                            onChange={(event) => setCircleWithdrawAddress(event.target.value)}
                            placeholder="Wallet or exchange address"
                            className="h-8 min-w-0 rounded-md border border-gray-200 bg-white px-2 text-[11px] text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.05] dark:text-white dark:placeholder:text-gray-500"
                          />
                          <div className="flex h-8 items-center rounded-md border border-gray-200 bg-white px-2 dark:border-white/10 dark:bg-white/[0.05]">
                            <input
                              value={circleWithdrawAmount}
                              onChange={(event) => setCircleWithdrawAmount(event.target.value)}
                              placeholder="0.00"
                              inputMode="decimal"
                              className="min-w-0 flex-1 bg-transparent text-right text-[11px] font-semibold text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-500"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[10px]">
                          <button
                            type="button"
                            onClick={handleCircleWithdrawMax}
                            className="font-semibold text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
                          >
                            Max {circleWalletBalance == null ? '' : `${formatAmount((Number(circleWalletBalance) / Math.pow(10, meta.decimals)).toString(), meta.decimals)} ${meta.asset}`}
                          </button>
                          <button
                            type="button"
                            onClick={handleCircleWithdraw}
                            disabled={circleWithdrawPending}
                            className="rounded-md bg-gray-900 px-3 py-1.5 font-semibold text-white transition-all hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                          >
                            {circleWithdrawPending ? 'Working...' : circleEvmEmailSession ? 'Withdraw' : 'Unlock'}
                          </button>
                        </div>
                        {!circleEvmEmailSession && (
                          <p className="text-[10px] font-medium text-amber-600 dark:text-amber-300">Unlock wallet to withdraw.</p>
                        )}
                        {circleWithdrawError && (
                          <p className="text-[10px] font-medium text-red-600 dark:text-red-300">{circleWithdrawError}</p>
                        )}
                        {circleWithdrawNotice && (
                          <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-300">{circleWithdrawNotice}</p>
                        )}
                        {circleWithdrawTxHash && (
                          <p className="truncate text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
                            Withdraw sent: {truncateAddress(circleWithdrawTxHash)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </details>
              )}
              {circlePasskeyError && circleWalletPanel !== 'withdraw' && (
                <p className="text-center text-[11px] font-medium text-red-600 dark:text-red-300">{circlePasskeyError}</p>
              )}
            </div>
          )}

          {/* ── Primary CTA (wallet mode only) ────────────────────────── */}
          {payMode === 'wallet' && missingStark ? (
            <button disabled className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-gray-100 px-6 py-4 text-sm font-semibold text-gray-400">
              <AlertTriangle className="h-4 w-4" />
              No Starknet Address Available
            </button>
          ) : payMode === 'wallet' && missingSolana ? (
            <button disabled className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-gray-100 px-6 py-4 text-sm font-semibold text-gray-400">
              <AlertTriangle className="h-4 w-4" />
              No Solana Address Available
            </button>
          ) : payMode === 'wallet' && chain === 'solana' && (!usePrivyCircleSolanaCheckout || privyAuthenticated) && (!isPolymarketFunding || polymarketFundingStep === 'fund' || !!circleSolanaSession || !!circleSolanaAddress) ? (
              <div className="space-y-2">
                {showCircleSolanaEmailBridgePay && !manualPayDetected && (
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
                    <button
                      onClick={handleCircleSolanaEmailPay}
                      disabled={circleSolanaPending || isSolanaConfirming || privyCircleLinkLoading || circleSolanaNeedsFunds || (requiresAttendeeName && !attendeeName.trim()) || paymentAmountBlocked}
                      className={cn(
                        'flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold transition-all',
                        circleSolanaPending || isSolanaConfirming || privyCircleLinkLoading || circleSolanaNeedsFunds
                          ? 'cursor-not-allowed bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400'
                          : 'bg-black text-white shadow-button hover:bg-gray-800 active:scale-[0.98] dark:bg-[#111113] dark:text-white dark:ring-1 dark:ring-white/10 dark:hover:bg-[#1c1c20]',
                      )}
                    >
                      {circleSolanaPending
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> {circleSolanaSession ? 'Payment processing' : 'Opening Smart wallet'}</>
                        : privyCircleLinkLoading
                          ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking Smart wallet</>
                        : circleSolanaSession
                          ? <><img src="/hash-logo-transparent.png" alt="" className="h-5 w-5 object-contain invert mix-blend-screen" /> Pay {formatAmount(effectiveAmt, 6)} USDC</>
                          : <><img src="/hash-logo-transparent.png" alt="" className="h-5 w-5 object-contain invert mix-blend-screen" /> Continue</>}
                    </button>
                    {!circleSolanaSession && (
                      <p className="text-center text-[11px] font-medium text-gray-400 dark:text-gray-500">
                        Smart wallet payment
                      </p>
                    )}
                    {(circleSolanaSession || circleSolanaAddress) && (
                      <details className="group rounded-lg border border-gray-200 bg-white/60 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[11px] font-medium text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 [&::-webkit-details-marker]:hidden">
                          <span className="min-w-0 truncate">
                            {circleSolanaNeedsFunds ? 'Add Solana USDC to continue' : 'Circle Solana wallet'}
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
                          <div className="mb-2 grid grid-cols-2 rounded-md bg-gray-100 p-0.5 text-[10px] font-semibold dark:bg-white/[0.06]">
                            {(['fund', 'withdraw'] as const).map((mode) => (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => setCircleSolanaPanel(mode)}
                                className={cn(
                                  'rounded px-2 py-1 capitalize transition-colors',
                                  circleSolanaPanel === mode
                                    ? 'bg-white text-gray-900 shadow-sm dark:bg-white/15 dark:text-white'
                                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
                                )}
                              >
                                {mode}
                              </button>
                            ))}
                          </div>

                          {circleSolanaPanel === 'fund' ? (
                            <>
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                    Circle wallet
                                  </p>
                                  <p className="truncate text-[11px] text-gray-500 dark:text-gray-300">
                                    {circleSolanaNeedsFunds ? 'Fund with Solana USDC' : 'Solana USDC ready'}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={handleCopyCircleSolanaWallet}
                                  className="shrink-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-gray-600 transition-all hover:bg-gray-50 active:scale-95 dark:border-white/10 dark:bg-white/[0.08] dark:text-gray-200 dark:hover:bg-white/[0.14]"
                                >
                                  {circleSolanaCopied ? 'Copied' : 'Copy address'}
                                </button>
                              </div>
                              <div className="mt-2 flex items-center justify-between text-[11px]">
                                <span className="text-gray-400 dark:text-gray-500">Solana balance</span>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-semibold text-gray-700 dark:text-gray-100">
                                    {circleSolanaBalanceError
                                      ? 'Unavailable'
                                      : circleSolanaBalance == null
                                      ? 'Checking...'
                                      : `${formatAmount((Number(circleSolanaBalance) / 1_000_000).toString(), 6)} USDC`}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => refreshCircleSolanaBalance()}
                                    className="rounded-md p-1 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-700 active:scale-95 dark:text-gray-500 dark:hover:bg-white/10 dark:hover:text-gray-200"
                                    aria-label="Refresh smart wallet balance"
                                    title="Refresh balance"
                                  >
                                    <RefreshCw className={cn('h-3 w-3', circleSolanaFetching && 'animate-spin')} />
                                  </button>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="space-y-2">
                              <div className="grid grid-cols-[1fr_72px] gap-2">
                                <input
                                  value={circleSolanaWithdrawAddress}
                                  onChange={(event) => setCircleSolanaWithdrawAddress(event.target.value)}
                                  placeholder="Wallet or exchange address"
                                  className="h-8 min-w-0 rounded-md border border-gray-200 bg-white px-2 text-[11px] text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.05] dark:text-white dark:placeholder:text-gray-500"
                                />
                                <div className="flex h-8 items-center rounded-md border border-gray-200 bg-white px-2 dark:border-white/10 dark:bg-white/[0.05]">
                                  <input
                                    value={circleSolanaWithdrawAmount}
                                    onChange={(event) => setCircleSolanaWithdrawAmount(event.target.value)}
                                    placeholder="0.00"
                                    inputMode="decimal"
                                    className="min-w-0 flex-1 bg-transparent text-right text-[11px] font-semibold text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-500"
                                  />
                                </div>
                              </div>
                              <div className="flex items-center justify-between gap-2 text-[10px]">
                                <button
                                  type="button"
                                  onClick={handleCircleSolanaWithdrawMax}
                                  className="font-semibold text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
                                >
                                  Max {circleSolanaBalance === null ? '' : `${formatAmount((Number(circleSolanaBalance) / 1_000_000).toString(), 6)} USDC`}
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCircleSolanaWithdraw}
                                  disabled={circleSolanaWithdrawPending}
                                  className="rounded-md bg-gray-900 px-3 py-1.5 font-semibold text-white transition-all hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                                >
                                  {circleSolanaWithdrawPending ? 'Working...' : circleSolanaSession ? 'Withdraw' : 'Unlock'}
                                </button>
                              </div>
                              {!circleSolanaSession && (
                                <p className="text-[10px] font-medium text-amber-600 dark:text-amber-300">Unlock wallet to withdraw.</p>
                              )}
                              {circleSolanaWithdrawError && (
                                <p className="text-[10px] font-medium text-red-600 dark:text-red-300">{circleSolanaWithdrawError}</p>
                              )}
                              {circleSolanaWithdrawNotice && (
                                <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-300">{circleSolanaWithdrawNotice}</p>
                              )}
                              {circleSolanaWithdrawTxHash && (
                                <p className="truncate text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
                                  Withdraw sent: {truncateAddress(circleSolanaWithdrawTxHash)}
                                </p>
                              )}
                            </div>
                          )}
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
                  </div>
                )}
                {!showCircleSolanaEmailBridgePay && !walletConnectBlocked && !isTelegramSource && !solanaWalletAddr ? (
                  <>
                <button
                  onClick={() => connectSolana()}
                  disabled={isSolanaConnecting || (requiresAttendeeName && !attendeeName.trim())}
                  className={cn(
                    'flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-60',
                    showCircleSolanaEmailBridgePay && !manualPayDetected
                      ? 'border border-gray-200 bg-white text-gray-800 hover:bg-gray-50'
                      : 'bg-[#14F195] text-gray-900 hover:bg-[#00E589]',
                  )}
                >
                  {isSolanaConnecting
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing in...</>
                    : <><Wallet className="h-4 w-4" /> {showCircleSolanaEmailBridgePay && !manualPayDetected ? 'Pay another way' : 'Sign in with Solana'}</>}
                </button>
                <p className="text-center text-xs text-gray-400">
                  {showCircleSolanaEmailBridgePay && !manualPayDetected
                    ? 'Use Phantom, Solflare, Backpack, or WalletConnect'
                    : 'Privy opens Phantom, Solflare, Backpack, or WalletConnect'}
                </p>
                  </>
                ) : !showCircleSolanaEmailBridgePay && !walletConnectBlocked && !isTelegramSource ? (
              <button
                onClick={handlePay}
                disabled={isSolanaPending || isSolanaConfirming || (requiresAttendeeName && !attendeeName.trim()) || paymentAmountBlocked}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-sm font-semibold transition-all',
                  isSolanaPending || isSolanaConfirming
                    ? 'cursor-not-allowed bg-gray-100 text-gray-500'
                    : 'bg-[#14F195] text-gray-900 hover:bg-[#00E589] shadow-button active:scale-[0.98]',
                )}
              >
                {isSolanaPending     ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirm in Wallet…</>
                : isSolanaConfirming ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirming on Chain…</>
                : <><Zap className="h-4 w-4" /> Pay {formatAmount(effectiveAmt, 6)} USDC on Solana</>}
              </button>
                ) : null}
              </div>
          ) : payMode === 'wallet' && chain === 'starknet' ? (
            !starkAccount ? (
              <div className="space-y-2">
                {showArgentStarknetEmailPay && !manualPayDetected && (
                  <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/70 p-3">
                    <button
                      onClick={handleArgentStarknetEmailPay}
                      disabled={argentStarkPending || isStarkPending || isStarkConfirming || (requiresAttendeeName && !attendeeName.trim()) || paymentAmountBlocked}
                      className={cn(
                        'flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold transition-all',
                        argentStarkPending || isStarkPending || isStarkConfirming
                          ? 'cursor-not-allowed bg-gray-100 text-gray-500'
                          : 'bg-black text-white shadow-button hover:bg-gray-800 active:scale-[0.98]',
                      )}
                    >
                      {isStarkConfirming
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirming on Chain</>
                        : isStarkPending
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirming payment</>
                        : argentStarkPending
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> {argentStarkSession ? 'Preparing payment' : 'Opening Smart wallet'}</>
                        : argentStarkSession
                          ? <><Zap className="h-4 w-4" /> Pay {formatAmount(effectiveAmt, 6)} USDC</>
                          : <><Mail className="h-4 w-4" /> Continue with email</>}
                    </button>
                    {argentStarkSession && (
                      <div className="rounded-lg border border-gray-200 bg-white/70 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Smart wallet</p>
                            <p className="truncate text-[11px] text-gray-500">
                              {starkSmartWalletNeedsFunds ? 'Fund with Starknet USDC' : 'Starknet USDC ready'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleCopyArgentStarkWallet}
                            className="shrink-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-gray-600 transition-all hover:bg-gray-50 active:scale-95"
                          >
                            {argentStarkCopied ? 'Copied' : 'Copy to fund'}
                          </button>
                        </div>
                        <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 text-[11px]">
                          <span className="text-gray-400">Starknet balance</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-gray-700">
                              {argentStarkBalance == null
                                ? 'Checking...'
                                : `${formatAmount((Number(argentStarkBalance) / 1_000_000).toString(), 6)} USDC`}
                            </span>
                            <button
                              type="button"
                              onClick={() => refreshArgentStarkBalance()}
                              className="rounded-md p-1 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-700 active:scale-95"
                              aria-label="Refresh smart wallet balance"
                              title="Refresh balance"
                            >
                              <RefreshCw className={cn('h-3 w-3', argentStarkFetching && 'animate-spin')} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    {argentStarkError && (
                      <p className="text-center text-[11px] font-medium text-red-600">
                        {isSmartWalletBalanceError(argentStarkError) ? argentStarkError : `Transaction failed: ${argentStarkError}`}
                      </p>
                    )}
                    {!smartWalletOnlyFunding && !isTelegramSource && (
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-gray-200" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">or</span>
                        <div className="h-px flex-1 bg-gray-200" />
                      </div>
                    )}
                  </div>
                )}
                <button onClick={connectStarknet} disabled={isStarkConnecting || !window.starknet || (requiresAttendeeName && !attendeeName.trim())}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#6236FF] px-6 py-4 text-sm font-semibold text-white transition-all hover:bg-[#5025EE] active:scale-[0.98] disabled:opacity-60">
                  {isStarkConnecting ? <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</> : <><Wallet className="h-4 w-4" /> {showArgentStarknetEmailPay ? 'Use ArgentX / Braavos' : 'Connect Starknet Wallet'}</>}
                </button>
                <p className="text-center text-xs text-gray-400">{showArgentStarknetEmailPay ? 'Browser wallet fallback' : 'ArgentX, Braavos & other Starknet wallets'}</p>
              </div>
            ) : (
              <button onClick={handlePay} disabled={isStarkPending || isStarkConfirming || (requiresAttendeeName && !attendeeName.trim()) || paymentAmountBlocked}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-sm font-semibold transition-all',
                  isStarkPending || isStarkConfirming ? 'cursor-not-allowed bg-gray-100 text-gray-500'
                    : 'bg-[#6236FF] text-white hover:bg-[#5025EE] shadow-button active:scale-[0.98]',
                )}>
                {isStarkPending     ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirm in Wallet…</>
                : isStarkConfirming ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirming on Chain…</>
                : <><Zap className="h-4 w-4" /> Pay {formatAmount(effectiveAmt, 6)} USDC on Starknet</>}
              </button>
            )
          ) : payMode === 'wallet' && (usePrivyCircleCheckout || usePrivyCircleSolanaCheckout) && !privyAuthenticated && !manualPayDetected && !showPolymarketFundingChoice ? (
            <div className={cn(
              'flex flex-col items-center gap-1.5',
              requiresAttendeeName && !attendeeName.trim() && 'pointer-events-none opacity-50 select-none',
            )}>
              <PrivyConnectButton className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-6 py-3.5 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200">
                <Wallet className="h-4 w-4" />
                Sign in to pay
              </PrivyConnectButton>
            </div>
          ) : payMode === 'wallet' && (!usePrivyCircleCheckout || hasExternalPrivyEvmWallet) && !walletConnectBlocked && !isTelegramSource && !isConnected ? (
            <div className={cn(
              'flex flex-col items-center gap-1.5',
              requiresAttendeeName && !attendeeName.trim() && 'pointer-events-none opacity-50 select-none',
            )}>
              <PrivyWalletConnectButton
                options={{ walletChainType: 'ethereum-only' }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3.5 text-sm font-semibold text-gray-800 transition-all hover:bg-gray-50 active:scale-[0.98]"
              >
                <Wallet className="h-4 w-4" />
                {showCircleEmailPay ? 'Connect EOA Wallet' : 'Connect Wallet to Pay'}
              </PrivyWalletConnectButton>
              {showLegacyCircleEmailPay && (
                <p className="text-center text-xs text-gray-400">Gas in ETH</p>
              )}
            </div>
          ) : payMode === 'wallet' && (!usePrivyCircleCheckout || hasExternalPrivyEvmWallet) && !walletConnectBlocked && !isTelegramSource && isConnected && !isPrivyEmbeddedWalletConnected && !isCorrectNetwork ? (
            <button onClick={() => switchChain({ chainId: targetChainId })} disabled={isSwitching}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-70"
              style={{ backgroundColor: meta.accentColor }}>
              {isSwitching
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Switching…</>
                : <><RefreshCw className="h-4 w-4" /> Switch to {meta.label}</>}
            </button>
          ) : payMode === 'wallet' && (!usePrivyCircleCheckout || hasExternalPrivyEvmWallet) && !walletConnectBlocked && !isTelegramSource && isConnected && !isPrivyEmbeddedWalletConnected ? (
            <div className="space-y-2">
              <button onClick={handlePay} disabled={isWalletPending || isConfirming || (requiresAttendeeName && !attendeeName.trim()) || paymentAmountBlocked}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-sm font-semibold transition-all',
                isWalletPending || isConfirming ? 'cursor-not-allowed bg-gray-100 text-gray-500'
                  : 'bg-black text-white shadow-button hover:bg-gray-800 hover:shadow-md active:scale-[0.98]',
              )}>
              {isSignPending        ? <><Loader2 className="h-4 w-4 animate-spin" /> Sign Permit in Wallet…</>
              : ghoRelayPending     ? <><Loader2 className="h-4 w-4 animate-spin" /> Relaying via HashPayLink…</>
              : isBasePaymasterPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Requesting sponsored gas…</>
              : isEvmWalletPending  ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirm in Wallet…</>
              : isConfirming        ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirming on Chain…</>
                : <><Zap className="h-4 w-4" /> Pay {formatAmount(effectiveAmt, meta.decimals)} {meta.asset} on {meta.label}</>}
              </button>
            </div>
          ) : payMode === 'wallet' && !walletConnectBlocked && !isTelegramSource && isPrivyEmbeddedWalletConnected && !showCircleEmailBridgePay ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center text-xs font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              Privy email is signed in, but its embedded wallet is not your Circle Smart Wallet. Add the Circle wallet app id to enable Circle Smart Wallet payments, or connect an external wallet.
            </div>
          ) : null /* direct mode — no CTA button, address panel above handles it */ }

          {showCirclePoweredAttribution && (
            <div className="flex items-center justify-center gap-2 pt-1 text-[11px] font-semibold text-gray-400 dark:text-gray-500">
              <span className="circle-premium-mark">
                <img src="/brand/circle-logo.jpeg" alt="" className="h-4 w-4 rounded-full object-cover" />
              </span>
              <span>Powered by Circle</span>
            </div>
          )}

          <p className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            Secure · Non-custodial · Open source
          </p>
        </div>
      </div>

      {/* Pending tx banner */}
      {txHash && !isConfirmed && !isSendError && (
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
      {showCheckButton && !manualPayDetected && chain !== 'starknet' && chain !== 'solana' && payMode === 'wallet' && (
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

      <div className="mt-10 animate-fade-in">
        <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-widest text-gray-400">
          How it works
        </p>
        <div className="grid grid-cols-3 gap-3">
          {(isHelperAccess ? [
            { n: '1', title: 'Ask Hash', body: 'Open helper access from Telegram or the agent page' },
            { n: '2', title: 'Verify access', body: 'Hash PayLink confirms the payment receipt' },
            { n: '3', title: 'Open helper', body: 'Return to Telegram with access unlocked' },
          ] : isPolymarketFunding ? [
            { n: '1', title: 'Review wallet', body: 'Confirm the funding wallet and amount' },
            { n: '2', title: 'Fund with USDC', body: 'Pay from your gasless wallet or another wallet' },
            { n: '3', title: 'Continue trading', body: 'Use the success screen to return to Polymarket' },
          ] : isWalletManagerFunding ? [
            { n: '1', title: 'Fund wallet', body: 'Add USDC to your Circle wallet balance' },
            { n: '2', title: 'Activate x402', body: 'Move wallet USDC into x402 service balance' },
            { n: '3', title: 'Return to services', body: 'Go back to the wallet manager or PolyDesk checkout' },
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
              <p className="mt-0.5 text-xs text-gray-400 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 border-t border-gray-100 pt-5 flex items-center justify-center gap-8">
          <a
            href="mailto:support@hashpaylink.com"
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-900 transition-colors"
          >
            <Mail className="h-3.5 w-3.5" />
            support@hashpaylink.com
          </a>
          <a
            href="https://x.com/Hash_PayLink"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-900 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            @Hash_PayLink
          </a>
          <Link
            to="/docs"
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-900 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Docs
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          {isHelperAccess ? 'Helper access on ' : isPolymarketFunding ? 'Polymarket Funding on ' : isWalletManagerFunding ? 'x402 wallet funding on ' : isAgentFunding ? 'Agent payments on ' : 'Powered by Circle USDC · '}
          {(isPolymarketFunding ? [
            { label: 'Base',      href: 'https://basescan.org' },
            { label: 'Solana',   href: 'https://solscan.io' },
            { label: 'Arbitrum', href: 'https://arbiscan.io' },
          ] : isAgentOrWalletFunding || isHelperAccess ? [
            { label: 'Base',      href: 'https://basescan.org' },
            { label: 'Arbitrum', href: 'https://arbiscan.io' },
            { label: 'Arc Testnet', href: 'https://testnet.arcscan.app' },
          ] : [
            { label: 'Base',      href: 'https://basescan.org' },
            { label: 'Arbitrum', href: 'https://arbiscan.io' },
            { label: 'Arc Testnet', href: 'https://testnet.arcscan.app' },
            { label: 'Solana',   href: 'https://solscan.io' },
          ]).map((item, i, arr) => (
            <span key={item.label}>
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-gray-500 underline-offset-2 hover:underline transition-colors"
              >
                {item.label}
              </a>
              {i < arr.length - 1 && ' · '}
            </span>
          ))}
        </p>
      </div>

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
