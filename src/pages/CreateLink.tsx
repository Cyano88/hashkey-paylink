import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useOutletContext, Link } from 'react-router-dom'
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
  MessageCircle,
  Send,
  Tag,
  Coins,
  ExternalLink,
  Sparkles,
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
} from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import { FX_CURRENCIES, getFxMeta, formatLocalAmt, fetchFxRate } from '../lib/fx'
import { isAddress, type Address } from 'viem'
import { cn, truncateAddress, formatAmount, copyToClipboard } from '../lib/utils'
import { useStarknet } from '../lib/StarknetContext'
import { useSolana }   from '../lib/SolanaContext'
import { CHAIN_META, type ChainKey } from '../lib/chains'
import { isValidSolanaAddress } from '../lib/solanaAddress'
import { setPaylinkParam } from '../lib/paylinkParams'
import { PRIVY_AUTH_ENABLED } from '../lib/authMode'
import { EVM_CLIENTS, ERC20_BALANCE_OF_ABI } from '../lib/router'
import { canUseCircleEvmEmailWallet, connectCircleEvmEmailWallet } from '../lib/circleEvmEmailWallet'
import { canUseCircleSolanaEmailWallet, connectCircleSolanaEmailWallet } from '../lib/circleSolanaEmailWallet'
import { resolvePrivyCircleLink, savePrivyCircleLink } from '../lib/privyCircleLink'

// ─── Starknet address: 0x followed by exactly 64 hex chars ──────────────────
const isValidStarkAddr = (v: string) => /^0x[0-9a-fA-F]{64}$/.test(v)

// ─── Solana address: base58, 32–44 characters ────────────────────────────────
const isValidSolanaAddr = isValidSolanaAddress

const VISIBLE_CREATE_CHAINS: ChainKey[] = ['base', 'arc', 'solana', 'arbitrum']
const SHOW_STARKNET_CREATE_UI = false
const TELEGRAM_AGENT_URL = import.meta.env.VITE_TELEGRAM_AGENT_URL || 'https://t.me/hashpaylinkbot'

type VaultStep = 'idle' | 'ready'
type ReceiveMode = 'email' | 'paste'
type PosNetwork = 'base' | 'arbitrum' | 'arc' | 'solana'
type PosMerchant = {
  merchant_id: string
  display_name: string
  circle_smart_wallet_address: string
  solana_wallet_address?: string
  supported_networks?: PosNetwork[]
}

const POS_NETWORK_OPTIONS: Array<{ key: PosNetwork; label: string; badge?: string }> = [
  { key: 'base', label: 'Base' },
  { key: 'arbitrum', label: 'Arbitrum' },
  { key: 'arc', label: 'Arc', badge: 'Testnet' },
  { key: 'solana', label: 'Solana' },
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
}) {
  const { authenticated: privyAuthenticated, user: privyUser, login: loginPrivy, logout: logoutPrivy, getAccessToken } = usePrivy()
  const privyEmail = emailFromPrivyUser(privyUser).trim().toLowerCase()
  const [circleRecipientPending, setCircleRecipientPending] = useState(false)
  const [circleRecipientError, setCircleRecipientError] = useState<string | null>(null)
  const [circleWalletBalance, setCircleWalletBalance] = useState('Balance --')
  const circleRecipientRunKey = useRef('')

  async function handleEmailRecipient() {
    setReceiveMode('email')
    setGeneratedLink('')
    setCircleRecipientError(null)

    if (!canReceiveWithEmail) {
      setCircleRecipientError('Email receiving is not configured for this network. Paste a wallet address instead.')
      return
    }

    if (!privyAuthenticated) {
      loginPrivy({ loginMethods: ['email'] })
      return
    }

    if (!privyEmail) {
      setCircleRecipientError('Sign in with email to receive with the Circle wallet for this network.')
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
    if (receiveMode !== 'email' || !privyAuthenticated || !privyEmail || circleRecipientPending) return
    if (selectedNet === 'solana' ? solanaValid : evmValid) return
    void handleEmailRecipient()
  }, [receiveMode, privyAuthenticated, privyEmail, selectedNet]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (canReceiveWithEmail) return
    setReceiveMode('paste')
    setCircleRecipientError(null)
  }, [canReceiveWithEmail, setReceiveMode])

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
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
        Receive to
      </label>
      <div className={cn('grid gap-2', canReceiveWithEmail ? 'grid-cols-2' : 'grid-cols-1')}>
        <button
          type="button"
          onClick={() => {
            setReceiveMode('paste')
            setCircleRecipientError(null)
            setGeneratedLink('')
          }}
          className={cn(
            'rounded-xl border px-3 py-3 text-left transition-all active:scale-[0.99]',
            receiveMode === 'paste'
              ? 'border-gray-900 bg-gray-50 text-gray-900 dark:border-white/30 dark:bg-white/10 dark:text-gray-100'
              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:border-white/20 dark:hover:bg-white/[0.07]',
          )}
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Wallet className="h-4 w-4 text-gray-500" />
            Paste wallet address
          </span>
          <span className="mt-1 block text-[11px] text-gray-400">Any wallet or exchange</span>
        </button>
        {canReceiveWithEmail && (
          <button
            type="button"
            onClick={handleEmailRecipient}
            disabled={circleRecipientPending}
            className={cn(
              'rounded-xl border px-3 py-3 text-left transition-all active:scale-[0.99]',
              receiveMode === 'email'
                ? 'border-gray-900 bg-gray-50 text-gray-900 dark:border-white/30 dark:bg-white/10 dark:text-gray-100'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:border-white/20 dark:hover:bg-white/[0.07]',
              circleRecipientPending && 'cursor-not-allowed opacity-70',
            )}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              {circleRecipientPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4 text-blue-500" />}
              Receive with email
            </span>
            <span className="mt-1 block text-[11px] text-gray-400">
              Single-network Circle wallet
            </span>
          </button>
        )}
      </div>

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
                  : privyEmail || 'Sign in with email to continue'}
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
          Email receiving for Solana is not enabled here yet.
        </p>
      )}
    </div>
  )
}

export default function CreateLink() {
  const { authenticated: privyAuthenticated, logout: logoutPrivy } = usePrivy()
  const [evmAddr,       setEvmAddr]       = useState('')
  const [starkAddr,     setStarkAddr]     = useState('')
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
  const [agentUrl,       setAgentUrl]       = useState('')
  const [agentUrlStatus, setAgentUrlStatus] = useState<'idle' | 'checking' | 'ok' | 'incompatible'>('idle')
  const [receiveMode,    setReceiveMode]    = useState<ReceiveMode>('paste')
  const [posMode,        setPosMode]        = useState(false)
  const [posMerchantName, setPosMerchantName] = useState('')
  const [posNetworks,    setPosNetworks]    = useState<PosNetwork[]>(['base'])
  const [posWallet,      setPosWallet]      = useState('')
  const [posSolanaWallet, setPosSolanaWallet] = useState('')
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
  const isEvmNet = selectedNet !== 'starknet' && selectedNet !== 'solana'
  const [vaultStep,     setVaultStep]     = useState<VaultStep>('idle')

  useEffect(() => {
    if (!VISIBLE_CREATE_CHAINS.includes(selectedNet)) onNetworkSelect('base')
  }, [selectedNet, onNetworkSelect])

  useEffect(() => {
    if (multiChainMode) setReceiveMode('paste')
  }, [multiChainMode])
  // Background check — null=checking, true=deployed, false=not deployed

  // ── Wallet hooks ──────────────────────────────────────────────────────────
  const { address: connectedEvm } = useAccount()
  const { disconnect: disconnectEvm } = useDisconnect()
  const { address: connectedStark }            = useStarknet()
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
    if (SHOW_STARKNET_CREATE_UI && connectedStark && starkAddr === '' && (selectedNet === 'starknet' || multiChainMode)) setStarkAddr(connectedStark)
  }, [connectedStark, selectedNet, multiChainMode])  // eslint-disable-line react-hooks/exhaustive-deps

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
    setEvmAddr(''); setStarkAddr(''); setSolanaAddr('')
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
    if (!fxShow || !eventMode || !fxCurrency) { setFxPreviewRate(null); return }
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
  }, [fxShow, fxCurrency, eventMode, fxSrc, fxCustomRate])

  // ── Validation ─────────────────────────────────────────────────────────
  const evmDirty    = evmAddr.length > 0
  const starkDirty  = starkAddr.length > 0
  const solanaDirty = solanaAddr.length > 0
  const amtDirty    = amt.length > 0

  const evmValid    = isAddress(evmAddr)
  const starkValid  = isValidStarkAddr(starkAddr)
  const solanaValid = isValidSolanaAddr(solanaAddr)
  const isValidAmt  = amtDirty && /^(?:\d+|\d*\.\d+)$/.test(amt) && Number(amt) > 0

  // In access mode event collection is always on
  const effectiveEventMode = accessMode || eventMode

  const hasAddress = multiChainMode
    ? (evmValid || solanaValid || (SHOW_STARKNET_CREATE_UI && starkValid))
    : (selectedNet === 'solana' ? solanaValid : isEvmNet ? evmValid : (SHOW_STARKNET_CREATE_UI && starkValid))

  const canGenerate = (flexAmount || isValidAmt) && hasAddress && (!accessMode || agentUrlStatus === 'ok')

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
  function toggleAccessMode(on: boolean) {
    setPosMode(false)
    setAccessMode(on)
    setAgentUrl('')
    setAgentUrlStatus('idle')
    if (on && !eventId) {
      const bytes = crypto.getRandomValues(new Uint8Array(16))
      setEventId(Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''))
    }
    setGeneratedLink('')
    setVaultStep('idle')
  }

  function openPosMode() {
    setPosMode(true)
    setAccessMode(false)
    setGeneratedLink('')
    setCopied(false)
    setVaultStep('idle')
    setPosError('')
  }

  function closePosMode() {
    setPosMode(false)
    setPosError('')
  }

  const posCustomerUrl = posMerchant
    ? `${window.location.origin}/pos/ng?merchant_id=${encodeURIComponent(posMerchant.merchant_id)}`
    : ''

  const posNeedsEvmWallet = posNetworks.some((network) => network !== 'solana')
  const posNeedsSolanaWallet = posNetworks.includes('solana')
  const posMerchantNetworks = posMerchant?.supported_networks?.length ? posMerchant.supported_networks : ['base']
  const posDashboardNetwork = posMerchantNetworks.find((network) => network !== 'solana') ?? 'solana'
  const posDashboardAddressParam = posDashboardNetwork === 'solana' ? 's' : 'e'
  const posDashboardAddress = posDashboardNetwork === 'solana' ? posMerchant?.solana_wallet_address : posMerchant?.circle_smart_wallet_address
  const posDashboardUrl = posMerchant
    ? `${window.location.origin}/dashboard?${posDashboardAddressParam}=${encodeURIComponent(posDashboardAddress ?? '')}&n=${encodeURIComponent(posDashboardNetwork)}&id=${encodeURIComponent(`ngpos-${posMerchant.merchant_id}`)}&src=ngpos`
    : ''

  function togglePosNetwork(network: PosNetwork) {
    setPosNetworks((current) => {
      if (current.includes(network)) {
        return current.length === 1 ? current : current.filter((item) => item !== network)
      }
      return [...current, network]
    })
    setPosError('')
  }

  async function createPosMerchant() {
    setPosBusy(true)
    setPosError('')
    try {
      const response = await fetch('/api/ng-pos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'createMerchant',
          payout_preference: 'KEEP_CRYPTO',
          display_name: posMerchantName.trim(),
          supported_networks: posNetworks,
          circle_smart_wallet_address: posWallet.trim(),
          solana_wallet_address: posSolanaWallet.trim(),
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
      if (SHOW_STARKNET_CREATE_UI && starkValid) setPaylinkParam(params, 'k', starkAddr)
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
      if (accessMode && agentUrl) setPaylinkParam(params, 'g', agentUrl)
      return `${window.location.origin}/pay?${params.toString()}`
    }
    const params = new URLSearchParams({ n: selectedNet })
    if (!flexAmount) params.set('a', amt); else params.set('f', '1')
    if (selectedNet === 'solana')  setPaylinkParam(params, 's', solanaAddr)
    else if (isEvmNet)             setPaylinkParam(params, 'e', evmAddr)
    else if (SHOW_STARKNET_CREATE_UI) setPaylinkParam(params, 'k', starkAddr)
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
      if (SHOW_STARKNET_CREATE_UI && starkValid) setPaylinkParam(params, 'k', starkAddr)
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

  // ── Generate handler ───────────────────────────────────────────────────
  function handleGenerate() {
    if (!canGenerate) return
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

  const shareMessage = `${memo.trim() ? `Pay ${formatAmount(amt, 6)} USDC for ${memo.trim()}` : `Pay ${formatAmount(amt, 6)} USDC with Hash PayLink`}\n${generatedLink}`
  const encodedShareText = encodeURIComponent(memo.trim() ? `Pay ${formatAmount(amt, 6)} USDC for ${memo.trim()}` : `Pay ${formatAmount(amt, 6)} USDC with Hash PayLink`)
  const encodedShareUrl = encodeURIComponent(generatedLink)
  const encodedShareMessage = encodeURIComponent(shareMessage)

  function handleReset() {
    setEvmAddr(''); setStarkAddr(''); setSolanaAddr(''); setAmt(''); setMemo('')
    setGeneratedLink(''); setCopied(false); setMultiChainMode(false); setFlexAmount(false)
    setVaultStep('idle')
    setAccessMode(false); setAgentUrl(''); setAgentUrlStatus('idle')
  }

  const linkReady = generatedLink !== ''

  return (
    <div className="mx-auto max-w-lg animate-fade-in">
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="mb-8 text-center">
        <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3.5 py-1.5 text-xs font-semibold text-[#0071E3]">
          <Sparkles className="h-3.5 w-3.5" />
          Multi-Chain PayFi
        </span>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-[2.25rem]">
          {posMode ? 'Create POS QR' : 'Create a Hash PayLink'}
        </h1>
        <p className="mt-2 text-[15px] text-gray-500 text-balance">
          {posMode ? 'Set up one static QR for local in-person payments.' : 'Request USDC from anyone — no app, no signup, just a link.'}
        </p>

        {/* ── Chain preview toggle — hidden in multi-chain mode (all chains active) */}
        {!multiChainMode && !posMode && <div className="mt-5 flex flex-col items-center gap-2.5">
          <div className="flex items-center justify-center gap-0.5 sm:gap-1 rounded-xl border border-gray-200 bg-gray-100/80 p-1 overflow-x-auto w-full sm:w-auto sm:inline-flex">
            {VISIBLE_CREATE_CHAINS.map((c) => {
              const m = CHAIN_META[c]
              const isActive = selectedNet === c
              return (
                <button
                  key={c}
                  onClick={() => onNetworkSelect(c)}
                  className={cn(
                    'flex shrink-0 items-center gap-1 sm:gap-1.5 rounded-lg px-1.5 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-semibold transition-all duration-150',
                    isActive ? m.toggleActive : 'text-gray-500 hover:text-gray-800',
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
                      isActive ? 'bg-white/20 text-white' : 'bg-cyan-100 text-cyan-700',
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
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-all duration-200',
                m.badgeBg, m.badgeText, m.badgeBorder,
              )}>
                <span className={cn('h-1.5 w-1.5 rounded-full', m.dotColor)} />
                {m.engineLabel}
              </span>
            )
          })()}
        </div>}

        {/* Multi-chain mode active badge */}
        {multiChainMode && !posMode && (
          <div className="mt-5 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-semibold text-violet-700">
              <Globe className="h-3 w-3" />
              Multi-Chain · All networks active
            </span>
          </div>
        )}
      </div>

      {/* ── Form card ─────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card dark:border-white/10 dark:bg-[#111114]">
        <div className="space-y-5 p-6 sm:p-8">

          <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-gray-400">
            <img src="/brand/circle-logo.jpeg" alt="" className="h-4 w-4 rounded-full object-cover" />
            <span>Powered by Circle USDC</span>
          </div>

          {/* ── Payment / Access toggle ───────────────────────────────── */}
          <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-white/10 dark:bg-white/[0.04]">
            <button
              type="button"
              onClick={() => toggleAccessMode(false)}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all',
                !accessMode && !posMode ? 'bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white' : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300',
              )}
            >
              <Coins className="h-4 w-4" />
              Payment
            </button>
            <button
              type="button"
              onClick={() => toggleAccessMode(true)}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all',
                accessMode ? 'bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white' : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300',
              )}
            >
              <Bot className="h-4 w-4" />
              Agent
            </button>
            <button
              type="button"
              onClick={openPosMode}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all',
                posMode ? 'bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white' : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300',
              )}
            >
              <Store className="h-4 w-4" />
              POS
            </button>
          </div>

          {posMode ? (
            <div className="space-y-5">
              <button
                type="button"
                onClick={closePosMode}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>

              {!posMerchant ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Nigerian Retail Mode</p>
                    <h2 className="mt-1 text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">Create POS QR</h2>
                    <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                      One static QR for local in-person payments.
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
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Supported networks</span>
                      <div className="mt-1.5 grid grid-cols-2 gap-2">
                        {POS_NETWORK_OPTIONS.map((network) => {
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
                      <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">Payers will only see selected networks.</p>
                    </div>
                    {posNeedsEvmWallet && (
                      <label className="block">
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">EVM Circle wallet</span>
                        <input
                          value={posWallet}
                          onChange={(event) => {
                            setPosWallet(event.target.value.trim())
                            setPosError('')
                          }}
                          placeholder="0x..."
                          className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 font-mono text-sm font-medium text-gray-950 outline-none placeholder:text-gray-300 focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-gray-600 dark:focus:border-white/25"
                        />
                      </label>
                    )}
                    {posNeedsSolanaWallet && (
                      <label className="block">
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Solana Circle wallet</span>
                        <input
                          value={posSolanaWallet}
                          onChange={(event) => {
                            setPosSolanaWallet(event.target.value.trim())
                            setPosError('')
                          }}
                          placeholder="Solana wallet address"
                          className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 font-mono text-sm font-medium text-gray-950 outline-none placeholder:text-gray-300 focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-gray-600 dark:focus:border-white/25"
                        />
                      </label>
                    )}
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">Naira bank settlement</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Coming soon after licensed payout partner setup.</p>
                      </div>
                      <span className="shrink-0 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-400 dark:border-white/10 dark:bg-white/[0.06]">
                        Soon
                      </span>
                    </div>
                  </div>

                  {posError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300">
                      {posError}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={createPosMerchant}
                    disabled={posBusy || !posMerchantName.trim() || (posNeedsEvmWallet && !posWallet.trim()) || (posNeedsSolanaWallet && !posSolanaWallet.trim())}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                  >
                    {posBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
                    Generate POS QR
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Nigerian Retail Mode</p>
                    <h2 className="mt-1 text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">POS QR ready</h2>
                    <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                      Customers scan once and enter their amount.
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
                          {posCopied ? 'Copied' : 'Copy customer link'}
                        </button>
                      </div>
                    </div>
                    <p className="mt-3 text-[11px] font-medium text-gray-400 dark:text-gray-500">Customer link ready</p>
                  </div>

                  <div className="grid gap-2">
                    <a
                      href={posDashboardUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                    >
                      <LayoutDashboard className="h-4 w-4" />
                      Open receipts
                    </a>
                    <p className="text-center text-[11px] font-medium text-gray-400 dark:text-gray-500">
                      Customers open payment by scanning the QR or using the copied link.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : accessMode ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-white/[0.06]">
                    <Bot className="h-[18px] w-[18px] text-gray-700 dark:text-gray-200" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Agent</p>
                    <h2 className="mt-1 text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">Hash PayLink Agent</h2>
                    <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                      Create payment links, manage agent wallets, run market tools, and open StreamPay services from Telegram.
                    </p>
                  </div>
                </div>

                <div className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-100 bg-white px-3 dark:divide-white/10 dark:border-white/10 dark:bg-white/[0.05]">
                  {[
                    { icon: Link2, title: '/Payment Links', body: 'Request USDC, fund Polymarket, or fund a Circle CLI agent.', href: '/telegram/payment-links' },
                    { icon: Wallet, title: 'Agent wallets', body: 'Create or sign in to manage Circle CLI agent wallets.' },
                    { icon: Radio, title: 'Market tools', body: 'Run LP Scout and other market actions.' },
                    { icon: Zap, title: 'StreamPay services', body: 'Create and manage USDC streaming flows.' },
                  ].map(({ icon: Icon, title, body, href }) => {
                    const row = (
                      <>
                        <Icon className="h-4 w-4 shrink-0 text-gray-400" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{body}</p>
                        </div>
                        {href && <ArrowRight className="h-4 w-4 text-gray-400" />}
                      </>
                    )
                    return href ? (
                      <Link key={title} to={href} className="flex items-center gap-3 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                        {row}
                      </Link>
                    ) : (
                      <div key={title} className="flex items-center gap-3 py-3">
                        {row}
                      </div>
                    )
                  })}
                </div>

                <a
                  href={TELEGRAM_AGENT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                >
                  Open Telegram
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
                <Link to="/agent?profile=agent" className="text-xs font-medium text-gray-400 transition-colors hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200">
                  Agent wallet dashboard
                </Link>
                <Link to="/docs/access-mode" className="text-xs font-medium text-gray-400 transition-colors hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200">
                  Developer access docs
                </Link>
              </div>
            </div>
          ) : (
            <>

          {!accessMode && !multiChainMode && PRIVY_AUTH_ENABLED && (
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
            />
          )}

          {/* ── EVM Address — Base / HashKey / Arc ───────────────────── */}
          {!accessMode && multiChainMode && (
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3.5 py-3 dark:border-white/10 dark:bg-white/[0.04]">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Paste wallet addresses</p>
              <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">One address per network. Email receive is for single-network links.</p>
            </div>
          )}

          {(isEvmNet || multiChainMode) && (multiChainMode || receiveMode === 'paste') && <fieldset className="space-y-1.5">
            <label className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                {multiChainMode ? 'EVM wallet address' : 'Wallet address'}
              </span>
              <span className="text-[11px] font-medium text-gray-400">
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
                  'w-full rounded-xl border bg-gray-50/60 px-4 py-3 font-mono text-sm',
                  'placeholder:text-gray-400 transition-all focus:bg-white focus:outline-none focus:ring-2',
                  evmDirty && !evmValid
                    ? 'border-red-300 pr-10 text-red-600 focus:ring-red-100'
                    : evmValid
                    ? 'border-emerald-300 text-gray-900 focus:ring-emerald-100'
                    : 'border-gray-200 text-gray-900 focus:border-[#0071E3]/40 focus:ring-[#0071E3]/15',
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

          {/* ── Starknet Address — Starknet only ─────────────────────── */}
          {SHOW_STARKNET_CREATE_UI && (selectedNet === 'starknet' || multiChainMode) && <fieldset className="space-y-1.5">
            <label className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                Starknet Address
              </span>
              <span className="text-[11px] font-medium text-gray-400">Starknet Mainnet · WalletConnect</span>
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="0x… (exactly 64 hex chars)"
                value={starkAddr}
                onChange={(e) => { setStarkAddr(e.target.value.trim()); setGeneratedLink('') }}
                spellCheck={false}
                autoComplete="off"
                className={cn(
                  'w-full rounded-xl border bg-gray-50/60 px-4 py-3 font-mono text-sm',
                  'placeholder:text-gray-400 transition-all focus:bg-white focus:outline-none focus:ring-2',
                  starkDirty && !starkValid
                    ? 'border-red-300 pr-10 text-red-600 focus:ring-red-100'
                    : starkValid
                    ? 'border-purple-300 text-gray-900 focus:ring-purple-100'
                    : 'border-gray-200 text-gray-900 focus:border-[#8B5CF6]/40 focus:ring-[#8B5CF6]/15',
                )}
              />
              {starkDirty && !starkValid && (
                <XCircle className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-400" />
              )}
            </div>
            {starkDirty && !starkValid && (
              <p className="flex items-center gap-1 text-xs text-red-500">
                <Info className="h-3 w-3" /> Must be a valid 64-character Starknet address.
              </p>
            )}
            {starkValid && (
              <p className="flex items-center gap-1 text-xs text-purple-600">
                <CheckCheck className="h-3 w-3" />
                {connectedStark && starkAddr.toLowerCase() === connectedStark.toLowerCase()
                  ? `Connected wallet · ${truncateAddress(starkAddr, 8)}`
                  : truncateAddress(starkAddr, 8)}
              </p>
            )}
          </fieldset>}

          {/* ── Solana Address — Solana only ──────────────────────────── */}
          {(selectedNet === 'solana' || multiChainMode) && (multiChainMode || receiveMode === 'paste') && <fieldset className="space-y-1.5">
            <label className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                Solana wallet address
              </span>
              <span className="text-[11px] font-medium text-gray-400">No 0x · usually 32-44 chars</span>
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
                  'w-full rounded-xl border bg-gray-50/60 px-4 py-3 font-mono text-sm',
                  'placeholder:text-gray-400 transition-all focus:bg-white focus:outline-none focus:ring-2',
                  solanaDirty && !solanaValid
                    ? 'border-red-300 pr-10 text-red-600 focus:ring-red-100'
                    : solanaValid
                    ? 'border-emerald-300 text-gray-900 focus:ring-emerald-100'
                    : 'border-gray-200 text-gray-900 focus:border-[#14F195]/40 focus:ring-[#14F195]/15',
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
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-violet-200 bg-violet-50/40 px-4 py-3">
              <Sliders className="h-4 w-4 shrink-0 text-violet-400" />
              <div>
                <p className="text-xs font-semibold text-violet-600">Flexible Amount enabled</p>
                <p className="text-[11px] text-violet-400 mt-0.5">Payer enters the amount at checkout</p>
              </div>
            </div>
          )}
          {!flexAmount && <fieldset className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Coins className="h-3.5 w-3.5 text-gray-400" />
              Amount
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
                  'w-full rounded-xl border bg-gray-50/60 px-4 py-3 pr-28 text-sm',
                  'placeholder:text-gray-400 transition-all focus:bg-white focus:outline-none focus:ring-2',
                  amtDirty && !isValidAmt
                    ? 'border-red-300 focus:ring-red-100'
                    : 'border-gray-200 focus:border-[#0071E3]/40 focus:ring-[#0071E3]/15',
                )}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-gray-400 whitespace-nowrap">
                USDC
              </span>
            </div>
            {amtDirty && !isValidAmt && (
              <p className="flex items-center gap-1 text-xs text-red-500">
                <Info className="h-3 w-3" /> Enter a valid amount greater than 0
              </p>
            )}
            {!amtDirty && (
              <p className="text-[11px] text-gray-400">
                {multiChainMode
                  ? 'USDC on Base, Arc Testnet, Solana, or Arbitrum — payer chooses the chain'
                  : `USDC on ${selectedNet === 'arc' ? 'Arc Testnet' : CHAIN_META[selectedNet].label}`}
              </p>
            )}
          </fieldset>}

          {/* ── Payment note ──────────────────────────────────────────── */}
          <fieldset className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
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
              className="w-full rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3 text-sm placeholder:text-gray-400 transition-all focus:border-[#0071E3]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]/15"
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

          {/* ── Multi-payer Collection toggle (Payment mode only) ─────── */}
          {!accessMode && <button
            type="button"
            onClick={() => toggleEventMode(!eventMode)}
            className={cn(
              'w-full rounded-xl border-2 p-3.5 text-left transition-all',
              eventMode
                ? 'border-blue-400 bg-blue-50/60'
                : 'border-gray-200 bg-white hover:border-gray-300',
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ScanLine className={cn('h-4 w-4', eventMode ? 'text-blue-500' : 'text-gray-400')} />
                <span className="text-sm font-semibold text-gray-800">Multi-payer Collection</span>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">Beta</span>
              </div>
              {/* Toggle pill */}
              <div className={cn('relative h-5 w-9 rounded-full transition-colors', eventMode ? 'bg-blue-500' : 'bg-gray-300')}>
                <div className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                  eventMode ? 'translate-x-4' : 'translate-x-0.5',
                )} />
              </div>
            </div>
            <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">
              Collect payer names and track payments in a live dashboard.
            </p>
            <p className="mt-1 text-[11px] text-gray-400">
              Suitable for: <span className="font-medium text-gray-500">donations · group splits · fees · dues · registrations</span>
            </p>
          </button>}

          {/* ── Access mode: multi-payer always on notice ─────────────── */}
          {accessMode && (
            <div className="flex items-center gap-2.5 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/30 px-4 py-3">
              <ScanLine className="h-3.5 w-3.5 text-blue-400 dark:text-blue-500 shrink-0" />
              <p className="text-xs text-blue-600 dark:text-blue-300">
                <span className="font-semibold">Multi-payer collection is always on</span> in Access mode — each payer's name is logged and archived to 0G for verification.
              </p>
            </div>
          )}

          {/* ── FX Display Settings (event or access mode) ────────────── */}
          {effectiveEventMode && (
            <div className={cn(
              'rounded-xl border p-4 space-y-3 transition-all',
              fxShow
                ? 'border-blue-200 bg-blue-50/30 dark:border-blue-800/40 dark:bg-blue-950/20'
                : 'border-gray-200 bg-gray-50/50 dark:border-white/10 dark:bg-white/[0.03]',
            )}>
              {/* Header row with toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className={cn('h-3.5 w-3.5', fxShow ? 'text-blue-400' : 'text-gray-400 dark:text-gray-500')} />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Local Currency Display</span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 font-normal">— optional</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFxShow(v => !v)}
                  className="shrink-0"
                >
                  <div className={cn('relative h-5 w-9 rounded-full transition-colors', fxShow ? 'bg-blue-500' : 'bg-gray-300')}>
                    <div className={cn(
                      'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                      fxShow ? 'translate-x-4' : 'translate-x-0.5',
                    )} />
                  </div>
                </button>
              </div>

              {/* Settings — only when toggled on */}
              {fxShow && (
                <div className="space-y-2.5 pt-0.5">
                  {/* Currency picker */}
                  <div className="flex items-center gap-3">
                    <label className="w-16 shrink-0 text-[11px] text-gray-500">Currency</label>
                    <select
                      value={fxCurrency}
                      onChange={e => { setFxCurrency(e.target.value); setFxPreviewRate(null) }}
                      className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-100"
                    >
                      {FX_CURRENCIES.map(c => (
                        <option key={c.code} value={c.code}>
                          {c.symbol} {c.name} ({c.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Rate source toggle */}
                  <div className="flex items-center gap-3">
                    <label className="w-16 shrink-0 text-[11px] text-gray-500">Rate</label>
                    <div className="flex flex-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs font-medium">
                      <button
                        type="button"
                        onClick={() => setFxSrc('live')}
                        className={cn(
                          'flex-1 rounded-md px-3 py-1.5 transition-all',
                          fxSrc === 'live' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700',
                        )}
                      >Live (Fixer.io)</button>
                      <button
                        type="button"
                        onClick={() => setFxSrc('custom')}
                        className={cn(
                          'flex-1 rounded-md px-3 py-1.5 transition-all',
                          fxSrc === 'custom' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700',
                        )}
                      >Custom / Street</button>
                    </div>
                  </div>

                  {/* Custom rate input */}
                  {fxSrc === 'custom' && (
                    <div className="flex items-center gap-3">
                      <label className="w-16 shrink-0 text-[11px] text-gray-500">1 USDC =</label>
                      <div className="relative flex-1">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          placeholder={`e.g. 1780`}
                          value={fxCustomRate}
                          onChange={e => setFxCustomRate(e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 pr-14 text-sm text-gray-700 placeholder:text-gray-300 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-100"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-gray-400">
                          {fxCurrency}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Live preview */}
                  <div className="flex items-center justify-center gap-1.5 pt-0.5">
                    {fxPreviewLoad ? (
                      <RefreshCw className="h-3 w-3 animate-spin text-gray-300" />
                    ) : fxPreviewRate ? (() => {
                        const decimals = getFxMeta(fxCurrency)?.decimals ?? 2
                        return (
                          <p className="text-[11px] text-gray-400 text-center">
                            {fxSrc === 'custom' ? '📌 Custom rate:' : 'Live rate:'}{' '}
                            1 USDC = {fxPreviewRate.toFixed(decimals > 0 ? 2 : 0)} {fxCurrency}
                            {isValidAmt && ` · ≈ ${formatLocalAmt(parseFloat(amt), fxPreviewRate, decimals)} ${fxCurrency} for ${amt} USDC`}
                          </p>
                        )
                      })() : fxSrc === 'custom' && !fxCustomRate ? (
                      <p className="text-[11px] text-gray-400">Enter your street / parallel market rate above</p>
                    ) : null}
                  </div>
                  {fxSrc === 'custom' && (
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center leading-relaxed">
                      Custom rate is baked into the link — regenerate if the rate shifts significantly.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Payer network toggle ──────────────────────────────────── */}
          <button
            type="button"
            onClick={() => toggleMultiChainMode(!multiChainMode)}
            className={cn(
              'w-full rounded-xl border-2 p-3.5 text-left transition-all',
              multiChainMode
                ? 'border-violet-400 bg-violet-50/60'
                : 'border-gray-200 bg-white hover:border-gray-300',
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className={cn('h-4 w-4', multiChainMode ? 'text-violet-500' : 'text-gray-400')} />
                <span className="text-sm font-semibold text-gray-800">Let payer choose network</span>
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">New</span>
              </div>
              <div className={cn('relative h-5 w-9 rounded-full transition-colors', multiChainMode ? 'bg-violet-500' : 'bg-gray-300')}>
                <div className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                  multiChainMode ? 'translate-x-4' : 'translate-x-0.5',
                )} />
              </div>
            </div>
            <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">
              Add multiple wallet addresses so the payer can choose a network.
            </p>
          </button>

          {/* ── Flexible amount toggle ────────────────────────────────── */}
          <button
            type="button"
            onClick={() => toggleFlexAmount(!flexAmount)}
            className={cn(
              'w-full rounded-xl border-2 p-3.5 text-left transition-all',
              flexAmount
                ? 'border-violet-400 bg-violet-50/60'
                : 'border-gray-200 bg-white hover:border-gray-300',
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className={cn('h-4 w-4', flexAmount ? 'text-violet-500' : 'text-gray-400')} />
                <span className="text-sm font-semibold text-gray-800">Let payer enter amount</span>
              </div>
              <div className={cn('relative h-5 w-9 rounded-full transition-colors', flexAmount ? 'bg-violet-500' : 'bg-gray-300')}>
                <div className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                  flexAmount ? 'translate-x-4' : 'translate-x-0.5',
                )} />
              </div>
            </div>
            <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">
              No fixed price. The payer enters the amount at checkout.
            </p>
          </button>

          {/* ── Generate / checking button ───────────────────────────── */}
          {vaultStep === 'idle' && (
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold transition-all duration-200',
                canGenerate
                  ? 'bg-black text-white shadow-button hover:bg-gray-800 hover:shadow-md active:scale-[0.98]'
                  : 'cursor-not-allowed bg-gray-100 text-gray-400',
              )}
            >
              <Link2 className="h-4 w-4" />
              Generate Payment Link
              {canGenerate && <ArrowRight className="h-4 w-4" />}
            </button>
          )}

          {!canGenerate && vaultStep === 'idle' && (
            multiChainMode
              ? (!evmDirty && !solanaDirty && !(SHOW_STARKNET_CREATE_UI && starkDirty))
              : (selectedNet === 'solana' ? !solanaDirty : isEvmNet ? !evmDirty : !starkDirty)
          ) && (
            <p className="text-center text-xs text-gray-400">
              {multiChainMode
                ? 'Enter at least one wallet address to continue'
                : `Enter a ${selectedNet === 'solana' ? 'Solana' : 'wallet'} address to continue`}
            </p>
          )}
            </>
          )}
        </div>

        {/* ── Link ready panel ─────────────────────────────────────────── */}
        {linkReady && (
          <div className="animate-slide-up border-t border-gray-100 bg-gradient-to-b from-gray-50/80 to-white p-6 sm:px-8 space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <CheckCheck className="h-4 w-4 text-emerald-500" />
                  Link Ready
                </p>
                <button onClick={handleReset} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                  Start over
                </button>
              </div>

              {/* Preview + QR side by side */}
              <div className="rounded-xl border border-gray-100 bg-white p-4 flex items-start gap-3">
                {/* Left — link details */}
                <div className="flex-1 min-w-0 space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Preview</p>
                  <div className="flex items-baseline gap-1.5">
                    {flexAmount
                      ? <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1 text-sm font-semibold text-violet-700"><Sliders className="h-3.5 w-3.5" />Flexible</span>
                      : <><span className="text-2xl font-bold text-gray-900">{formatAmount(amt, 6)}</span><span className="text-sm font-medium text-gray-500">USDC</span></>
                    }
                  </div>
                  <div className="space-y-1">
                    {evmValid && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>{multiChainMode ? 'Base · Arc Testnet · Arbitrum' : CHAIN_META[selectedNet].label}:</span>
                        <span className="font-mono text-gray-700">{truncateAddress(evmAddr, 8)}</span>
                      </div>
                    )}
                    {SHOW_STARKNET_CREATE_UI && starkValid && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>Starknet:</span>
                        <span className="font-mono text-gray-700">{truncateAddress(starkAddr, 8)}</span>
                      </div>
                    )}
                    {solanaValid && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>Solana:</span>
                        <span className="font-mono text-gray-700">{truncateAddress(solanaAddr, 8)}</span>
                      </div>
                    )}
                    {memo && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>Payment note: <span className="font-medium text-gray-700">"{memo}"</span></span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right — QR code (single payment mode only) */}
                {!effectiveEventMode && (
                  <div className="shrink-0 flex flex-col items-center gap-1.5">
                    <div ref={qrRef} className="relative rounded-xl bg-white p-1.5 shadow-sm border border-gray-100">
                      <QRCodeCanvas value={generatedLink} size={112} level="H" includeMargin />
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="rounded-sm bg-white p-0.5">
                          <img src="/hash-logo.png" alt="" className="h-4 w-4 object-contain" />
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={downloadQR}
                      className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-all active:scale-[0.98]"
                    >
                      <Download className="h-3 w-3" /> Save
                    </button>
                  </div>
                )}
              </div>

              {/* Share + Test buttons */}
              <div className="flex gap-2.5">
                <button
                  onClick={handleShare}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98]',
                    copied
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'bg-black text-white hover:bg-gray-800',
                  )}
                >
                  {copied ? <><CheckCheck className="h-4 w-4" /> Copied!</> : <><Share2 className="h-4 w-4" /> Share</>}
                </button>
                <a
                  href={generatedLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-all active:scale-[0.98]"
                >
                  <ExternalLink className="h-4 w-4" />
                  Test
                </a>
              </div>

              {/* Organizer dashboard — multi-payer / access mode only */}
              {effectiveEventMode && (
                <a
                  href={buildDashboardLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-semibold text-blue-600 hover:bg-blue-50 transition-all active:scale-[0.98]"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Open Organizer Dashboard
                </a>
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
      </div>

      {/* ── Last event dashboard recovery ────────────────────────────── */}
      {!generatedLink && !posMode && savedEvent && (
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
      {!generatedLink && !posMode && (
        <div className="mt-10 animate-fade-in">
          <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            How it works
          </p>
          <div className="grid grid-cols-3 gap-3">
            {(!accessMode ? [
              { n: '1', title: 'Enter details',   body: 'Your wallet address' },
              { n: '2', title: 'Enter amount',    body: 'USDC' },
              { n: '3', title: 'Get paid',        body: 'Anyone pays from any wallet or exchange' },
            ] : [
              { n: '1', title: 'Open Telegram',   body: 'Start the Hash PayLink bot' },
              { n: '2', title: 'Choose a flow',   body: 'Payment link, wallet, or market tool' },
              { n: '3', title: 'Confirm action',  body: 'Track funds from the dashboard' },
            ]).map(({ n, title, body }) => (
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
        </div>
      )}

      {shareOpen && generatedLink && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 px-4 pb-5 sm:items-center sm:pb-0"
          onClick={() => setShareOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">Share payment link</p>
                <p className="text-xs text-gray-400">Copy it or send it directly.</p>
              </div>
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                aria-label="Close share options"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className={cn(
                'mb-2 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98]',
                copied
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'bg-black text-white hover:bg-gray-800',
              )}
            >
              {copied ? <><CheckCheck className="h-4 w-4" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy link</>}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <a
                href={`https://wa.me/?text=${encodedShareMessage}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
              <a
                href={`https://t.me/share/url?url=${encodedShareUrl}&text=${encodedShareText}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50"
              >
                <Send className="h-4 w-4" />
                Telegram
              </a>
              <a
                href={`https://twitter.com/intent/tweet?url=${encodedShareUrl}&text=${encodedShareText}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50"
              >
                <X className="h-4 w-4" />
                X
              </a>
              <a
                href={`mailto:?subject=${encodeURIComponent('Hash PayLink payment request')}&body=${encodedShareMessage}`}
                className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50"
              >
                <Mail className="h-4 w-4" />
                Email
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
