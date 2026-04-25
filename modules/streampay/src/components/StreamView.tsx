import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  useAccount, useChainId, useSwitchChain,
  useReadContract, useSignTypedData,
} from 'wagmi'
import { useStreamState }     from '../hooks/useStreamState'
import { usePendingTx }       from '../hooks/usePendingTx'
import { TriStateBar, formatUsdc, formatUsdcFull } from './TriStateBar'
import { SyncingOverlay }     from './SyncingOverlay'
import { PendingTxToast }     from './PendingTxToast'
import { CreateStreamForm }   from './CreateStreamForm'
import { StreamNotFound }     from './StreamNotFound'
import { STREAM_VAULT_ABI }   from '../lib/streamVaultAbi'

// ── StreamInfo type (viem returns labeled tuple; cast via unknown) ─────────────
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

// ── Constants ─────────────────────────────────────────────────────────────────
const ARC_CHAIN_ID = 5042002
const ARC_EXPLORER = 'https://testnet.arcscan.app'
const nowSec = () => BigInt(Math.floor(Date.now() / 1000))

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeRemaining(endTime: bigint): string {
  const diff = Number(endTime - nowSec())
  if (diff <= 0) return 'Stream complete'
  const days  = Math.floor(diff / 86400)
  const hours = Math.floor((diff % 86400) / 3600)
  const mins  = Math.floor((diff % 3600) / 60)
  if (days  > 0) return `${days}d ${hours}h remaining`
  if (hours > 0) return `${hours}h ${mins}m remaining`
  return `${mins}m remaining`
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

// ── Types ─────────────────────────────────────────────────────────────────────
type ActionState = 'idle' | 'signing' | 'relaying' | 'success' | 'error'

interface StreamViewProps {
  vaultAddress?: `0x${string}`
}

// ── Component ─────────────────────────────────────────────────────────────────
export function StreamView({ vaultAddress }: StreamViewProps) {
  const [params] = useSearchParams()
  const reason   = params.get('reason') ?? undefined

  if (!vaultAddress) return <CreateStreamForm />
  return <StreamDetail vaultAddress={vaultAddress} reason={reason} />
}

// ── Stream Detail (production, live contract data) ────────────────────────────
function StreamDetail({ vaultAddress, reason }: { vaultAddress: `0x${string}`; reason?: string }) {
  const { address: connectedAddr, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const isOnArc = chainId === ARC_CHAIN_ID

  // ── Relayer health gate ───────────────────────────────────────────────────
  const [relayerReady, setRelayerReady] = useState(false)

  // ── Contract reads ────────────────────────────────────────────────────────
  const {
    data: rawInfo,
    refetch: refetchInfo,
    isLoading,
    isError,
  } = useReadContract({
    address:      vaultAddress,
    abi:          STREAM_VAULT_ABI,
    functionName: 'streamInfo',
    query:        { enabled: relayerReady, retry: 1 },
  })
  const info = rawInfo as unknown as StreamInfo | undefined

  const { data: signerNonce, refetch: refetchNonce } = useReadContract({
    address:      vaultAddress,
    abi:          STREAM_VAULT_ABI,
    functionName: 'nonces',
    args:         [connectedAddr ?? '0x0000000000000000000000000000000000000000'],
    query:        { enabled: relayerReady && !!connectedAddr },
  })

  // ── Role detection ────────────────────────────────────────────────────────
  const isRecipient = !!connectedAddr && !!info
    && connectedAddr.toLowerCase() === info._recipient.toLowerCase()
  const isSender = !!connectedAddr && !!info
    && connectedAddr.toLowerCase() === info._sender.toLowerCase()

  // ── Live ticker params (100ms updates) ───────────────────────────────────
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

  // ── EIP-712 gasless actions ───────────────────────────────────────────────
  const { signTypedDataAsync } = useSignTypedData()
  const [actionState, setActionState] = useState<ActionState>('idle')
  const [txHash,      setTxHash]      = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const { pendingTxs, addPending, dismiss } = usePendingTx(vaultAddress)

  async function handleClaim() {
    if (!connectedAddr || !stream || stream.claimable === 0n) return
    setActionState('signing'); setActionError(null)
    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600)
      const nonce    = signerNonce ?? 0n

      const sig = await signTypedDataAsync({
        domain: { name: 'StreamVault', version: '1', chainId: ARC_CHAIN_ID, verifyingContract: vaultAddress },
        types: {
          Claim: [
            { name: 'recipient', type: 'address' },
            { name: 'amount',    type: 'uint256' },
            { name: 'nonce',     type: 'uint256' },
            { name: 'deadline',  type: 'uint256' },
          ],
        },
        primaryType: 'Claim',
        message: { recipient: connectedAddr, amount: stream.claimable, nonce, deadline },
      })

      setActionState('relaying')
      const res  = await fetch('/api/relay-stream', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'claim', vaultAddress, sig,
          nonce: nonce.toString(), deadline: deadline.toString(),
          amount: stream.claimable.toString(),
        }),
      })
      const data = await res.json() as { ok: boolean; txHash?: string; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'Relay failed')

      const hash = data.txHash as `0x${string}` | undefined
      setTxHash(hash ?? null)
      if (hash) addPending(hash, vaultAddress, 'claim')
      setActionState('success')
      setTimeout(() => { refetchInfo(); refetchNonce() }, 4_000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('rejected') || msg.toLowerCase().includes('denied')) {
        setActionState('idle'); return
      }
      setActionError(msg.slice(0, 120)); setActionState('error')
    }
  }

  async function handleCancel() {
    if (!connectedAddr) return
    if (!window.confirm('Cancel this stream?\n\nThe unlocked portion will be sent to the recipient and the locked remainder will be refunded to you.')) return
    setActionState('signing'); setActionError(null)
    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600)
      const nonce    = signerNonce ?? 0n

      const sig = await signTypedDataAsync({
        domain: { name: 'StreamVault', version: '1', chainId: ARC_CHAIN_ID, verifyingContract: vaultAddress },
        types: {
          Cancel: [
            { name: 'sender',   type: 'address' },
            { name: 'nonce',    type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
          ],
        },
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

      const hash = data.txHash as `0x${string}` | undefined
      setTxHash(hash ?? null)
      if (hash) addPending(hash, vaultAddress, 'cancel')
      setActionState('success')
      setTimeout(() => refetchInfo(), 4_000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('rejected') || msg.toLowerCase().includes('denied')) {
        setActionState('idle'); return
      }
      setActionError(msg.slice(0, 120)); setActionState('error')
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const isCancelled = info?._cancelled ?? false
  const isComplete  = stream?.isComplete ?? false
  const endTime     = liveParams?.endTime ?? 0n

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (!relayerReady || (isLoading && !info)) {
    return (
      <div className="mx-auto w-full max-w-md font-inter">
        <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg">
          {!relayerReady && <SyncingOverlay onReady={() => setRelayerReady(true)} />}
          <div className="animate-pulse px-6 py-8 space-y-5">
            <div className="h-3 w-24 rounded bg-gray-100" />
            <div className="h-14 w-48 rounded-lg bg-gray-100" />
            <div className="h-2 w-full rounded-full bg-gray-100" />
            <div className="grid grid-cols-3 gap-3">
              {[0,1,2].map(i => <div key={i} className="h-12 rounded-xl bg-gray-100" />)}
            </div>
            <div className="h-12 rounded-xl bg-gray-100" />
          </div>
        </div>
      </div>
    )
  }

  // ── Not found ─────────────────────────────────────────────────────────────
  if (isError && !info) {
    return <StreamNotFound vaultAddress={vaultAddress} />
  }

  // ── Production stream card ────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-md font-inter">
      <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <div className="flex items-center gap-1.5">
            <img src="/hash-logo.png" alt="" className="h-4 w-4 opacity-30" />
            <span className="text-[11px] font-medium tracking-widest text-gray-300 uppercase">
              Hash PayLink
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {!isComplete && !isCancelled && (
              <span className="flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                <span className="h-1.5 w-1.5 rounded-full bg-[#00FF41]"
                  style={{ animation: 'streamPulse 2s ease-in-out infinite' }} />
                Live
              </span>
            )}
            {isCancelled && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-400">Cancelled</span>}
            {isComplete && !isCancelled && <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#00CC33]">Complete</span>}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 pb-6 pt-4 space-y-6">

          {/* Role label + Ticker */}
          <div>
            <div className="flex items-center gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                {isRecipient ? 'Available for Withdrawal'
                 : isSender   ? 'Active Payroll Stream'
                 : 'Stream Overview'}
              </p>
              {reason && (
                <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[10px] font-semibold text-gray-500 truncate max-w-[160px]">
                  {reason}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="self-start mt-2 text-[11px] font-medium text-gray-400">$</span>
              <span
                className="text-[3.25rem] font-bold leading-none tracking-tight tabular-nums"
                style={{ color: '#00FF41' }}
              >
                {stream ? formatUsdcFull(stream.totalUnlocked) : '0.000000'}
              </span>
              <span className="mb-0.5 self-end text-xs font-medium text-gray-400">USDC</span>
            </div>
            <p className="mt-0.5 text-[12px] text-gray-400">
              {stream?.isBeforeStart  ? 'Stream begins soon'
               : isCancelled         ? 'Final vested amount'
               : isComplete          ? 'Fully vested'
               : 'Total unlocked · updates every 100ms'}
            </p>
          </div>

          {/* Progress bar */}
          {stream && (
            <TriStateBar
              claimed={stream.alreadyWithdrawn}
              unlocked={stream.claimable}
              locked={stream.remainingInStream}
              total={liveParams?.totalAmount ?? 1n}
            />
          )}

          {/* Meta cells */}
          <div className="grid grid-cols-3 gap-3">
            <MetaCell label="Total"     value={formatUsdc(liveParams?.totalAmount ?? 0n)} />
            <MetaCell
              label={isCancelled ? 'Cancelled' : isComplete ? 'Completed' : 'Remaining'}
              value={isCancelled || isComplete ? '—' : timeRemaining(endTime)}
            />
            <MetaCell label="Withdrawn" value={formatUsdc(stream?.alreadyWithdrawn ?? 0n)} />
          </div>

          {/* Actions */}
          {!isCancelled && (
            <div className="space-y-2.5">
              {isConnected && !isOnArc && (
                <button onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 py-3.5 text-[14px] font-semibold text-white hover:bg-gray-700 transition-colors active:scale-[0.98]">
                  Switch to Arc Network
                </button>
              )}
              {!isConnected && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 py-3.5 text-center text-[13px] text-gray-400">
                  Connect your wallet to interact
                </div>
              )}

              {/* Recipient withdraw */}
              {isRecipient && isOnArc && !isComplete && (() => {
                const isAccruing   = !!stream && stream.claimable === 0n && !stream.isBeforeStart
                const isNotStarted = !!stream && stream.isBeforeStart
                return (
                  <div className="space-y-1.5">
                    <ActionButton
                      state={actionState}
                      label={`Withdraw ${formatUsdc(stream?.claimable ?? 0n)} to Wallet`}
                      signingLabel="Sign in wallet — no gas required"
                      relayingLabel="Submitting via relayer…"
                      successLabel="Withdrawal submitted"
                      disabled={!stream || stream.claimable === 0n}
                      onClick={handleClaim}
                    />
                    {isNotStarted && (
                      <p className="text-center text-[12px] text-gray-400">
                        Stream begins {new Date(Number(liveParams!.startTime) * 1000).toLocaleString()}
                      </p>
                    )}
                    {isAccruing && (
                      <div className="flex items-center justify-center gap-1.5 text-[12px] text-gray-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#00FF41]"
                          style={{ animation: 'streamPulse 2s ease-in-out infinite' }} />
                        Earnings accruing — first withdrawal available soon
                      </div>
                    )}
                  </div>
                )
              })()}

              {isRecipient && isComplete && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 py-3.5 text-center text-[13px] font-medium text-gray-500">
                  All funds withdrawn
                </div>
              )}

              {/* Sender cancel */}
              {isSender && !isComplete && (
                <button onClick={handleCancel} disabled={actionState !== 'idle'}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 py-3 text-[13px] font-semibold text-red-600 hover:bg-red-100 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50">
                  {actionState === 'signing' ? 'Sign to confirm…'
                   : actionState === 'relaying' ? 'Processing…'
                   : 'Cancel Stream & Reclaim Locked Funds'}
                </button>
              )}

              {/* Create new stream link (observer role) */}
              {!isRecipient && !isSender && isConnected && (
                <a href="/"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-[13px] font-medium text-gray-500 hover:bg-gray-50 transition-colors">
                  Create Your Own Stream
                </a>
              )}

              {actionState === 'success' && txHash && (
                <a href={`${ARC_EXPLORER}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 text-[12px] font-medium text-gray-400 hover:text-gray-600 transition-colors">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                  View on Arcscan
                </a>
              )}
              {actionState === 'error' && actionError && (
                <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-center text-[12px] text-red-500">
                  {actionError}
                </p>
              )}
            </div>
          )}

          {/* Sender → Recipient strip */}
          {info && (
            <div className="flex items-center justify-between rounded-xl border border-gray-50 bg-gray-50/60 px-3.5 py-2.5">
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Sender</p>
                <p className="font-mono text-[12px] text-gray-600">{shortAddr(info._sender)}</p>
              </div>
              <svg className="h-3.5 w-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
              <div className="space-y-0.5 text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Recipient</p>
                <p className="font-mono text-[12px] text-gray-600">{shortAddr(info._recipient)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer badge */}
        <div className="flex items-center justify-center gap-1.5 border-t border-gray-50 bg-gray-50/40 py-3">
          <img src="/hash-logo.png" alt="Hash PayLink" className="h-3.5 w-3.5 opacity-25" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-300">
            Powered by Hash PayLink
          </span>
        </div>
      </div>

      <PendingTxToast txs={pendingTxs} onDismiss={dismiss} />

      <style>{`
        @keyframes streamPulse {
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
    <div className="rounded-xl border border-gray-50 bg-gray-50/60 px-3 py-2.5 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-0.5 text-[13px] font-semibold text-gray-700 tabular-nums">{value}</p>
    </div>
  )
}

interface ActionButtonProps {
  state:         ActionState
  label:         string
  signingLabel:  string
  relayingLabel: string
  successLabel:  string
  disabled?:     boolean
  onClick:       () => void
}

function ActionButton({ state, label, signingLabel, relayingLabel, successLabel, disabled, onClick }: ActionButtonProps) {
  const isWorking = state === 'signing' || state === 'relaying'
  const isDone    = state === 'success'

  const displayLabel = state === 'signing' ? signingLabel
    : state === 'relaying' ? relayingLabel
    : isDone ? successLabel
    : label

  return (
    <button
      onClick={onClick}
      disabled={disabled || isWorking || isDone}
      className={[
        'flex w-full items-center justify-center gap-2.5 rounded-xl py-3.5 text-[14px] font-semibold',
        'transition-all duration-150 active:scale-[0.98]',
        isDone    ? 'bg-gray-100 text-gray-500 cursor-default'
        : isWorking ? 'cursor-wait opacity-75'
        : disabled  ? 'cursor-not-allowed opacity-40'
        : 'shadow-sm hover:opacity-90',
      ].join(' ')}
      style={!isDone && !isWorking && !disabled ? { background: '#00FF41', color: '#0a0a0a' } : undefined}
    >
      {isWorking && (
        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {isDone && (
        <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      )}
      {displayLabel}
    </button>
  )
}
