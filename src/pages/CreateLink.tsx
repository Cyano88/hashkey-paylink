import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useOutletContext, Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { LayoutOutletContext } from '../Layout'
import {
  useAccount,
  useDisconnect,
} from 'wagmi'
import {
  Copy,
  CheckCheck,
  ArrowRight,
  ChevronDown,
  Activity,
  ExternalLink,
  Info,
  XCircle,
  Loader2,
  Wallet,
  Mail,
  X,
  ScanLine,
  Globe,
  DollarSign,
  RefreshCw,
  Bot,
  Trash2,
  Radio,
  Store,
  UserRound,
  Landmark,
} from 'lucide-react'
import { FX_CURRENCIES, getFxMeta, formatLocalAmt, fetchFxRate } from '../lib/fx'
import { isAddress } from 'viem'
import { cn, formatAmount, formatNgnAmount, copyToClipboard } from '../lib/utils'
import { useSolana }   from '../lib/SolanaContext'
import { CHAIN_META, type ChainKey } from '../lib/chains'
import { isValidSolanaAddress } from '../lib/solanaAddress'
import { setPaylinkParam } from '../lib/paylinkParams'
import { PRIVY_AUTH_ENABLED } from '../lib/authMode'
import { canUseCircleEvmEmailWallet } from '../lib/circleEvmEmailWallet'
import { canUseCircleSolanaEmailWallet } from '../lib/circleSolanaEmailWallet'
import { PrivyConnectButton } from '../lib/PrivyConnectButton'
import { createPocketPos } from '../pocket/api/pocketPosClient'
import { createPocketBankReceive } from '../pocket/api/pocketBankReceiveClient'
import { readPocketBankInstitutions, verifyPocketBankAccount } from '../pocket/api/pocketBankClient'
import { createPocketBankSend } from '../pocket/api/pocketBankSendClient'
import AgentWorkspace from './AgentWorkspace'
import { TelegramHelperPanel } from './TelegramPaymentLinks'
import PayLinkShareSheet from '../components/PayLinkShareSheet'
import {
  LocalCurrencyProfileCard,
  LocalCurrencySignInGate,
} from '../pocket/components/LocalCurrencyProfileCard'
import usePocketIdentity from '../pocket/hooks/usePocketIdentity'
import usePocketProfile from '../pocket/hooks/usePocketProfile'
import usePocketRecipient from '../pocket/hooks/usePocketRecipient'
import { PocketPayerNetworkPanel } from '../pocket/features/move/PocketPayerNetworkPanel'
import { PocketReceiveMethodPanel } from '../pocket/features/move/PocketReceiveMethodPanel'
import { PocketRecipientAddressFields } from '../pocket/features/move/PocketRecipientAddressFields'
import { PocketVerifiedBankFields } from '../pocket/features/move/PocketVerifiedBankFields'
import { PocketPosCountryPanel, PocketPosReadyPanel, PocketPosSetupPanel, PocketPosShell, PocketPosSignInCard } from '../pocket/features/move/PocketPosPanels'
import { PocketPayLinkReadyPanel } from '../pocket/features/move/PocketPayLinkReadyPanel'
import {
  PocketFlexibleAmountToggle,
  PocketPayLinkSubmitPanel,
  PocketPaymentAmountField,
  PocketPaymentNoteField,
  type PocketPayLinkLane,
} from '../pocket/features/move/PocketPayLinkFields'
import {
  usePocketBankReceiveController,
  usePocketPosController,
  usePocketUsdcPayLinkController,
  type PocketBankReceiveActions,
} from '../pocket/controllers/usePocketMoveControllers'
import { POCKET_ORIGIN } from '../pocket/lib/pocketRoutes'

// ─── Solana address: base58, 32–44 characters ────────────────────────────────
const isValidSolanaAddr = isValidSolanaAddress

const VISIBLE_CREATE_CHAINS: ChainKey[] = ['base', 'arc', 'solana', 'arbitrum']
const TELEGRAM_AGENT_URL = import.meta.env.VITE_TELEGRAM_AGENT_URL || 'https://t.me/HashPayLinkBot'
const HASHPAYSTREAM_APP_URL = import.meta.env.VITE_HASHPAYSTREAM_APP_URL || 'https://hashpaystream.app'
const POLYDESK_APP_URL = import.meta.env.VITE_POLYDESK_APP_URL || 'https://polydesk-i96m.onrender.com'
const AGENT_HASH_HEADER_PROMPTS = [
  { text: 'I can help with payments and Hash PayLink services.', delayMs: 9500 },
  { text: 'I am Agent Hash.', delayMs: 7000 },
  { text: 'Tap to launch me.', delayMs: 3600 },
  { text: 'What do you want to fund or request today?', delayMs: 8500 },
] as const

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

function AgentHashCssIcon({ header = false, staticPose = false }: { header?: boolean; staticPose?: boolean }) {
  return (
    <div className={cn('ask-hash-live-agent shrink-0', staticPose && 'ask-hash-live-agent--static', header && 'ask-hash-live-agent--header')} aria-hidden="true">
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

function PaymentHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className} fill="none">
      <path
        d="M3.5 23.2h5.2c1.1 0 2 .28 3.05.72l3.05 1.28c.72.3 1.5.45 2.28.45h5.04c.78 0 1.42-.58 1.5-1.35.08-.83-.57-1.55-1.4-1.55h-4.34c-.72 0-1.43-.16-2.08-.46l-2.26-1.04"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m23.3 24.2 4.42-3.15a1.82 1.82 0 0 1 2.47.32c.68.82.52 2.04-.36 2.64l-5.64 3.84a5.75 5.75 0 0 1-3.22 1H16.1c-.78 0-1.56-.14-2.3-.43l-4.1-1.57H3.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="20.9" cy="11.7" r="6.5" stroke="currentColor" strokeWidth="1.9" />
      <path
        d="M20.9 7.95v7.5M22.75 9.55c-.32-.5-.86-.76-1.66-.76-.94 0-1.58.4-1.58 1.12 0 1.68 3.43.8 3.43 2.84 0 .8-.68 1.38-1.78 1.38-.93 0-1.62-.31-2.08-.9"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.1 11.45a4.6 4.6 0 1 1 5.18-6.93M16.05 5.05a4.6 4.6 0 0 1 8.02 1.18"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  )
}

function FlowBackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition-all hover:-translate-x-0.5 hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]"
    >
      <span className="back-btn text-gray-500 dark:text-gray-300" aria-hidden="true">
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

type VaultStep = 'idle' | 'ready'
type ReceiveMode = 'email' | 'paste' | 'bank'
type PaymentMode = 'personal' | 'business'
type PaymentFlow = 'usdc' | 'bank' | 'bank-send'
type PaymentTab = PaymentMode | PaymentFlow | 'pos' | 'bills'
type PosNetwork = 'base' | 'arbitrum' | 'arc' | 'solana'
type BankSendNetwork = 'polygon' | 'base'
type PosCountry = 'NG' | 'KE' | 'GH'
type PosSettlementPath = 'PAYCREST_NAIRA'
type PosStep = 'country' | 'setup' | 'ready'
type CreateProduct = 'payment' | 'agent' | 'circle-pocket' | 'pos' | 'streampay' | 'polymarket'
type AccessView = 'overview' | 'wallet'
type PaycrestInstitutionOption = {
  code: string
  name: string
  type?: string
}
type PosMerchant = {
  merchant_id: string
  display_name: string
  circle_smart_wallet_address: string
  solana_wallet_address?: string
  supported_networks?: PosNetwork[]
}

function telegramStartUrl(payload: string) {
  const base = TELEGRAM_AGENT_URL.trim().replace(/\/+$/, '') || 'https://t.me/HashPayLinkBot'
  const cleanPayload = payload.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'start'
  return base.includes('?') ? `${base}&start=${encodeURIComponent(cleanPayload)}` : `${base}?start=${encodeURIComponent(cleanPayload)}`
}

function readableErrorMsg(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string' && err) return err
  return fallback
}
function readableBankPayoutError(err: unknown, fallback: string) {
  const message = readableErrorMsg(err, fallback).replaceAll('Paycrest ', '')
  if (/PAYCREST_API_KEY|not configured/i.test(message)) {
    return 'Bank payouts are temporarily unavailable. Please try again later.'
  }
  return message
}

const POS_NETWORK_OPTIONS: Array<{ key: PosNetwork; label: string; badge?: string }> = [
  { key: 'base', label: 'Base' },
  { key: 'arbitrum', label: 'Arbitrum' },
  { key: 'arc', label: 'Arc', badge: 'Testnet' },
  { key: 'solana', label: 'Solana' },
]

const PAYCREST_POS_NETWORK_OPTIONS = POS_NETWORK_OPTIONS.filter((network) => network.key === 'base')

const PAYCREST_ONRAMP_NETWORK_OPTIONS: Array<{ key: BankSendNetwork; label: string }> = [
  { key: 'base', label: 'Base' },
]

const POS_COUNTRIES: Array<{ key: PosCountry; name: string; label: string; status: 'live' | 'soon'; copy: string }> = [
  { key: 'NG', name: 'Nigeria', label: 'Live', status: 'live', copy: 'Payers use Base USDC. You receive Naira to a verified bank account.' },
  { key: 'KE', name: 'Kenya', label: 'Coming soon', status: 'soon', copy: 'Pending a verified local wallet or payout partner.' },
  { key: 'GH', name: 'Ghana', label: 'Coming soon', status: 'soon', copy: 'Pending a verified local wallet or payout partner.' },
]

function normalizeAmountInput(value: string) {
  const normalized = value.replace(',', '.').replace(/[^\d.]/g, '')
  const [whole, ...fraction] = normalized.split('.')
  return fraction.length ? `${whole}.${fraction.join('')}` : whole
}

function CircleReceiveSelector({
  selectedNet,
  isEvmNet,
  receiveMode,
  setReceiveMode,
  evmAddr,
  solanaAddr,
  evmValid,
  solanaValid,
  canReceiveWithEmail,
  setEvmAddr,
  setSolanaAddr,
  setGeneratedLink,
  bankCountry,
  bankInstitutions,
  bankInstitutionsBusy,
  bankCode,
  bankName,
  bankAccount,
  bankAccountName,
  bankVerified,
  bankVerifyBusy,
  bankError,
  bankActions,
  selectorLabel,
  addressOptionLabel,
  addressOptionBody,
  hideLabel = false,
  hideBankSignIn = false,
  deferEmailSignIn = false,
}: {
  selectedNet: ChainKey
  isEvmNet: boolean
  receiveMode: ReceiveMode
  setReceiveMode: Dispatch<SetStateAction<ReceiveMode>>
  evmAddr: string
  solanaAddr: string
  evmValid: boolean
  solanaValid: boolean
  canReceiveWithEmail: boolean
  setEvmAddr: Dispatch<SetStateAction<string>>
  setSolanaAddr: Dispatch<SetStateAction<string>>
  setGeneratedLink: Dispatch<SetStateAction<string>>
  bankCountry: PosCountry | null
  bankInstitutions: PaycrestInstitutionOption[]
  bankInstitutionsBusy: boolean
  bankCode: string
  bankName: string
  bankAccount: string
  bankAccountName: string
  bankVerified: boolean
  bankVerifyBusy: boolean
  bankError: string
  bankActions: PocketBankReceiveActions
  selectorLabel?: string
  addressOptionLabel?: string
  addressOptionBody?: string
  hideLabel?: boolean
  hideBankSignIn?: boolean
  deferEmailSignIn?: boolean
}) {
  const { authenticated: privyAuthenticated, email: privyEmail, getAccessToken } = usePocketIdentity()
  const invalidateRecipientResult = useCallback(() => setGeneratedLink(''), [setGeneratedLink])
  const recipient = usePocketRecipient({
    authenticated: privyAuthenticated,
    email: privyEmail,
    getAccessToken,
    network: selectedNet,
    receiveMode,
    setReceiveMode,
    evmAddress: evmAddr,
    solanaAddress: solanaAddr,
    evmValid,
    solanaValid,
    canReceiveWithEmail,
    setEvmAddress: setEvmAddr,
    setSolanaAddress: setSolanaAddr,
    invalidateResult: invalidateRecipientResult,
  })

  const bankSignInControl = receiveMode === 'bank' && !privyAuthenticated && !hideBankSignIn ? (
    <PrivyConnectButton
      debugLabel="create-receive-bank"
      loginOptions={{ loginMethods: ['email'] }}
      logoutOnAuthenticated={false}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-gray-700 transition-all hover:border-gray-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:border-white/20 dark:hover:bg-white/[0.07]"
    >
      <span>
        <span className="block text-sm font-semibold">Sign in to save bank payouts</span>
        <span className="mt-0.5 block text-[11px] text-gray-400">Required for settlement history and support.</span>
      </span>
      <Mail className="h-4 w-4 text-blue-500" />
    </PrivyConnectButton>
  ) : undefined

  const emailSignInControl = canReceiveWithEmail && !privyAuthenticated ? (
    deferEmailSignIn ? (
      <button
        type="button"
        onClick={() => {
          recipient.deferEmailSignIn()
        }}
        className={cn(
          'rounded-xl border px-3 py-2.5 text-left transition-all active:scale-[0.99]',
          receiveMode === 'email'
            ? 'border-gray-900 bg-gray-50 text-gray-900 dark:border-white/30 dark:bg-white/10 dark:text-gray-100'
            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:border-white/20 dark:hover:bg-white/[0.07]',
        )}
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Mail className="h-4 w-4 text-blue-500" />
          Receive with Circle Pocket
        </span>
        <span className="mt-1 block text-[11px] text-gray-400">Email-backed Circle wallet</span>
      </button>
    ) : (
      <PrivyConnectButton
        debugLabel="create-receive-email"
        loginOptions={{ loginMethods: ['email'] }}
        logoutOnAuthenticated={false}
        onBeforeLogin={() => {
          recipient.rememberSignInIntent()
        }}
        className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-gray-700 transition-all hover:border-gray-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:border-white/20 dark:hover:bg-white/[0.07]"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Mail className="h-4 w-4 text-blue-500" />
          Receive with Circle Pocket
        </span>
        <span className="mt-1 block text-[11px] text-gray-400">
          Email-backed Circle wallet
        </span>
      </PrivyConnectButton>
    )
  ) : undefined

  return (
    <PocketReceiveMethodPanel
      receiveMode={receiveMode}
      canReceiveWithEmail={canReceiveWithEmail}
      selectedNetwork={selectedNet}
      networkLabel={CHAIN_META[selectedNet].label}
      recipientPending={recipient.pending}
      recipientError={recipient.error}
      recipientAddressLabel={recipient.recipientAddressLabel}
      walletBalance={recipient.walletBalance}
      walletReady={recipient.walletReady}
      selectorLabel={selectorLabel}
      addressOptionLabel={addressOptionLabel}
      addressOptionBody={addressOptionBody}
      hideLabel={hideLabel}
      bankSignInControl={bankSignInControl}
      emailSignInControl={emailSignInControl}
      bankFields={receiveMode === 'bank' ? (
        <PocketVerifiedBankFields
          country={bankCountry ?? 'NG'}
          institutions={bankInstitutions}
          institutionsBusy={bankInstitutionsBusy}
          bankCode={bankCode}
          bankName={bankName}
          accountNumber={bankAccount}
          accountName={bankAccountName}
          verified={bankVerified}
          verifying={bankVerifyBusy}
          error={bankError}
          onCountryChange={bankActions.setBankCountry}
          onInstitutionChange={bankActions.setBankInstitution}
          onAccountChange={bankActions.setBankAccount}
          onVerify={bankActions.verifyBankAccount}
        />
      ) : undefined}
      onSelectPaste={recipient.selectPaste}
      onSelectEmail={() => void recipient.connect()}
      onDisconnectEmail={() => void recipient.disconnect()}
    />
  )
}


type CreateLinkProps = {
  initialProduct?: 'payment' | 'polymarket'
}

export default function CreateLink({
  initialProduct = 'payment',
}: CreateLinkProps = {}) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const productParam = searchParams.get('product')
  const paymentTabParam = searchParams.get('tab')
  const agentHashRouteOpen = searchParams.get('agent') === 'hash'
  const posStepParam = searchParams.get('posStep')
  const agentAmountParam = (searchParams.get('amount') ?? '').replace(/,/g, '').trim()
  const agentMemoParam = (searchParams.get('memo') ?? '').trim().slice(0, 80)
  const initialAgentAmount = /^\d+(?:\.\d{1,2})?$/.test(agentAmountParam) && Number(agentAmountParam) > 0 ? agentAmountParam : ''
  const initialProductTarget = (productParam ?? '').toLowerCase()
  const initialPaymentTab = (paymentTabParam ?? '').toLowerCase()
  const startsInBankPayment = initialProductTarget === 'payment' && initialPaymentTab === 'bank'
  const startsInBankSendPayment = false
  const startsInPosPayment = initialProductTarget === 'payment' && initialPaymentTab === 'pos'
  const startsInBillsPayment = initialProductTarget === 'payment' && initialPaymentTab === 'bills'
  const startsInProduct = Boolean(initialProductTarget) || initialProduct === 'polymarket' || window.location.pathname === '/polymarket'
  const startsInPaymentMenu = initialProductTarget === 'payment' && !paymentTabParam
  const { authenticated: privyAuthenticated, email: privyEmail, logout: logoutPrivy, getAccessToken } = usePocketIdentity()
  const posCreationIdempotencyRef = useRef('')
  const bankReceiveIdempotencyRef = useRef('')
  const bankSendIdempotencyRef = useRef('')
  const {
    profile: localCurrencyProfile,
    draft: localCurrencyProfileDraft,
    setDraft: setLocalCurrencyProfileDraft,
    editing: localCurrencyProfileEditing,
    busy: localCurrencyProfileBusy,
    error: localCurrencyProfileError,
    save: saveLocalCurrencyProfile,
    edit: editLocalCurrencyProfile,
    cancel: cancelLocalCurrencyProfileEdit,
  } = usePocketProfile({ authenticated: privyAuthenticated, email: privyEmail, getAccessToken })
  const [evmAddr,       setEvmAddr]       = useState('')
  const [solanaAddr,    setSolanaAddr]    = useState('')
  const [amt,           setAmt]           = useState(initialAgentAmount)
  const [memo,          setMemo]          = useState(agentMemoParam)
  const [generatedLink, setGeneratedLink] = useState('')
  const [copied,        setCopied]        = useState(false)
  const [shareOpen,     setShareOpen]     = useState(false)
  const [savedLinkCopied, setSavedLinkCopied] = useState(false)
  const [eventMode,      setEventMode]      = useState(false)
  const [eventId,        setEventId]        = useState('')
  const [multiChainMode, setMultiChainMode] = useState(false)
  const [flexAmount,     setFlexAmount]     = useState(false)
  const [accessMode,     setAccessMode]     = useState(false)
  const [accessView,     setAccessView]     = useState<AccessView>('overview')
  const [agentUrl,       setAgentUrl]       = useState('')
  const [agentUrlStatus, setAgentUrlStatus] = useState<'idle' | 'checking' | 'ok' | 'incompatible'>('idle')
  const [paymentFlow,    setPaymentFlow]    = useState<PaymentFlow>(startsInBankPayment ? 'bank' : startsInBankSendPayment ? 'bank-send' : 'usdc')
  const [receiveMode,    setReceiveMode]    = useState<ReceiveMode>(startsInBankPayment ? 'bank' : 'paste')
  const [bankSendNetwork, setBankSendNetwork] = useState<BankSendNetwork>('base')
  const [posMode,        setPosMode]        = useState(startsInPosPayment)
  const [billsMode,      setBillsMode]      = useState(startsInBillsPayment)
  const [streamMode,     setStreamMode]     = useState(false)
  const [streamSpotlightIndex, setStreamSpotlightIndex] = useState(0)
  const [polymarketMode, setPolymarketMode] = useState(initialProduct === 'polymarket' || window.location.pathname === '/polymarket')
  const [polymarketSpotlightIndex, setPolymarketSpotlightIndex] = useState(0)
  const [productHubOpen, setProductHubOpen] = useState(!startsInProduct)
  const [paymentMenuOpen, setPaymentMenuOpen] = useState(startsInPaymentMenu)
  const [serviceHubAgentPromptIndex, setServiceHubAgentPromptIndex] = useState(0)
  const [serviceHubAgentMounted, setServiceHubAgentMounted] = useState(agentHashRouteOpen)
  const [serviceHubAgentVisible, setServiceHubAgentVisible] = useState(agentHashRouteOpen)
  const [serviceHubAnonymousOwner] = useState(() => {
    const storageKey = 'hashpaylink-agent-hash-session-owner'
    const stored = window.sessionStorage.getItem(storageKey)?.trim()
    if (stored) return stored
    const bytes = crypto.getRandomValues(new Uint8Array(12))
    const generated = `service-hub-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`
    window.sessionStorage.setItem(storageKey, generated)
    return generated
  })
  const [serviceHubAgentComposerActive, setServiceHubAgentComposerActive] = useState(false)
  const [serviceHubAgentViewport, setServiceHubAgentViewport] = useState<{
    top: number
    left: number
    width: number
    height: number
  } | null>(null)
  const [posCountry,     setPosCountry]     = useState<PosCountry | null>(startsInBankPayment ? 'NG' : null)
  const [posSettlementPath, setPosSettlementPath] = useState<PosSettlementPath | null>(null)
  const [posMerchantName, setPosMerchantName] = useState('')
  const [posNetworks,    setPosNetworks]    = useState<PosNetwork[]>(['base'])
  const [posWallet,      setPosWallet]      = useState('')
  const [posSolanaWallet, setPosSolanaWallet] = useState('')
  const [posBankInstitutions, setPosBankInstitutions] = useState<PaycrestInstitutionOption[]>([])
  const [posBankInstitutionsBusy, setPosBankInstitutionsBusy] = useState(false)
  const [posBankName, setPosBankName] = useState('')
  const [posBankCode, setPosBankCode] = useState('')
  const [posBankAccount, setPosBankAccount] = useState('')
  const [posBankAccountName, setPosBankAccountName] = useState('')
  const [posBankVerified, setPosBankVerified] = useState(false)
  const [posBankVerifyBusy, setPosBankVerifyBusy] = useState(false)
  const [posMerchant,    setPosMerchant]    = useState<PosMerchant | null>(null)
  const [posBusy,        setPosBusy]        = useState(false)
  const [posError,       setPosError]       = useState('')
  const [posCopied,      setPosCopied]      = useState(false)
  const chainSwitchMounted = useRef(false)

  // ── FX Display settings (event mode only) ────────────────────────────────
  const [fxShow,        setFxShow]        = useState(false)
  const [fxCurrency,    setFxCurrency]    = useState('NGN')
  const [fxSrc,         setFxSrc]         = useState<'live' | 'custom'>('live')
  const [fxCustomRate,  setFxCustomRate]  = useState('')
  const [fxPreviewRate, setFxPreviewRate] = useState<number | null>(null)
  const [fxPreviewLoad, setFxPreviewLoad] = useState(false)

  // Recover last multi-payer dashboard from localStorage
  type SavedEvent = { dashboardUrl: string; paymentUrl: string; eventName: string; ts: number }
  const [savedEvent, setSavedEvent] = useState<SavedEvent | null>(() => {
    try { return JSON.parse(localStorage.getItem('hp_last_event') ?? 'null') }
    catch { return null }
  })
  const qrRef       = useRef<HTMLDivElement>(null)
  const qrHiResRef  = useRef<HTMLDivElement>(null)
  // selectedNet is owned by Layout and shared via outlet context for bidirectional sync with the header toolkit
  const { selectedNet, onNetworkSelect } = useOutletContext<LayoutOutletContext>()
  // Derived early so useEffect hooks below can reference it without TDZ error
  const isEvmNet = selectedNet !== 'solana'
  const [vaultStep,     setVaultStep]     = useState<VaultStep>('idle')

  useEffect(() => {
    if (!VISIBLE_CREATE_CHAINS.includes(selectedNet)) onNetworkSelect('base')
  }, [selectedNet, onNetworkSelect])

  useEffect(() => {
    if (receiveMode === 'bank' && selectedNet !== 'base') onNetworkSelect('base')
  }, [receiveMode, selectedNet, onNetworkSelect])

  useEffect(() => {
    if (receiveMode === 'bank' && !posCountry) setPosCountry('NG')
  }, [receiveMode, posCountry])

  useEffect(() => {
    if (receiveMode !== 'bank') return
    setPosBankVerified(false)
    setPosBankAccountName('')
    setPosError('')
  }, [receiveMode, posBankCode, posBankAccount])
  // Background check — null=checking, true=deployed, false=not deployed

  // ── Wallet hooks ──────────────────────────────────────────────────────────
  const { address: connectedEvm } = useAccount()
  const { disconnect: disconnectEvm } = useDisconnect()
  const { address: connectedSolana, disconnect: disconnectSolana } = useSolana()

  function disconnectConnectedEvmRecipient() {
    disconnectEvm()
    setEvmAddr('')
    setGeneratedLink('')
  }

  function disconnectConnectedSolanaRecipient() {
    disconnectSolana()
    setSolanaAddr('')
    setGeneratedLink('')
  }

  // ── Connected wallet auto-fill ─────────────────────────────────────────
  useEffect(() => {
    if (connectedEvm && evmAddr === '' && (isEvmNet || multiChainMode)) setEvmAddr(connectedEvm)
  }, [connectedEvm, isEvmNet, multiChainMode])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (connectedSolana && solanaAddr === '' && (selectedNet === 'solana' || multiChainMode)) setSolanaAddr(connectedSolana)
  }, [connectedSolana, selectedNet, multiChainMode])  // eslint-disable-line react-hooks/exhaustive-deps

  // Disconnect Solana wallet when switching away from Solana network
  useEffect(() => {
    if (selectedNet !== 'solana' && !multiChainMode && connectedSolana) {
      disconnectSolana()
      setSolanaAddr('')
    }
  }, [selectedNet, multiChainMode])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Wipe addresses on chain switch (single-chain mode only) ───────────────
  // Prevents address bleed-over when the organizer switches chains.
  useEffect(() => {
    if (!chainSwitchMounted.current) { chainSwitchMounted.current = true; return }
    if (multiChainMode) return
    setEvmAddr(''); setSolanaAddr('')
    setGeneratedLink(''); setVaultStep('idle')
  }, [selectedNet])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reset vault step when address changes ─────────────────────────────
  useEffect(() => {
    setVaultStep('idle')
    setGeneratedLink('')
  }, [evmAddr])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Background router check (no wallet needed — uses public client) ────
  // Once a router is deployed for this address, every future link auto-shows Active.
  // ── FX preview rate ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!fxShow || !fxCurrency) { setFxPreviewRate(null); return }
    if (fxSrc === 'custom') {
      const v = parseFloat(fxCustomRate)
      setFxPreviewRate(v > 0 ? v : null)
      return
    }
    let cancelled = false
    setFxPreviewLoad(true)
    fetchFxRate(fxCurrency).then(d => {
      if (!cancelled && d.ok && d.rate) setFxPreviewRate(d.rate)
    }).catch(() => {}).finally(() => { if (!cancelled) setFxPreviewLoad(false) })
    return () => { cancelled = true }
  }, [fxShow, fxCurrency, fxSrc, fxCustomRate])

  // ── Validation ─────────────────────────────────────────────────────────
  const evmDirty    = evmAddr.length > 0
  const solanaDirty = solanaAddr.length > 0
  const amtDirty    = amt.length > 0

  const evmValid    = isAddress(evmAddr)
  const solanaValid = isValidSolanaAddr(solanaAddr)
  const isValidAmt  = amtDirty && /^(?:\d+|\d*\.\d+)$/.test(amt) && Number(amt) > 0
  const paymentMode: PaymentMode = eventMode ? 'business' : 'personal'
  const localCurrencyProfileReady = Boolean(localCurrencyProfile?.firstName && localCurrencyProfile?.lastName && (localCurrencyProfile.email || privyEmail))

  // In access mode event collection is always on
  const effectiveEventMode = accessMode || eventMode

  const isBankReceive = paymentFlow === 'bank' || receiveMode === 'bank'
  const isBankSend = paymentFlow === 'bank-send'
  const hasAddress = isBankReceive
    ? Boolean(posBankVerified && posBankCode && posBankAccountName)
    : isBankSend
    ? evmValid
    : multiChainMode
    ? (evmValid || solanaValid)
    : (selectedNet === 'solana' ? solanaValid : evmValid)

  const canGenerateBankReceive = isBankReceive && (flexAmount || isValidAmt) && hasAddress && privyAuthenticated && localCurrencyProfileReady
  const canGenerateBankSend = isBankSend && (flexAmount || isValidAmt) && hasAddress && privyAuthenticated && localCurrencyProfileReady
  const canGenerate = isBankReceive
    ? canGenerateBankReceive
    : isBankSend
    ? canGenerateBankSend
    : (flexAmount || isValidAmt) && hasAddress && (!accessMode || agentUrlStatus === 'ok')

  const canReceiveWithEmail =
    !multiChainMode &&
    !accessMode &&
    PRIVY_AUTH_ENABLED &&
    (
      selectedNet === 'solana'
        ? canUseCircleSolanaEmailWallet()
        : isEvmNet && canUseCircleEvmEmailWallet(selectedNet)
    )

  // ── Flexible amount toggle ─────────────────────────────────────────────────
  function toggleFlexAmount(on: boolean) {
    setFlexAmount(on)
    if (on) setAmt('')   // clear any typed amount — payer will enter it
    setGeneratedLink('')
    setVaultStep('idle')
  }

  // ── Multi-chain mode toggle ────────────────────────────────────────────────
  function toggleMultiChainMode(on: boolean) {
    if (on) {
      setReceiveMode('paste')
      if (receiveMode === 'email') {
        if (selectedNet === 'solana') setSolanaAddr('')
        else if (isEvmNet) setEvmAddr('')
      }
      if (privyAuthenticated) void logoutPrivy()
    }
    setMultiChainMode(on)
    setGeneratedLink('')
    setVaultStep('idle')
  }

  // ── Event mode toggle ──────────────────────────────────────────────────────
  function toggleEventMode(on: boolean) {
    setEventMode(on)
    if (on && !eventId) {
      const bytes = crypto.getRandomValues(new Uint8Array(16))
      setEventId(Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''))
    }
    setGeneratedLink('')
    setVaultStep('idle')
  }

  // ── Access mode toggle ─────────────────────────────────────────────────────
  function setPaymentMode(nextMode: PaymentMode) {
    toggleEventMode(nextMode === 'business')
  }

  function pushProductHistory(product: CreateProduct | 'hub') {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (product === 'hub') url.searchParams.delete('product')
    else url.searchParams.set('product', product)
    navigate(`${url.pathname}${url.search}${url.hash}`)
  }

  function pushPaymentTabHistory(tab: PaymentTab) {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('product', 'payment')
    if (tab === 'personal') url.searchParams.delete('tab')
    else url.searchParams.set('tab', tab)
    url.searchParams.delete('posStep')
    navigate(`${url.pathname}${url.search}${url.hash}`)
  }

  function pushPosStepHistory(step: PosStep) {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('product', 'payment')
    url.searchParams.set('tab', 'pos')
    if (step === 'country') url.searchParams.delete('posStep')
    else url.searchParams.set('posStep', step)
    navigate(`${url.pathname}${url.search}${url.hash}`)
  }

  function goBackOr(fallback: () => void) {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1)
      return
    }
    fallback()
  }

  function openServiceHubAgent() {
    setServiceHubAgentMounted(true)
    window.setTimeout(() => setServiceHubAgentVisible(true), 20)
    const url = new URL(window.location.href)
    url.searchParams.set('agent', 'hash')
    navigate(`${url.pathname}${url.search}${url.hash}`)
  }

  function closeServiceHubAgent() {
    setServiceHubAgentComposerActive(false)
    setServiceHubAgentVisible(false)
    window.setTimeout(() => setServiceHubAgentMounted(false), 260)
    const url = new URL(window.location.href)
    url.searchParams.delete('agent')
    navigate(`${url.pathname}${url.search}${url.hash}`)
  }

  function applyPosStep(step: string | null) {
    if (step === 'setup' || step === 'ready') {
      setPosCountry('NG')
      setPosSettlementPath('PAYCREST_NAIRA')
      if (step === 'setup') {
        setPosMerchant(null)
        setPosCopied(false)
      }
      return
    }
    setPosCountry(null)
    setPosSettlementPath(null)
    setPosMerchant(null)
    setPosCopied(false)
    resetPosBankDetails()
    setPosError('')
  }

  function activateBankReceive() {
    setPaymentFlow('bank')
    setReceiveMode('bank')
    setPaymentMode('personal')
    onNetworkSelect('base')
    setMultiChainMode(false)
    setAccessMode(false)
    setPaymentMenuOpen(false)
    setPosMode(false)
    setBillsMode(false)
    setStreamMode(false)
    setPolymarketMode(false)
    setProductHubOpen(false)
    setGeneratedLink('')
    setCopied(false)
    setVaultStep('idle')
    if (!posCountry) setPosCountry('NG')
  }

  function activateBankSend() {
    try { window.sessionStorage.removeItem('hashpaylink-circle-email-receive-intent') } catch {}
    setPaymentFlow('bank-send')
    setReceiveMode('paste')
    setPaymentMode('personal')
    onNetworkSelect('base')
    setBankSendNetwork('base')
    setMultiChainMode(false)
    setAccessMode(false)
    setPaymentMenuOpen(false)
    setPosMode(false)
    setBillsMode(false)
    setStreamMode(false)
    setPolymarketMode(false)
    setProductHubOpen(false)
    setGeneratedLink('')
    setCopied(false)
    setVaultStep('idle')
    setPosError('')
  }

  function openHubMode(push = true) {
    if (push) pushProductHistory('hub')
    setProductHubOpen(true)
    setPaymentMenuOpen(false)
    setAccessMode(false)
    setPosMode(false)
    setBillsMode(false)
    setStreamMode(false)
    setPolymarketMode(false)
    setAccessView('overview')
    setAgentUrl('')
    setAgentUrlStatus('idle')
  }

  function toggleAccessMode(on: boolean, push = true) {
    if (on && push) pushProductHistory('agent')
    setProductHubOpen(false)
    setPaymentMenuOpen(false)
    setPosMode(false)
    setBillsMode(false)
    setStreamMode(false)
    setPolymarketMode(false)
    setAccessMode(on)
    setAccessView('overview')
    setAgentUrl('')
    setAgentUrlStatus('idle')
    if (on && !eventId) {
      const bytes = crypto.getRandomValues(new Uint8Array(16))
      setEventId(Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''))
    }
    setGeneratedLink('')
    setVaultStep('idle')
  }

  function closeAccessMode() {
    goBackOr(() => openHubMode(false))
  }

  function openStandaloneCirclePocket(replace = false) {
    if (replace) window.location.replace(POCKET_ORIGIN)
    else window.location.assign(POCKET_ORIGIN)
  }

  function openPaymentMenu(push = true) {
    if (push) pushProductHistory('payment')
    setProductHubOpen(false)
    setPaymentMenuOpen(true)
    setAccessMode(false)
    setPosMode(false)
    setBillsMode(false)
    setStreamMode(false)
    setPolymarketMode(false)
    setAccessView('overview')
    setGeneratedLink('')
    setCopied(false)
    setVaultStep('idle')
    setPaymentFlow('usdc')
    setReceiveMode('paste')
    setMultiChainMode(false)
  }

  function openPaymentMode(push = true) {
    if (push) pushPaymentTabHistory(paymentFlow)
    setProductHubOpen(false)
    setPaymentMenuOpen(false)
    setAccessMode(false)
    setPosMode(false)
    setBillsMode(false)
    setStreamMode(false)
    setPolymarketMode(false)
    setAccessView('overview')
    setGeneratedLink('')
    setCopied(false)
    setVaultStep('idle')
  }

  function openPosMode(push = true, paymentTab = false) {
    if (push) {
      if (paymentTab) pushPaymentTabHistory('pos')
      else pushProductHistory('pos')
    }
    setProductHubOpen(false)
    setPaymentMenuOpen(false)
    setPosMode(true)
    setBillsMode(false)
    setAccessMode(false)
    setStreamMode(false)
    setPolymarketMode(false)
    setGeneratedLink('')
    setCopied(false)
    setVaultStep('idle')
    setAccessView('overview')
    setPosError('')
  }

  function resetPosBankDetails() {
    setPosBankName('')
    setPosBankCode('')
    setPosBankAccount('')
    setPosBankAccountName('')
    setPosBankVerified(false)
    setPosBankVerifyBusy(false)
  }

  function closePosMode() {
    pushPaymentTabHistory('personal')
    setProductHubOpen(false)
    setPaymentMenuOpen(true)
    setPosMode(false)
    setPosCountry(null)
    setPosSettlementPath(null)
    setPosMerchant(null)
    setPosCopied(false)
    resetPosBankDetails()
    setPosError('')
  }

  function openBillsMode(push = true) {
    if (push) pushPaymentTabHistory('bills')
    setProductHubOpen(false)
    setPaymentMenuOpen(false)
    setBillsMode(true)
    setPosMode(false)
    setAccessMode(false)
    setStreamMode(false)
    setPolymarketMode(false)
    setGeneratedLink('')
    setCopied(false)
    setVaultStep('idle')
    setAccessView('overview')
  }

  function openStreamMode(push = true) {
    if (push && typeof window !== 'undefined') {
      window.location.assign(HASHPAYSTREAM_APP_URL)
      return
    }
    if (push) pushProductHistory('streampay')
    setProductHubOpen(false)
    setPaymentMenuOpen(false)
    setStreamMode(true)
    setPosMode(false)
    setBillsMode(false)
    setAccessMode(false)
    setPolymarketMode(false)
    setGeneratedLink('')
    setCopied(false)
    setVaultStep('idle')
    setAccessView('overview')
  }

  function closeStreamMode() {
    goBackOr(() => {
      openHubMode(false)
      setStreamMode(false)
    })
  }

  function openPolymarketMode(push = true) {
    if (push && typeof window !== 'undefined') {
      window.location.assign(POLYDESK_APP_URL)
      return
    }
    if (push) pushProductHistory('polymarket')
    setProductHubOpen(false)
    setPaymentMenuOpen(false)
    setPolymarketMode(true)
    setStreamMode(false)
    setPosMode(false)
    setBillsMode(false)
    setAccessMode(false)
    setGeneratedLink('')
    setCopied(false)
    setVaultStep('idle')
    setAccessView('overview')
  }

  function closePolymarketMode() {
    goBackOr(() => openHubMode(false))
  }

  useEffect(() => {
    const product = (productParam ?? '').toLowerCase() as CreateProduct | ''
    if (!product) return
    setProductHubOpen(false)

    if (product === 'payment') {
      const tab = (paymentTabParam ?? '').toLowerCase()
      if (!tab) {
        openPaymentMenu(false)
        return
      }
      setAccessMode(false)
      setPaymentMenuOpen(false)
      setPosMode(false)
      setBillsMode(false)
      setStreamMode(false)
      setPolymarketMode(false)
      setGeneratedLink('')
      setCopied(false)
      setVaultStep('idle')
      if (tab === 'pos') {
        openPosMode(false, true)
        applyPosStep(posStepParam)
        return
      }
      if (tab === 'bills') {
        openBillsMode(false)
        return
      }
      if (tab === 'bank') {
        activateBankReceive()
      } else if (tab === 'bank-send') {
        openHubMode(false)
      } else {
        setPaymentFlow('usdc')
        setReceiveMode('paste')
        setPaymentMode(tab === 'business' ? 'business' : 'personal')
      }
      return
    }

    if (product === 'agent') {
      toggleAccessMode(true, false)
      return
    }

    if (product === 'circle-pocket') {
      openStandaloneCirclePocket(true)
      return
    }

    if (product === 'pos') {
      openPosMode(false)
      return
    }

    if (product === 'streampay') {
      openStreamMode(false)
      return
    }

    if (product === 'polymarket') {
      openPolymarketMode(false)
    }
  }, [productParam, paymentTabParam, posStepParam]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onPopState = () => {
      const url = new URL(window.location.href)
      const product = (url.searchParams.get('product') ?? '').toLowerCase() as CreateProduct | ''
      const tab = (url.searchParams.get('tab') ?? '').toLowerCase()
      if (!product) {
        openHubMode(false)
        return
      }
      if (product === 'payment') {
        if (tab === 'pos') {
          openPosMode(false, true)
          applyPosStep(url.searchParams.get('posStep'))
        }
        else if (tab === 'bills') openBillsMode(false)
        else {
          if (!tab) openPaymentMenu(false)
          else {
            openPaymentMode(false)
            if (tab === 'bank') {
              activateBankReceive()
            } else if (tab === 'bank-send') {
              openHubMode(false)
            } else {
              setPaymentFlow('usdc')
              setReceiveMode('paste')
              setPaymentMode(tab === 'business' ? 'business' : 'personal')
            }
          }
        }
      }
      if (product === 'agent') toggleAccessMode(true, false)
      if (product === 'circle-pocket') openStandaloneCirclePocket(true)
      if (product === 'pos') openPosMode(false)
      if (product === 'streampay') openStreamMode(false)
      if (product === 'polymarket') openPolymarketMode(false)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!streamMode) {
      setStreamSpotlightIndex(0)
      return
    }
    const timer = window.setInterval(() => {
      setStreamSpotlightIndex(current => (current + 1) % 3)
    }, 7_000)
    return () => window.clearInterval(timer)
  }, [streamMode])

  useEffect(() => {
    if (!polymarketMode) {
      setPolymarketSpotlightIndex(0)
      return
    }
    const timer = window.setInterval(() => {
      setPolymarketSpotlightIndex(current => (current + 1) % 3)
    }, 7_000)
    return () => window.clearInterval(timer)
  }, [polymarketMode])

  useEffect(() => {
    if (agentHashRouteOpen) {
      setServiceHubAgentMounted(true)
      const timer = window.setTimeout(() => setServiceHubAgentVisible(true), 20)
      return () => window.clearTimeout(timer)
    }
    setServiceHubAgentComposerActive(false)
    setServiceHubAgentVisible(false)
    const timer = window.setTimeout(() => setServiceHubAgentMounted(false), 260)
    return () => window.clearTimeout(timer)
  }, [agentHashRouteOpen])

  useEffect(() => {
    if (!productHubOpen || serviceHubAgentMounted) {
      setServiceHubAgentPromptIndex(0)
      return
    }
    const delay = AGENT_HASH_HEADER_PROMPTS[serviceHubAgentPromptIndex]?.delayMs ?? 7000
    const timer = window.setTimeout(() => {
      setServiceHubAgentPromptIndex(index => (index + 1) % AGENT_HASH_HEADER_PROMPTS.length)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [productHubOpen, serviceHubAgentPromptIndex, serviceHubAgentMounted])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('hashpaylink-home-surface', {
        detail: { visible: productHubOpen && !serviceHubAgentMounted },
      }))
    }, 0)
    return () => {
      window.clearTimeout(timer)
      window.dispatchEvent(new CustomEvent('hashpaylink-home-surface', {
        detail: { visible: false },
      }))
    }
  }, [productHubOpen, serviceHubAgentMounted])

  useEffect(() => {
    const receiveUsdcOpen = !productHubOpen
      && !paymentMenuOpen
      && !accessMode
      && !posMode
      && !billsMode
      && !streamMode
      && !polymarketMode
      && !isBankReceive
    const timer = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('hashpaylink-history-visibility', {
        detail: { visible: receiveUsdcOpen || isBankReceive || posMode || billsMode },
      }))
    }, 0)
    return () => {
      window.clearTimeout(timer)
      window.dispatchEvent(new CustomEvent('hashpaylink-history-visibility', {
        detail: { visible: false },
      }))
    }
  }, [
    accessMode,
    billsMode,
    isBankReceive,
    paymentMenuOpen,
    polymarketMode,
    posMode,
    productHubOpen,
    streamMode,
  ])

  useEffect(() => {
    const mobileComposerFocused = serviceHubAgentComposerActive
      && window.matchMedia('(max-width: 767px)').matches
    window.dispatchEvent(new CustomEvent('hashpaylink-agent-composer-focus', {
      detail: { focused: mobileComposerFocused },
    }))
    return () => {
      window.dispatchEvent(new CustomEvent('hashpaylink-agent-composer-focus', {
        detail: { focused: false },
      }))
    }
  }, [serviceHubAgentComposerActive])

  useEffect(() => {
    if (!serviceHubAgentComposerActive || !window.matchMedia('(max-width: 767px)').matches) {
      setServiceHubAgentViewport(null)
      return
    }

    const viewport = window.visualViewport
    const updateViewport = () => {
      const topNavHeight = document.querySelector<HTMLElement>('[data-hashpaylink-top-nav]')?.getBoundingClientRect().height ?? 0
      const viewportHeight = viewport?.height ?? window.innerHeight
      setServiceHubAgentViewport({
        top: (viewport?.offsetTop ?? 0) + topNavHeight,
        left: viewport?.offsetLeft ?? 0,
        width: viewport?.width ?? window.innerWidth,
        height: Math.max(220, viewportHeight - topNavHeight),
      })
    }
    const previousBodyOverflow = document.body.style.overflow
    updateViewport()
    document.body.style.overflow = 'hidden'
    viewport?.addEventListener('resize', updateViewport)
    viewport?.addEventListener('scroll', updateViewport)
    window.addEventListener('resize', updateViewport)
    return () => {
      document.body.style.overflow = previousBodyOverflow
      viewport?.removeEventListener('resize', updateViewport)
      viewport?.removeEventListener('scroll', updateViewport)
      window.removeEventListener('resize', updateViewport)
    }
  }, [serviceHubAgentComposerActive])

  function handlePosBack() {
    if (posMerchant) {
      goBackOr(() => {
        setPosMerchant(null)
        setPosCopied(false)
        setPosError('')
      })
      return
    }
    if (posSettlementPath) {
      goBackOr(() => {
        setPosCountry(null)
        setPosSettlementPath(null)
        resetPosBankDetails()
        setPosError('')
      })
      return
    }
    goBackOr(() => openPaymentMenu(false))
  }

  const posCustomerUrl = posMerchant
    ? `${window.location.origin}/pos/ng?merchant_id=${encodeURIComponent(posMerchant.merchant_id)}`
    : ''

  const posIsPaycrestFlow = posSettlementPath === 'PAYCREST_NAIRA'
  const posNeedsEvmWallet = !posIsPaycrestFlow && posNetworks.some((network) => network !== 'solana')
  const posNeedsSolanaWallet = !posIsPaycrestFlow && posNetworks.includes('solana')
  const posNetworkOptions = posIsPaycrestFlow ? PAYCREST_POS_NETWORK_OPTIONS : POS_NETWORK_OPTIONS
  const posPaycrestReady = !posIsPaycrestFlow || (posBankVerified && posBankCode && posBankAccountName && localCurrencyProfileReady)
  const posMerchantNetworks = posMerchant?.supported_networks?.length ? posMerchant.supported_networks : ['base']
  const posDashboardNetwork = posMerchantNetworks.find((network) => network !== 'solana') ?? 'solana'
  const posDashboardAddressParam = posDashboardNetwork === 'solana' ? 's' : 'e'
  const posDashboardAddress = posDashboardNetwork === 'solana' ? posMerchant?.solana_wallet_address : posMerchant?.circle_smart_wallet_address
  const posDashboardUrl = posMerchant
    ? `${window.location.origin}/dashboard?${posDashboardAddressParam}=${encodeURIComponent(posDashboardAddress ?? '')}&n=${encodeURIComponent(posDashboardNetwork)}&id=${encodeURIComponent(`ngpos-${posMerchant.merchant_id}`)}&src=ngpos`
    : ''

  function togglePosNetwork(network: PosNetwork) {
    if (posIsPaycrestFlow) {
      setPosNetworks(['base'])
      setPosError('')
      return
    }
    setPosNetworks((current) => {
      if (current.includes(network)) {
        return current.length === 1 ? current : current.filter((item) => item !== network)
      }
      return [...current, network]
    })
    setPosError('')
  }

  useEffect(() => {
    if (!posIsPaycrestFlow && receiveMode !== 'bank') return
    setPosNetworks((current) => {
      const supported = current.filter((network) => network === 'base')
      return supported.length ? supported : ['base']
    })
  }, [posIsPaycrestFlow, receiveMode])

  useEffect(() => {
    if (!posIsPaycrestFlow && receiveMode !== 'bank') return
    setPosBankInstitutionsBusy(true)
    readPocketBankInstitutions()
      .then((data) => {
        setPosBankInstitutions(data.institutions)
      })
      .catch((error) => {
        setPosBankInstitutions([])
        setPosError(readableBankPayoutError(error, 'Could not load banks.'))
      })
      .finally(() => setPosBankInstitutionsBusy(false))
  }, [posIsPaycrestFlow, receiveMode])

  async function verifyPosBankAccount() {
    setPosBankVerifyBusy(true)
    setPosError('')
    setPosBankVerified(false)
    setPosBankAccountName('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to verify this bank account.')
      const data = await verifyPocketBankAccount({
        accessToken: token,
        request: {
          bank_code: posBankCode,
          bank_name: posBankName,
          account_number: posBankAccount,
        },
      })
      if (data.bank_code) setPosBankCode(String(data.bank_code).trim())
      setPosBankAccountName(String(data.account_name ?? '').trim())
      setPosBankVerified(true)
    } catch (error) {
      setPosError(readableBankPayoutError(error, 'Account verification failed'))
    } finally {
      setPosBankVerifyBusy(false)
    }
  }

  async function createPosMerchant() {
    if (!privyAuthenticated) {
      setPosError('Sign in to create POS and save local currency receipts.')
      return
    }
    setPosBusy(true)
    setPosError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to create POS.')
      const idempotencyKey = posCreationIdempotencyRef.current || window.crypto.randomUUID()
      posCreationIdempotencyRef.current = idempotencyKey
      const data = await createPocketPos({
        accessToken: token,
        idempotencyKey,
        request: {
          owner_email: privyEmail,
          owner_first_name: localCurrencyProfile?.firstName,
          owner_last_name: localCurrencyProfile?.lastName,
          payout_preference: posIsPaycrestFlow ? 'INSTANT_FIAT' : 'KEEP_CRYPTO',
          display_name: posMerchantName.trim(),
          supported_networks: posIsPaycrestFlow ? ['base'] : posNetworks,
          circle_smart_wallet_address: posIsPaycrestFlow ? '' : posWallet.trim(),
          solana_wallet_address: posSolanaWallet.trim(),
          bank_name: posIsPaycrestFlow ? posBankName.trim() : undefined,
          bank_code: posIsPaycrestFlow ? posBankCode.trim() : undefined,
          account_number: posIsPaycrestFlow ? posBankAccount.trim() : undefined,
          account_name: posIsPaycrestFlow ? posBankAccountName.trim() : undefined,
        },
      })
      setPosMerchant(data.merchant)
      posCreationIdempotencyRef.current = ''
      pushPosStepHistory('ready')
    } catch (error) {
      setPosError(error instanceof Error ? error.message : 'POS setup failed')
    } finally {
      setPosBusy(false)
    }
  }

  async function copyPosCustomerLink() {
    if (!posCustomerUrl) return
    await copyToClipboard(posCustomerUrl)
    setPosCopied(true)
    setTimeout(() => setPosCopied(false), 1800)
  }

  // ── Agent URL compatibility check ──────────────────────────────────────────
  async function checkAgentUrl() {
    if (!agentUrl) return
    try { new URL(agentUrl) } catch { setAgentUrlStatus('incompatible'); return }
    setAgentUrlStatus('checking')
    try {
      const r = await fetch(`/api/check-agent-url?url=${encodeURIComponent(agentUrl)}`)
      const data = await r.json()
      setAgentUrlStatus(data.compatible ? 'ok' : 'incompatible')
    } catch {
      setAgentUrlStatus('incompatible')
    }
  }

  // ── QR download — uses hidden 1024px canvas for UHD output ────────────────
  function downloadQR() {
    const canvas = qrHiResRef.current?.querySelector('canvas')
    if (!canvas) return
    const out  = document.createElement('canvas')
    out.width  = canvas.width
    out.height = canvas.height
    const ctx  = out.getContext('2d')!
    ctx.drawImage(canvas, 0, 0)
    const logo  = new Image()
    logo.onload = () => {
      const size    = Math.round(canvas.width * 0.15)
      const x       = Math.round((canvas.width  - size) / 2)
      const y       = Math.round((canvas.height - size) / 2)
      const pad     = 10
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(x - pad, y - pad, size + pad * 2, size + pad * 2)
      ctx.drawImage(logo, x, y, size, size)
      const a    = document.createElement('a')
      a.href     = out.toDataURL('image/png')
      a.download = `${(memo.trim() || 'payment-link').replace(/\s+/g, '-')}-qr.png`
      a.click()
    }
    logo.src = '/hash-logo.png'
  }

  // ── Build link URL ─────────────────────────────────────────────────────
  function buildLink() {
    if (multiChainMode) {
      const params = new URLSearchParams({ x: '1' })
      if (!flexAmount) params.set('a', amt); else params.set('f', '1')
      if (evmValid)    setPaylinkParam(params, 'e', evmAddr)
      if (solanaValid) setPaylinkParam(params, 's', solanaAddr)
      setPaylinkParam(params, 'm', memo)
      if (effectiveEventMode && eventId) {
        params.set('v', '1'); params.set('id', eventId)
        if (fxShow && fxCurrency) {
          params.set('fx', fxCurrency); params.set('fs', '1')
          if (fxSrc === 'custom' && parseFloat(fxCustomRate) > 0) {
            params.set('xs', 'custom'); params.set('xr', fxCustomRate)
          }
        }
      }
      if (!effectiveEventMode && fxShow && fxCurrency) {
        params.set('fx', fxCurrency); params.set('fs', '1')
        if (fxSrc === 'custom' && parseFloat(fxCustomRate) > 0) {
          params.set('xs', 'custom'); params.set('xr', fxCustomRate)
        }
      }
      if (accessMode && agentUrl) setPaylinkParam(params, 'g', agentUrl)
      return `${window.location.origin}/pay?${params.toString()}`
    }
    const params = new URLSearchParams({ n: selectedNet })
    if (!flexAmount) params.set('a', amt); else params.set('f', '1')
    if (selectedNet === 'solana')  setPaylinkParam(params, 's', solanaAddr)
    else if (isEvmNet)             setPaylinkParam(params, 'e', evmAddr)
    setPaylinkParam(params, 'm', memo)
    if (effectiveEventMode && eventId) {
      params.set('v', '1'); params.set('id', eventId)
      if (fxShow && fxCurrency) {
        params.set('fx', fxCurrency); params.set('fs', '1')
        if (fxSrc === 'custom' && parseFloat(fxCustomRate) > 0) {
          params.set('xs', 'custom'); params.set('xr', fxCustomRate)
        }
      }
    }
    if (!effectiveEventMode && fxShow && fxCurrency) {
      params.set('fx', fxCurrency); params.set('fs', '1')
      if (fxSrc === 'custom' && parseFloat(fxCustomRate) > 0) {
        params.set('xs', 'custom'); params.set('xr', fxCustomRate)
      }
    }
    if (accessMode && agentUrl) setPaylinkParam(params, 'g', agentUrl)
    return `${window.location.origin}/pay?${params.toString()}`
  }

  function buildDashboardLink() {
    const params = new URLSearchParams({ id: eventId })
    if (!flexAmount) params.set('a', amt)
    else             params.set('f', '1')
    if (multiChainMode) {
      params.set('x', '1')
      if (evmValid)    setPaylinkParam(params, 'e', evmAddr)
      if (solanaValid) setPaylinkParam(params, 's', solanaAddr)
    } else {
      params.set('n', selectedNet)
      if (selectedNet === 'solana') setPaylinkParam(params, 's', solanaAddr)
      else                          setPaylinkParam(params, 'e', evmAddr)
    }
    setPaylinkParam(params, 'm', memo)
    if (fxShow && fxCurrency) {
      params.set('fx', fxCurrency); params.set('fs', '1')
      if (fxSrc === 'custom' && parseFloat(fxCustomRate) > 0) {
        params.set('xs', 'custom'); params.set('xr', fxCustomRate)
      }
    }
    return `${window.location.origin}/event?${params.toString()}`
  }

  function buildGlobalDashboardLink() {
    const params = new URLSearchParams()
    if (multiChainMode) {
      params.set('x', '1')
      if (evmValid) setPaylinkParam(params, 'e', evmAddr)
      if (solanaValid) setPaylinkParam(params, 's', solanaAddr)
    } else {
      params.set('n', selectedNet)
      if (selectedNet === 'solana') setPaylinkParam(params, 's', solanaAddr)
      else setPaylinkParam(params, 'e', evmAddr)
    }
    return `${window.location.origin}/dashboard?${params.toString()}`
  }

  // ── Generate handler ───────────────────────────────────────────────────
  async function createBankReceiveLink() {
    if (!canGenerateBankReceive) return
    setPosBusy(true)
    setPosError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to create bank receive links.')
      const idempotencyKey = bankReceiveIdempotencyRef.current || window.crypto.randomUUID()
      bankReceiveIdempotencyRef.current = idempotencyKey
      const data = await createPocketBankReceive({
        accessToken: token,
        idempotencyKey,
        request: {
          owner_email: privyEmail,
          owner_first_name: localCurrencyProfile?.firstName || localCurrencyProfileDraft.firstName,
          owner_last_name: localCurrencyProfile?.lastName || localCurrencyProfileDraft.lastName,
          display_name: memo.trim() || 'Bank receive',
          amount: flexAmount ? '' : amt,
          flexible_amount: flexAmount,
          bank_name: posBankName,
          bank_code: posBankCode,
          account_number: posBankAccount,
          account_name: posBankAccountName,
          client_origin: window.location.origin,
        },
      })
      const link = data.link.payment_url
      bankReceiveIdempotencyRef.current = ''
      setGeneratedLink(link)
      setVaultStep('ready')
      const entry: SavedEvent = {
        dashboardUrl: data.link.dashboard_url || buildGlobalDashboardLink(),
        paymentUrl: link,
        eventName: memo.trim() || 'Bank receive',
        ts: Date.now(),
      }
      localStorage.setItem('hp_last_event', JSON.stringify(entry))
      setSavedEvent(entry)
    } catch (error) {
      setPosError(error instanceof Error ? error.message : 'Could not create bank receive link.')
    } finally {
      setPosBusy(false)
    }
  }

  async function createBankSendLink() {
    if (!canGenerateBankSend) return
    setPosBusy(true)
    setPosError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to create bank-to-USDC links.')
      const idempotencyKey = bankSendIdempotencyRef.current || window.crypto.randomUUID()
      bankSendIdempotencyRef.current = idempotencyKey
      const data = await createPocketBankSend({
        accessToken: token,
        idempotencyKey,
        request: {
          owner_email: privyEmail,
          owner_first_name: localCurrencyProfile?.firstName || localCurrencyProfileDraft.firstName,
          owner_last_name: localCurrencyProfile?.lastName || localCurrencyProfileDraft.lastName,
          display_name: memo.trim() || 'Bank to USDC',
          amount: flexAmount ? '' : amt,
          flexible_amount: flexAmount,
          network: bankSendNetwork,
          destination_address: evmAddr.trim(),
          client_origin: window.location.origin,
        },
      })
      const link = data.link.payment_url
      bankSendIdempotencyRef.current = ''
      setGeneratedLink(link)
      setVaultStep('ready')
      const entry: SavedEvent = {
        dashboardUrl: data.link.dashboard_url || `${window.location.origin}/dashboard?src=ngpos`,
        paymentUrl: link,
        eventName: memo.trim() || 'Bank to USDC',
        ts: Date.now(),
      }
      localStorage.setItem('hp_last_event', JSON.stringify(entry))
      setSavedEvent(entry)
    } catch (error) {
      setPosError(error instanceof Error ? error.message : 'Could not create bank-to-USDC link.')
    } finally {
      setPosBusy(false)
    }
  }

  function handleGenerate() {
    if (!canGenerate) return
    if (isBankReceive) {
      void createBankReceiveLink()
      return
    }
    if (isBankSend) {
      void createBankSendLink()
      return
    }
    const link = buildLink()
    setGeneratedLink(link)
    setVaultStep('ready')
    if (effectiveEventMode && eventId) {
      const entry: SavedEvent = {
        dashboardUrl: buildDashboardLink(),
        paymentUrl:   link,
        eventName:    memo.trim() || (accessMode ? 'My Access Link' : 'My Event'),
        ts:           Date.now(),
      }
      localStorage.setItem('hp_last_event', JSON.stringify(entry))
      setSavedEvent(entry)
    }
  }

  // ── Deploy vault handler ───────────────────────────────────────────────
  // ── Copy / reset ───────────────────────────────────────────────────────
  async function handleCopy() {
    if (!generatedLink) return
    await copyToClipboard(generatedLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  async function handleShare() {
    if (!generatedLink) return

    const cleanedMemo = memo.trim()
    const shareText = cleanedMemo
      ? `Pay ${formatAmount(amt, 6)} USDC for ${cleanedMemo}`
      : `Pay ${formatAmount(amt, 6)} USDC with Hash PayLink`

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Hash PayLink',
          text: shareText,
          url: generatedLink,
        })
        return
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
      }
    }

    setShareOpen(true)
  }

  const shareMessage = memo.trim() ? `Pay ${formatAmount(amt, 6)} USDC for ${memo.trim()}` : `Pay ${formatAmount(amt, 6)} USDC with Hash PayLink`

  function handleReset() {
    setEvmAddr(''); setSolanaAddr(''); setAmt(''); setMemo('')
    setGeneratedLink(''); setCopied(false); setMultiChainMode(false); setFlexAmount(false)
    setEventMode(false)
    setVaultStep('idle')
    setAccessMode(false); setPaymentMenuOpen(false); setPosMode(false); setBillsMode(false); setPolymarketMode(false); setAgentUrl(''); setAgentUrlStatus('idle')
  }

  const linkReady = generatedLink !== ''
  const isPaymentView = !productHubOpen && !paymentMenuOpen && !accessMode && !posMode && !billsMode && !streamMode && !polymarketMode
  const pocketUsdcController = usePocketUsdcPayLinkController({
    draft: {
      amount: amt,
      memo,
      flexibleAmount: flexAmount,
      network: selectedNet,
      recipientAddress: selectedNet === 'solana' ? solanaAddr : evmAddr,
    },
    canSubmit: !isBankReceive && !isBankSend && canGenerate,
    submitting: false,
    completed: !isBankReceive && !isBankSend && vaultStep === 'ready',
    submit: handleGenerate,
    actions: {
      setEvmRecipientAddress: (address) => {
        setEvmAddr(address.trim())
        setGeneratedLink('')
      },
      setSolanaRecipientAddress: (address) => {
        setSolanaAddr(address.trim())
        setGeneratedLink('')
      },
      selectNetwork: (network) => onNetworkSelect(network as ChainKey),
      toggleMultiChain: (enabled) => toggleMultiChainMode(enabled),
    },
  })
  const pocketBankReceiveController = usePocketBankReceiveController({
    draft: {
      amountNgn: amt,
      memo,
      flexibleAmount: flexAmount,
      bankName: posBankName,
      bankAccountLast4: posBankAccount.slice(-4),
      accountVerified: posBankVerified,
    },
    canSubmit: canGenerateBankReceive,
    submitting: isBankReceive && posBusy,
    completed: isBankReceive && vaultStep === 'ready',
    submit: handleGenerate,
    actions: {
      setBankCountry: (country) => {
        setPosCountry(country as PosCountry)
        setGeneratedLink('')
      },
      setBankInstitution: (code, name, resetAccount) => {
        setPosBankCode(code)
        setPosBankName(name)
        if (resetAccount) setPosBankAccount('')
        setGeneratedLink('')
      },
      setBankAccount: (accountNumber) => {
        setPosBankAccount(accountNumber.replace(/\D/g, '').slice(0, 10))
        setGeneratedLink('')
      },
      verifyBankAccount: verifyPosBankAccount,
    },
  })
  const pocketPosController = usePocketPosController({
    draft: {
      merchantName: posMerchantName,
      country: posCountry ?? '',
      networks: posNetworks,
      bankName: posBankName,
      bankAccountLast4: posBankAccount.slice(-4),
      accountVerified: posBankVerified,
    },
    canSubmit: Boolean(privyAuthenticated && !posBusy && posMerchantName.trim() && !(posNeedsEvmWallet && !posWallet.trim()) && !(posNeedsSolanaWallet && !posSolanaWallet.trim()) && posPaycrestReady),
    submitting: posBusy,
    completed: Boolean(posMerchant),
    submit: createPosMerchant,
    actions: {
      selectCountry: (country) => {
        if (!privyAuthenticated || !localCurrencyProfileReady) {
          setPosError('Sign in and save your payout profile before creating POS.')
          return
        }
        setPosCountry(country as PosCountry)
        setPosSettlementPath('PAYCREST_NAIRA')
        setPosError('')
        pushPosStepHistory('setup')
      },
      setMerchantName: (name) => {
        setPosMerchantName(name)
        setPosError('')
      },
      toggleNetwork: (network) => togglePosNetwork(network as PosNetwork),
      setBankInstitution: (code, name) => {
        setPosBankCode(code)
        setPosBankName(name)
        setPosBankVerified(false)
        setPosBankAccountName('')
        setPosError('')
      },
      setManualBankCode: (code) => {
        setPosBankCode(code.toUpperCase().trim())
        setPosBankName('')
        setPosBankVerified(false)
        setPosBankAccountName('')
        setPosError('')
      },
      setBankAccount: (accountNumber) => {
        setPosBankAccount(accountNumber.replace(/\D/g, '').slice(0, 10))
        setPosBankVerified(false)
        setPosBankAccountName('')
        setPosError('')
      },
      verifyBankAccount: verifyPosBankAccount,
    },
  })
  const activePocketPayLinkController = isBankReceive ? pocketBankReceiveController : pocketUsdcController
  const activePocketPayLinkLane: PocketPayLinkLane = isBankReceive ? 'bank' : isBankSend ? 'bank-send' : 'usdc'
  const activePocketCanSubmit = isBankSend ? canGenerate : activePocketPayLinkController.canSubmit
  const activePocketSubmitting = isBankSend ? posBusy : activePocketPayLinkController.submitting
  const pocketAmountHelperText = isBankReceive
    ? 'Enter the Naira amount the payer should pay.'
    : isBankSend
      ? 'Enter the Naira amount the payer will send from their bank.'
      : multiChainMode
        ? 'USDC on Base, Arc Testnet, Solana, or Arbitrum — payer chooses the chain'
        : `USDC on ${selectedNet === 'arc' ? 'Arc Testnet' : CHAIN_META[selectedNet].label}`
  const pocketAddressGuidance = !isBankReceive && !isBankSend && !canGenerate && (
    multiChainMode ? !evmDirty && !solanaDirty : selectedNet === 'solana' ? !solanaDirty : !evmDirty
  )
    ? multiChainMode
      ? 'Enter at least one wallet address to continue'
      : `Enter a ${selectedNet === 'solana' ? 'Solana' : 'wallet'} address to continue`
    : undefined
  const showHowItWorks = streamMode || accessMode || polymarketMode
  const paymentTabs: Array<{ key: PaymentTab; title: string; body: string; icon: typeof UserRound; badge?: string }> = [
    { key: 'usdc', title: 'Receive USDC', body: 'Anyone pays USDC. You receive USDC in your wallet.', icon: Wallet, badge: 'No account' },
    { key: 'bank', title: 'Receive to Bank', body: 'Anyone pays Base USDC. You receive Naira in your bank account.', icon: Landmark, badge: 'Sign-in required' },
    { key: 'pos', title: 'POS', body: 'Create a static checkout QR for in-store payments.', icon: Store, badge: 'Sign-in required' },
    { key: 'bills', title: 'Bills', body: 'Pay bills and keep receipts in local currency history.', icon: Landmark, badge: 'Sign-in required' },
  ] as const
  const howItWorksSteps = productHubOpen
    ? [
        { n: '1', title: 'Open Circle Pocket', body: 'Manage wallet, x402, receipts, and service balance' },
        { n: '2', title: 'Launch services', body: 'PolyDesk and Hash Paystream run as standalone service apps' },
        { n: '3', title: 'Keep proof', body: 'Receipts, dashboards, and settlement records stay connected' },
      ]
    : polymarketMode
    ? [
        { n: '1', title: 'Open Telegram', body: 'Start Hash PayLink inside chat' },
        { n: '2', title: 'Save address', body: 'Link your Polymarket profile' },
        { n: '3', title: 'Fund and track', body: 'Add USDC and watch positions' },
      ]
    : streamMode
    ? [
        { n: '1', title: 'Sign in', body: 'Open your Circle wallet' },
        { n: '2', title: 'Start stream', body: 'Lock USDC over time' },
        { n: '3', title: 'Claim anytime', body: 'Recipient withdraws on Arc' },
      ]
    : accessMode
    ? [
        { n: '1', title: 'Wallet balance', body: 'Open or fund your Circle USDC wallet' },
        { n: '2', title: 'Activate x402', body: 'Move wallet USDC into x402 service balance' },
        { n: '3', title: 'Use services', body: 'Spend x402 service balance on paid actions' },
      ]
    : [
        { n: '1', title: 'Enter details', body: 'Your wallet address' },
        { n: '2', title: 'Enter amount', body: 'USDC' },
        { n: '3', title: 'Get paid', body: 'Anyone pays from any wallet' },
      ]

  function setPaymentTab(tab: PaymentTab) {
    if (tab === 'usdc' || tab === 'personal' || tab === 'business') {
      pushPaymentTabHistory(tab)
      setPaymentFlow('usdc')
      setReceiveMode('paste')
      openPaymentMode(false)
      setPaymentMode(tab === 'business' ? 'business' : 'personal')
      return
    }
    if (tab === 'bank') {
      pushPaymentTabHistory('bank')
      activateBankReceive()
      return
    }
    if (tab === 'bank-send') {
      openHubMode()
      return
    }
    if (tab === 'pos') {
      openPosMode(true, true)
      return
    }
    openBillsMode(true)
  }

  function PaymentFlowCards() {
    return (
      <div className="space-y-2">
        {paymentTabs.map(({ key, title, body, icon: Icon, badge }) => {
          return (
            <button
              key={key}
              type="button"
              onClick={() => setPaymentTab(key)}
              className="group flex min-h-[92px] w-full items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-200 hover:shadow-md active:scale-[0.99] dark:border-white/10 dark:bg-[#111216] dark:hover:border-white/20"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-600 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-black text-gray-950 dark:text-white">{title}</span>
                  <span className="mt-1 block text-[12px] leading-5 text-gray-500 dark:text-gray-400">{body}</span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {badge && (
                  <span className="hidden rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] font-bold text-gray-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-400 sm:inline-flex">
                    {badge}
                  </span>
                )}
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-950 text-white transition-transform group-hover:translate-x-0.5 dark:bg-white dark:text-gray-950">
                  <ChevronDown className="-rotate-90 h-4 w-4" />
                </span>
              </span>
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="mx-auto w-[calc(100vw-2rem)] max-w-lg min-w-0 animate-fade-in sm:w-[32rem]">
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className={cn(
        'mb-6 flex flex-col',
        paymentMenuOpen || posMode || billsMode || isPaymentView ? 'items-center text-center' : 'items-start text-left',
        (serviceHubAgentMounted || isBankReceive || posMode || billsMode || isPaymentView) && 'hidden',
      )}>
        {productHubOpen && !serviceHubAgentMounted && (
          <span className="mb-4 inline-flex items-center justify-center gap-2 text-sm font-bold leading-none text-[#0071E3] dark:text-blue-200">
            <PaymentHubMark className="h-7 w-7 shrink-0 text-gray-950 dark:text-white" />
            Service Hub
          </span>
        )}
        {productHubOpen && serviceHubAgentMounted && (
          <span className="mb-4 inline-flex items-center justify-center gap-2 text-sm font-bold leading-none text-[#0071E3] dark:text-blue-200">
            <AgentHashCssIcon staticPose />
            Agent Hash
          </span>
        )}
        <h1 className={cn(
          'text-gray-900 dark:text-white',
          productHubOpen && !serviceHubAgentMounted
            ? 'text-[28px] font-black leading-[1.08] tracking-[-0.035em] sm:text-[34px]'
            : 'text-3xl font-bold tracking-tight sm:text-[2.25rem]',
        )}>
          {productHubOpen ? serviceHubAgentMounted ? 'Ask Agent Hash' : 'What do you want to do today?' : paymentMenuOpen ? 'Choose payment flow' : polymarketMode ? 'PolyDesk' : posMode ? 'Retail POS' : billsMode ? 'Bills' : streamMode ? 'Hash Paystream' : accessMode ? accessView === 'wallet' ? 'x402 Wallet Manager' : 'x402 Wallet Manager' : paymentFlow === 'bank' ? 'Receive to Bank' : 'Receive USDC'}
        </h1>
        {!(productHubOpen && !serviceHubAgentMounted) && (
          <p className="mt-2 text-[15px] text-gray-500 text-balance dark:text-gray-400">
            {productHubOpen
              ? 'Your Hash PayLink assistant, powered by ZeroScout intelligence.'
              : paymentMenuOpen
            ? 'Select the payment experience you want to create.'
            : polymarketMode
            ? 'Fund, track, and scout Polymarket from one desk.'
            : posMode
            ? 'Choose a country, select settlement, and create one static QR.'
            : billsMode
            ? 'Utility bill payment will live here when it is ready.'
            : streamMode
              ? 'Stream USDC for payroll, creator access, agent services, and Arena games.'
              : accessMode
                ? accessView === 'wallet'
                  ? 'Check Circle wallet balance, activate x402 service balance, and view paid service access.'
                  : 'Fund your Circle wallet, activate x402 service balance, then use paid services.'
                : paymentFlow === 'bank'
                  ? 'Create a Naira payout link. Payer pays Base USDC.'
                  : paymentFlow === 'bank-send'
                    ? 'Create a bank-to-USDC funding link. Payer sends Naira, recipient receives USDC.'
                    : 'Create a secure USDC PayLink in seconds.'}
          </p>
        )}

        {/* ── Chain preview toggle — hidden in multi-chain mode (all chains active) */}
        {false && !productHubOpen && !paymentMenuOpen && !isBankReceive && !multiChainMode && !accessMode && !posMode && !billsMode && !streamMode && !polymarketMode && <div className="mt-5 flex w-full flex-col items-center gap-2.5">
          <div className="mx-auto flex w-[17.5rem] max-w-full items-center justify-start gap-0.5 overflow-x-auto rounded-xl border border-gray-200 bg-gray-100/80 p-1 [scrollbar-width:none] dark:border-white/10 dark:bg-white/[0.05] [&::-webkit-scrollbar]:hidden sm:inline-flex sm:w-auto sm:justify-center sm:gap-1">
            {VISIBLE_CREATE_CHAINS.map((c) => {
              const m = CHAIN_META[c]
              const isActive = selectedNet === c
              return (
                <button
                  key={c}
                  onClick={() => onNetworkSelect(c)}
                  className={cn(
                    'flex shrink-0 items-center gap-1 sm:gap-1.5 rounded-lg px-1.5 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-semibold transition-all duration-150',
                    isActive ? m.toggleActive : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200',
                  )}
                >
                  <span className={cn(
                    'h-1.5 w-1.5 rounded-full transition-colors',
                    isActive ? 'bg-white/80' : m.dotColor,
                  )} />
                  <span>{m.label}</span>
                  {c === 'arc' && (
                    <span className={cn(
                      'rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase leading-none',
                      isActive ? 'bg-white/20 text-white' : 'bg-cyan-100 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-200',
                    )}>
                      Testnet
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {(() => {
            const m = CHAIN_META[selectedNet]
            return (
              <span className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-all duration-200 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-300',
                m.badgeBg, m.badgeText, m.badgeBorder,
              )}>
                <span className={cn('h-1.5 w-1.5 rounded-full', m.dotColor)} />
                {m.engineLabel}
              </span>
            )
          })()}
        </div>}

        {/* Multi-chain mode active badge */}
        {false && !productHubOpen && !paymentMenuOpen && !isBankReceive && multiChainMode && !accessMode && !posMode && !billsMode && !streamMode && !polymarketMode && (
          <div className="mt-5 flex w-full justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-700 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200">
              <Globe className="h-3 w-3" />
              Multi-Chain · All networks active
            </span>
          </div>
        )}
      </div>
      {/* ── Form card ─────────────────────────────────────────────────── */}
      <div
        className={cn(
          'w-full min-w-0',
          productHubOpen || paymentMenuOpen
            ? 'space-y-2'
            : 'overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card dark:border-white/10 dark:bg-[#111114]',
        )}
        style={{
          overflowX: 'hidden',
          overflowY: productHubOpen && serviceHubAgentMounted ? 'clip' : 'visible',
        }}
      >
        {productHubOpen ? (
          serviceHubAgentMounted ? (
            <div
              className={cn(
                'overflow-hidden border border-gray-200 bg-white shadow-card transition-all duration-200 ease-out dark:border-white/10 dark:bg-[#111114]',
                serviceHubAgentViewport ? 'fixed z-40 flex flex-col rounded-none' : 'rounded-[28px]',
              )}
              style={serviceHubAgentViewport
                ? {
                    top: serviceHubAgentViewport.top,
                    left: serviceHubAgentViewport.left,
                    width: serviceHubAgentViewport.width,
                    height: serviceHubAgentViewport.height,
                    opacity: 1,
                    transform: 'none',
                  }
                : {
                    opacity: serviceHubAgentVisible ? 1 : 0,
                    transform: serviceHubAgentVisible
                      ? 'perspective(1200px) rotateX(0deg) translateY(0) scale(1)'
                      : 'perspective(1200px) rotateX(-6deg) translateY(0) scale(0.985)',
                    transformOrigin: 'bottom center',
                  }}
            >
              <div className="flex items-center justify-between gap-3 px-3 py-3 sm:px-4">
                <FlowBackButton onClick={closeServiceHubAgent} />
                <div className="min-w-0">
                  <div className="min-w-0 text-right">
                    <p className="truncate text-sm font-bold text-gray-950 dark:text-white">Agent Hash</p>
                    <p className="text-[11px] font-medium text-gray-400">ZeroScout intelligence</p>
                  </div>
                </div>
              </div>
              <TelegramHelperPanel
                telegramName={localCurrencyProfile?.firstName || 'there'}
                ownerKey={privyEmail || evmAddr.trim() || serviceHubAnonymousOwner}
                telegramId=""
                fallbackOwner={privyEmail || evmAddr.trim() || serviceHubAnonymousOwner}
                initialEventId=""
                initialPayer={localCurrencyProfile?.firstName || ''}
                onRecoverTelegramName={() => undefined}
                onBack={closeServiceHubAgent}
                welcomeText="Welcome to Agent Hash. Ask about payments, wallets, Hash Paystream, PolyDesk, research, planning, or any Hash PayLink service."
                inputPlaceholder="Ask Agent Hash..."
                hideTopDivider
                fillAvailableHeight={Boolean(serviceHubAgentViewport)}
                onComposerFocusChange={setServiceHubAgentComposerActive}
              />
            </div>
          ) : (
          <div className="space-y-2">
            {[
              { icon: Wallet, title: 'Circle Pocket Wallet', body: 'Manage wallets, x402, receiving, bank payout, POS, bills, and receipts.', action: openStandaloneCirclePocket },
              { icon: Radio, title: 'Hash Paystream', body: 'Open the standalone Arc streaming app for payroll, creators, and Arena.', action: () => openStreamMode() },
              { icon: PolymarketMark, title: 'PolyDesk', body: 'Open standalone Polymarket funding, portfolio, World Cup, and LP Scout.', action: () => openPolymarketMode() },
            ].map(({ icon: Icon, title, body, action }) => (
              <button
                key={title}
                type="button"
                onClick={action}
                className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-200 hover:shadow-md active:scale-[0.99] dark:border-white/10 dark:bg-[#111216] dark:hover:border-white/20"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-600 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-black text-gray-950 dark:text-white">{title}</span>
                    <span className="mt-1 block text-[12px] leading-5 text-gray-500 dark:text-gray-400">{body}</span>
                  </span>
                </span>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-950 text-white transition-transform group-hover:translate-x-0.5 dark:bg-white dark:text-gray-950">
                  <ChevronDown className="-rotate-90 h-4 w-4" />
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={openServiceHubAgent}
              className="group mt-4 w-full rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-card transition-all hover:border-gray-200 hover:shadow-lg active:scale-[0.995] dark:border-white/10 dark:bg-[#111114] dark:hover:bg-[#15151a]"
            >
              <div className="flex items-start gap-3">
                <div className="flex shrink-0 items-start pt-0.5 text-gray-700 dark:text-gray-300">
                  <AgentHashCssIcon header />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Agent Hash</p>
                      <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-white">
                        Hello there
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
                      key={serviceHubAgentPromptIndex}
                      className="telegram-agent-typewriter text-sm font-semibold leading-relaxed text-gray-800 dark:text-gray-100"
                    >
                      {AGENT_HASH_HEADER_PROMPTS[serviceHubAgentPromptIndex]?.text}
                    </p>
                  </div>
                </div>
              </div>
            </button>
          </div>
          )
        ) : paymentMenuOpen ? (
          <PaymentFlowCards />
        ) : (
          <>
        <div className="space-y-0 p-0">
          {polymarketMode ? (
            <div className="space-y-5 p-4 sm:p-5">
                <FlowBackButton onClick={closePolymarketMode} />

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Polymarket tools</p>
                <h2 className="mt-1 text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">Choose a PolyDesk flow</h2>
                <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                  Fund markets, watch positions, and scout opportunities.
                </p>
              </div>

              <div>
                {(() => {
                  const flows = [
                    {
                      icon: Wallet,
                      title: 'Fund Polymarket',
                      body: 'Add USDC and check funding status.',
                      accent: 'text-blue-100',
                      bg: 'from-gray-950 via-blue-950 to-gray-900',
                    },
                    {
                      icon: Activity,
                      title: 'Positions',
                      body: 'Watch positions, claims, and alerts.',
                      accent: 'text-cyan-200',
                      bg: 'from-blue-700 via-gray-950 to-gray-900',
                    },
                    {
                      icon: Bot,
                      title: 'LP Scout',
                      body: 'Check depth, rewards, and risk.',
                      accent: 'text-emerald-300',
                      bg: 'from-gray-950 via-gray-900 to-gray-800',
                    },
                  ]
                  const flow = flows[polymarketSpotlightIndex % flows.length]
                  const Icon = flow.icon
                  return (
                    <a
                      key={flow.title}
                      href={telegramStartUrl('polymarket')}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(
                        'group relative block min-h-[178px] overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br p-5 text-left text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
                        flow.bg,
                      )}
                    >
                      <div key={flow.title} className="stream-card-slide flex min-h-[138px] flex-col justify-between gap-6">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 gap-3">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white">
                              <Icon className="h-5 w-5" />
                            </span>
                            <span className="min-w-0">
                              <p className={cn('text-[10px] font-bold uppercase tracking-[0.16em]', flow.accent)}>Live</p>
                              <p className="mt-2 text-xl font-black tracking-tight">{flow.title}</p>
                              <p className="mt-2 max-w-[280px] text-[13px] leading-relaxed text-white/70">
                                {flow.body}
                              </p>
                            </span>
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-gray-950">
                            Open <ArrowRight className="h-3 w-3" />
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {flows.map((item, index) => (
                            <span
                              key={item.title}
                              className={cn(
                                'h-1.5 rounded-full transition-all',
                                index === polymarketSpotlightIndex % flows.length ? 'w-6 bg-white' : 'w-1.5 bg-white/35',
                              )}
                            />
                          ))}
                        </div>
                      </div>
                    </a>
                  )
                })()}
              </div>
            </div>
          ) : streamMode ? (
            <div className="space-y-5 p-4 sm:p-5">
              <FlowBackButton onClick={closeStreamMode} />

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">USDC on Arc</p>
                <h2 className="mt-1 text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">Choose a Hash Paystream flow</h2>
                <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                  Creator Studio, Arena rooms, payroll, and agent streams share the same Arc USDC settlement layer.
                </p>
              </div>

              <div className="space-y-3">
                {(() => {
                  const flows = [
                    {
                      title: 'Payroll',
                      body: 'Create Arc USDC streams for payroll and scheduled payouts.',
                      to: '/stream',
                      accent: 'text-cyan-200',
                      bg: 'from-gray-950 via-blue-950 to-gray-900',
                    },
                    {
                      title: 'Creator Studio',
                      body: 'Gate articles or private links and earn USDC by the second while readers consume.',
                      to: '/creator?app=streampay',
                      accent: 'text-blue-100',
                      bg: 'from-blue-600 via-blue-900 to-gray-950',
                    },
                    {
                      title: 'Arena',
                      body: 'Private USDC trivia rooms on Arc. Per-room escrow, claimable unstreamed deposits.',
                      to: '/arena?app=streampay&game=trivia',
                      accent: 'text-emerald-300',
                      bg: 'from-gray-950 via-gray-900 to-gray-800',
                    },
                  ]
                  const flow = flows[streamSpotlightIndex % flows.length]
                  return (
                    <Link
                      key={flow.title}
                      to={flow.to}
                      className={cn(
                        'group relative block min-h-[178px] overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br p-5 text-left text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
                        flow.bg,
                      )}
                    >
                      <div key={flow.title} className="stream-card-slide flex min-h-[138px] flex-col justify-between gap-6">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className={cn('text-[10px] font-bold uppercase tracking-[0.16em]', flow.accent)}>Live</p>
                            <p className="mt-2 text-xl font-black tracking-tight">{flow.title}</p>
                            <p className="mt-2 max-w-[310px] text-[13px] leading-relaxed text-white/70">
                              {flow.body}
                            </p>
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-gray-950">
                            Open <ArrowRight className="h-3 w-3" />
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {flows.map((item, index) => (
                            <span
                              key={item.title}
                              className={cn(
                                'h-1.5 rounded-full transition-all',
                                index === streamSpotlightIndex % flows.length ? 'w-6 bg-white' : 'w-1.5 bg-white/35',
                              )}
                            />
                          ))}
                        </div>
                      </div>
                    </Link>
                  )
                })()}
              </div>

              <p className="text-center text-[11px] text-gray-400">
                Same Hash PayLink infrastructure. Hash Paystream flows settle on Arc and can attach receipts, dashboards, and 0G records.
              </p>
            </div>
          ) : posMode ? (
            <PocketPosShell
              standalone={false}
              backButton={<FlowBackButton onClick={handlePosBack} />}
            >
              {privyAuthenticated && (
                <LocalCurrencyProfileCard
                  profile={localCurrencyProfile}
                  draft={localCurrencyProfileDraft}
                  email={privyEmail}
                  busy={localCurrencyProfileBusy}
                  error={localCurrencyProfileError}
                  editing={localCurrencyProfileEditing}
                  bankAccountName={posBankAccountName}
                  onDraftChange={setLocalCurrencyProfileDraft}
                  onSave={saveLocalCurrencyProfile}
                  onEdit={editLocalCurrencyProfile}
                  onCancel={cancelLocalCurrencyProfileEdit}
                />
              )}

              {!posCountry ? (
                <PocketPosCountryPanel
                  controller={pocketPosController}
                  countries={POS_COUNTRIES}
                  profileReady={Boolean(privyAuthenticated && localCurrencyProfileReady)}
                />
              ) : !posMerchant ? (
                <PocketPosSetupPanel
                  controller={pocketPosController}
                  networkOptions={posNetworkOptions}
                  instantBankPayout={posIsPaycrestFlow}
                  bankInstitutions={posBankInstitutions}
                  bankInstitutionsBusy={posBankInstitutionsBusy}
                  bankCode={posBankCode}
                  bankAccount={posBankAccount}
                  bankAccountName={posBankAccountName}
                  bankVerified={posBankVerified}
                  bankVerifyBusy={posBankVerifyBusy}
                  error={posError}
                />
              ) : (
                <PocketPosReadyPanel
                  customerUrl={posCustomerUrl}
                  dashboardUrl={posDashboardUrl}
                  displayName={posMerchant.display_name}
                  walletAddress={posMerchant.circle_smart_wallet_address}
                  copied={posCopied}
                  onCopy={copyPosCustomerLink}
                />
              )}

              {!privyAuthenticated && (
                <PocketPosSignInCard />
              )}
            </PocketPosShell>
          ) : billsMode ? (
            <>
            <div className="min-h-[590px] space-y-5 p-4 sm:min-h-[640px] sm:p-5">
              <div className="relative flex min-h-8 items-center">
                <FlowBackButton onClick={() => goBackOr(() => openPaymentMenu(false))} />
                <div className="pointer-events-none absolute left-1/2 max-w-[48%] -translate-x-1/2 text-center">
                  <p className="truncate text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Bills</p>
                </div>
              </div>
              {!privyAuthenticated && (
                <LocalCurrencySignInGate
                  title="Sign in for bills history"
                  body="Bills need an account so receipts, reversals, and support records stay attached to you."
                />
              )}
              {privyAuthenticated && (
                <LocalCurrencyProfileCard
                  profile={localCurrencyProfile}
                  draft={localCurrencyProfileDraft}
                  email={privyEmail}
                  busy={localCurrencyProfileBusy}
                  error={localCurrencyProfileError}
                  editing={localCurrencyProfileEditing}
                  onDraftChange={setLocalCurrencyProfileDraft}
                  onSave={saveLocalCurrencyProfile}
                  onEdit={editLocalCurrencyProfile}
                  onCancel={cancelLocalCurrencyProfileEdit}
                />
              )}
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5 text-center dark:border-white/10 dark:bg-white/[0.04]">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-700 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200">
                  <Landmark className="h-5 w-5" />
                </span>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-gray-400">Local Currency</p>
                <h2 className="mt-1 text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">Bills history is coming here</h2>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                  Bill payments will share the same signed-in local currency dashboard as bank payouts and POS receipts.
                </p>
              </div>
            </div>
            </>
          ) : accessMode ? (
            <div className="space-y-5 p-4 sm:p-5">
              <FlowBackButton onClick={closeAccessMode} />
              <AgentWorkspace embedded forceProfile />
            </div>
          ) : (
            <>
          <div className={cn(
            'overflow-hidden',
            isBankReceive ? 'bg-transparent' : 'bg-gray-50/60 dark:bg-white/[0.035]',
          )}>
            <div className="min-h-[590px] space-y-3.5 px-3.5 py-3 sm:min-h-[640px] sm:p-4">
              <div className="relative flex min-h-8 items-center">
                <FlowBackButton onClick={() => goBackOr(() => openPaymentMenu(false))} />
                <div className="pointer-events-none absolute left-1/2 max-w-[48%] -translate-x-1/2 text-center">
                  <p className="truncate text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                    {isBankReceive ? 'Bank payout' : 'Receive USDC'}
                  </p>
                </div>
              </div>

          {!accessMode && !multiChainMode && (
            <CircleReceiveSelector
              selectedNet={selectedNet}
              isEvmNet={isEvmNet}
              receiveMode={receiveMode}
              setReceiveMode={setReceiveMode}
              evmAddr={evmAddr}
              solanaAddr={solanaAddr}
              evmValid={evmValid}
              solanaValid={solanaValid}
              canReceiveWithEmail={canReceiveWithEmail}
              setEvmAddr={setEvmAddr}
              setSolanaAddr={setSolanaAddr}
              setGeneratedLink={setGeneratedLink}
              bankCountry={posCountry}
              bankInstitutions={posBankInstitutions}
              bankInstitutionsBusy={posBankInstitutionsBusy}
              bankCode={posBankCode}
              bankName={posBankName}
              bankAccount={posBankAccount}
              bankAccountName={posBankAccountName}
              bankVerified={posBankVerified}
              bankVerifyBusy={posBankVerifyBusy}
              bankError={posError}
              bankActions={pocketBankReceiveController.actions}
              hideLabel
              selectorLabel={isBankSend ? 'USDC destination' : undefined}
              addressOptionLabel={isBankSend ? 'Receive with address' : undefined}
              addressOptionBody={isBankSend ? 'Send USDC to any EVM wallet you control.' : undefined}
            />
          )}

          {(isBankReceive || isBankSend) && privyAuthenticated && (
            <LocalCurrencyProfileCard
              profile={localCurrencyProfile}
              draft={localCurrencyProfileDraft}
              email={privyEmail}
              busy={localCurrencyProfileBusy}
              error={localCurrencyProfileError}
              editing={localCurrencyProfileEditing}
              bankAccountName={isBankReceive ? posBankAccountName : undefined}
              title={isBankSend ? 'Your funding profile' : undefined}
              body={isBankSend ? 'Used for bank transfer receipts, refund context, and support records.' : undefined}
              savedFallback={isBankSend ? 'Funding profile' : undefined}
              saveLabel={isBankSend ? 'Save funding profile' : undefined}
              onDraftChange={setLocalCurrencyProfileDraft}
              onSave={saveLocalCurrencyProfile}
              onEdit={editLocalCurrencyProfile}
              onCancel={cancelLocalCurrencyProfileEdit}
            />
          )}

          {/* ── EVM Address — Base / HashKey / Arc ───────────────────── */}
          {isBankSend && (
            <div className="space-y-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Settlement network</p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  Payer sends Naira by bank transfer. The recipient receives USDC after confirmation.
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Recipient network</p>
                    <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">Bank send supports Base USDC first. Polygon is reserved for the PolyDesk bridge rollout.</p>
                  </div>
                  <div className="relative shrink-0">
                    <select
                      value={bankSendNetwork}
                      onChange={(event) => {
                        setBankSendNetwork(event.target.value as BankSendNetwork)
                        setGeneratedLink('')
                      }}
                      className="min-w-[118px] appearance-none rounded-xl border border-gray-900 bg-gray-950 px-3 py-2 pr-8 text-xs font-bold text-white outline-none transition-all dark:border-white dark:bg-white dark:text-gray-950"
                    >
                      {PAYCREST_ONRAMP_NETWORK_OPTIONS.map((network) => (
                        <option key={network.key} value={network.key}>
                          {network.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/70 dark:text-gray-500" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {isBankSend && !privyAuthenticated && (
            <LocalCurrencySignInGate
              title="Sign in for bank-to-USDC links"
              body="Bank transfer funding needs an account before setup so receipts, refunds, and support records stay attached."
            />
          )}

          {!accessMode && (
            <PocketPayerNetworkPanel
              showSelector={!isBankReceive && !isBankSend}
              selectedNetwork={selectedNet}
              selectedNetworkLabel={CHAIN_META[selectedNet].label}
              options={VISIBLE_CREATE_CHAINS.map(network => ({
                value: network,
                label: `${CHAIN_META[network].label}${network === 'arc' ? ' Testnet' : ''}`,
              }))}
              multiChain={multiChainMode}
              emailReceive={receiveMode === 'email'}
              onNetworkSelect={pocketUsdcController.actions.selectNetwork}
              onMultiChainToggle={() => {
                if (receiveMode !== 'email') pocketUsdcController.actions.toggleMultiChain(!multiChainMode)
              }}
            />
          )}

          <PocketRecipientAddressFields
            showEvm={(isEvmNet || multiChainMode) && !isBankReceive && (multiChainMode || receiveMode === 'paste')}
            showSolana={(selectedNet === 'solana' || multiChainMode) && !isBankReceive && !isBankSend && (multiChainMode || receiveMode === 'paste')}
            bankSend={isBankSend}
            multiChain={multiChainMode}
            selectedNetwork={selectedNet}
            receiveMode={receiveMode}
            evm={{
              address: evmAddr,
              dirty: evmDirty,
              valid: evmValid,
              connectedAddress: connectedEvm,
              onChange: pocketUsdcController.actions.setEvmRecipientAddress,
              onDisconnect: disconnectConnectedEvmRecipient,
            }}
            solana={{
              address: solanaAddr,
              dirty: solanaDirty,
              valid: solanaValid,
              connectedAddress: connectedSolana,
              onChange: pocketUsdcController.actions.setSolanaRecipientAddress,
              onDisconnect: disconnectConnectedSolanaRecipient,
            }}
          />

          <PocketPaymentAmountField
            lane={activePocketPayLinkLane}
            flexible={flexAmount}
            amount={amt}
            dirty={amtDirty}
            valid={isValidAmt}
            helperText={pocketAmountHelperText}
            onAmountChange={(value) => {
              setAmt(normalizeAmountInput(value))
              setGeneratedLink('')
            }}
          />

          {/* ── Payment note ──────────────────────────────────────────── */}
          {isBankReceive && (
            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Payer network</p>
                  <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">Bank receive supports Base USDC only for now.</p>
                </div>
                <button
                  type="button"
                  className="inline-flex shrink-0 cursor-default items-center gap-1.5 rounded-xl border border-gray-900 bg-gray-950 px-3 py-2 text-xs font-bold text-white dark:border-white dark:bg-white dark:text-gray-950"
                  aria-label="Selected payer network"
                >
                  Base
                </button>
              </div>
            </div>
          )}

          {isBankSend && (
            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Payer method</p>
                  <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
                    Checkout will show Nigerian bank transfer instructions.
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex shrink-0 cursor-default items-center gap-1.5 rounded-xl border border-gray-900 bg-gray-950 px-3 py-2 text-xs font-bold text-white dark:border-white dark:bg-white dark:text-gray-950"
                  aria-label="Selected payer method"
                >
                  NGN Bank
                </button>
              </div>
            </div>
          )}

          <PocketPaymentNoteField
            value={memo}
            onChange={(value) => {
              setMemo(value)
              setGeneratedLink('')
            }}
          />

          {/* ── Agent URL (Access mode only) ─────────────────────────── */}
          {accessMode && (
            <fieldset className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Bot className="h-3.5 w-3.5 text-gray-400" />
                Agent URL
              </label>
              <div className="relative">
                <input
                  type="url"
                  placeholder="https://youragent.com/chat"
                  value={agentUrl}
                  onChange={(e) => { setAgentUrl(e.target.value.trim()); setAgentUrlStatus('idle'); setGeneratedLink('') }}
                  onBlur={() => { if (agentUrl) checkAgentUrl() }}
                  spellCheck={false}
                  autoComplete="off"
                  className={cn(
                    'w-full rounded-xl border bg-gray-50/60 px-4 py-3 text-sm',
                    'placeholder:text-gray-400 transition-all focus:bg-white focus:outline-none focus:ring-2',
                    agentUrlStatus === 'ok'           ? 'border-emerald-300 focus:ring-emerald-100'
                    : agentUrlStatus === 'incompatible' ? 'border-red-300 focus:ring-red-100'
                    : 'border-gray-200 focus:border-[#0071E3]/40 focus:ring-[#0071E3]/15',
                  )}
                />
                {agentUrlStatus === 'checking'     && <Loader2    className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />}
                {agentUrlStatus === 'ok'           && <CheckCheck className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />}
                {agentUrlStatus === 'incompatible' && <XCircle    className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-400" />}
              </div>
              {agentUrlStatus === 'ok' && (
                <p className="flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCheck className="h-3 w-3" /> Compatible — your service returns a JSON response
                </p>
              )}
              {agentUrlStatus === 'incompatible' && (
                <p className="flex items-center gap-1 text-xs text-red-500">
                  <Info className="h-3 w-3" /> Not compatible — integrate the verification API first.{' '}
                  <Link to="/docs/access-mode/api" className="underline">See guide →</Link>
                </p>
              )}
              {agentUrlStatus === 'idle' && agentUrl && (
                <p className="text-[11px] text-gray-400">Click outside to check compatibility</p>
              )}
              {!agentUrl && (
                <p className="text-[11px] text-gray-400">
                  Your service must handle <span className="font-mono">?eventId=</span> and <span className="font-mono">?payer=</span> params.{' '}
                  <Link to="/docs/access-mode" className="text-gray-500 hover:underline">How to integrate →</Link>
                </p>
              )}
            </fieldset>
          )}

          {/* ── Access mode: multi-payer always on notice ─────────────── */}
          {accessMode && (
            <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gray-900 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950">
                <ScanLine className="h-3.5 w-3.5" />
              </span>
              <p className="text-xs leading-snug text-gray-500 dark:text-gray-400">
                <span className="font-semibold text-gray-800 dark:text-gray-100">Multi-payer collection is always on</span> in Access mode. Each payer's name is logged and archived to 0G.
              </p>
            </div>
          )}

          {/* ── FX Display Settings (event or access mode) ────────────── */}
          {false && (
            <div className={cn(
              'rounded-xl border p-3 space-y-3 transition-all',
              fxShow
                ? 'border-gray-300 bg-white shadow-sm dark:border-white/15 dark:bg-white/[0.05]'
                : 'border-gray-200 bg-gray-50/50 dark:border-white/10 dark:bg-white/[0.03]',
            )}>
              {/* Header row with toggle */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-all',
                    fxShow
                      ? 'border-gray-900 bg-gray-950 text-white dark:border-white/20 dark:bg-gray-900 dark:text-white'
                      : 'border-gray-200 bg-white text-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-500',
                  )}>
                    <DollarSign className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-tight text-gray-800 dark:text-gray-100">Local Currency Display</span>
                    <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">Optional</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setFxShow(v => !v)}
                  aria-pressed={fxShow}
                  className={cn(
                    'relative h-6 w-10 shrink-0 rounded-full p-0.5 transition-all focus:outline-none focus:ring-2 focus:ring-gray-900/10 dark:focus:ring-white/20 sm:h-7 sm:w-12',
                    fxShow ? 'bg-gray-950 shadow-inner dark:bg-white' : 'bg-gray-200 dark:bg-white/10',
                  )}
                >
                  <span className={cn(
                    'block h-5 w-5 rounded-full bg-white shadow-sm transition-transform dark:bg-gray-950 sm:h-6 sm:w-6',
                    fxShow ? 'translate-x-4 sm:translate-x-5' : 'translate-x-0',
                  )} />
                </button>
              </div>

              {/* Settings — only when toggled on */}
              {fxShow && (
                <div className="space-y-3 border-t border-gray-100 pt-3 dark:border-white/10">
                  {/* Currency picker */}
                  <div className="grid gap-1.5 sm:grid-cols-[76px_minmax(0,1fr)] sm:items-center sm:gap-3">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">Currency</label>
                    <select
                      value={fxCurrency}
                      onChange={e => { setFxCurrency(e.target.value); setFxPreviewRate(null) }}
                      className="min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 outline-none transition-all focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100 dark:focus:border-white dark:focus:ring-white/10"
                    >
                      {FX_CURRENCIES.map(c => (
                        <option key={c.code} value={c.code}>
                          {c.symbol} {c.name} ({c.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Rate source toggle */}
                  <div className="grid gap-1.5 sm:grid-cols-[76px_minmax(0,1fr)] sm:items-center sm:gap-3">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">Rate</label>
                    <div className="grid grid-cols-2 rounded-lg border border-gray-200 bg-gray-50 p-1 text-xs font-semibold dark:border-white/10 dark:bg-white/[0.04]">
                      <button
                        type="button"
                        onClick={() => setFxSrc('live')}
                        className={cn(
                          'min-w-0 rounded-md px-2 py-2 text-center transition-all',
                          fxSrc === 'live'
                            ? 'bg-gray-950 text-white shadow-sm dark:bg-gray-900 dark:text-white'
                            : 'text-gray-500 hover:bg-white/70 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200',
                        )}
                      >Live (Fixer.io)</button>
                      <button
                        type="button"
                        onClick={() => setFxSrc('custom')}
                        className={cn(
                          'min-w-0 rounded-md px-2 py-2 text-center transition-all',
                          fxSrc === 'custom'
                            ? 'bg-gray-950 text-white shadow-sm dark:bg-gray-900 dark:text-white'
                            : 'text-gray-500 hover:bg-white/70 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200',
                        )}
                      >Custom / Street</button>
                    </div>
                  </div>

                  {/* Custom rate input */}
                  {fxSrc === 'custom' && (
                    <div className="grid gap-1.5 sm:grid-cols-[76px_minmax(0,1fr)] sm:items-center sm:gap-3">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">1 USDC</label>
                      <div className="relative min-w-0">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          placeholder={`e.g. 1780`}
                          value={fxCustomRate}
                          onChange={e => setFxCustomRate(e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 pr-14 text-sm font-medium text-gray-700 outline-none placeholder:text-gray-300 transition-all focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100 dark:focus:border-white dark:focus:ring-white/10"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-gray-400">
                          {fxCurrency}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Live preview */}
                  <div className="flex items-center justify-center gap-1.5 rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.035]">
                    {fxPreviewLoad ? (
                      <RefreshCw className="h-3 w-3 animate-spin text-gray-300" />
                    ) : fxPreviewRate ? (() => {
                        const decimals = getFxMeta(fxCurrency)?.decimals ?? 2
                        return (
                          <p className="text-center text-[11px] font-medium leading-snug text-gray-500 dark:text-gray-400">
                            {fxSrc === 'custom' ? 'Custom rate:' : 'Live rate:'}{' '}
                            1 USDC = {fxPreviewRate.toFixed(decimals > 0 ? 2 : 0)} {fxCurrency}
                            {isValidAmt && ` · ≈ ${formatLocalAmt(parseFloat(amt), fxPreviewRate, decimals)} ${fxCurrency} for ${amt} USDC`}
                          </p>
                        )
                      })() : fxSrc === 'custom' && !fxCustomRate ? (
                      <p className="text-center text-[11px] font-medium leading-snug text-gray-400">Enter your street / parallel market rate above</p>
                    ) : null}
                  </div>
                  {fxSrc === 'custom' && (
                    <p className="px-2 text-center text-[10px] leading-relaxed text-gray-400 dark:text-gray-500">
                      Custom rate is baked into the link. Regenerate if the rate shifts significantly.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Payer network toggle ──────────────────────────────────── */}
          {false && false && <button
            type="button"
            onClick={() => toggleMultiChainMode(!multiChainMode)}
            className={cn(
              'w-full rounded-xl border p-3 text-left transition-all',
              multiChainMode
                ? 'border-gray-300 bg-white shadow-sm dark:border-white/15 dark:bg-white/[0.05]'
                : 'border-gray-200 bg-white hover:border-gray-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20',
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-all',
                  multiChainMode
                    ? 'border-gray-900 bg-gray-950 text-white dark:border-white/20 dark:bg-gray-900 dark:text-white'
                    : 'border-gray-200 bg-white text-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-500',
                )}>
                  <Globe className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold leading-tight text-gray-800 dark:text-gray-100">Let payer choose network</span>
                    <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-gray-500 dark:bg-white/10 dark:text-gray-400">New</span>
                  </span>
                  <span className="block text-[11px] font-medium leading-snug text-gray-400 dark:text-gray-500">Add addresses per network.</span>
                </span>
              </div>
              <span className={cn(
                'relative h-6 w-10 shrink-0 rounded-full p-0.5 transition-all sm:h-7 sm:w-12',
                multiChainMode ? 'bg-gray-950 shadow-inner dark:bg-white' : 'bg-gray-200 dark:bg-white/10',
              )}>
                <span className={cn(
                  'block h-5 w-5 rounded-full bg-white shadow-sm transition-transform dark:bg-gray-950 sm:h-6 sm:w-6',
                  multiChainMode ? 'translate-x-4 sm:translate-x-5' : 'translate-x-0',
                )} />
              </span>
            </div>
          </button>}

          {/* ── Flexible amount toggle ────────────────────────────────── */}
          <PocketFlexibleAmountToggle
            lane={activePocketPayLinkLane}
            enabled={flexAmount}
            onToggle={() => toggleFlexAmount(!flexAmount)}
          />

          {/* ── Generate / checking button ───────────────────────────── */}
          <PocketPayLinkSubmitPanel
            lane={activePocketPayLinkLane}
            shellActive={false}
            idle={vaultStep === 'idle'}
            canSubmit={activePocketCanSubmit}
            submitting={activePocketSubmitting}
            error={isBankReceive ? posError : undefined}
            addressGuidance={pocketAddressGuidance}
            onSubmit={isBankSend ? handleGenerate : activePocketPayLinkController.submit}
          />
            </div>
          </div>
            </>
          )}
        </div>

        {/* ── Link ready panel ─────────────────────────────────────────── */}
        {linkReady && (
          <PocketPayLinkReadyPanel
            url={generatedLink}
            copied={copied}
            flexible={flexAmount}
            localCurrency={isBankReceive || isBankSend}
            amountLabel={isBankReceive || isBankSend ? formatNgnAmount(amt) : formatAmount(amt, 6)}
            networkLabel={multiChainMode ? 'Base · Arc Testnet · Arbitrum' : CHAIN_META[selectedNet].label}
            evmAddress={evmValid ? evmAddr : undefined}
            solanaAddress={solanaValid ? solanaAddr : undefined}
            memo={memo}
            eventMode={effectiveEventMode}
            accessMode={accessMode}
            dashboardUrl={effectiveEventMode ? buildDashboardLink() : buildGlobalDashboardLink()}
            qrRef={qrRef}
            qrHiResRef={qrHiResRef}
            onReset={handleReset}
            onDownloadQr={downloadQR}
            onShare={handleShare}
          />
        )}
          </>
        )}
      </div>

      {/* ── Last event dashboard recovery ────────────────────────────── */}
      {!generatedLink && !productHubOpen && !posMode && !streamMode && savedEvent && (
        <div className="mt-6 animate-fade-in">
          <div className="flex items-center justify-between gap-3">
            {/* Left — label + event info */}
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-gray-500">Last Multi-payer Collection</p>
              <p className="text-[11px] text-gray-400 truncate">
                {savedEvent.eventName} · {new Date(savedEvent.ts).toLocaleDateString()}
              </p>
            </div>

            {/* Right — three minimal actions */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Dashboard link — truncated URL style */}
              <a
                href={savedEvent.dashboardUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10px] font-medium text-gray-500 hover:text-gray-800 hover:border-gray-300 transition-all"
                title="Open organizer dashboard"
              >
                <ExternalLink className="h-3 w-3" />
                dashboard
              </a>

              {/* Copy payment link */}
              <button
                onClick={async () => {
                  await copyToClipboard(savedEvent.paymentUrl)
                  setSavedLinkCopied(true)
                  setTimeout(() => setSavedLinkCopied(false), 2000)
                }}
                className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10px] font-medium text-gray-500 hover:text-gray-800 hover:border-gray-300 transition-all"
                title="Copy payment link"
              >
                {savedLinkCopied
                  ? <><CheckCheck className="h-3 w-3 text-emerald-500" /><span className="text-emerald-600">Copied!</span></>
                  : <><Copy className="h-3 w-3" />copy</>}
              </button>

              {/* Delete */}
              <button
                onClick={() => { localStorage.removeItem('hp_last_event'); setSavedEvent(null) }}
                className="flex items-center justify-center rounded-lg border border-gray-200 bg-white p-1 text-gray-400 hover:text-red-500 hover:border-red-200 transition-all"
                title="Remove"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ── How it works ─────────────────────────────────────────────── */}
      {!generatedLink && showHowItWorks && (
        <div className="mt-10 animate-fade-in">
          <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            {productHubOpen ? 'What Hash PayLink powers' : 'How it works'}
          </p>
          <div className="grid grid-cols-3 gap-3">
            {howItWorksSteps.map(({ n, title, body }) => (
              <div key={n} className="rounded-xl border border-gray-100 bg-white p-4 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
                <div className="mx-auto mb-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600 dark:bg-white/[0.08] dark:text-gray-300">
                  {n}
                </div>
                <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">{title}</p>
                <p className="mt-0.5 text-xs text-gray-400 leading-relaxed dark:text-gray-500">{body}</p>
              </div>
            ))}
          </div>

          {/* ── Agent links ───────────────────────────────────────────── */}
          {/* ── Footer links ─────────────────────────────────────────── */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-gray-100 pt-5 dark:border-white/10">
            <a
              href="mailto:support@hashpaylink.com"
              className="flex min-w-0 items-center gap-1.5 py-1 text-xs text-gray-400 transition-colors hover:text-gray-900 dark:hover:text-gray-200"
            >
              <Mail className="h-3.5 w-3.5 shrink-0" />
              Support
            </a>
            <a
              href="https://x.com/Hash_PayLink"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 py-1 text-xs text-gray-400 transition-colors hover:text-gray-900 dark:hover:text-gray-200"
            >
              <X className="h-3.5 w-3.5 shrink-0" />
              DM us
            </a>
            <Link
              to="/docs"
              className="flex items-center gap-1.5 py-1 text-xs text-gray-400 transition-colors hover:text-gray-900 dark:hover:text-gray-200"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              Docs
            </Link>
          </div>
        </div>
      )}

      <PayLinkShareSheet
        open={shareOpen}
        url={generatedLink}
        copied={copied}
        shareText={shareMessage}
        onCopy={handleCopy}
        onClose={() => setShareOpen(false)}
      />
    </div>
  )
}
