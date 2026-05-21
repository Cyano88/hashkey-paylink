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
import { Link, useOutletContext }       from 'react-router-dom'
import { cn }                           from '../lib/utils'
import type { LayoutOutletContext }     from '../Layout'
import { CHAIN_META }                   from '../lib/chains'
import type { ChainKey }                from '../lib/chains'
import { queryBalances }                from '../lib/unifiedBalance'
import {
  CheckCircle2, AlertCircle, Loader2, Send,
  ExternalLink, ArrowLeft, ShieldCheck, Zap,
  Wallet, CreditCard, Radio, Copy, Power, X,
} from 'lucide-react'

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
  type: 'wallet_connected' | 'funded' | 'gateway_activated' | 'x402_spent' | 'scout_returned'
  title: string
  amount?: string
  asset?: string
  direction?: 'in' | 'out' | 'result' | 'system'
  network?: string
  wallet?: string
  txHash?: string
  detail?: string
  createdAt: number
}

// ─── Demo credentials (pre-filled for judges) ─────────────────────────────────
const DEMO_EVENT_ID = 'test-0g-1778114523394'
const DEMO_PAYER    = 'HashPayLink 0G Test'

// ─── Component ────────────────────────────────────────────────────────────────

export default function AgentDemo() {
  const { selectedNet, onNetworkSelect } = useOutletContext<LayoutOutletContext>()
  const params = new URLSearchParams(window.location.search)
  const agentSlug = params.get('agent') ?? ''
  const agentWallet = params.get('wallet') ?? params.get('e') ?? ''
  const intendedAgentWallet = params.get('wallet') ?? params.get('expectedWallet') ?? params.get('e') ?? ''
  const [ignoreUrlAgentWallet, setIgnoreUrlAgentWallet] = useState(false)
  const agentPrice = params.get('price') ?? '1'
  const agentStreamPrice = params.get('streamPrice') ?? ''
  const agentStreamDuration = params.get('streamDuration') ?? ''
  const urlAgentNetwork = params.get('n') ?? 'base'
  const isAgentTreasuryNetwork = (value: string): value is Extract<ChainKey, 'base' | 'arbitrum' | 'arc'> =>
    value === 'base' || value === 'arbitrum' || value === 'arc'
  const agentNetwork = isAgentTreasuryNetwork(selectedNet)
    ? selectedNet
    : isAgentTreasuryNetwork(urlAgentNetwork)
    ? urlAgentNetwork
    : 'base'
  const agentMeta = CHAIN_META[agentNetwork]
  const showAgentProfile = params.get('profile') === 'agent' || Boolean(agentSlug || agentWallet)
  const [eventId,    setEventId]    = useState(() => params.get('eventId') ?? '')
  const [payer,      setPayer]      = useState(() => params.get('payer')   ?? '')
  const [currentAgentWallet, setCurrentAgentWallet] = useState(agentWallet)
  const [agentWalletSessionConnected, setAgentWalletSessionConnected] = useState(Boolean(agentWallet))
  const [agentWalletChain, setAgentWalletChain] = useState('')
  const [treasuryBalance, setTreasuryBalance] = useState<string | null>(null)
  const [treasuryBalanceChecked, setTreasuryBalanceChecked] = useState(false)
  const [treasuryBalanceError, setTreasuryBalanceError] = useState('')
  const [x402Balance, setX402Balance] = useState<string | null>(null)
  const [x402BalanceChecked, setX402BalanceChecked] = useState(false)
  const [x402BalanceError, setX402BalanceError] = useState('')
  const [x402Amount, setX402Amount] = useState('1')
  const [x402Busy, setX402Busy] = useState(false)
  const [x402Status, setX402Status] = useState('')
  const [x402ModalOpen, setX402ModalOpen] = useState(false)
  const [activity, setActivity] = useState<AgentActivity[]>([])
  const [copiedWallet, setCopiedWallet] = useState(false)
  const [walletEmail, setWalletEmail] = useState('')
  const [walletOtp, setWalletOtp] = useState('')
  const [walletMode, setWalletMode] = useState<'choose' | 'create' | 'login'>('choose')
  const [walletStep, setWalletStep] = useState<'idle' | 'otp' | 'done'>('idle')
  const [walletBusy, setWalletBusy] = useState(false)
  const [walletError, setWalletError] = useState<string | null>(null)
  const [verifying,  setVerifying]  = useState(false)
  const [verified,   setVerified]   = useState<VerifyResult | null>(null)
  const [question,   setQuestion]   = useState('')
  const [messages,   setMessages]   = useState<Message[]>([])
  const [isAsking,   setIsAsking]   = useState(false)
  const [askError,   setAskError]   = useState<string | null>(null)
  const bottomRef    = useRef<HTMLDivElement>(null)
  const autoRan      = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isAsking])

  async function loadAgentWallet() {
    const slug = agentSlug || 'hashpaylink-agent'
    const res = await fetch(`/api/agent-wallet?agent=${encodeURIComponent(slug)}`)
    if (!res.ok) return
    const data = await res.json() as { walletAddress?: string; chain?: string; connected?: boolean; activity?: AgentActivity[] }
    if (data.walletAddress) setCurrentAgentWallet(data.walletAddress)
    setAgentWalletSessionConnected(Boolean(data.connected))
    if (data.chain) setAgentWalletChain(data.chain)
    if (Array.isArray(data.activity)) setActivity(data.activity)
  }

  useEffect(() => {
    if (!showAgentProfile) return
    loadAgentWallet()
      .catch(() => undefined)
  }, [agentSlug, showAgentProfile]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false
    if (!showAgentProfile || !currentAgentWallet) {
      setTreasuryBalance(null)
      setTreasuryBalanceChecked(true)
      setTreasuryBalanceError('')
      return
    }

    setTreasuryBalance(null)
    setTreasuryBalanceChecked(false)
    setTreasuryBalanceError('')
    queryBalances({
      evmAddress: currentAgentWallet,
      chains: [agentNetwork],
    })
      .then(result => {
        if (cancelled) return
        const row = result.rows.find(item => item.key === agentNetwork)
        if (!row || row.status === 'error') {
          setTreasuryBalanceError(row?.error || 'Balance unavailable')
          return
        }
        setTreasuryBalance(String(row.balance))
        setAgentWalletChain(row.label)
      })
      .catch(error => {
        if (!cancelled) setTreasuryBalanceError(error instanceof Error ? error.message : 'Balance unavailable')
      })
      .finally(() => {
        if (!cancelled) setTreasuryBalanceChecked(true)
      })

    return () => { cancelled = true }
  }, [agentNetwork, currentAgentWallet, showAgentProfile])

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
  }, [agentSlug, agentWalletSessionConnected, currentAgentWallet, showAgentProfile]) // eslint-disable-line react-hooks/exhaustive-deps

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

  function fillDemo() {
    setEventId(DEMO_EVENT_ID)
    setPayer(DEMO_PAYER)
    setVerified(null)
    setMessages([])
  }

  async function copyAgentWallet() {
    if (!currentAgentWallet) return
    await navigator.clipboard.writeText(currentAgentWallet)
    setCopiedWallet(true)
    window.setTimeout(() => setCopiedWallet(false), 1600)
  }

  function buildAgentFundUrl() {
    const p = new URLSearchParams()
    p.set('id', `agent-${agentSlug || 'hashpaylink'}-fund-${Date.now().toString(36)}`)
    p.set('m', `Fund agent wallet: ${agentSlug || 'Hash PayLink Agent'}`)
    p.set('n', agentNetwork)
    p.set('f', '1')
    p.set('v', '1')
    p.set('x', '1')
    p.set('src', 'agent')
    p.set('agent', agentSlug || 'hashpaylink-agent')
    p.set('agentSlug', agentSlug || 'hashpaylink-agent')
    if (currentAgentWallet) p.set('e', currentAgentWallet)
    return `/pay?${p.toString()}`
  }

  function handleFundAgent() {
    onNetworkSelect(agentNetwork)
  }

  function buildAgentStreamUrl() {
    if (!currentAgentWallet || !agentStreamPrice || !agentStreamDuration) return ''
    const p = new URLSearchParams()
    p.set('app', 'streampay')
    p.set('amount', agentStreamPrice)
    p.set('recipient', currentAgentWallet)
    p.set('duration', agentStreamDuration)
    p.set('reason', `Agent retainer: ${agentSlug || 'Hash PayLink Agent'}`)
    p.set('src', 'agent')
    p.set('wallet', 'circle')
    return `/?${p.toString()}`
  }

  async function callAgentWallet(action: 'init' | 'complete', mode?: 'create' | 'login') {
    const selectedMode = mode ?? (walletMode === 'choose' ? 'login' : walletMode)
    setWalletMode(selectedMode)
    setWalletBusy(true)
    setWalletError(null)
    try {
      const res = await fetch('/api/agent-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          agentSlug: agentSlug || 'hashpaylink-agent',
          email: walletEmail,
          otp: walletOtp,
          testnet: agentNetwork === 'arc',
          expectedWallet: ignoreUrlAgentWallet ? currentAgentWallet || undefined : intendedAgentWallet || currentAgentWallet || undefined,
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; walletAddress?: string; chain?: string; code?: string; existingWallet?: string; newWallet?: string }
      if (data.code === 'wallet_mismatch') {
        throw new Error(`Circle returned a different wallet. Existing: ${data.existingWallet ?? 'saved wallet'}. New: ${data.newWallet ?? 'new wallet'}. Login with the email for the existing funded wallet, or disconnect and replace intentionally.`)
      }
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Circle Agent Wallet request failed')
      if (action === 'init') {
        setWalletStep('otp')
      } else if (data.walletAddress) {
        setCurrentAgentWallet(data.walletAddress)
        if (data.chain) setAgentWalletChain(data.chain)
        setTreasuryBalance(null)
        setTreasuryBalanceChecked(false)
        setTreasuryBalanceError('')
        setWalletStep('done')
        setAgentWalletSessionConnected(true)
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
      setWalletMode('choose')
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : 'Wallet disconnect failed')
    } finally {
      setWalletBusy(false)
    }
  }

  async function activateX402Balance() {
    if (!currentAgentWallet || x402Busy) return
    setX402Busy(true)
    setX402Status('')
    setX402BalanceError('')
    try {
      if (agentNetwork === 'arc') throw new Error('x402 Gateway activation supports Base or Arbitrum funding. Switch network to Base or Arbitrum.')
      const amount = Number(x402Amount)
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid x402 amount.')
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
      setX402Status(`${data.amount ?? x402Amount} USDC activated for x402.`)
      setX402ModalOpen(false)
      await refreshX402Balance()
      await loadAgentWallet()
    } catch (err) {
      setX402BalanceError(err instanceof Error ? err.message : 'x402 activation failed')
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
  const displayAgentWalletChain =
    agentWalletChain === 'BASE' ? 'Base' :
    agentWalletChain === 'ARBITRUM' ? 'Arbitrum' :
    agentWalletChain === 'ARC-TESTNET' ? 'Arc Testnet' :
    agentWalletChain
  const walletErrorMessage = walletError
    ? /invalid or expired request id/i.test(walletError)
      ? 'OTP expired. Resend OTP and use the newest code.'
      : walletError.replace(/^Command failed:[\s\S]*?\n/i, '').replace(/^Error:\s*/i, '').slice(0, 180)
    : ''

  return (
    <div className="mx-auto max-w-2xl animate-slide-up space-y-6">

      {/* ── Back ──────────────────────────────────────────────────────────── */}
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> Create a link
      </Link>

      {showAgentProfile && (
        <div
          className="relative rounded-2xl border bg-white p-5 shadow-sm transition-all dark:bg-[#1c1c20] sm:p-6"
          style={{
            borderColor: `${agentMeta.accentColor}24`,
            boxShadow: `0 16px 44px -32px ${agentMeta.accentColor}, ${agentMeta.glowStyle}`,
          }}
        >
          {currentAgentWallet && (
            <button
              type="button"
              onClick={disconnectAgentWallet}
              disabled={walletBusy}
              aria-label="Disconnect agent wallet session"
              title="Disconnect agent wallet session"
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-500 active:scale-95 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.06] dark:hover:border-red-400/30 dark:hover:bg-red-400/10 dark:hover:text-red-300"
            >
              {walletBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
            </button>
          )}
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 dark:border-blue-900/30 dark:bg-blue-900/20">
              <Wallet className="h-5 w-5 text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Agent treasury</p>
              <h1 className="mt-1 truncate text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
                {agentSlug || 'Hash PayLink Agent'}
              </h1>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                <p className="max-w-full truncate font-mono text-xs text-gray-500 dark:text-gray-400">
                  {currentAgentWallet || 'Circle Agent Wallet not configured'}
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
            </div>
          </div>

          <div className="mt-5 grid gap-2.5 sm:grid-cols-4">
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
              <CreditCard className="h-4 w-4 text-gray-400" />
              <p className="mt-2 text-xs font-semibold text-gray-800 dark:text-gray-100">Ask</p>
              <p className="text-xs text-gray-500">{agentPrice} USDC once</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
              <Radio className="h-4 w-4 text-gray-400" />
              <p className="mt-2 text-xs font-semibold text-gray-800 dark:text-gray-100">Stream</p>
              <p className="text-xs text-gray-500" title={treasuryBalanceError || undefined}>
                {agentStreamPrice && agentStreamDuration ? `${agentStreamPrice} USDC / ${agentStreamDuration}` : 'Not set'}
              </p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
              <Wallet className="h-4 w-4 text-gray-400" />
              <p className="mt-2 text-xs font-semibold text-gray-800 dark:text-gray-100">Fund</p>
              <p className="text-xs text-gray-500">Treasury on {agentNetwork}</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
              <ShieldCheck className="h-4 w-4 text-gray-400" />
              <p className="mt-2 text-xs font-semibold text-gray-800 dark:text-gray-100">Treasury</p>
              <p className="text-xs text-gray-500" title={treasuryBalanceError || undefined}>
                {treasuryBalance !== null
                  ? `${Number(treasuryBalance).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`
                  : currentAgentWallet
                  ? treasuryBalanceError || treasuryBalanceChecked ? 'Unavailable' : 'Checking...'
                  : 'No wallet'}
              </p>
              {treasuryBalanceError && (
                <p className="mt-1 line-clamp-2 text-[10px] leading-tight text-amber-600 dark:text-amber-300">
                  {treasuryBalanceError}
                </p>
              )}
              {displayAgentWalletChain && (
                <p className="mt-0.5 text-[10px] font-semibold" style={{ color: agentMeta.accentColor }}>
                  {displayAgentWalletChain}
                </p>
              )}
            </div>
          </div>

          {(!currentAgentWallet || !agentWalletSessionConnected) && (
            <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50/70 p-4 transition-all dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {currentAgentWallet ? 'Reconnect wallet' : 'Connect wallet'}
                </p>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {currentAgentWallet
                  ? 'Use the same Circle email. A different wallet will not replace this one.'
                  : walletMode === 'choose'
                  ? 'Create a new wallet or reconnect an existing one.'
                  : walletMode === 'create'
                  ? 'Enter email. Circle sends an OTP.'
                  : 'Enter the wallet email. Circle sends an OTP.'}
              </p>
              {walletMode === 'choose' ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setWalletMode('create')
                      setWalletStep('idle')
                      setWalletOtp('')
                      setWalletError(null)
                    }}
                    disabled={walletBusy}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-black px-3 py-3 text-sm font-semibold text-white transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
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
                      setWalletError(null)
                    }}
                    disabled={walletBusy}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.1]"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Login
                  </button>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {walletStep !== 'otp' && (
                    <div className="grid gap-2 sm:grid-cols-[1fr_132px]">
                      <input
                        type="email"
                        value={walletEmail}
                        onChange={e => setWalletEmail(e.target.value)}
                        placeholder="you@example.com"
                        disabled={walletBusy || walletStep === 'done'}
                        className="min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-200 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => callAgentWallet('init')}
                        disabled={walletBusy || !walletEmail.trim() || walletStep === 'done'}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                      >
                        {walletBusy && walletStep === 'idle' ? <Loader2 className="h-4 w-4 animate-spin" /> : walletMode === 'create' ? <Wallet className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                        Send OTP
                      </button>
                    </div>
                  )}

                  {walletStep === 'otp' && (
                    <div className="grid gap-2 sm:grid-cols-[1fr_104px_108px]">
                      <input
                        value={walletOtp}
                        onChange={e => setWalletOtp(e.target.value.trim())}
                        placeholder="6-digit OTP"
                        disabled={walletBusy}
                        className="min-w-0 rounded-lg border border-blue-100 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => callAgentWallet('complete')}
                        disabled={walletBusy || !walletOtp.trim()}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white transition-all hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900"
                      >
                        {walletBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Verify
                      </button>
                      <button
                        type="button"
                        onClick={() => callAgentWallet('init', walletMode)}
                        disabled={walletBusy || !walletEmail.trim()}
                        className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200"
                      >
                        Resend OTP
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setWalletMode(walletMode === 'create' ? 'login' : 'create')
                      setWalletStep('idle')
                      setWalletOtp('')
                      setWalletError(null)
                    }}
                    disabled={walletBusy}
                    className="text-xs font-semibold text-gray-500 transition-colors hover:text-gray-900 disabled:opacity-50 dark:text-gray-400 dark:hover:text-white"
                  >
                    {walletMode === 'create' ? 'Already have a wallet? Login' : 'Need a new wallet? Create wallet'}
                  </button>
                </div>
              )}

              {walletErrorMessage && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:bg-red-950/20 dark:text-red-300">{walletErrorMessage}</p>}
              {walletStep === 'otp' && !walletError && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Check your email for the latest Circle OTP.
                </p>
              )}
            </div>
          )}

          {currentAgentWallet && agentWalletSessionConnected && (
            <div className="mt-5 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Link
                  to={buildAgentFundUrl()}
                  onClick={handleFundAgent}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white shadow-button transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                >
                  <Wallet className="h-4 w-4" /> Fund Agent Wallet
                </Link>

                {agentStreamUrl && (
                  <a
                    href={agentStreamUrl}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-100"
                  >
                    <Radio className="h-4 w-4" /> Start StreamPay Retainer
                  </a>
                )}
              </div>

              <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-gray-900 dark:text-white">x402 Gateway balance</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400" title={x402BalanceError || undefined}>
                      {x402Balance !== null
                        ? `${Number(x402Balance).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC ready`
                        : x402BalanceError || x402BalanceChecked
                        ? 'Unavailable'
                        : 'Checking...'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => refreshX402Balance()}
                    disabled={x402Busy}
                    className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300"
                  >
                    Refresh
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setX402ModalOpen(true)}
                  disabled={x402Busy}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-3 py-2.5 text-sm font-semibold text-white transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-gray-950"
                >
                  {x402Busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  Activate x402
                </button>
                {(x402BalanceError || x402Status) && (
                  <p className={cn('mt-2 text-xs font-medium', x402BalanceError ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300')}>
                    {x402BalanceError || x402Status}
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-gray-100 bg-white p-3 dark:border-white/10 dark:bg-white/[0.04]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-900 dark:text-white">Agent activity</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Funding, x402 activation, and agent-paid service receipts</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadAgentWallet()}
                    className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300"
                  >
                    Refresh
                  </button>
                </div>
                <div className="mt-3 space-y-2">
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
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-400 dark:border-white/10">
                      No activity yet. Fund the wallet, activate x402, then run /lp x402.
                    </div>
                  )}
                </div>
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
      {showAgentProfile && (
        <div className="animate-fade-in">
          <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            How it works
          </p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { n: '1', title: 'Connect', body: 'Circle email wallet' },
              { n: '2', title: 'Fund', body: 'Add USDC' },
              { n: '3', title: 'Use', body: 'Ask, stream, x402' },
            ].map(({ n, title, body }) => (
              <div key={n} className="rounded-xl border border-gray-100 bg-white p-4 text-center shadow-sm">
                <div className="mx-auto mb-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                  {n}
                </div>
                <p className="text-xs font-semibold text-gray-800">{title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-400">{body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!showAgentProfile && (
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
          onClick={fillDemo}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-purple-200 dark:border-purple-800 px-3 py-1.5 text-xs font-medium text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
        >
          <Zap className="h-3 w-3" /> Try with demo credentials
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
        {verified && !verified.verified && (
          <div className="rounded-xl border border-red-100 bg-red-50 dark:bg-red-900/10 dark:border-red-900/20 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">No payment found</p>
            </div>
            <p className="text-xs text-red-600 dark:text-red-400">
              {verified.error ?? 'No verified payment found on 0G Storage for this payer.'}
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 underline underline-offset-2"
            >
              Create a payment link →
            </Link>
          </div>
        )}

        {verified?.verified && verified.payment && verified.proof && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-900/20 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Payment verified on 0G</p>
            </div>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              {verified.payment.payer} · {verified.payment.amount} · {verified.payment.chain}
            </p>
            <a
              href={verified.proof.ogExplorer}
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

      {x402ModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-[#1c1c20]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Activate x402 Gateway</p>
                <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  Move USDC from the agent wallet into Circle Gateway so the agent can pay APIs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setX402ModalOpen(false)}
                disabled={x402Busy}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/[0.06]"
                aria-label="Close x402 activation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-300">Amount</label>
              <div className="flex min-w-0 items-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/[0.06]">
                <input
                  value={x402Amount}
                  onChange={event => setX402Amount(event.target.value.replace(/[^\d.]/g, ''))}
                  inputMode="decimal"
                  className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm font-semibold text-gray-900 outline-none dark:text-white"
                />
                <span className="border-l border-gray-200 px-3 text-xs font-semibold text-gray-400 dark:border-white/10">USDC</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {['0.25', '1', '5'].map(amount => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setX402Amount(amount)}
                    disabled={x402Busy}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-xs font-semibold transition-all active:scale-[0.98] disabled:opacity-50',
                      x402Amount === amount
                        ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-950'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300',
                    )}
                  >
                    {amount}
                  </button>
                ))}
              </div>
            </div>

            {agentNetwork === 'arc' && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                x402 Gateway activation currently funds from Base or Arbitrum. Switch the network selector to Base or Arbitrum.
              </p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2">
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
                disabled={x402Busy || agentNetwork === 'arc' || !x402Amount || Number(x402Amount) <= 0}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-gray-950"
              >
                {x402Busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Activate
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
