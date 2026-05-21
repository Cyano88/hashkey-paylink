import { useEffect, useMemo, useRef, useState, Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  useAccount, useChainId, useSwitchChain, useSignTypedData,
} from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { createPublicClient, http, defineChain } from 'viem'
import { useStreamState }    from '../hooks/useStreamState'
import { TriStateBar, formatUsdc, formatUsdcFull } from './TriStateBar'
import { CreateStreamForm, HashPayLinkBadge } from './CreateStreamForm'
import { StreamNotFound }    from './StreamNotFound'
import { STREAM_VAULT_ABI }  from '../lib/streamVaultAbi'
import {
  canUseCircleEvmEmailWallet,
  connectCircleEvmEmailWallet,
  deployCircleEvmEmailWallet,
  signCircleArcStreamClaim,
  type CircleEvmEmailSession,
} from '../../../../src/lib/circleEvmEmailWallet'

// ── Standalone Arc public client ──────────────────────────────────────────────
const arcClient = createPublicClient({
  chain: defineChain({
    id:             5042002,
    name:           'Arc Testnet',
    nativeCurrency: { decimals: 18, name: 'USD Coin', symbol: 'USDC' },
    rpcUrls:        { default: { http: ['https://rpc.testnet.arc.network'] } },
  }),
  transport: http('https://rpc.testnet.arc.network'),
})

// ── Types ─────────────────────────────────────────────────────────────────────
type StreamInfo = {
  _sender:           `0x${string}`
  _recipient:        `0x${string}`
  _totalAmount:      bigint
  _startTime:        bigint
  _endTime:          bigint
  _alreadyWithdrawn: bigint
  _cancelled:        boolean
  _unlocked:         bigint
  _claimable:        bigint
}

// idle → signing → relaying → pending → confirmed
//                           ↘ error (at any step after idle)
type ActionState = 'idle' | 'signing' | 'relaying' | 'pending' | 'confirmed' | 'error'

// ── Constants ─────────────────────────────────────────────────────────────────
const ARC_CHAIN_ID = 5042002
const ARC_EXPLORER = 'https://testnet.arcscan.app'
const nowSec = () => BigInt(Math.floor(Date.now() / 1000))

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeRemaining(endTime: bigint): string {
  const diff = Number(endTime - nowSec())
  if (diff <= 0) return 'Stream complete'
  const d = Math.floor(diff / 86400)
  const h = Math.floor((diff % 86400) / 3600)
  const m = Math.floor((diff % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function shortAddr(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}` }

function isTelegramStreamPay(params: URLSearchParams) {
  const source = (params.get('src') ?? '').toLowerCase()
  const wallet = (params.get('wallet') ?? params.get('mode') ?? '').toLowerCase()
  return source === 'telegram' || wallet === 'circle'
}

function cleanRelayError(msg: string): string {
  if (msg.toLowerCase().includes('missing or invalid')) return 'Transaction rejected by Arc — please try again.'
  if (msg.toLowerCase().includes('nothing available'))   return 'No funds available to withdraw yet.'
  if (msg.toLowerCase().includes('already cancelled'))   return 'This stream is already cancelled.'
  if (msg.toLowerCase().includes('relay failed'))        return 'Relay server error — please try again.'
  // Strip long URLs from raw viem/RPC errors
  return msg.replace(/https?:\/\/[^\s]+/g, '').trim().slice(0, 120)
}

async function waitForArcContractCode(address: `0x${string}`, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const code = await arcClient.getBytecode({ address }).catch(() => undefined)
    if (code && code !== '0x') return true
    await new Promise(resolve => setTimeout(resolve, 2_500))
  }
  return false
}

// ── Error boundary ────────────────────────────────────────────────────────────
class StreamErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(e: Error) { return { error: e } }
  componentDidCatch(e: Error, info: ErrorInfo) { console.error('[StreamPay]', e, info) }
  render() {
    if (this.state.error) {
      return (
        <div className="w-full max-w-[480px] mx-auto mt-12">
          <div className="rounded-2xl border border-red-100 dark:border-red-900/40 bg-white dark:bg-[#111216] p-8 text-center space-y-4 shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40">
              <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <p className="text-[15px] font-bold text-gray-900 dark:text-gray-100">Something went wrong</p>
              <p className="mt-1 text-[12px] text-gray-400">{this.state.error.message}</p>
            </div>
            <button
              onClick={() => { this.setState({ error: null }); window.location.reload() }}
              className="w-full rounded-xl py-2.5 text-[13px] font-semibold text-white"
              style={{ background: '#111827' }}
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────
export function StreamView({ vaultAddress }: { vaultAddress?: `0x${string}` }) {
  const [params] = useSearchParams()
  const reason   = params.get('reason') ?? undefined
  if (!vaultAddress) return <CreateStreamForm />
  return (
    <StreamErrorBoundary>
      <StreamDetail vaultAddress={vaultAddress} reason={reason} />
    </StreamErrorBoundary>
  )
}

// ── Stream Detail ─────────────────────────────────────────────────────────────
function StreamDetail({ vaultAddress, reason }: { vaultAddress: `0x${string}`; reason?: string }) {
  const [params] = useSearchParams()
  const telegramMode = isTelegramStreamPay(params)
  const { address: connectedAddr, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const isOnArc = chainId === ARC_CHAIN_ID

  // Background relayer health check — only affects Withdraw button spinner
  const [relayerReady, setRelayerReady] = useState(false)
  const checkedRef = useRef(false)
  useEffect(() => {
    if (checkedRef.current) return
    checkedRef.current = true
    let dead = false
    async function ping() {
      if (dead) return
      try {
        const r = await fetch('/api/health', { cache: 'no-store' })
        if (r.ok && !dead) { setRelayerReady(true); return }
      } catch { /* still waking */ }
      if (!dead) setTimeout(ping, 5_000)
    }
    ping()
    return () => { dead = true }
  }, [])

  // ── Contract reads via standalone Arc client ──────────────────────────────
  const { data: info, isLoading, isError, refetch: refetchInfo } = useQuery<StreamInfo>({
    queryKey: ['streamInfo', vaultAddress],
    queryFn:  async () => {
      const r = await arcClient.readContract({
        address: vaultAddress, abi: STREAM_VAULT_ABI, functionName: 'streamInfo',
      }) as unknown as readonly [`0x${string}`, `0x${string}`, bigint, bigint, bigint, bigint, boolean, bigint, bigint]
      return {
        _sender: r[0], _recipient: r[1], _totalAmount: r[2],
        _startTime: r[3], _endTime: r[4], _alreadyWithdrawn: r[5],
        _cancelled: r[6], _unlocked: r[7], _claimable: r[8],
      }
    },
    retry: 2, staleTime: 0,
  })

  const { refetch: refetchNonce } = useQuery<bigint>({
    queryKey: ['nonce', vaultAddress, connectedAddr],
    queryFn:  async () => {
      const raw = await arcClient.readContract({
        address: vaultAddress, abi: STREAM_VAULT_ABI,
        functionName: 'nonces', args: [connectedAddr!],
      })
      return raw as bigint
    },
    enabled: !!connectedAddr, staleTime: 0,
  })

  // ── Role detection ────────────────────────────────────────────────────────
  const isRecipient = !!connectedAddr && !!info
    && connectedAddr.toLowerCase() === info._recipient.toLowerCase()
  const isSender = !!connectedAddr && !!info
    && connectedAddr.toLowerCase() === info._sender.toLowerCase()

  // ── Live ticker ───────────────────────────────────────────────────────────
  const liveParams = useMemo(() => {
    if (!info) return null
    return {
      totalAmount:      info._totalAmount,
      startTime:        BigInt(info._startTime),
      endTime:          BigInt(info._endTime),
      alreadyWithdrawn: info._alreadyWithdrawn,
      cancelled:        info._cancelled,
      enabled:          true,
    }
  }, [info])

  const stream = useStreamState(liveParams, 100)

  // ── EIP-712 action state ──────────────────────────────────────────────────
  const { signTypedDataAsync } = useSignTypedData()
  const [actionState, setActionState] = useState<ActionState>('idle')
  const [txHash,      setTxHash]      = useState<`0x${string}` | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [circleEmail, setCircleEmail] = useState('')
  const [circleSession, setCircleSession] = useState<CircleEvmEmailSession | null>(null)
  const [circleCopied, setCircleCopied] = useState<'wallet' | 'recipient' | null>(null)

  // Poll for transaction receipt every 3s after broadcast
  function pollReceipt(hash: `0x${string}`, attempts = 0) {
    if (attempts > 60) { // 3 min max
      setActionError('Transaction not confirmed after 3 minutes — check Arcscan')
      setActionState('error')
      return
    }
    setTimeout(async () => {
      try {
        const receipt = await arcClient.getTransactionReceipt({ hash })
        if (receipt?.status === 'success') {
          setActionState('confirmed')
          refetchInfo(); refetchNonce()
          setTimeout(() => refetchInfo(), 3_000)
          setTimeout(() => refetchInfo(), 7_000)
        } else if (receipt?.status === 'reverted') {
          setActionError('Transaction reverted on Arc — funds not moved')
          setActionState('error')
        } else {
          pollReceipt(hash, attempts + 1)
        }
      } catch {
        pollReceipt(hash, attempts + 1)
      }
    }, 3_000)
  }

  async function handleClaim() {
    if (!connectedAddr || !stream || stream.claimable === 0n) return
    setActionState('signing'); setActionError(null); setTxHash(null)
    try {
      const claimable = await arcClient.readContract({
        address: vaultAddress, abi: STREAM_VAULT_ABI,
        functionName: 'claimable',
      }) as bigint
      if (claimable === 0n) {
        setActionError('No funds available to withdraw yet.')
        setActionState('error')
        return
      }

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600)
      const nonce = await arcClient.readContract({
        address: vaultAddress, abi: STREAM_VAULT_ABI,
        functionName: 'nonces', args: [connectedAddr],
      }) as bigint

      const sig = await signTypedDataAsync({
        domain: { name: 'StreamVault', version: '1', chainId: ARC_CHAIN_ID, verifyingContract: vaultAddress },
        types: { Claim: [
          { name: 'recipient', type: 'address' },
          { name: 'amount',    type: 'uint256' },
          { name: 'nonce',     type: 'uint256' },
          { name: 'deadline',  type: 'uint256' },
        ]},
        primaryType: 'Claim',
        message: { recipient: connectedAddr, amount: claimable, nonce, deadline },
      })

      setActionState('relaying')
      const res  = await fetch('/api/relay-stream', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'claim', vaultAddress, sig,
          nonce: nonce.toString(), deadline: deadline.toString(),
          amount: claimable.toString(),
        }),
      })
      const data = await res.json() as { ok: boolean; txHash?: string; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'Relay failed')

      const hash = data.txHash as `0x${string}`
      setTxHash(hash)
      setActionState('pending')
      pollReceipt(hash)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('rejected') || msg.toLowerCase().includes('denied')) {
        setActionState('idle'); return
      }
      setActionError(cleanRelayError(msg))
      setActionState('error')
    }
  }

  async function handleCircleClaim() {
    if (!info || !stream || stream.claimable === 0n) return
    const email = circleEmail.trim()
    if (!email && !circleSession) {
      setActionError('Enter your email to continue with Circle Smart Wallet.')
      setActionState('error')
      return
    }

    setActionState('signing'); setActionError(null); setTxHash(null)
    try {
      const session = circleSession ?? await connectCircleEvmEmailWallet(email, 'arc')
      setCircleSession(session)

      if (session.wallet.address.toLowerCase() !== info._recipient.toLowerCase()) {
        setActionError(`This stream belongs to ${shortAddr(info._recipient)}. Use that Circle wallet to claim.`)
        setActionState('error')
        return
      }

      const walletCode = await arcClient.getBytecode({ address: session.wallet.address }).catch(() => undefined)
      if (!walletCode || walletCode === '0x') {
        setActionError('Activating Circle wallet on Arc. Confirm once, then sign the claim.')
        await deployCircleEvmEmailWallet({ session })
        const deployed = await waitForArcContractCode(session.wallet.address)
        if (!deployed) {
          throw new Error('Circle wallet activation is still pending on Arc. Refresh this page in a minute and try again.')
        }
        setActionError(null)
      }

      const claimable = await arcClient.readContract({
        address: vaultAddress, abi: STREAM_VAULT_ABI,
        functionName: 'claimable',
      }) as bigint
      if (claimable === 0n) {
        setActionError('No funds available to withdraw yet.')
        setActionState('error')
        return
      }

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600)
      const nonce = await arcClient.readContract({
        address: vaultAddress, abi: STREAM_VAULT_ABI,
        functionName: 'nonces', args: [session.wallet.address],
      }) as bigint

      let sig: `0x${string}`
      try {
        sig = await signCircleArcStreamClaim({
          session,
          vaultAddress,
          amountUnits: claimable.toString(),
          nonce: nonce.toString(),
          deadline: deadline.toString(),
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!msg.toLowerCase().includes('undeployed wallet')) throw err
        setActionError('Activating Circle wallet on Arc. Confirm once, then sign the claim.')
        await deployCircleEvmEmailWallet({ session })
        const deployed = await waitForArcContractCode(session.wallet.address)
        if (!deployed) {
          throw new Error('Circle wallet activation is still pending on Arc. Refresh this page in a minute and try again.')
        }
        setActionError(null)
        sig = await signCircleArcStreamClaim({
          session,
          vaultAddress,
          amountUnits: claimable.toString(),
          nonce: nonce.toString(),
          deadline: deadline.toString(),
        })
      }

      setActionState('relaying')
      const res = await fetch('/api/relay-stream', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'claim', vaultAddress, sig,
          nonce: nonce.toString(), deadline: deadline.toString(),
          amount: claimable.toString(),
        }),
      })
      const data = await res.json() as { ok: boolean; txHash?: string; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'Relay failed')

      const hash = data.txHash as `0x${string}`
      setTxHash(hash)
      setActionState('pending')
      pollReceipt(hash)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('rejected') || msg.toLowerCase().includes('denied')) {
        setActionState('idle'); return
      }
      setActionError(cleanRelayError(msg))
      setActionState('error')
    }
  }

  async function copyCircleAddress(kind: 'wallet' | 'recipient', value: string) {
    await navigator.clipboard.writeText(value)
    setCircleCopied(kind)
    setTimeout(() => setCircleCopied(null), 2500)
  }

  function handleClaimAgain() {
    setActionState('idle')
    setActionError(null)
    setTxHash(null)
    refetchInfo()
    refetchNonce()
  }

  async function handleCancel() {
    if (!connectedAddr) return
    if (!window.confirm('Cancel this stream?\n\nThe unlocked portion goes to the recipient. The locked remainder is refunded to you.')) return
    setActionState('signing'); setActionError(null); setTxHash(null)
    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600)
      const nonce = await arcClient.readContract({
        address: vaultAddress, abi: STREAM_VAULT_ABI,
        functionName: 'nonces', args: [connectedAddr],
      }) as bigint

      const sig = await signTypedDataAsync({
        domain: { name: 'StreamVault', version: '1', chainId: ARC_CHAIN_ID, verifyingContract: vaultAddress },
        types: { Cancel: [
          { name: 'sender',   type: 'address' },
          { name: 'nonce',    type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ]},
        primaryType: 'Cancel',
        message: { sender: connectedAddr, nonce, deadline },
      })

      setActionState('relaying')
      const res  = await fetch('/api/relay-stream', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel', vaultAddress, sig,
          nonce: nonce.toString(), deadline: deadline.toString(),
        }),
      })
      const data = await res.json() as { ok: boolean; txHash?: string; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'Relay failed')

      const hash = data.txHash as `0x${string}`
      setTxHash(hash)
      setActionState('pending')
      pollReceipt(hash)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('rejected') || msg.toLowerCase().includes('denied')) {
        setActionState('idle'); return
      }
      setActionError(cleanRelayError(msg))
      setActionState('error')
    }
  }

  const isCancelled = info?._cancelled ?? false
  const isComplete  = stream?.isComplete ?? false
  const endTime     = liveParams?.endTime ?? 0n

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (isLoading && !info) {
    return (
      <div className="w-full max-w-[480px] mx-auto mt-12">
        <div className="overflow-hidden rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#111216] shadow-sm">
          <div className="animate-pulse p-7 space-y-5">
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 rounded bg-gray-100" />
              <div className="h-5 w-14 rounded-full bg-gray-100" />
            </div>
            <div className="space-y-1">
              <div className="h-3 w-32 rounded bg-gray-100" />
              <div className="h-12 w-48 rounded-lg bg-gray-100" />
            </div>
            <div className="h-2 w-full rounded-full bg-gray-100" />
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map(i => <div key={i} className="h-14 rounded-xl bg-gray-100" />)}
            </div>
            <div className="h-11 rounded-xl bg-gray-100" />
          </div>
        </div>
      </div>
    )
  }

  if (isError || !info) return <StreamNotFound vaultAddress={vaultAddress} />

  const statusBadge = isCancelled
    ? <span className="inline-flex items-center rounded-full bg-red-50 border border-red-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-500">Cancelled</span>
    : isComplete
    ? <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Complete</span>
    : <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ animation: 'spPulse 2s ease-in-out infinite' }} />
        Live
      </span>

  // ── Stream card ───────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-[480px] mx-auto mt-12">
      <div className="overflow-hidden rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#111216] shadow-sm">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2 sm:px-7 sm:pt-6 sm:pb-3">
          <div className="flex items-center gap-2">
            <span className="flex gap-0.5">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              <span className="h-2 w-2 rounded-full bg-amber-400" />
            </span>
            <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">StreamPay</span>
          </div>
          {statusBadge}
        </div>

        {/* Body */}
        <div className="px-5 pb-5 space-y-4 sm:px-7 sm:pb-6 sm:space-y-5">

          {/* Ticker */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                {isRecipient ? 'Available for Withdrawal' : isSender ? 'Active Payroll Stream' : 'Stream Overview'}
              </p>
              {reason && (
                <span className="max-w-[140px] truncate rounded-full border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:text-gray-300">
                  {reason}
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-1">
              <span className="self-start mt-1.5 text-[12px] font-medium text-gray-400">$</span>
              <span className="text-[2rem] sm:text-[3rem] font-bold leading-none tracking-tight tabular-nums text-gray-900 dark:text-gray-100">
                {stream ? formatUsdcFull(stream.totalUnlocked) : '0.000000'}
              </span>
              <span className="mb-0.5 self-end text-[12px] font-medium text-gray-400">USDC</span>
            </div>
            <p className="mt-0.5 text-[12px] text-gray-400">
              {stream?.isBeforeStart ? 'Stream begins soon'
               : isCancelled        ? 'Final vested amount'
               : isComplete         ? 'Fully vested'
               : 'Total unlocked · updates every 100ms'}
            </p>
          </div>

          {/* Progress bar */}
          {stream && (
            <TriStateBar
              claimed={stream.alreadyWithdrawn}
              unlocked={stream.claimable}
              locked={stream.remainingInStream}
              total={info._totalAmount}
            />
          )}

          {/* Meta cells */}
          <div className="grid grid-cols-3 gap-2">
            <MetaCell label="Total"     value={formatUsdc(info._totalAmount)} />
            <MetaCell
              label={isCancelled ? 'Cancelled' : isComplete ? 'Completed' : 'Remaining'}
              value={isCancelled || isComplete ? '—' : timeRemaining(endTime)}
            />
            <MetaCell label="Withdrawn" value={formatUsdc(info._alreadyWithdrawn)} />
          </div>

          {/* ── Actions ─────────────────────────────────────────────────── */}
          {!isCancelled && (
            <div className="space-y-2.5">
              {telegramMode && (() => {
                const claimable = stream?.claimable ?? 0n
                const hasBalance = claimable > 0n
                const circleConfigured = canUseCircleEvmEmailWallet('arc')
                const circleWalletMatches = !!circleSession && circleSession.wallet.address.toLowerCase() === info._recipient.toLowerCase()

                if (actionState === 'confirmed' && txHash) {
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 py-3">
                        <svg className="h-4 w-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        <span className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-300">Claim confirmed</span>
                      </div>
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <button
                          type="button"
                          onClick={() => window.open(`${ARC_EXPLORER}/tx/${txHash}`, '_blank', 'noopener,noreferrer')}
                          className="flex min-w-0 items-center justify-center gap-2 rounded-xl border-2 border-gray-200 dark:border-white/10 py-3 text-[13px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                        >
                          <ExtLinkIcon />
                          View on Arcscan
                        </button>
                        <button
                          type="button"
                          onClick={handleClaimAgain}
                          className="shrink-0 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#15151a] px-3 py-3 text-[11px] font-bold text-gray-500 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-white/5"
                        >
                          Claim again
                        </button>
                      </div>
                    </div>
                  )
                }

                return (
                  <div className="rounded-2xl border border-blue-100 dark:border-blue-900/30 bg-blue-50/40 dark:bg-blue-950/20 p-3.5 space-y-3">
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold text-gray-800 dark:text-gray-100">Claim with Circle Smart Wallet</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">Telegram StreamPay claims stay inside Circle on Arc</p>
                    </div>

                    {!circleSession && (
                      <input
                        type="email"
                        placeholder="email@example.com"
                        value={circleEmail}
                        onChange={e => setCircleEmail(e.target.value)}
                        disabled={actionState === 'signing' || actionState === 'relaying' || actionState === 'pending'}
                        className="w-full rounded-xl border-2 border-blue-100 dark:border-blue-900/40 bg-white dark:bg-[#15151a] px-4 py-3 text-[13px] text-gray-800 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 focus:outline-none focus:border-blue-300 transition-colors disabled:opacity-50 min-h-[46px]"
                      />
                    )}

                    {circleSession && (
                      <div className="rounded-xl border border-blue-100 dark:border-blue-900/40 bg-white dark:bg-[#15151a] px-3 py-2.5 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Circle wallet</p>
                            <p className="truncate font-mono text-[11px] text-gray-600 dark:text-gray-300">
                              {circleSession.wallet.address}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => copyCircleAddress('wallet', circleSession.wallet.address)}
                            className="shrink-0 rounded-lg border border-gray-200 dark:border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300"
                          >
                            {circleCopied === 'wallet' ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        {!circleWalletMatches && (
                          <div className="rounded-lg border border-red-100 bg-red-50 px-2.5 py-2 space-y-2">
                            <p className="text-[11px] font-semibold text-red-500">This wallet is not the stream recipient.</p>
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-red-300">Expected recipient</p>
                                <p className="truncate font-mono text-[11px] text-red-500">{info._recipient}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => copyCircleAddress('recipient', info._recipient)}
                            className="shrink-0 rounded-lg border border-red-200 dark:border-red-900/40 bg-white dark:bg-[#15151a] px-2.5 py-1.5 text-[11px] font-semibold text-red-500 dark:text-red-300"
                              >
                                {circleCopied === 'recipient' ? 'Copied' : 'Copy'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {actionState === 'pending' && txHash ? (
                      <button disabled
                        className="flex w-full items-center justify-center gap-2.5 rounded-xl py-3.5 text-[13px] font-semibold"
                        style={{ background: '#f3f4f6', color: '#6b7280', cursor: 'default' }}
                      >
                        Claim submitted on Arc
                      </button>
                    ) : actionState === 'signing' || actionState === 'relaying' ? (
                      <button disabled
                        className="flex w-full items-center justify-center gap-2.5 rounded-xl py-3.5 text-[13px] font-semibold"
                        style={{ background: '#111827', color: '#ffffff', opacity: 0.75, cursor: 'wait' }}
                      >
                        <svg className="h-4 w-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        {actionState === 'signing' ? 'Confirm in Circle Smart Wallet' : 'Broadcasting claim to Arc'}
                      </button>
                    ) : !hasBalance ? (
                      <div className="rounded-xl border border-gray-100 bg-white dark:bg-[#15151a] py-3.5 text-center text-[12px] font-medium text-gray-500 dark:text-gray-400">
                        {isComplete ? 'All funds withdrawn' : 'Earnings are still accruing'}
                      </div>
                    ) : (
                      <button
                        onClick={circleConfigured ? handleCircleClaim : undefined}
                        disabled={!circleConfigured}
                        className="flex w-full items-center justify-center gap-2.5 rounded-xl py-3.5 text-[13px] font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                        style={{ background: '#111827', color: '#ffffff' }}
                      >
                        Claim {formatUsdc(claimable)} with Circle
                      </button>
                    )}

                    {actionState === 'error' && actionError && (
                      <div className="rounded-xl border border-red-100 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-center space-y-1">
                        <p className="text-[12px] font-semibold text-red-600 dark:text-red-300">{actionError}</p>
                        <button
                          onClick={() => { setActionState('idle'); setActionError(null) }}
                          className="text-[11px] font-semibold text-red-500 dark:text-red-300 underline underline-offset-2"
                        >
                          Try again
                        </button>
                      </div>
                    )}

                    {!circleConfigured && (
                      <p className="text-center text-[12px] font-semibold text-red-500">Circle Smart Wallet is not configured.</p>
                    )}
                    <div className="flex justify-center">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-[#15151a] px-3 py-1">
                        <img src="/brand/circle-logo.jpeg" alt="" className="h-3 w-3 rounded-full object-cover" />
                        <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500">Powered by Circle</span>
                      </span>
                    </div>
                  </div>
                )
              })()}

              {/* Wallet not connected — header handles Connect Wallet */}
              {!telegramMode && !isConnected && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 py-3.5 text-center text-[12px] text-gray-400">
                  Connect your wallet above to interact
                </div>
              )}

              {/* Wrong network */}
              {!telegramMode && isConnected && !isOnArc && (
                <button
                  onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
                  className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[13px] font-semibold transition-colors active:scale-[0.98] min-h-[52px]"
                  style={{ background: '#111827', color: '#ffffff' }}
                >
                  Switch to Arc Network
                </button>
              )}

              {/* ── Recipient withdraw flow ── */}
              {!telegramMode && isRecipient && isOnArc && (() => {
                const claimable = stream?.claimable ?? 0n
                const hasBalance = claimable > 0n

                // Confirmed — show Arcscan button (even after balance refreshes to 0)
                if (actionState === 'confirmed' && txHash) {
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 py-3">
                        <svg className="h-4 w-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        <span className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-300">Withdrawal confirmed</span>
                      </div>
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <button
                          type="button"
                          onClick={() => window.open(`${ARC_EXPLORER}/tx/${txHash}`, '_blank', 'noopener,noreferrer')}
                          className="flex min-w-0 items-center justify-center gap-2 rounded-xl border-2 border-gray-200 dark:border-white/10 py-3 text-[13px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                        >
                          <ExtLinkIcon />
                          View on Arcscan
                        </button>
                        <button
                          type="button"
                          onClick={handleClaimAgain}
                          className="shrink-0 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#15151a] px-3 py-3 text-[11px] font-bold text-gray-500 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-white/5"
                        >
                          Claim again
                        </button>
                      </div>
                    </div>
                  )
                }

                // Pending — show inline status
                if (actionState === 'pending' && txHash) {
                  return (
                    <div className="space-y-2">
                      <button disabled
                        className="flex w-full items-center justify-center gap-2.5 rounded-xl py-3.5 text-[13px] font-semibold"
                        style={{ background: '#f3f4f6', color: '#6b7280', cursor: 'default' }}
                      >
                        Withdrawal submitted
                      </button>
                      {/* Pending indicator */}
                      <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <svg className="h-3.5 w-3.5 animate-spin text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          <span className="text-[12px] text-gray-500 font-medium">Pending on Arc…</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => window.open(`${ARC_EXPLORER}/tx/${txHash}`, '_blank', 'noopener,noreferrer')}
                          className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-800 underline underline-offset-2 transition-colors cursor-pointer"
                        >
                          <ExtLinkIcon />
                          Track
                        </button>
                      </div>
                    </div>
                  )
                }

                // Signing / relaying — disabled button with live label
                if (actionState === 'signing' || actionState === 'relaying') {
                  return (
                    <button disabled
                      className="flex w-full items-center justify-center gap-2.5 rounded-xl py-3.5 text-[13px] font-semibold"
                      style={{ background: '#111827', color: '#ffffff', opacity: 0.75, cursor: 'wait' }}
                    >
                      <svg className="h-4 w-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {actionState === 'signing' ? 'Sign in wallet — no gas required' : 'Broadcasting to Arc…'}
                    </button>
                  )
                }

                // Error — show message + retry
                if (actionState === 'error') {
                  return (
                    <div className="space-y-2">
                      <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-center space-y-1">
                        <p className="text-[12px] font-semibold text-red-600">{actionError}</p>
                        <button
                          onClick={() => { setActionState('idle'); setActionError(null) }}
                          className="text-[11px] font-semibold text-red-500 underline underline-offset-2"
                        >
                          Try again
                        </button>
                      </div>
                      {txHash && (
                        <button
                          type="button"
                          onClick={() => window.open(`${ARC_EXPLORER}/tx/${txHash}`, '_blank', 'noopener,noreferrer')}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-gray-200 py-2.5 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
                        >
                          <ExtLinkIcon />
                          Check transaction on Arcscan
                        </button>
                      )}
                    </div>
                  )
                }

                // Idle — main withdraw button (or "All funds withdrawn")
                if (!hasBalance) {
                  if (isComplete) {
                    return (
                      <div className="rounded-xl border border-gray-100 bg-gray-50 py-3.5 text-center text-[13px] font-medium text-gray-500">
                        All funds withdrawn
                      </div>
                    )
                  }
                  return (
                    <div className="flex items-center justify-center gap-1.5 text-[12px] text-gray-400 py-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ animation: 'spPulse 2s ease-in-out infinite' }} />
                      Earnings accruing — first withdrawal available soon
                    </div>
                  )
                }

                // Has balance — show withdraw
                if (!relayerReady) {
                  return (
                    <button disabled
                      className="flex w-full items-center justify-center gap-2.5 rounded-xl py-3.5 text-[13px] font-semibold"
                      style={{ background: '#111827', color: '#ffffff', opacity: 0.7, cursor: 'wait' }}
                    >
                      <svg className="h-4 w-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Relayer connecting…
                    </button>
                  )
                }

                return (
                  <button
                    onClick={handleClaim}
                    className="flex w-full items-center justify-center gap-2.5 rounded-xl py-3.5 text-[13px] font-semibold transition-all active:scale-[0.98]"
                    style={{ background: '#111827', color: '#ffffff', cursor: 'pointer' }}
                  >
                    Withdraw {formatUsdc(claimable)} to Wallet
                  </button>
                )
              })()}

              {/* Recipient complete — already handled inside the IIFE above */}

              {/* Sender cancel */}
              {!telegramMode && isSender && !isComplete && isOnArc && (
                <button
                  onClick={handleCancel}
                  disabled={actionState !== 'idle' && actionState !== 'error'}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 py-3 text-[13px] font-semibold text-red-600 hover:bg-red-100 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {actionState === 'signing'  ? 'Sign to confirm…'
                   : actionState === 'relaying' ? 'Processing…'
                   : actionState === 'pending'  ? 'Cancellation pending…'
                   : 'Cancel Stream & Reclaim Locked Funds'}
                </button>
              )}

              {/* Observer */}
              {!telegramMode && !isRecipient && !isSender && isConnected && (
                <a href="/"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-[13px] font-medium text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Create Your Own Stream
                </a>
              )}
            </div>
          )}

          {/* Address strip */}
          <div className="flex items-center justify-between rounded-xl border border-gray-100 dark:border-white/10 bg-gray-50/60 dark:bg-white/5 px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Sender</p>
              <p className="font-mono text-[12px] text-gray-600 dark:text-gray-300">{shortAddr(info._sender)}</p>
            </div>
            <svg className="h-3.5 w-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
            <div className="space-y-0.5 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Recipient</p>
              <p className="font-mono text-[12px] text-gray-600 dark:text-gray-300">{shortAddr(info._recipient)}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-50 dark:border-white/10 bg-gray-50/40 dark:bg-white/[0.03] py-3.5">
          <HashPayLinkBadge />
        </div>
      </div>

      <style>{`
        @keyframes spPulse {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 1;   }
        }
      `}</style>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 dark:border-white/10 bg-gray-50/60 dark:bg-white/5 px-2 py-2.5 sm:px-3 text-center">
      <p className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-gray-400 truncate">{label}</p>
      <p className="mt-0.5 text-[12px] sm:text-[13px] font-semibold text-gray-700 dark:text-gray-200 tabular-nums">{value}</p>
    </div>
  )
}

function ExtLinkIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  )
}
