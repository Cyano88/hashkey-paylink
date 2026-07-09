import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useOutletContext, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import type { LayoutOutletContext } from '../Layout'
import {
  useAccount,
  useDisconnect,
} from 'wagmi'
import {
  Link2,
  Copy,
  CheckCheck,
  Share2,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Activity,
  MessageCircle,
  Tag,
  Coins,
  ExternalLink,
  Info,
  XCircle,
  ShieldCheck,
  Loader2,
  Zap,
  AlertTriangle,
  Wallet,
  Mail,
  X,
  Download,
  ScanLine,
  LayoutDashboard,
  Globe,
  Sliders,
  DollarSign,
  RefreshCw,
  Bot,
  Trash2,
  LogOut,
  Radio,
  Store,
  UserRound,
  Briefcase,
  Landmark,
  Banknote,
  Pencil,
} from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import { FX_CURRENCIES, getFxMeta, formatLocalAmt, fetchFxRate } from '../lib/fx'
import { isAddress, parseUnits, type Address } from 'viem'
import { cn, truncateAddress, formatAmount, copyToClipboard } from '../lib/utils'
import { useSolana }   from '../lib/SolanaContext'
import { CHAIN_META, type ChainKey } from '../lib/chains'
import { isValidSolanaAddress } from '../lib/solanaAddress'
import { setPaylinkParam } from '../lib/paylinkParams'
import { PRIVY_AUTH_ENABLED } from '../lib/authMode'
import { EVM_CLIENTS, ERC20_BALANCE_OF_ABI } from '../lib/router'
import { canUseCircleEvmEmailWallet, connectCircleEvmEmailWallet, sendCircleEvmEmailWithdraw } from '../lib/circleEvmEmailWallet'
import { canUseCircleSolanaEmailWallet, connectCircleSolanaEmailWallet, signCircleSolanaTransaction } from '../lib/circleSolanaEmailWallet'
import { PrivyConnectButton } from '../lib/PrivyConnectButton'
import { resolvePrivyCircleLink, savePrivyCircleLink } from '../lib/privyCircleLink'
import { queryBalances, type UnifiedBalanceBreakdown } from '../lib/unifiedBalance'
import AgentWorkspace from './AgentWorkspace'
import PayLinkShareSheet from '../components/PayLinkShareSheet'

// ─── Solana address: base58, 32–44 characters ────────────────────────────────
const isValidSolanaAddr = isValidSolanaAddress

const VISIBLE_CREATE_CHAINS: ChainKey[] = ['base', 'arc', 'solana', 'arbitrum']
const TELEGRAM_AGENT_URL = import.meta.env.VITE_TELEGRAM_AGENT_URL || 'https://t.me/HashPayLinkBot'

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

function UsdcMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
      <circle cx="12" cy="12" r="7.45" stroke="currentColor" strokeWidth="1.65" />
      <path
        d="M12 6.95v10.1M14.55 9.15c-.42-.7-1.18-1.08-2.3-1.08-1.3 0-2.18.58-2.18 1.55 0 2.32 4.73 1.1 4.73 3.92 0 1.1-.94 1.9-2.45 1.9-1.28 0-2.24-.43-2.88-1.25"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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

type VaultStep = 'idle' | 'ready'
type ReceiveMode = 'email' | 'paste' | 'bank'
type PaymentMode = 'personal' | 'business'
type PaymentFlow = 'usdc' | 'bank' | 'bank-send'
type PaymentTab = PaymentMode | PaymentFlow | 'pos' | 'bills'
type PosNetwork = 'base' | 'arbitrum' | 'arc' | 'solana'
type BankSendNetwork = 'polygon' | 'base'
type CirclePocketView = 'chooser' | 'main' | 'x402'
type CirclePocketTab = 'balance' | 'fund' | 'withdraw' | 'activity'
type PosCountry = 'NG' | 'KE' | 'GH'
type PosSettlementPath = 'PAYCREST_NAIRA'
type CreateProduct = 'payment' | 'agent' | 'circle-pocket' | 'pos' | 'streampay' | 'polymarket'
type AccessView = 'overview' | 'wallet'
type LocalCurrencyProfile = {
  firstName: string
  lastName: string
  email: string
}
type CirclePocketWallet = {
  address: string
  walletId?: string
  blockchain?: string
}
type PaycrestInstitutionOption = {
  code: string
  name: string
  type?: string
}
type CirclePocketWallets = Partial<Record<PosNetwork, CirclePocketWallet>>
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

async function readApiJson<T>(res: Response, label: string): Promise<T> {
  const text = await res.text()
  let data: unknown = {}
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error(`${label} returned a non-JSON response.`)
    }
  }
  if (!res.ok) {
    const message = data && typeof data === 'object' && 'error' in data
      ? String((data as { error?: unknown }).error)
      : `${label} request failed.`
    throw new Error(message)
  }
  return data as T
}

function readableErrorMsg(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string' && err) return err
  return fallback
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

function emailFromPrivyUser(user: unknown) {
  const directEmail = (user as { email?: { address?: unknown } } | undefined)?.email?.address
  if (typeof directEmail === 'string') return directEmail

  const linkedAccounts = (user as { linkedAccounts?: unknown } | undefined)?.linkedAccounts
  if (!Array.isArray(linkedAccounts)) return ''
  for (const account of linkedAccounts) {
    const record = account as { type?: unknown; address?: unknown; email?: unknown }
    if (record.type === 'email' && typeof record.address === 'string') return record.address
    if (typeof record.email === 'string') return record.email
  }
  return ''
}

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
  setBankCountry,
  bankInstitutions,
  bankInstitutionsBusy,
  bankCode,
  setBankCode,
  bankName,
  setBankName,
  bankAccount,
  setBankAccount,
  bankAccountName,
  bankVerified,
  bankVerifyBusy,
  bankError,
  verifyBankAccount,
  selectorLabel,
  addressOptionLabel,
  addressOptionBody,
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
  setBankCountry: Dispatch<SetStateAction<PosCountry | null>>
  bankInstitutions: PaycrestInstitutionOption[]
  bankInstitutionsBusy: boolean
  bankCode: string
  setBankCode: Dispatch<SetStateAction<string>>
  bankName: string
  setBankName: Dispatch<SetStateAction<string>>
  bankAccount: string
  setBankAccount: Dispatch<SetStateAction<string>>
  bankAccountName: string
  bankVerified: boolean
  bankVerifyBusy: boolean
  bankError: string
  verifyBankAccount: () => void
  selectorLabel?: string
  addressOptionLabel?: string
  addressOptionBody?: string
}) {
  const circleEmailReceiveIntentKey = 'hashpaylink-circle-email-receive-intent'
  const { authenticated: privyAuthenticated, user: privyUser, logout: logoutPrivy, getAccessToken } = usePrivy()
  const privyEmail = emailFromPrivyUser(privyUser).trim().toLowerCase()
  const [circleRecipientPending, setCircleRecipientPending] = useState(false)
  const [circleRecipientError, setCircleRecipientError] = useState<string | null>(null)
  const [circleWalletBalance, setCircleWalletBalance] = useState('Balance --')
  const circleRecipientRunKey = useRef('')

  async function handleEmailRecipient() {
    if (!canReceiveWithEmail) {
      setReceiveMode('email')
      setGeneratedLink('')
      setCircleRecipientError('Circle Pocket receiving is not configured for this network. Paste a wallet address instead.')
      return
    }

    if (!privyAuthenticated) {
      setCircleRecipientError('Sign in with Privy first, then continue receiving with email.')
      return
    }

    setReceiveMode('email')
    setGeneratedLink('')
    setCircleRecipientError(null)

    if (!privyEmail) {
      setCircleRecipientError('Sign in with email to receive with Circle Pocket for this network.')
      return
    }

    const runKey = `${selectedNet}:${privyEmail}`
    circleRecipientRunKey.current = runKey
    setCircleRecipientPending(true)
    try {
      if (selectedNet === 'solana') {
        const token = await getAccessToken()
        if (!token) throw new Error('Email session is not ready. Sign in again and retry.')

        const existing = await resolvePrivyCircleLink({ accessToken: token, chain: 'solana' })
        if (circleRecipientRunKey.current !== runKey) return
        if (existing.link?.circleWalletAddress) {
          setSolanaAddr(existing.link.circleWalletAddress)
          setCircleRecipientError(null)
          return
        }

        const session = await connectCircleSolanaEmailWallet(privyEmail)
        if (circleRecipientRunKey.current !== runKey) return
        setSolanaAddr(session.wallet.address)
        await savePrivyCircleLink({
          accessToken: token,
          chain: 'solana',
          email: privyEmail,
          wallet: {
            id: session.wallet.id,
            address: session.wallet.address,
            blockchain: session.wallet.blockchain,
          },
        })
        setCircleRecipientError(null)
        return
      }

      const chain = selectedNet as Extract<ChainKey, 'base' | 'arbitrum' | 'arc'>
      const token = await getAccessToken()
      if (!token) throw new Error('Email session is not ready. Sign in again and retry.')

      const existing = await resolvePrivyCircleLink({ accessToken: token, chain })
      if (circleRecipientRunKey.current !== runKey) return
      if (existing.link?.circleWalletAddress) {
        setEvmAddr(existing.link.circleWalletAddress)
        setCircleRecipientError(null)
        return
      }

      const session = await connectCircleEvmEmailWallet(privyEmail, chain)
      if (circleRecipientRunKey.current !== runKey) return
      setEvmAddr(session.wallet.address)
      await savePrivyCircleLink({
        accessToken: token,
        chain,
        email: privyEmail,
        wallet: {
          id: session.wallet.id,
          address: session.wallet.address as Address,
          blockchain: session.wallet.blockchain,
        },
      })
      setCircleRecipientError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Circle smart wallet setup failed.'
      const receiveMessage = message === 'Payment cancelled.' ? 'Payment request cancelled.' : message
      setCircleRecipientError(receiveMessage)
    } finally {
      if (circleRecipientRunKey.current === runKey) setCircleRecipientPending(false)
    }
  }

  useEffect(() => {
    if (!privyAuthenticated || !privyEmail) return
    let pending = ''
    try { pending = window.sessionStorage.getItem(circleEmailReceiveIntentKey) || '' } catch {}
    if (!pending) return
    try { window.sessionStorage.removeItem(circleEmailReceiveIntentKey) } catch {}
    if (!canReceiveWithEmail) return
    setReceiveMode('email')
    setGeneratedLink('')
    setCircleRecipientError(null)
  }, [privyAuthenticated, privyEmail, canReceiveWithEmail, setReceiveMode, setGeneratedLink])

  useEffect(() => {
    if (receiveMode !== 'email' || !privyAuthenticated || !privyEmail || circleRecipientPending) return
    if (selectedNet === 'solana' ? solanaValid : evmValid) return
    void handleEmailRecipient()
  }, [receiveMode, privyAuthenticated, privyEmail, selectedNet]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (receiveMode === 'bank') return
    if (canReceiveWithEmail) return
    setReceiveMode('paste')
    setCircleRecipientError(null)
  }, [canReceiveWithEmail, receiveMode, setReceiveMode])

  useEffect(() => {
    const hasCircleWallet = selectedNet === 'solana' ? solanaValid : isEvmNet && evmValid
    if (receiveMode !== 'email' || !hasCircleWallet) {
      setCircleWalletBalance('Balance --')
      return
    }

    let cancelled = false
    setCircleWalletBalance('Balance ...')
    const evmBalanceNet = selectedNet === 'base' || selectedNet === 'arc' || selectedNet === 'arbitrum'
      ? selectedNet
      : 'base'

    const balancePromise = selectedNet === 'solana'
      ? fetch('/api/solana-balance', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ accountAddress: solanaAddr }),
        })
          .then(async response => {
            const data = await response.json() as { ok?: boolean; balance?: string }
            if (!response.ok || !data.ok) throw new Error('Balance unavailable')
            return Number(BigInt(data.balance ?? '0')) / 1_000_000
          })
      : EVM_CLIENTS[evmBalanceNet]
          .readContract({
            address: CHAIN_META[evmBalanceNet].tokenAddress,
            abi: ERC20_BALANCE_OF_ABI,
            functionName: 'balanceOf',
            args: [evmAddr as `0x${string}`],
          })
          .then(raw => Number(raw) / 10 ** CHAIN_META[evmBalanceNet].decimals)

    balancePromise
      .then(balance => {
        if (!cancelled) setCircleWalletBalance(`Balance ${formatAmount(balance.toString(), 6)} USDC`)
      })
      .catch(() => {
        if (!cancelled) setCircleWalletBalance('Balance --')
      })

    return () => {
      cancelled = true
    }
  }, [selectedNet, isEvmNet, receiveMode, evmValid, evmAddr, solanaValid, solanaAddr])

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
        {selectorLabel ?? (receiveMode === 'bank' ? 'Bank payout' : 'Receive to')}
      </label>
      {receiveMode === 'bank' && !privyAuthenticated && (
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
      )}
      {receiveMode !== 'bank' && <div className="grid gap-2">
        <button
          type="button"
          onClick={() => {
            setReceiveMode('paste')
            setCircleRecipientError(null)
            setGeneratedLink('')
          }}
          className={cn(
            'rounded-xl border px-3 py-2.5 text-left transition-all active:scale-[0.99]',
            receiveMode === 'paste'
              ? 'border-gray-900 bg-gray-50 text-gray-900 dark:border-white/30 dark:bg-white/10 dark:text-gray-100'
              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:border-white/20 dark:hover:bg-white/[0.07]',
          )}
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Wallet className="h-4 w-4 text-gray-500" />
            {addressOptionLabel ?? 'Paste wallet address'}
          </span>
          <span className="mt-1 block text-[11px] text-gray-400">{addressOptionBody ?? 'Any wallet or exchange'}</span>
        </button>
        {canReceiveWithEmail && !privyAuthenticated ? (
          <PrivyConnectButton
            debugLabel="create-receive-email"
            loginOptions={{ loginMethods: ['email'] }}
            logoutOnAuthenticated={false}
            onBeforeLogin={() => {
              try { window.sessionStorage.setItem(circleEmailReceiveIntentKey, selectedNet) } catch {}
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
        ) : canReceiveWithEmail && (
          <button
            type="button"
            onClick={handleEmailRecipient}
            disabled={circleRecipientPending}
            className={cn(
              'rounded-xl border px-3 py-2.5 text-left transition-all active:scale-[0.99]',
              receiveMode === 'email'
                ? 'border-gray-900 bg-gray-50 text-gray-900 dark:border-white/30 dark:bg-white/10 dark:text-gray-100'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:border-white/20 dark:hover:bg-white/[0.07]',
              circleRecipientPending && 'cursor-not-allowed opacity-70',
            )}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              {circleRecipientPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4 text-blue-500" />}
              Receive with Circle Pocket
            </span>
            <span className="mt-1 block text-[11px] text-gray-400">
              Email-backed Circle wallet
            </span>
          </button>
        )}
      </div>}

      {receiveMode === 'bank' && (
        <div className="space-y-2.5 rounded-xl border border-gray-100 bg-gray-50/70 p-2.5 dark:border-white/10 dark:bg-white/[0.04]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Country</p>
            <div className="relative mt-1">
              <select
                value={bankCountry ?? 'NG'}
                onChange={(event) => {
                  setBankCountry(event.target.value as PosCountry)
                  setGeneratedLink('')
                }}
                className="w-full appearance-none rounded-lg border border-gray-200 bg-white px-3 py-2 pr-9 text-sm font-semibold text-gray-950 outline-none transition-all focus:border-gray-400 dark:border-white/10 dark:bg-gray-950 dark:text-white dark:focus:border-white/25"
              >
                <option value="NG">Nigeria</option>
                <option value="GH" disabled>Ghana - coming soon</option>
                <option value="KE" disabled>Kenya - coming soon</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            </div>
          </div>

          {bankCountry === 'NG' && (
            <div className="space-y-2.5 border-t border-gray-100 pt-2.5 dark:border-white/10">
              <label className="block">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Bank</span>
                {bankInstitutions.length ? (
                  <select
                    value={bankCode}
                    onChange={(event) => {
                      const selected = bankInstitutions.find((institution) => institution.code === event.target.value)
                      setBankCode(event.target.value)
                      setBankName(selected?.name ?? '')
                      setBankAccount('')
                      setGeneratedLink('')
                    }}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-950 outline-none focus:border-gray-400 dark:border-white/10 dark:bg-gray-950 dark:text-white dark:focus:border-white/25"
                  >
                    <option value="">{bankInstitutionsBusy ? 'Loading banks...' : 'Select bank'}</option>
                    {bankInstitutions.map((institution) => (
                      <option key={institution.code} value={institution.code}>
                        {institution.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={bankName || bankCode}
                    onChange={(event) => {
                      const value = event.target.value
                      setBankName(value)
                      setBankCode(value.trim())
                      setGeneratedLink('')
                    }}
                    placeholder={bankInstitutionsBusy ? 'Loading banks...' : 'Zenith Bank'}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-950 outline-none placeholder:text-gray-300 focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-gray-600"
                  />
                )}
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Account number</span>
                <div className="mt-1 flex gap-2">
                  <input
                    value={bankAccount}
                    onChange={(event) => {
                      setBankAccount(event.target.value.replace(/\D/g, '').slice(0, 10))
                      setGeneratedLink('')
                    }}
                    inputMode="numeric"
                    placeholder="0123456789"
                    className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-950 outline-none placeholder:text-gray-300 focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-gray-600"
                  />
                  <button
                    type="button"
                    onClick={verifyBankAccount}
                    disabled={bankVerifyBusy || !bankCode || bankAccount.length !== 10}
                    className="inline-flex min-w-[78px] items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 transition-all hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200"
                  >
                    {bankVerifyBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Verify
                  </button>
                </div>
              </label>
              {bankVerified && bankAccountName && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">
                  {bankAccountName}
                </div>
              )}
              {bankError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300">
                  {bankError}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {canReceiveWithEmail && receiveMode === 'email' && (
        <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3.5 py-3 dark:border-white/10 dark:bg-white/[0.04]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">
                {selectedNet === 'solana' ? 'Circle Solana wallet' : `${CHAIN_META[selectedNet].label} Circle wallet`}
              </p>
              <p className="mt-0.5 truncate font-mono text-[11px] text-gray-500 dark:text-gray-400">
                {circleRecipientPending
                  ? 'Preparing wallet...'
                  : selectedNet === 'solana' && solanaValid
                  ? truncateAddress(solanaAddr, 8)
                  : isEvmNet && evmValid
                  ? truncateAddress(evmAddr, 8)
                  : privyEmail || 'Sign in to open Circle Pocket'}
              </p>
              {(selectedNet === 'solana' ? solanaValid : isEvmNet && evmValid) && (
                <p className="mt-1 text-[11px] font-medium text-gray-400 dark:text-gray-500">
                  {circleWalletBalance}
                </p>
              )}
            </div>
            {!circleRecipientPending && (selectedNet === 'solana' ? solanaValid : evmValid) && (
              <div className="flex shrink-0 items-center gap-1.5">
                <CheckCheck className="h-4 w-4 text-emerald-500" />
                <button
                  type="button"
                  onClick={() => {
                    void logoutPrivy()
                    setReceiveMode('paste')
                    setGeneratedLink('')
                    if (selectedNet === 'solana') setSolanaAddr('')
                    else setEvmAddr('')
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/80 text-gray-500 transition-colors hover:bg-white hover:text-gray-900 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/15 dark:hover:text-white"
                  aria-label="Disconnect email wallet"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
          {circleRecipientError && <p className="mt-2 text-xs text-red-500">{circleRecipientError}</p>}
        </div>
      )}
      {!canReceiveWithEmail && selectedNet === 'solana' && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Circle Pocket receiving for Solana is not enabled here yet.
        </p>
      )}
    </div>
  )
}

function LocalCurrencySignInGate({
  title,
  body,
}: {
  title: string
  body: string
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200">
          <Mail className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-950 dark:text-white">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{body}</p>
        </div>
      </div>
      <PrivyConnectButton
        loginOptions={{ loginMethods: ['email'] }}
        logoutOnAuthenticated={false}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-black active:scale-[0.98] disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100"
      >
        <Mail className="h-4 w-4" />
        Sign in to continue
      </PrivyConnectButton>
      <p className="mt-3 text-center text-[11px] font-medium leading-relaxed text-gray-400 dark:text-gray-500">
        Sign-in saves local currency history, receipts, payout context, and support records.
      </p>
    </div>
  )
}

function LocalCurrencyProfileCard({
  profile,
  draft,
  email,
  busy,
  error,
  editing,
  bankAccountName,
  title = 'Your payout profile',
  body = 'Used for receipts, payout support, and matching bank payment records.',
  savedFallback = 'Payout profile',
  saveLabel = 'Save payout profile',
  onDraftChange,
  onSave,
  onEdit,
  onCancel,
}: {
  profile: LocalCurrencyProfile | null
  draft: LocalCurrencyProfile
  email: string
  busy: boolean
  error: string
  editing: boolean
  bankAccountName?: string
  title?: string
  body?: string
  savedFallback?: string
  saveLabel?: string
  onDraftChange: (next: LocalCurrencyProfile) => void
  onSave: () => void
  onEdit: () => void
  onCancel: () => void
}) {
  const complete = Boolean(profile?.firstName && profile?.lastName && profile?.email)
  const dirty = Boolean(profile && (
    profile.firstName !== draft.firstName ||
    profile.lastName !== draft.lastName ||
    profile.email !== (email || draft.email)
  ))
  const fullName = `${draft.firstName} ${draft.lastName}`.trim()
  const bankMismatch = Boolean(bankAccountName && fullName && !bankAccountName.toLowerCase().includes(draft.lastName.trim().toLowerCase()))
  const identityEmail = email || draft.email || profile?.email || ''

  if (complete && !editing) {
    const savedName = `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim()
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-bold text-gray-950 dark:text-white">{savedName || savedFallback}</p>
              <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">
                Saved
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs font-medium text-gray-500 dark:text-gray-400">{profile?.email}</p>
          </div>
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${savedFallback.toLowerCase()}`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-600 transition-all hover:bg-gray-100 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-gray-950 dark:text-white">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            {body}
          </p>
        </div>
        {complete && editing && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] font-bold text-gray-600 transition-all hover:bg-gray-100 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]"
          >
            Cancel
          </button>
        )}
      </div>

      {identityEmail && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 dark:border-blue-400/20 dark:bg-blue-400/10">
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-blue-500 dark:text-blue-300">Signed in as</span>
            <span className="block truncate text-xs font-semibold text-blue-900 dark:text-blue-100">{identityEmail}</span>
          </span>
          <span className="shrink-0 rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:border-blue-400/20 dark:bg-white/10 dark:text-blue-200">
            Circle identity
          </span>
        </div>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">First name</span>
          <input
            value={draft.firstName}
            onChange={(event) => onDraftChange({ ...draft, firstName: event.target.value })}
            placeholder="First name"
            className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-950 outline-none placeholder:text-gray-300 focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-gray-600 dark:focus:border-white/25"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Last name</span>
          <input
            value={draft.lastName}
            onChange={(event) => onDraftChange({ ...draft, lastName: event.target.value })}
            placeholder="Last name"
            className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-950 outline-none placeholder:text-gray-300 focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-gray-600 dark:focus:border-white/25"
          />
        </label>
      </div>

      <label className="mt-2 block">
        <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Email</span>
        <input
          value={identityEmail}
          readOnly
          placeholder="Signed-in email"
          className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-100 px-3 py-2 text-sm font-medium text-gray-500 outline-none dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-400"
        />
      </label>

      {bankMismatch && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-relaxed text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
          Bank account name is {bankAccountName}. Make sure this payout account belongs to you or your business.
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300">
          {error}
        </p>
      )}

      {(!complete || dirty) && (
        <button
          type="button"
          onClick={onSave}
          disabled={busy || !draft.firstName.trim() || !draft.lastName.trim() || !(email || draft.email)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-black active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
          {dirty ? 'Save changes' : saveLabel}
        </button>
      )}
    </div>
  )
}

export default function CreateLink({ initialProduct = 'payment' }: { initialProduct?: 'payment' | 'polymarket' } = {}) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const productParam = searchParams.get('product')
  const paymentTabParam = searchParams.get('tab')
  const initialProductTarget = (productParam ?? '').toLowerCase()
  const initialPaymentTab = (paymentTabParam ?? '').toLowerCase()
  const startsInBankPayment = initialProductTarget === 'payment' && initialPaymentTab === 'bank'
  const startsInBankSendPayment = initialProductTarget === 'payment' && initialPaymentTab === 'bank-send'
  const startsInPosPayment = initialProductTarget === 'payment' && initialPaymentTab === 'pos'
  const startsInBillsPayment = initialProductTarget === 'payment' && initialPaymentTab === 'bills'
  const startsInProduct = Boolean(initialProductTarget) || initialProduct === 'polymarket' || window.location.pathname === '/polymarket'
  const startsInPaymentMenu = initialProductTarget === 'payment' && !paymentTabParam
  const { authenticated: privyAuthenticated, user: privyUser, logout: logoutPrivy, getAccessToken } = usePrivy()
  const privyEmail = emailFromPrivyUser(privyUser).trim().toLowerCase()
  const [localCurrencyProfile, setLocalCurrencyProfile] = useState<LocalCurrencyProfile | null>(null)
  const [localCurrencyProfileDraft, setLocalCurrencyProfileDraft] = useState<LocalCurrencyProfile>({ firstName: '', lastName: '', email: '' })
  const [localCurrencyProfileEditing, setLocalCurrencyProfileEditing] = useState(false)
  const [localCurrencyProfileBusy, setLocalCurrencyProfileBusy] = useState(false)
  const [localCurrencyProfileError, setLocalCurrencyProfileError] = useState('')
  const [evmAddr,       setEvmAddr]       = useState('')
  const [solanaAddr,    setSolanaAddr]    = useState('')
  const [amt,           setAmt]           = useState('')
  const [memo,          setMemo]          = useState('')
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
  const [circlePocketMode, setCirclePocketMode] = useState(false)
  const [circlePocketView, setCirclePocketView] = useState<CirclePocketView>('chooser')
  const [circlePocketTab, setCirclePocketTab] = useState<CirclePocketTab>('balance')
  const [circlePocketNetwork, setCirclePocketNetwork] = useState<PosNetwork>('base')
  const [circlePocketWallets, setCirclePocketWallets] = useState<CirclePocketWallets>({})
  const [circlePocketEvmSession, setCirclePocketEvmSession] = useState<Awaited<ReturnType<typeof connectCircleEvmEmailWallet>> | null>(null)
  const [circlePocketSolanaSession, setCirclePocketSolanaSession] = useState<Awaited<ReturnType<typeof connectCircleSolanaEmailWallet>> | null>(null)
  const [circlePocketRows, setCirclePocketRows] = useState<UnifiedBalanceBreakdown[]>([])
  const [circlePocketGlobalBalance, setCirclePocketGlobalBalance] = useState(0)
  const [circlePocketBusy, setCirclePocketBusy] = useState(false)
  const [circlePocketBalanceBusy, setCirclePocketBalanceBusy] = useState(false)
  const [circlePocketError, setCirclePocketError] = useState('')
  const [circlePocketCopied, setCirclePocketCopied] = useState(false)
  const [circlePocketWithdrawAddress, setCirclePocketWithdrawAddress] = useState('')
  const [circlePocketWithdrawAmount, setCirclePocketWithdrawAmount] = useState('')
  const [circlePocketWithdrawPending, setCirclePocketWithdrawPending] = useState(false)
  const [circlePocketWithdrawNotice, setCirclePocketWithdrawNotice] = useState('')
  const [circlePocketWithdrawTxHash, setCirclePocketWithdrawTxHash] = useState('')
  const [circlePocketActivity, setCirclePocketActivity] = useState<string[]>([])
  const [posMode,        setPosMode]        = useState(startsInPosPayment)
  const [billsMode,      setBillsMode]      = useState(startsInBillsPayment)
  const [streamMode,     setStreamMode]     = useState(false)
  const [streamSpotlightIndex, setStreamSpotlightIndex] = useState(0)
  const [polymarketMode, setPolymarketMode] = useState(initialProduct === 'polymarket' || window.location.pathname === '/polymarket')
  const [polymarketSpotlightIndex, setPolymarketSpotlightIndex] = useState(0)
  const [productHubOpen, setProductHubOpen] = useState(!startsInProduct)
  const [paymentMenuOpen, setPaymentMenuOpen] = useState(startsInPaymentMenu)
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
    if (tab === 'personal' || tab === 'usdc') url.searchParams.delete('tab')
    else url.searchParams.set('tab', tab)
    navigate(`${url.pathname}${url.search}${url.hash}`)
  }

  function activateBankReceive() {
    setPaymentFlow('bank')
    setReceiveMode('bank')
    setPaymentMode('personal')
    onNetworkSelect('base')
    setMultiChainMode(false)
    setAccessMode(false)
    setPaymentMenuOpen(false)
    setCirclePocketMode(false)
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
    setPaymentFlow('bank-send')
    setReceiveMode('paste')
    setPaymentMode('personal')
    onNetworkSelect('base')
    setBankSendNetwork('base')
    setMultiChainMode(false)
    setAccessMode(false)
    setPaymentMenuOpen(false)
    setCirclePocketMode(false)
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
    window.dispatchEvent(new CustomEvent('agent-hash-mode', { detail: { mode: 'support' } }))
    setProductHubOpen(true)
    setPaymentMenuOpen(false)
    setAccessMode(false)
    setCirclePocketMode(false)
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
    setCirclePocketMode(false)
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
    openHubMode()
  }

  function openCirclePocketMode(push = true, view: CirclePocketView = 'chooser') {
    if (push) pushProductHistory('circle-pocket')
    window.dispatchEvent(new CustomEvent('agent-hash-mode', { detail: { mode: 'payments' } }))
    setProductHubOpen(false)
    setPaymentMenuOpen(false)
    setCirclePocketMode(true)
    setCirclePocketView(view)
    setAccessMode(false)
    setPosMode(false)
    setBillsMode(false)
    setStreamMode(false)
    setPolymarketMode(false)
    setAccessView('overview')
    setGeneratedLink('')
    setCopied(false)
    setVaultStep('idle')
    setCirclePocketError('')
  }

  function closeCirclePocketMode() {
    if (circlePocketView !== 'chooser') {
      setCirclePocketView('chooser')
      setAccessView('overview')
      setCirclePocketError('')
      return
    }
    openHubMode()
  }

  function openPaymentMenu(push = true) {
    if (push) pushProductHistory('payment')
    window.dispatchEvent(new CustomEvent('agent-hash-mode', { detail: { mode: 'payments' } }))
    setProductHubOpen(false)
    setPaymentMenuOpen(true)
    setAccessMode(false)
    setCirclePocketMode(false)
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
    window.dispatchEvent(new CustomEvent('agent-hash-mode', { detail: { mode: 'payments' } }))
    setProductHubOpen(false)
    setPaymentMenuOpen(false)
    setAccessMode(false)
    setCirclePocketMode(false)
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
    setCirclePocketMode(false)
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
    setPosBankProvider('paycrest')
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
    window.dispatchEvent(new CustomEvent('agent-hash-mode', { detail: { mode: 'payments' } }))
    setProductHubOpen(false)
    setPaymentMenuOpen(false)
    setBillsMode(true)
    setCirclePocketMode(false)
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
    if (push) pushProductHistory('streampay')
    setProductHubOpen(false)
    setPaymentMenuOpen(false)
    setStreamMode(true)
    setCirclePocketMode(false)
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
    openHubMode()
    setStreamMode(false)
  }

  function openPolymarketMode(push = true) {
    if (push) pushProductHistory('polymarket')
    setProductHubOpen(false)
    setPaymentMenuOpen(false)
    setPolymarketMode(true)
    setStreamMode(false)
    setCirclePocketMode(false)
    setPosMode(false)
    setBillsMode(false)
    setAccessMode(false)
    setGeneratedLink('')
    setCopied(false)
    setVaultStep('idle')
    setAccessView('overview')
  }

  function closePolymarketMode() {
    openHubMode()
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
      setCirclePocketMode(false)
      setPosMode(false)
      setBillsMode(false)
      setStreamMode(false)
      setPolymarketMode(false)
      setGeneratedLink('')
      setCopied(false)
      setVaultStep('idle')
      if (tab === 'pos') {
        openPosMode(false, true)
        return
      }
      if (tab === 'bills') {
        openBillsMode(false)
        return
      }
      if (tab === 'bank') {
        activateBankReceive()
      } else if (tab === 'bank-send') {
        activateBankSend()
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
      openCirclePocketMode(false)
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
  }, [productParam, paymentTabParam]) // eslint-disable-line react-hooks/exhaustive-deps

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
        if (tab === 'pos') openPosMode(false, true)
        else if (tab === 'bills') openBillsMode(false)
        else {
          if (!tab) openPaymentMenu(false)
          else {
            openPaymentMode(false)
            if (tab === 'bank') {
              activateBankReceive()
            } else if (tab === 'bank-send') {
              activateBankSend()
            } else {
              setPaymentFlow('usdc')
              setReceiveMode('paste')
              setPaymentMode(tab === 'business' ? 'business' : 'personal')
            }
          }
        }
      }
      if (product === 'agent') toggleAccessMode(true, false)
      if (product === 'circle-pocket') openCirclePocketMode(false)
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

  const circlePocketSelectedWallet = circlePocketWallets[circlePocketNetwork]
  const circlePocketSelectedBalance = circlePocketRows.find(row => row.key === circlePocketNetwork)?.balance ?? 0
  const circlePocketNetworkLabel = circlePocketNetwork === 'solana' ? 'Solana' : CHAIN_META[circlePocketNetwork].label
  const circlePocketSelectedAddress = circlePocketSelectedWallet?.address ?? ''

  async function unlockCirclePocketWallet(network = circlePocketNetwork) {
    setCirclePocketError('')
    if (!PRIVY_AUTH_ENABLED) throw new Error('Circle Pocket requires Privy email sign-in.')
    if (!privyAuthenticated) throw new Error('Sign in with email to open Circle Pocket.')
    if (!privyEmail) throw new Error('Sign in with an email account to open Circle Pocket.')
    if (network === 'solana' && !canUseCircleSolanaEmailWallet()) throw new Error('Circle Solana wallet is not configured.')
    if (network !== 'solana' && !canUseCircleEvmEmailWallet(network)) throw new Error(`${CHAIN_META[network].label} Circle wallet is not configured.`)

    const token = await getAccessToken()
    if (!token) throw new Error('Email session is not ready. Sign in again and retry.')
    const existing = await resolvePrivyCircleLink({ accessToken: token, chain: network })
    if (existing.link?.circleWalletAddress) {
      const wallet = {
        address: existing.link.circleWalletAddress,
        walletId: existing.link.circleWalletId,
        blockchain: existing.link.circleBlockchain,
      }
      setCirclePocketWallets(current => ({ ...current, [network]: wallet }))
      return wallet
    }

    if (network === 'solana') {
      const session = await connectCircleSolanaEmailWallet(privyEmail)
      setCirclePocketSolanaSession(session)
      await savePrivyCircleLink({
        accessToken: token,
        chain: 'solana',
        email: privyEmail,
        wallet: {
          id: session.wallet.id,
          address: session.wallet.address,
          blockchain: session.wallet.blockchain,
        },
      })
      const wallet = {
        address: session.wallet.address,
        walletId: session.wallet.id,
        blockchain: session.wallet.blockchain,
      }
      setCirclePocketWallets(current => ({ ...current, solana: wallet }))
      return wallet
    }

    const session = await connectCircleEvmEmailWallet(privyEmail, network)
    setCirclePocketEvmSession(session)
    await savePrivyCircleLink({
      accessToken: token,
      chain: network,
      email: privyEmail,
      wallet: session.wallet,
    })
    const wallet = {
      address: session.wallet.address,
      walletId: session.wallet.id,
      blockchain: session.wallet.blockchain,
    }
    setCirclePocketWallets(current => ({ ...current, [network]: wallet }))
    return wallet
  }

  async function refreshCirclePocketBalances(wallets = circlePocketWallets) {
    const networks = POS_NETWORK_OPTIONS.map(item => item.key)
    setCirclePocketBalanceBusy(true)
    setCirclePocketError('')
    try {
      const rows: UnifiedBalanceBreakdown[] = []
      for (const network of networks) {
        const wallet = wallets[network]
        if (!wallet?.address) {
          rows.push({
            key: network,
            label: network === 'solana' ? 'Solana' : CHAIN_META[network].label,
            balance: 0,
            status: 'ok',
          })
          continue
        }
        const result = await queryBalances({
          chains: [network],
          evmAddress: network === 'solana' ? undefined : wallet.address,
          solanaAddress: network === 'solana' ? wallet.address : undefined,
        })
        rows.push(...result.rows)
      }
      setCirclePocketRows(rows)
      setCirclePocketGlobalBalance(rows.reduce((sum, row) => sum + row.balance, 0))
    } catch (err) {
      setCirclePocketError(readableErrorMsg(err, 'Circle Pocket balance refresh failed.'))
    } finally {
      setCirclePocketBalanceBusy(false)
    }
  }

  useEffect(() => {
    if (!privyAuthenticated || !privyEmail) {
      setCirclePocketWallets({})
      setCirclePocketRows([])
      setCirclePocketGlobalBalance(0)
      return
    }

    let cancelled = false
    async function hydrateLinkedCirclePocketWallets() {
      try {
        const token = await getAccessToken()
        if (!token || cancelled) return

        const entries = await Promise.all(
          POS_NETWORK_OPTIONS.map(async ({ key }) => {
            try {
              const existing = await resolvePrivyCircleLink({ accessToken: token, chain: key })
              const link = existing.link
              if (!link?.circleWalletAddress) return null
              return [key, {
                address: link.circleWalletAddress,
                walletId: link.circleWalletId,
                blockchain: link.circleBlockchain,
              }] as const
            } catch {
              return null
            }
          }),
        )
        if (cancelled) return

        const nextWallets = entries.reduce<CirclePocketWallets>((acc, entry) => {
          if (!entry) return acc
          acc[entry[0]] = entry[1]
          return acc
        }, {})
        setCirclePocketWallets(nextWallets)
        if (Object.keys(nextWallets).length) {
          await refreshCirclePocketBalances(nextWallets)
        } else {
          setCirclePocketRows([])
          setCirclePocketGlobalBalance(0)
        }
      } catch {
        if (!cancelled) {
          setCirclePocketWallets({})
          setCirclePocketRows([])
          setCirclePocketGlobalBalance(0)
        }
      }
    }

    void hydrateLinkedCirclePocketWallets()
    return () => {
      cancelled = true
    }
  }, [privyAuthenticated, privyEmail]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCirclePocketSetup(network = circlePocketNetwork) {
    setCirclePocketBusy(true)
    setCirclePocketError('')
    try {
      const wallet = await unlockCirclePocketWallet(network)
      const nextWallets = { ...circlePocketWallets, [network]: wallet }
      await refreshCirclePocketBalances(nextWallets)
      setCirclePocketActivity(current => [`${network === 'solana' ? 'Solana' : CHAIN_META[network].label} wallet ready`, ...current].slice(0, 5))
    } catch (err) {
      setCirclePocketError(readableErrorMsg(err, 'Circle Pocket setup failed.'))
    } finally {
      setCirclePocketBusy(false)
    }
  }

  async function handleCirclePocketCopy() {
    if (!circlePocketSelectedAddress) return
    await copyToClipboard(circlePocketSelectedAddress)
    setCirclePocketCopied(true)
    setCirclePocketActivity(current => [`Copied ${circlePocketNetworkLabel} funding address`, ...current].slice(0, 5))
    setTimeout(() => setCirclePocketCopied(false), 1800)
  }

  function handleCirclePocketWithdrawMax() {
    if (circlePocketSelectedBalance <= 0) return
    setCirclePocketWithdrawAmount(String(circlePocketSelectedBalance))
  }

  async function handleCirclePocketWithdraw() {
    setCirclePocketError('')
    setCirclePocketWithdrawNotice('')
    setCirclePocketWithdrawTxHash('')
    const recipient = circlePocketWithdrawAddress.trim()
    const decimals = circlePocketNetwork === 'solana' ? 6 : CHAIN_META[circlePocketNetwork].decimals
    if (circlePocketNetwork === 'solana' ? !isValidSolanaAddress(recipient) : !isAddress(recipient)) {
      setCirclePocketError('Enter a valid destination address for the selected network.')
      return
    }
    let amountUnits: bigint
    try {
      amountUnits = parseUnits(circlePocketWithdrawAmount || '0', decimals)
    } catch {
      setCirclePocketError('Enter a valid amount.')
      return
    }
    if (amountUnits <= 0n) {
      setCirclePocketError('Enter an amount to withdraw.')
      return
    }
    if (circlePocketSelectedBalance > 0) {
      const selectedUnits = parseUnits(String(circlePocketSelectedBalance), decimals)
      if (amountUnits > selectedUnits) {
        setCirclePocketError('Amount is higher than your wallet balance.')
        return
      }
    }

    setCirclePocketWithdrawPending(true)
    try {
      const wallet = circlePocketSelectedWallet ?? await unlockCirclePocketWallet(circlePocketNetwork)
      if (circlePocketNetwork === 'solana') {
        let session = circlePocketSolanaSession
        if (!session || session.wallet.address !== wallet.address) {
          session = await connectCircleSolanaEmailWallet(privyEmail)
          setCirclePocketSolanaSession(session)
        }
        const buildRes = await fetch('/api/solana-build-tx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: session.wallet.address,
            to: recipient,
            amount: circlePocketWithdrawAmount,
            mode: 'withdraw',
          }),
        })
        const buildData = await readApiJson<{ ok: boolean; tx?: string; lastValidBlockHeight?: number; error?: string }>(buildRes, 'Solana build')
        if (!buildData.ok || !buildData.tx || !buildData.lastValidBlockHeight) throw new Error(buildData.error ?? 'Failed to build withdraw transaction')
        const signedB64 = await signCircleSolanaTransaction({
          session,
          rawTransaction: buildData.tx,
          memo: `Hash PayLink Circle Pocket withdraw ${formatAmount(circlePocketWithdrawAmount, 6)} USDC`,
        })
        const relayRes = await fetch('/api/solana-relay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tx: signedB64, lastValidBlockHeight: buildData.lastValidBlockHeight }),
        })
        const relayData = await readApiJson<{ ok: boolean; txHash?: string; error?: string }>(relayRes, 'Solana relay')
        if (!relayData.ok || !relayData.txHash) throw new Error(relayData.error ?? 'Relay failed')
        setCirclePocketWithdrawTxHash(relayData.txHash)
      } else {
        let session = circlePocketEvmSession
        if (!session || session.chain !== circlePocketNetwork || session.wallet.address.toLowerCase() !== wallet.address.toLowerCase()) {
          session = await connectCircleEvmEmailWallet(privyEmail, circlePocketNetwork)
          setCirclePocketEvmSession(session)
        }
        const txHash = await sendCircleEvmEmailWithdraw({
          session,
          recipient: recipient as Address,
          amount: circlePocketWithdrawAmount,
        })
        if (txHash) setCirclePocketWithdrawTxHash(txHash)
      }
      setCirclePocketWithdrawNotice('Withdraw sent. Check the destination wallet in a moment.')
      setCirclePocketActivity(current => [`Withdrew ${circlePocketWithdrawAmount} USDC on ${circlePocketNetworkLabel}`, ...current].slice(0, 5))
      setCirclePocketWithdrawAmount('')
      setCirclePocketWithdrawAddress('')
      await refreshCirclePocketBalances()
    } catch (err) {
      setCirclePocketError(readableErrorMsg(err, 'Withdraw failed.'))
    } finally {
      setCirclePocketWithdrawPending(false)
    }
  }

  function handlePosBack() {
    if (posMerchant) {
      setPosMerchant(null)
      setPosCopied(false)
      setPosError('')
      return
    }
    if (posSettlementPath) {
      setPosCountry(null)
      setPosSettlementPath(null)
      resetPosBankDetails()
      setPosError('')
      return
    }
    closePosMode()
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

  async function requestLocalCurrencyProfile(action: 'get' | 'save') {
    const token = await getAccessToken()
    if (!token) throw new Error('Sign in again to save local currency profile.')
    const response = await fetch('/api/local-currency-profile', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action,
        first_name: localCurrencyProfileDraft.firstName,
        last_name: localCurrencyProfileDraft.lastName,
        email: privyEmail || localCurrencyProfileDraft.email,
      }),
    })
    const data = await response.json().catch(() => undefined) as {
      ok?: boolean
      error?: string
      email?: string
      profile?: LocalCurrencyProfile | null
    } | undefined
    if (!response.ok || !data?.ok) throw new Error(data?.error ?? 'Profile request failed.')
    return data
  }

  async function loadLocalCurrencyProfile() {
    if (!privyAuthenticated) {
      setLocalCurrencyProfile(null)
      setLocalCurrencyProfileDraft({ firstName: '', lastName: '', email: '' })
      setLocalCurrencyProfileEditing(false)
      setLocalCurrencyProfileError('')
      return
    }
    setLocalCurrencyProfileBusy(true)
    setLocalCurrencyProfileError('')
    try {
      const data = await requestLocalCurrencyProfile('get')
      const profile = data.profile ?? null
      setLocalCurrencyProfile(profile)
      setLocalCurrencyProfileDraft({
        firstName: profile?.firstName ?? '',
        lastName: profile?.lastName ?? '',
        email: profile?.email ?? data.email ?? privyEmail,
      })
      setLocalCurrencyProfileEditing(!profile)
    } catch (error) {
      setLocalCurrencyProfileError(error instanceof Error ? error.message : 'Could not load payout profile.')
      setLocalCurrencyProfileDraft(current => ({ ...current, email: privyEmail || current.email }))
      setLocalCurrencyProfileEditing(true)
    } finally {
      setLocalCurrencyProfileBusy(false)
    }
  }

  async function saveLocalCurrencyProfile() {
    setLocalCurrencyProfileBusy(true)
    setLocalCurrencyProfileError('')
    try {
      const data = await requestLocalCurrencyProfile('save')
      if (!data.profile) throw new Error('Profile was not saved.')
      setLocalCurrencyProfile(data.profile)
      setLocalCurrencyProfileDraft(data.profile)
      setLocalCurrencyProfileEditing(false)
    } catch (error) {
      setLocalCurrencyProfileError(error instanceof Error ? error.message : 'Could not save payout profile.')
    } finally {
      setLocalCurrencyProfileBusy(false)
    }
  }

  function editLocalCurrencyProfile() {
    if (localCurrencyProfile) setLocalCurrencyProfileDraft(localCurrencyProfile)
    else setLocalCurrencyProfileDraft(current => ({ ...current, email: privyEmail || current.email }))
    setLocalCurrencyProfileError('')
    setLocalCurrencyProfileEditing(true)
  }

  function cancelLocalCurrencyProfileEdit() {
    if (!localCurrencyProfile) return
    setLocalCurrencyProfileDraft(localCurrencyProfile)
    setLocalCurrencyProfileError('')
    setLocalCurrencyProfileEditing(false)
  }

  useEffect(() => {
    void loadLocalCurrencyProfile()
  }, [privyAuthenticated, privyEmail]) // eslint-disable-line react-hooks/exhaustive-deps

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
    fetch('/api/ng-pos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'institutions', currency: 'NGN' }),
    })
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok || !data.ok) throw new Error(data.error ?? 'Could not load Paycrest banks.')
        setPosBankInstitutions(Array.isArray(data.institutions) ? data.institutions : [])
      })
      .catch((error) => {
        setPosBankInstitutions([])
        setPosError(error instanceof Error ? error.message : 'Could not load Paycrest banks.')
      })
      .finally(() => setPosBankInstitutionsBusy(false))
  }, [posIsPaycrestFlow, receiveMode])

  async function verifyPosBankAccount() {
    setPosBankVerifyBusy(true)
    setPosError('')
    setPosBankVerified(false)
    setPosBankAccountName('')
    try {
      const response = await fetch('/api/ng-pos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'verifyAccount',
          bank_code: posBankCode,
          bank_name: posBankName,
          account_number: posBankAccount,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error ?? 'Account verification failed')
      if (data.bank_code) setPosBankCode(String(data.bank_code).trim())
      setPosBankAccountName(String(data.account_name ?? '').trim())
      setPosBankVerified(true)
    } catch (error) {
      setPosError(error instanceof Error ? error.message : 'Account verification failed')
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
      const response = await fetch('/api/ng-pos', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'createMerchant',
          owner_id: String(privyUser?.id ?? ''),
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
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error ?? 'POS setup failed')
      setPosMerchant(data.merchant)
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
      const response = await fetch('/api/ng-pos', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'createBankReceive',
          owner_id: String(privyUser?.id ?? ''),
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
        }),
      })
      const data = await response.json().catch(() => undefined) as {
        ok?: boolean
        error?: string
        link?: {
          payment_url?: string
          dashboard_url?: string
        }
      } | undefined
      if (!response.ok || !data?.ok || !data.link?.payment_url) throw new Error(data?.error || 'Could not create bank receive link.')
      const link = data.link.payment_url
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
      const response = await fetch('/api/ng-pos', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'createBankSend',
          owner_id: String(privyUser?.id ?? ''),
          owner_email: privyEmail,
          owner_first_name: localCurrencyProfile?.firstName || localCurrencyProfileDraft.firstName,
          owner_last_name: localCurrencyProfile?.lastName || localCurrencyProfileDraft.lastName,
          display_name: memo.trim() || 'Bank to USDC',
          amount: flexAmount ? '' : amt,
          flexible_amount: flexAmount,
          network: bankSendNetwork,
          destination_address: evmAddr.trim(),
          client_origin: window.location.origin,
        }),
      })
      const data = await response.json().catch(() => undefined) as {
        ok?: boolean
        error?: string
        link?: {
          payment_url?: string
          dashboard_url?: string
        }
      } | undefined
      if (!response.ok || !data?.ok || !data.link?.payment_url) throw new Error(data?.error || 'Could not create bank-to-USDC link.')
      const link = data.link.payment_url
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
    setAccessMode(false); setPaymentMenuOpen(false); setCirclePocketMode(false); setPosMode(false); setBillsMode(false); setPolymarketMode(false); setAgentUrl(''); setAgentUrlStatus('idle')
  }

  const linkReady = generatedLink !== ''
  const chatCta = productHubOpen || paymentMenuOpen || posMode || billsMode || streamMode || accessMode || circlePocketMode
    ? null
    : polymarketMode
      ? { label: 'Open PolyDesk', url: telegramStartUrl('polymarket') }
      : { label: 'Open payments in Telegram', url: telegramStartUrl('payment_links') }
  const isPaymentView = !productHubOpen && !paymentMenuOpen && !accessMode && !circlePocketMode && !posMode && !billsMode && !streamMode && !polymarketMode
  const showHowItWorks = productHubOpen || posMode || streamMode || accessMode || polymarketMode
  const paymentTabs: Array<{ key: PaymentTab; title: string; body: string; icon: typeof UserRound; badge?: string }> = [
    { key: 'usdc', title: 'Receive USDC', body: 'Anyone pays USDC. You receive USDC in your wallet.', icon: Wallet, badge: 'No account' },
    { key: 'bank', title: 'Receive to Bank', body: 'Anyone pays Base USDC. You receive Naira in your bank account.', icon: Landmark, badge: 'Sign-in required' },
    { key: 'bank-send', title: 'Send from Bank', body: 'Payer sends Naira from their bank. Recipient receives USDC.', icon: Banknote, badge: 'Sign-in required' },
    { key: 'pos', title: 'POS', body: 'Create a static checkout QR for in-store payments.', icon: Store, badge: 'Sign-in required' },
    { key: 'bills', title: 'Bills', body: 'Pay bills and keep receipts in local currency history.', icon: Landmark, badge: 'Sign-in required' },
  ] as const
  const howItWorksSteps = productHubOpen
    ? [
        { n: '1', title: 'Receive payments', body: 'Personal, business, POS, and QR payment flows' },
        { n: '2', title: 'Manage services', body: 'Circle wallet balance, x402 service balance, PolyDesk, and HashpayStream' },
        { n: '3', title: 'Keep proof', body: 'Receipts, dashboards, and settlement records stay connected' },
      ]
    : polymarketMode
    ? [
        { n: '1', title: 'Open Telegram', body: 'Start Hash PayLink inside chat' },
        { n: '2', title: 'Save address', body: 'Link your Polymarket profile' },
        { n: '3', title: 'Fund and track', body: 'Add USDC and watch positions' },
      ]
    : posMode
    ? [
        { n: '1', title: 'Choose country', body: 'Pick the local POS flow' },
        { n: '2', title: 'Add wallet', body: 'Select supported networks' },
        { n: '3', title: 'Show QR', body: 'Payers scan and pay USDC' },
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
      const url = new URL(window.location.href)
      url.searchParams.set('product', 'payment')
      url.searchParams.set('tab', 'bank')
      window.location.assign(`${url.pathname}${url.search}${url.hash}`)
      return
    }
    if (tab === 'bank-send') {
      pushPaymentTabHistory('bank-send')
      activateBankSend()
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
        paymentMenuOpen ? 'items-center text-center' : 'items-start text-left',
      )}>
        {productHubOpen && (
          <span className="mb-4 inline-flex items-center justify-center gap-2 text-sm font-bold leading-none text-[#0071E3] dark:text-blue-200">
            <PaymentHubMark className="h-7 w-7 shrink-0 text-gray-950 dark:text-white" />
            Payment Hub
          </span>
        )}
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-[2.25rem]">
          {productHubOpen ? 'What do you want to do?' : paymentMenuOpen ? 'Choose payment flow' : circlePocketMode ? 'Circle Pocket' : polymarketMode ? 'PolyDesk' : posMode ? 'Retail POS' : billsMode ? 'Bills' : streamMode ? 'HashpayStream' : accessMode ? accessView === 'wallet' ? 'x402 Wallet Manager' : 'x402 Wallet Manager' : paymentFlow === 'bank' ? 'Receive to Bank' : paymentFlow === 'bank-send' ? 'Send from Bank' : 'Receive USDC'}
        </h1>
        <p className="mt-2 text-[15px] text-gray-500 text-balance dark:text-gray-400">
          {productHubOpen
            ? 'Receive payments, manage x402, run HashpayStream, or PolyDesk.'
            : paymentMenuOpen
            ? 'Select the payment experience you want to create.'
            : circlePocketMode
            ? 'Choose the wallet area to manage.'
            : polymarketMode
            ? 'Fund, track, and scout Polymarket from one desk.'
            : posMode
            ? 'Choose a country, select settlement, and create one static QR.'
            : billsMode
            ? 'Utility bill payment will live here when it is ready.'
            : streamMode
              ? 'Stream USDC for payroll, agent services, and Arena games.'
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

        {/* ── Chain preview toggle — hidden in multi-chain mode (all chains active) */}
        {false && !productHubOpen && !paymentMenuOpen && !isBankReceive && !multiChainMode && !accessMode && !circlePocketMode && !posMode && !billsMode && !streamMode && !polymarketMode && <div className="mt-5 flex w-full flex-col items-center gap-2.5">
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
        {false && !productHubOpen && !paymentMenuOpen && !isBankReceive && multiChainMode && !accessMode && !circlePocketMode && !posMode && !billsMode && !streamMode && !polymarketMode && (
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
        style={{ overflowX: 'hidden' }}
      >
        {productHubOpen ? (
          <div className="space-y-2">
            {[
              { icon: Wallet, title: 'Circle Pocket Wallet', body: 'Fund services, pay bills, and send money from one Circle balance.', action: () => openCirclePocketMode() },
              { icon: Coins, title: 'Payment', body: 'Create personal, business, POS, or bills flows.', action: () => openPaymentMenu() },
              { icon: Radio, title: 'Stream', body: 'Creator, payroll, and Arena on Arc.', action: () => { window.location.href = '/stream' } },
              { icon: PolymarketMark, title: 'Poly', body: 'Funding, positions, and LP Scout.', action: () => openPolymarketMode() },
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
          </div>
        ) : paymentMenuOpen ? (
          <PaymentFlowCards />
        ) : (
          <>
        <div className="space-y-0 p-0">
          {circlePocketMode ? (
            <div className="space-y-5 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={closeCirclePocketMode}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]"
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
                {privyAuthenticated && (
                  <button
                    type="button"
                    onClick={() => void logoutPrivy()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-500 transition-all hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-400 dark:hover:bg-white/[0.1] dark:hover:text-gray-100"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </button>
                )}
              </div>

              {privyAuthenticated && privyEmail && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 dark:border-blue-400/20 dark:bg-blue-400/10">
                  <span className="min-w-0">
                    <span className="block text-[10px] font-bold uppercase tracking-widest text-blue-500 dark:text-blue-300">Circle identity</span>
                    <span className="block truncate text-xs font-semibold text-blue-900 dark:text-blue-100">{privyEmail}</span>
                  </span>
                  <span className="shrink-0 rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:border-blue-400/20 dark:bg-white/10 dark:text-blue-200">
                    Synced
                  </span>
                </div>
              )}

              {circlePocketView === 'chooser' ? (
                <div className="space-y-3">
                  {[
                    {
                      icon: Wallet,
                      title: 'Main Wallet',
                      body: 'Balance, fund, withdraw, and track USDC.',
                      action: () => setCirclePocketView('main'),
                    },
                    {
                      icon: Radio,
                      title: 'x402 Wallet',
                      body: 'Move available funds into paid service balance.',
                      action: () => setCirclePocketView('x402'),
                    },
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
                </div>
              ) : circlePocketView === 'x402' ? (
                <AgentWorkspace embedded forceProfile />
              ) : (
                <>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Balance</p>
                    <h2 className="mt-1 text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">Main Wallet</h2>
                    <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                      Add USDC, send it out, or use it across Hash PayLink.
                    </p>
                  </div>

                  <div className="grid grid-cols-4 gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-[#17181d]">
                    {[
                      { key: 'balance', label: 'Balance', icon: Activity },
                      { key: 'fund', label: 'Fund', icon: Download },
                      { key: 'withdraw', label: 'Withdraw', icon: ArrowRight },
                      { key: 'activity', label: 'Activity', icon: LayoutDashboard },
                    ].map(({ key, label, icon: Icon }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setCirclePocketTab(key as CirclePocketTab)}
                        className={cn(
                          'flex min-h-[46px] flex-col items-center justify-center gap-1 rounded-lg border px-1.5 text-[10px] font-bold transition-all',
                          circlePocketTab === key
                            ? 'border-gray-300 bg-gray-100 text-gray-950 shadow-sm dark:border-white/15 dark:bg-white/[0.12] dark:text-white'
                            : 'border-transparent bg-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200',
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    {POS_NETWORK_OPTIONS.map(network => (
                      <button
                        key={network.key}
                        type="button"
                        onClick={() => setCirclePocketNetwork(network.key)}
                        className={cn(
                          'rounded-lg border px-2 py-2 text-[11px] font-bold transition-all',
                          circlePocketNetwork === network.key
                            ? 'border-gray-950 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950'
                            : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400 dark:hover:border-white/20 dark:hover:text-gray-200',
                        )}
                      >
                        {network.label}
                      </button>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111216]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Total available</p>
                        <p className="mt-1 text-2xl font-black tracking-tight text-gray-950 dark:text-white">
                          ${formatAmount(circlePocketGlobalBalance, 6)}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Across Base, Arbitrum, Arc, and Solana.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => refreshCirclePocketBalances()}
                        disabled={!privyAuthenticated || circlePocketBalanceBusy}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-600 transition-all hover:bg-gray-100 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300"
                        aria-label="Refresh Circle Pocket balance"
                      >
                        <RefreshCw className={cn('h-4 w-4', circlePocketBalanceBusy && 'animate-spin')} />
                      </button>
                    </div>
                  </div>

                  {!privyAuthenticated ? (
                    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-br from-white to-gray-50 p-4 shadow-sm dark:border-white/10 dark:from-[#111216] dark:to-white/[0.04]">
                      <PrivyConnectButton className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-black active:scale-[0.98] disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100">
                        <Mail className="h-4 w-4" />
                        Sign in to continue
                        <span className="back-btn shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true">
                          <span className="arrow-container arrow-container--right">
                            <span className="chevron c1" />
                            <span className="chevron c2" />
                            <span className="chevron c3" />
                          </span>
                        </span>
                      </PrivyConnectButton>
                      <p className="mt-2 text-center text-xs font-medium text-gray-400 dark:text-gray-500">Start with email</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {circlePocketTab === 'balance' && (
                        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-[#111216]">
                          <div className="space-y-2 p-2">
                            {POS_NETWORK_OPTIONS.map(network => {
                              const row = circlePocketRows.find(item => item.key === network.key)
                              const wallet = circlePocketWallets[network.key]
                              return (
                                <div key={network.key} className="flex items-center justify-between gap-3 rounded-xl p-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-bold text-gray-950 dark:text-white">{network.label}</p>
                                    <p className="mt-0.5 text-[11px] text-gray-400">{wallet?.address ? truncateAddress(wallet.address) : 'Wallet not opened'}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm font-black text-gray-950 dark:text-white">${formatAmount(row?.balance ?? 0, 6)}</p>
                                    <p className={cn('mt-0.5 text-[10px] font-bold uppercase tracking-wider', row?.status === 'error' ? 'text-red-500' : 'text-emerald-500')}>
                                      {row?.status === 'error' ? 'Retry' : wallet?.address ? 'Ready' : 'Setup'}
                                    </p>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {circlePocketTab === 'fund' && (
                        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111216]">
                          <p className="text-sm font-bold text-gray-950 dark:text-white">Fund on {circlePocketNetworkLabel}</p>
                          <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">Send USDC to this address on the selected network.</p>
                          {circlePocketSelectedAddress ? (
                            <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                              <p className="break-all text-xs font-semibold text-gray-700 dark:text-gray-200">{circlePocketSelectedAddress}</p>
                              <button
                                type="button"
                                onClick={handleCirclePocketCopy}
                                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-gray-950 px-3 py-2 text-xs font-bold text-white dark:bg-white dark:text-gray-950"
                              >
                                {circlePocketCopied ? <CheckCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                {circlePocketCopied ? 'Copied' : 'Copy address'}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleCirclePocketSetup()}
                              disabled={circlePocketBusy}
                              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950"
                            >
                              {circlePocketBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                              Open {circlePocketNetworkLabel} wallet
                            </button>
                          )}
                        </div>
                      )}

                      {circlePocketTab === 'withdraw' && (
                        <div className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111216]">
                          <div>
                            <p className="text-sm font-bold text-gray-950 dark:text-white">Withdraw from {circlePocketNetworkLabel}</p>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Available: ${formatAmount(circlePocketSelectedBalance, 6)} USDC</p>
                          </div>
                          <input
                            type="text"
                            value={circlePocketWithdrawAddress}
                            onChange={(event) => setCirclePocketWithdrawAddress(event.target.value.trim())}
                            placeholder={circlePocketNetwork === 'solana' ? 'Destination Solana address' : '0x destination address'}
                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-medium text-gray-900 outline-none transition focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                          />
                          <div className="flex gap-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={circlePocketWithdrawAmount}
                              onChange={(event) => setCirclePocketWithdrawAmount(event.target.value)}
                              placeholder="0.00"
                              className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-medium text-gray-900 outline-none transition focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={handleCirclePocketWithdrawMax}
                              className="rounded-xl border border-gray-200 px-3 text-xs font-black text-gray-700 dark:border-white/10 dark:text-gray-200"
                            >
                              Max
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={handleCirclePocketWithdraw}
                            disabled={circlePocketWithdrawPending}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950"
                          >
                            {circlePocketWithdrawPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                            Withdraw
                          </button>
                          {circlePocketWithdrawNotice && <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{circlePocketWithdrawNotice}</p>}
                          {circlePocketWithdrawTxHash && <p className="break-all text-[11px] text-gray-400">Tx: {circlePocketWithdrawTxHash}</p>}
                        </div>
                      )}

                      {circlePocketTab === 'activity' && (
                        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111216]">
                          <p className="text-sm font-bold text-gray-950 dark:text-white">Recent Circle Pocket activity</p>
                          <div className="mt-3 space-y-2">
                            {(circlePocketActivity.length ? circlePocketActivity : ['No local wallet activity yet.']).map((item, index) => (
                              <div key={`${item}-${index}`} className="rounded-xl bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
                                {item}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {circlePocketError && (
                        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">
                          {circlePocketError}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : polymarketMode ? (
            <div className="space-y-5 p-4 sm:p-5">
              <button
                type="button"
                onClick={closePolymarketMode}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]"
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
              <button
                type="button"
                onClick={closeStreamMode}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]"
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

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">USDC on Arc</p>
                <h2 className="mt-1 text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">Choose a HashpayStream flow</h2>
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
                Same Hash PayLink platform. HashpayStream flows settle on Arc and can attach receipts, dashboards, and 0G records.
              </p>
            </div>
          ) : posMode ? (
            <>
            <div className="space-y-5 p-4 sm:p-5">
              {!privyAuthenticated && (
                <LocalCurrencySignInGate
                  title="Sign in for POS history"
                  body="POS creates local currency receipts and payout records, so it needs an account before setup."
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
                  bankAccountName={posBankAccountName}
                  onDraftChange={setLocalCurrencyProfileDraft}
                  onSave={saveLocalCurrencyProfile}
                  onEdit={editLocalCurrencyProfile}
                  onCancel={cancelLocalCurrencyProfileEdit}
                />
              )}

              {(posCountry || posSettlementPath || posMerchant) && (
                <button
                  type="button"
                  onClick={handlePosBack}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </button>
              )}

              {!posCountry ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Retail POS</p>
                    <h2 className="mt-1 text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">Choose country</h2>
                    <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                      Start with live USDC checkout, then add local wallet partners country by country.
                    </p>
                  </div>

                  <div className="grid gap-2">
                    {POS_COUNTRIES.map((country) => {
                      const live = country.status === 'live'
                      return (
                        <button
                          key={country.key}
                          type="button"
                          disabled={!live}
                          onClick={() => {
                            if (!privyAuthenticated || !localCurrencyProfileReady) {
                              setPosError('Sign in and save your payout profile before creating POS.')
                              return
                            }
                            setPosCountry(country.key)
                            setPosSettlementPath('PAYCREST_NAIRA')
                            setPosError('')
                          }}
                          className={cn(
                            'group flex items-center justify-between gap-4 rounded-2xl border p-4 text-left transition-all',
                            live && privyAuthenticated && localCurrencyProfileReady
                              ? 'border-gray-200 bg-gray-50 hover:-translate-y-0.5 hover:border-gray-300 hover:bg-white hover:shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/20 dark:hover:bg-white/[0.07]'
                              : 'cursor-not-allowed border-dashed border-gray-200 bg-gray-50/70 opacity-70 dark:border-white/10 dark:bg-white/[0.03]',
                          )}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-[11px] font-black text-gray-900 shadow-sm dark:bg-white/10 dark:text-white">
                                {country.key}
                              </span>
                              <div>
                                <p className="text-sm font-black text-gray-900 dark:text-white">{country.name}</p>
                                <p className="mt-0.5 text-xs leading-snug text-gray-500 dark:text-gray-400">{country.copy}</p>
                              </div>
                            </div>
                          </div>
                          <span className={cn(
                            'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold',
                            live
                              ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-950'
                              : 'border border-gray-200 bg-white text-gray-400 dark:border-white/10 dark:bg-white/[0.06]',
                          )}>
                            {country.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : !posMerchant ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                      Nigeria Naira POS
                    </p>
                    <h2 className="mt-1 text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">
                      Create Naira POS QR
                    </h2>
                    <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                      Payers enter Naira, pay with Base USDC, and you receive a bank payout.
                    </p>
                  </div>

                  <div className="grid gap-3">
                    <label className="block">
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Merchant name</span>
                      <input
                        value={posMerchantName}
                        onChange={(event) => {
                          setPosMerchantName(event.target.value)
                          setPosError('')
                        }}
                        placeholder="Shy Stores"
                        className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-medium text-gray-950 outline-none placeholder:text-gray-300 focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-gray-600 dark:focus:border-white/25"
                      />
                    </label>
                    <div>
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                        Network
                      </span>
                      <div className="mt-1.5 grid gap-2">
                        {posNetworkOptions.map((network) => {
                          const active = posNetworks.includes(network.key)
                          return (
                            <button
                              key={network.key}
                              type="button"
                              onClick={() => togglePosNetwork(network.key)}
                              className={cn(
                                'flex min-h-[42px] items-center justify-between rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-all',
                                active
                                  ? 'border-gray-900 bg-gray-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-gray-950'
                                  : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400 dark:hover:border-white/20',
                              )}
                            >
                              <span>{network.label}</span>
                              {network.badge && <span className={cn('text-[10px] font-bold uppercase tracking-wide', active ? 'text-white/70 dark:text-gray-500' : 'text-gray-400')}>{network.badge}</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    {posIsPaycrestFlow && (
                      <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">Nigerian bank account</p>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              Choose the bank and verify the account name before creating the QR.
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-3">
                          <label className="block">
                            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Bank</span>
                            {posBankInstitutions.length ? (
                              <select
                                value={posBankCode}
                                onChange={(event) => {
                                  const selected = posBankInstitutions.find((institution) => institution.code === event.target.value)
                                  setPosBankCode(event.target.value)
                                  setPosBankName(selected?.name ?? '')
                                  setPosBankVerified(false)
                                  setPosBankAccountName('')
                                  setPosError('')
                                }}
                                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-950 outline-none focus:border-gray-400 dark:border-white/10 dark:bg-gray-950 dark:text-white dark:focus:border-white/25"
                              >
                                <option value="">{posBankInstitutionsBusy ? 'Loading Paycrest banks...' : 'Select bank'}</option>
                                {posBankInstitutions.map((institution) => (
                                  <option key={institution.code} value={institution.code}>
                                    {institution.name} ({institution.code})
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                value={posBankCode}
                                onChange={(event) => {
                                  setPosBankCode(event.target.value.toUpperCase().trim())
                                  setPosBankName('')
                                  setPosBankVerified(false)
                                  setPosBankAccountName('')
                                  setPosError('')
                                }}
                                placeholder={posBankInstitutionsBusy ? 'Loading Paycrest banks...' : 'Paycrest bank code'}
                                className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-medium text-gray-950 outline-none placeholder:text-gray-300 focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-gray-600 dark:focus:border-white/25"
                              />
                            )}
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Account number</span>
                            <input
                              value={posBankAccount}
                              onChange={(event) => {
                                setPosBankAccount(event.target.value.replace(/\D/g, '').slice(0, 10))
                                setPosBankVerified(false)
                                setPosBankAccountName('')
                                setPosError('')
                              }}
                              inputMode="numeric"
                              placeholder="0123456789"
                              className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-medium text-gray-950 outline-none placeholder:text-gray-300 focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-gray-600 dark:focus:border-white/25"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={verifyPosBankAccount}
                            disabled={posBankVerifyBusy || !posBankCode || posBankAccount.length !== 10}
                            className="flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:border-white/20"
                          >
                            {posBankVerifyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {posBankVerified ? 'Account verified' : 'Verify account'}
                          </button>
                          {posBankAccountName && (
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">
                              {posBankAccountName}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {posError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300">
                      {posError}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={createPosMerchant}
                    disabled={!privyAuthenticated || posBusy || !posMerchantName.trim() || (posNeedsEvmWallet && !posWallet.trim()) || (posNeedsSolanaWallet && !posSolanaWallet.trim()) || !posPaycrestReady}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                  >
                    {posBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
                    Generate Naira POS QR
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Nigerian Retail Mode</p>
                    <h2 className="mt-1 text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">POS QR ready</h2>
                    <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                      Payers scan once and enter their amount.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                    <div className="flex items-center gap-4">
                      <div className="rounded-xl bg-white p-2 shadow-sm">
                        <QRCodeCanvas value={posCustomerUrl} size={112} level="H" includeMargin />
                      </div>
                      <div className="min-w-0">
                        <span className="inline-flex rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:border-white/10 dark:bg-white/[0.06]">
                          Static POS QR
                        </span>
                        <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{posMerchant.display_name}</p>
                        <p className="mt-1 truncate font-mono text-[11px] text-gray-500 dark:text-gray-400">
                          {truncateAddress(posMerchant.circle_smart_wallet_address, 8)}
                        </p>
                        <button
                          type="button"
                          onClick={copyPosCustomerLink}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {posCopied ? 'Copied' : 'Copy payer link'}
                        </button>
                      </div>
                    </div>
                    <p className="mt-3 text-[11px] font-medium text-gray-400 dark:text-gray-500">Payer link ready</p>
                  </div>

                  <div className="grid gap-2">
                    <a
                      href={posDashboardUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                    >
                      <LayoutDashboard className="h-4 w-4" />
                      View payments
                    </a>
                    <p className="text-center text-[11px] font-medium text-gray-400 dark:text-gray-500">
                      Payers open payment by scanning the QR or using the copied link.
                    </p>
                  </div>
                </div>
              )}
            </div>
            </>
          ) : billsMode ? (
            <>
            <div className="space-y-5 p-4 sm:p-5">
              <button
                type="button"
                onClick={() => openPaymentMenu()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
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
              <button
                type="button"
                onClick={closeAccessMode}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]"
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
              <AgentWorkspace embedded forceProfile />
            </div>
          ) : (
            <>
          <div className="overflow-hidden bg-gray-50/60 dark:bg-white/[0.035]">
            <div className="space-y-3.5 px-3.5 py-3 sm:p-4">
              <button
                type="button"
                onClick={() => openPaymentMenu()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>

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
              setBankCountry={setPosCountry}
              bankInstitutions={posBankInstitutions}
              bankInstitutionsBusy={posBankInstitutionsBusy}
              bankCode={posBankCode}
              setBankCode={setPosBankCode}
              bankName={posBankName}
              setBankName={setPosBankName}
              bankAccount={posBankAccount}
              setBankAccount={setPosBankAccount}
              bankAccountName={posBankAccountName}
              bankVerified={posBankVerified}
              bankVerifyBusy={posBankVerifyBusy}
              bankError={posError}
              verifyBankAccount={verifyPosBankAccount}
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
                  Payer sends Naira by bank transfer. Paycrest settles USDC to the selected destination after confirmation.
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

          {!accessMode && !isBankReceive && !isBankSend && (
            <div className="space-y-2.5 rounded-xl border border-gray-100 bg-white p-2.5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Payer network</p>
                  <p className="mt-0.5 text-xs font-medium text-gray-700 dark:text-gray-200">
                    {multiChainMode ? 'Payer chooses at checkout' : CHAIN_META[selectedNet].label}
                  </p>
                </div>
                <div className="relative shrink-0">
                  <select
                    value={multiChainMode ? 'multi' : selectedNet}
                    disabled={multiChainMode}
                    onChange={(event) => onNetworkSelect(event.target.value as ChainKey)}
                    className={cn(
                      'min-w-[128px] appearance-none rounded-lg border px-3 py-2 pr-8 text-xs font-bold outline-none transition-all',
                      multiChainMode
                        ? 'cursor-default border-gray-200 bg-gray-100 text-gray-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-400'
                        : 'border-gray-900 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950',
                    )}
                  >
                    {multiChainMode ? (
                      <option value="multi">Any supported</option>
                    ) : (
                      VISIBLE_CREATE_CHAINS.map((network) => (
                        <option key={network} value={network}>
                          {CHAIN_META[network].label}{network === 'arc' ? ' Testnet' : ''}
                        </option>
                      ))
                    )}
                  </select>
                  {!multiChainMode && <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/70 dark:text-gray-500" />}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (receiveMode !== 'email') toggleMultiChainMode(!multiChainMode)
                }}
                disabled={receiveMode === 'email'}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left transition-all hover:border-gray-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/10 dark:bg-white/[0.035] dark:hover:border-white/20"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">Let payer choose network</span>
                  <span className="block text-[11px] font-medium text-gray-400 dark:text-gray-500">
                    {receiveMode === 'email'
                      ? 'Circle Pocket uses the selected network.'
                      : multiChainMode
                      ? 'Add addresses per network.'
                      : 'Use one selected network.'}
                  </span>
                </span>
                <span className={cn(
                  'relative h-6 w-10 shrink-0 rounded-full p-0.5 transition-all',
                  multiChainMode ? 'bg-gray-950 shadow-inner dark:bg-white' : 'bg-gray-200 dark:bg-white/10',
                )}>
                  <span className={cn(
                    'block h-5 w-5 rounded-full bg-white shadow-sm transition-transform dark:bg-gray-950',
                    multiChainMode ? 'translate-x-4' : 'translate-x-0',
                  )} />
                </span>
              </button>
            </div>
          )}

          {!accessMode && multiChainMode && (
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3.5 py-3 dark:border-white/10 dark:bg-white/[0.04]">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Add receiving addresses</p>
              <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">Enter one address for each network payers can choose.</p>
            </div>
          )}

          {(isEvmNet || multiChainMode) && !isBankReceive && (multiChainMode || receiveMode === 'paste') && <fieldset className="space-y-1.5">
            <label className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                {isBankSend ? 'Recipient wallet address' : multiChainMode ? 'EVM wallet address' : 'Wallet address'}
              </span>
              <span className="hidden text-[11px] font-medium text-gray-400 sm:inline">
                {multiChainMode ? 'Base · Arc Testnet · Arbitrum' : 'Starts with 0x'}
              </span>
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="0x... wallet address"
                value={evmAddr}
                onChange={(e) => setEvmAddr(e.target.value.trim())}
                spellCheck={false}
                autoComplete="off"
                className={cn(
                  'w-full rounded-xl border bg-gray-50/60 px-3.5 py-2.5 font-mono text-sm',
                  'placeholder:text-gray-400 transition-all focus:bg-white focus:outline-none focus:ring-2 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100 dark:placeholder:text-gray-600 dark:focus:bg-white/[0.06]',
                  evmDirty && !evmValid
                    ? 'border-red-300 pr-10 text-red-600 focus:ring-red-100 dark:border-red-400/40 dark:text-red-300 dark:focus:ring-red-400/10'
                    : evmValid
                    ? 'border-emerald-300 text-gray-900 focus:ring-emerald-100 dark:border-emerald-400/40 dark:text-gray-100 dark:focus:ring-emerald-400/10'
                    : 'border-gray-200 text-gray-900 focus:border-[#0071E3]/40 focus:ring-[#0071E3]/15 dark:border-white/10 dark:text-gray-100 dark:focus:border-blue-400/40 dark:focus:ring-blue-400/10',
                )}
              />
              {evmDirty && !evmValid && (
                <XCircle className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-400" />
              )}
            </div>
            {evmDirty && !evmValid && (
              <p className="flex items-center gap-1 text-xs text-red-500">
                <Info className="h-3 w-3" /> Enter a valid wallet address that starts with 0x
              </p>
            )}
            {evmValid && (
              <div className="flex items-center justify-between gap-3">
                <p className="flex min-w-0 items-center gap-1.5 text-xs text-emerald-600">
                  <CheckCheck className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {connectedEvm && evmAddr.toLowerCase() === connectedEvm.toLowerCase()
                      ? `Connected wallet · ${truncateAddress(evmAddr, 8)}`
                      : truncateAddress(evmAddr, 8)}
                  </span>
                </p>
                {connectedEvm && evmAddr.toLowerCase() === connectedEvm.toLowerCase() && (
                  <button
                    type="button"
                    onClick={disconnectConnectedEvmRecipient}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 transition-colors hover:bg-zinc-200 hover:text-zinc-950 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/15 dark:hover:text-white"
                    aria-label="Disconnect connected wallet"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {multiChainMode ? 'EVM address for Base, Arc, or Arbitrum.' : 'Paste EVM address.'}
            </p>
          </fieldset>}
          {(selectedNet === 'solana' || multiChainMode) && !isBankReceive && !isBankSend && (multiChainMode || receiveMode === 'paste') && <fieldset className="space-y-1.5">
            <label className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                Solana wallet address
              </span>
              <span className="hidden text-[11px] font-medium text-gray-400 sm:inline">No 0x · usually 32-44 chars</span>
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Solana wallet address"
                value={solanaAddr}
                onChange={(e) => { setSolanaAddr(e.target.value.trim()); setGeneratedLink('') }}
                spellCheck={false}
                autoComplete="off"
                className={cn(
                  'w-full rounded-xl border bg-gray-50/60 px-3.5 py-2.5 font-mono text-sm',
                  'placeholder:text-gray-400 transition-all focus:bg-white focus:outline-none focus:ring-2 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100 dark:placeholder:text-gray-600 dark:focus:bg-white/[0.06]',
                  solanaDirty && !solanaValid
                    ? 'border-red-300 pr-10 text-red-600 focus:ring-red-100 dark:border-red-400/40 dark:text-red-300 dark:focus:ring-red-400/10'
                    : solanaValid
                    ? 'border-emerald-300 text-gray-900 focus:ring-emerald-100 dark:border-emerald-400/40 dark:text-gray-100 dark:focus:ring-emerald-400/10'
                    : 'border-gray-200 text-gray-900 focus:border-[#14F195]/40 focus:ring-[#14F195]/15 dark:border-white/10 dark:text-gray-100 dark:focus:border-emerald-400/40 dark:focus:ring-emerald-400/10',
                )}
              />
              {solanaDirty && !solanaValid && (
                <XCircle className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-400" />
              )}
            </div>
            {solanaDirty && !solanaValid && (
              <p className="flex items-center gap-1 text-xs text-red-500">
                <Info className="h-3 w-3" /> Enter a valid Solana wallet address
              </p>
            )}
            {solanaValid && (
              <div className="flex items-center justify-between gap-3">
                <p className="flex min-w-0 items-center gap-1 text-xs text-emerald-600">
                  <CheckCheck className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {receiveMode === 'email' && solanaValid
                      ? `Circle Solana wallet · ${truncateAddress(solanaAddr, 8)}`
                      : connectedSolana && solanaAddr === connectedSolana
                      ? `Connected wallet · ${truncateAddress(solanaAddr, 8)}`
                      : truncateAddress(solanaAddr, 8)}
                  </span>
                </p>
                {connectedSolana && solanaAddr === connectedSolana && (
                  <button
                    type="button"
                    onClick={disconnectConnectedSolanaRecipient}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 transition-colors hover:bg-zinc-200 hover:text-zinc-950 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/15 dark:hover:text-white"
                    aria-label="Disconnect connected wallet"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
            {selectedNet === 'solana' && (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {receiveMode === 'email' && solanaValid ? 'Circle Solana wallet.' : 'Paste Solana address.'}
              </p>
            )}
          </fieldset>}

          {/* ── Amount ───────────────────────────────────────────────── */}
          {flexAmount && (
            <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gray-900 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950">
                <Sliders className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold leading-tight text-gray-800 dark:text-gray-100">Flexible amount enabled</p>
                <p className="mt-0.5 text-[11px] font-medium leading-snug text-gray-400 dark:text-gray-500">
                  {isBankReceive || isBankSend ? 'Payer enters the Naira amount.' : 'Payer enters the amount.'}
                </p>
              </div>
            </div>
          )}
          {!flexAmount && <fieldset className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              {isBankReceive || isBankSend ? <Landmark className="h-3.5 w-3.5 text-gray-400" /> : <Coins className="h-3.5 w-3.5 text-gray-400" />}
              {isBankReceive || isBankSend ? 'Naira amount' : 'Amount'}
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.0"
                value={amt}
                onChange={(e) => { setAmt(normalizeAmountInput(e.target.value)); setGeneratedLink('') }}
                className={cn(
                  'w-full rounded-xl border bg-gray-50/60 px-3.5 py-2.5 pr-28 text-sm',
                  'placeholder:text-gray-400 transition-all focus:bg-white focus:outline-none focus:ring-2 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100 dark:placeholder:text-gray-600 dark:focus:bg-white/[0.06]',
                  amtDirty && !isValidAmt
                    ? 'border-red-300 focus:ring-red-100 dark:border-red-400/40 dark:text-red-300 dark:focus:ring-red-400/10'
                    : 'border-gray-200 focus:border-[#0071E3]/40 focus:ring-[#0071E3]/15 dark:border-white/10 dark:text-gray-100 dark:focus:border-blue-400/40 dark:focus:ring-blue-400/10',
                )}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-gray-400 whitespace-nowrap">
                {isBankReceive || isBankSend ? 'NGN' : 'USDC'}
              </span>
            </div>
            {amtDirty && !isValidAmt && (
              <p className="flex items-center gap-1 text-xs text-red-500">
                <Info className="h-3 w-3" /> Enter a valid amount greater than 0
              </p>
            )}
            {!amtDirty && (
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                {isBankReceive
                  ? 'Enter the Naira amount the payer should pay.'
                  : isBankSend
                  ? 'Enter the Naira amount the payer will send from their bank.'
                  : multiChainMode
                  ? 'USDC on Base, Arc Testnet, Solana, or Arbitrum — payer chooses the chain'
                  : `USDC on ${selectedNet === 'arc' ? 'Arc Testnet' : CHAIN_META[selectedNet].label}`}
              </p>
            )}
          </fieldset>}

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
                    Checkout will show Paycrest Nigerian bank transfer instructions.
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

          <fieldset className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              <Tag className="h-3.5 w-3.5 text-gray-400" />
              Payment note
              <span className="text-xs font-normal text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="Coffee, Invoice #042, Split dinner..."
              value={memo}
              maxLength={100}
              onChange={(e) => { setMemo(e.target.value); setGeneratedLink('') }}
              className="w-full rounded-xl border border-gray-200 bg-gray-50/60 px-3.5 py-2.5 text-sm placeholder:text-gray-400 transition-all focus:border-[#0071E3]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]/15 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100 dark:placeholder:text-gray-600 dark:focus:border-blue-400/40 dark:focus:bg-white/[0.06] dark:focus:ring-blue-400/10"
            />
          </fieldset>

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
          <button
            type="button"
            onClick={() => toggleFlexAmount(!flexAmount)}
            className={cn(
              'w-full rounded-xl border p-3 text-left transition-all',
              flexAmount
                ? 'border-gray-300 bg-white shadow-sm dark:border-white/15 dark:bg-white/[0.05]'
                : 'border-gray-200 bg-white hover:border-gray-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20',
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-all',
                  flexAmount
                    ? 'border-gray-900 bg-gray-950 text-white dark:border-white/20 dark:bg-gray-900 dark:text-white'
                    : 'border-gray-200 bg-white text-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-500',
                )}>
                  <Sliders className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-tight text-gray-800 dark:text-gray-100">Let payer enter amount</span>
                  <span className="block text-[11px] font-medium leading-snug text-gray-400 dark:text-gray-500">
                    {isBankReceive || isBankSend ? 'Payer enters the Naira amount.' : 'Payer enters the amount.'}
                  </span>
                </span>
              </div>
              <span className={cn(
                'relative h-6 w-10 shrink-0 rounded-full p-0.5 transition-all sm:h-7 sm:w-12',
                flexAmount ? 'bg-gray-950 shadow-inner dark:bg-white' : 'bg-gray-200 dark:bg-white/10',
              )}>
                <span className={cn(
                  'block h-5 w-5 rounded-full bg-white shadow-sm transition-transform dark:bg-gray-950 sm:h-6 sm:w-6',
                  flexAmount ? 'translate-x-4 sm:translate-x-5' : 'translate-x-0',
                )} />
              </span>
            </div>
          </button>
            </div>
          </div>

          {/* ── Generate / checking button ───────────────────────────── */}
          <div className="space-y-2 p-3 sm:p-4">
          {vaultStep === 'idle' && (
            <button
              onClick={handleGenerate}
              disabled={!canGenerate || (isBankReceive && posBusy)}
              className={cn(
                'flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-3 text-center text-sm font-semibold leading-tight transition-all duration-200',
                canGenerate && !(isBankReceive && posBusy)
                  ? 'bg-black text-white shadow-button hover:bg-gray-800 hover:shadow-md active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200'
                  : 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-white/[0.06] dark:text-gray-500',
              )}
            >
              {(isBankReceive || isBankSend) && posBusy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Link2 className="h-4 w-4 shrink-0" />}
              <span>{isBankReceive ? 'Create Bank PayLink' : isBankSend ? 'Create Bank-to-USDC PayLink' : 'Generate Payment Link'}</span>
              {canGenerate && !((isBankReceive || isBankSend) && posBusy) && <ArrowRight className="h-4 w-4 shrink-0" />}
            </button>
          )}

          {isBankReceive && vaultStep === 'idle' && (
            <div className="space-y-1 px-2 text-center text-xs leading-snug">
              {posError && <p className="font-medium text-red-500">{posError}</p>}
              {!canGenerateBankReceive && !posError && (
                <p className="text-gray-400 dark:text-gray-500">
                  Sign in, save your profile, verify bank account, and enter a Naira amount.
                </p>
              )}
            </div>
          )}

          {isBankSend && vaultStep === 'idle' && (
            <div className="space-y-1 px-2 text-center text-xs leading-snug">
              <p className="text-gray-400 dark:text-gray-500">
                Payer checkout will collect refund bank details before creating the Paycrest on-ramp order.
              </p>
            </div>
          )}

          {!isBankReceive && !isBankSend && !canGenerate && vaultStep === 'idle' && (
            multiChainMode
              ? (!evmDirty && !solanaDirty)
              : (selectedNet === 'solana' ? !solanaDirty : !evmDirty)
          ) && (
            <p className="px-2 text-center text-xs leading-snug text-gray-400 dark:text-gray-500">
              {multiChainMode
                ? 'Enter at least one wallet address to continue'
                : `Enter a ${selectedNet === 'solana' ? 'Solana' : 'wallet'} address to continue`}
            </p>
          )}
          </div>
            </>
          )}
        </div>

        {/* ── Link ready panel ─────────────────────────────────────────── */}
        {linkReady && (
          <div className="animate-slide-up space-y-4 border-t border-gray-100 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.03] sm:p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-900 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950">
                    <CheckCheck className="h-3.5 w-3.5" />
                  </span>
                  Link Ready
                </p>
                <button onClick={handleReset} className="text-xs font-medium text-gray-400 transition-colors hover:text-gray-700 dark:hover:text-gray-200">
                  Start over
                </button>
              </div>

              {/* Preview + QR side by side */}
              <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.04] sm:flex-row sm:items-start">
                {/* Left — link details */}
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Preview</p>
                  <div className="flex items-baseline gap-1.5">
                    {flexAmount
                      ? <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-sm font-semibold text-gray-800 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100"><Sliders className="h-3.5 w-3.5" />Flexible</span>
                      : <><span className="text-2xl font-bold text-gray-900 dark:text-white">{formatAmount(amt, 6)}</span><span className="text-sm font-medium text-gray-500 dark:text-gray-400">USDC</span></>
                    }
                  </div>
                  <div className="space-y-1">
                    {evmValid && (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>{multiChainMode ? 'Base · Arc Testnet · Arbitrum' : CHAIN_META[selectedNet].label}:</span>
                        <span className="font-mono text-gray-700 dark:text-gray-200">{truncateAddress(evmAddr, 8)}</span>
                      </div>
                    )}
                    {solanaValid && (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>Solana:</span>
                        <span className="font-mono text-gray-700 dark:text-gray-200">{truncateAddress(solanaAddr, 8)}</span>
                      </div>
                    )}
                    {memo && (
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>Payment note: <span className="font-medium text-gray-700 dark:text-gray-200">"{memo}"</span></span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right — QR code (single payment mode only) */}
                {!effectiveEventMode && (
                  <div className="flex shrink-0 flex-col items-center gap-1.5 self-center sm:self-auto">
                    <div ref={qrRef} className="relative rounded-xl border border-gray-100 bg-white p-1.5 shadow-sm">
                      <QRCodeCanvas value={generatedLink} size={112} level="H" includeMargin />
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="rounded-sm bg-white p-0.5">
                          <img src="/hash-logo.png" alt="" className="h-4 w-4 object-contain" />
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={downloadQR}
                      className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-medium text-gray-500 transition-all hover:bg-gray-50 hover:text-gray-700 active:scale-[0.98]"
                    >
                      <Download className="h-3 w-3" /> Save
                    </button>
                  </div>
                )}
              </div>

              {/* Share + Test buttons */}
              <div className="grid gap-2.5 sm:grid-cols-[1fr_auto]">
                <button
                  onClick={handleShare}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98]',
                    copied
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300'
                      : 'bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200',
                  )}
                >
                  {copied ? <><CheckCheck className="h-4 w-4" /> Copied!</> : <><Share2 className="h-4 w-4" /> Share</>}
                </button>
                <a
                  href={generatedLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:border-white/20 dark:hover:bg-white/[0.07]"
                >
                  <ExternalLink className="h-4 w-4" />
                  Test
                </a>
              </div>

              {/* Organizer dashboard — multi-payer / access mode only */}
              {!effectiveEventMode && (
                <a
                  href={buildGlobalDashboardLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:border-white/20 dark:hover:bg-white/[0.07]"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  View payments
                </a>
              )}

              {effectiveEventMode && (
                <div className="grid gap-2">
                  <a
                    href={buildDashboardLink()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:border-white/20 dark:hover:bg-white/[0.07]"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    View payments
                  </a>
                </div>
              )}

              {effectiveEventMode && (
                <p className="text-[11px] text-gray-400">
                  {accessMode
                    ? 'Each payer enters their name — used to generate their personal access link after payment.'
                    : 'Each payer must enter their name before paying — their entry will appear live in the dashboard.'}
                </p>
              )}

              {/* Hidden 1024px canvas for UHD download */}
              <div ref={qrHiResRef} aria-hidden="true"
                style={{ position: 'absolute', left: '-9999px', visibility: 'hidden' }}>
                <QRCodeCanvas value={generatedLink} size={1024} level="H" includeMargin />
              </div>
            </div>
          </div>
        )}
          </>
        )}
      </div>

      {/* ── Last event dashboard recovery ────────────────────────────── */}
      {!generatedLink && chatCta && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <p className="text-center text-[11px] font-medium text-gray-400 dark:text-gray-500">
            Or at your convenience
          </p>
          <a
            href={chatCta.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full max-w-[18rem] items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200 sm:max-w-[20rem]"
          >
            <MessageCircle className="h-4 w-4" />
            {chatCta.label}
          </a>
          <p className="text-center text-[11px] font-medium text-gray-400 dark:text-gray-500">
            WhatsApp support coming soon.
          </p>
        </div>
      )}

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
