import { useMemo, useState } from 'react'
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useReadContract,
  useSignTypedData,
} from 'wagmi'
import { useStreamState }  from '../hooks/useStreamState'
import { TriStateBar, formatUsdc, formatUsdcFull } from './TriStateBar'
import { SyncingOverlay }  from './SyncingOverlay'
import { STREAM_VAULT_ABI } from '../lib/streamVaultAbi'

// ── Arc constants (self-contained — no import from core SDK) ──────────────────
const ARC_CHAIN_ID = 5042002
const ARC_EXPLORER = 'https://testnet.arcscan.app'

// ── Demo stream — shown when no vaultAddress is provided ──────────────────────
const nowSec = () => BigInt(Math.floor(Date.now() / 1000))
const DEMO_PARAMS = {
  totalAmount:      50_000_000n,                      // 50 USDC
  startTime:        nowSec() - 7_200n,                // started 2h ago
  endTime:          nowSec() + 79_200n,               // ends in 22h (24h stream)
  alreadyWithdrawn: 3_125_000n,                       // ~3.12 USDC claimed
  cancelled:        false,
  enabled:          true,
}

// ── Types ─────────────────────────────────────────────────────────────────────
type ActionState = 'idle' | 'signing' | 'relaying' | 'success' | 'error'

interface StreamViewProps {
  /** Deployed StreamVault address. Omit to show the interactive demo. */
  vaultAddress?: `0x${string}`
}

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

// ── Main component ────────────────────────────────────────────────────────────
export function StreamView({ vaultAddress }: StreamViewProps) {
  const isDemo = !vaultAddress

  // ── Network + wallet ────────────────────────────��──────────────────────────
  const { address: connectedAddr, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const isOnArc = chainId === ARC_CHAIN_ID

  // ── Relayer health ─────────────────────────────────────────────────────────
  const [relayerReady, setRelayerReady] = useState(isDemo) // demo skips health check

  // ── Contract reads (skipped in demo mode) ─────────────────────────────────
  const { data: info, refetch: refetchInfo } = useReadContract({
    address:      vaultAddress,
    abi:          STREAM_VAULT_ABI,
    functionName: 'streamInfo',
    query:        { enabled: !!vaultAddress && relayerReady },
  })

  const { data: signerNonce, refetch: refetchNonce } = useReadContract({
    address:      vaultAddress,
    abi:          STREAM_VAULT_ABI,
    functionName: 'nonces',
    args:         [connectedAddr ?? '0x0000000000000000000000000000000000000000'],
    query:        { enabled: !!vaultAddress && !!connectedAddr && relayerReady },
  })

  // ── Role detection ─────────────────────────────────────────────────────────
  const isRecipient = !isDemo && !!connectedAddr && info?._recipient
    ? connectedAddr.toLowerCase() === info._recipient.toLowerCase()
    : isDemo   // demo defaults to recipient view

  const isSender = !isDemo && !!connectedAddr && info?._sender
    ? connectedAddr.toLowerCase() === info._sender.toLowerCase()
    : false

  // ── Stream params → live ticker (100ms for buttery smooth display) ─────────
  const liveParams = useMemo(() => {
    if (isDemo) return { ...DEMO_PARAMS, enabled: true }
    if (!info)  return null
    return {
      totalAmount:      info._totalAmount,
      startTime:        BigInt(info._startTime),
      endTime:          BigInt(info._endTime),
      alreadyWithdrawn: info._alreadyWithdrawn,
      cancelled:        info._cancelled,
      enabled:          true,
    }
  }, [isDemo, info])

  const stream = useStreamState(liveParams, 100)

  // ── EIP-712 signing ────────────────────────────────────────────────────────
  const { signTypedDataAsync } = useSignTypedData()

  const [actionState, setActionState] = useState<ActionState>('idle')
  const [txHash,      setTxHash]      = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleClaim() {
    if (!vaultAddress || !connectedAddr || !stream || stream.claimable === 0n) return
    setActionState('signing')
    setActionError(null)
    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600)  // 10-minute window
      const nonce    = signerNonce ?? 0n

      const sig = await signTypedDataAsync({
        domain: {
          name:              'StreamVault',
          version:           '1',
          chainId:           ARC_CHAIN_ID,
          verifyingContract: vaultAddress,
        },
        types: {
          Claim: [
            { name: 'recipient', type: 'address' },
            { name: 'amount',    type: 'uint256' },
            { name: 'nonce',     type: 'uint256' },
            { name: 'deadline',  type: 'uint256' },
          ],
        },
        primaryType: 'Claim',
        message: {
          recipient: connectedAddr,
          amount:    stream.claimable,
          nonce,
          deadline,
        },
      })

      setActionState('relaying')
      const res  = await fetch('/api/relay-stream', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:       'claim',
          vaultAddress,
          sig,
          nonce:    nonce.toString(),
          deadline: deadline.toString(),
          amount:   stream.claimable.toString(),
        }),
      })
      const data = await res.json() as { ok: boolean; txHash?: string; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'Relay failed')

      setTxHash(data.txHash ?? null)
      setActionState('success')
      setTimeout(() => { refetchInfo(); refetchNonce() }, 4_000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      // User rejected signing — return quietly
      if (msg.toLowerCase().includes('rejected') || msg.toLowerCase().includes('denied')) {
        setActionState('idle')
        return
      }
      setActionError(msg.slice(0, 120))
      setActionState('error')
    }
  }

  async function handleCancel() {
    if (!vaultAddress || !connectedAddr) return
    if (!window.confirm('Cancel this stream? The unlocked portion will be sent to the recipient and the remainder refunded to you.')) return

    setActionState('signing')
    setActionError(null)
    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600)
      const nonce    = signerNonce ?? 0n

      const sig = await signTypedDataAsync({
        domain: {
          name:              'StreamVault',
          version:           '1',
          chainId:           ARC_CHAIN_ID,
          verifyingContract: vaultAddress,
        },
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
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel', vaultAddress, sig,
          nonce: nonce.toString(), deadline: deadline.toString(),
        }),
      })
      const data = await res.json() as { ok: boolean; txHash?: string; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'Relay failed')

      setTxHash(data.txHash ?? null)
      setActionState('success')
      setTimeout(() => refetchInfo(), 4_000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('rejected') || msg.toLowerCase().includes('denied')) {
        setActionState('idle'); return
      }
      setActionError(msg.slice(0, 120))
      setActionState('error')
    }
  }

  // ── Derived display values ─────────────────────────────────────────────────
  const endTime = liveParams
    ? (isDemo ? DEMO_PARAMS.endTime : BigInt((info?._endTime ?? 0)))
    : 0n

  const isCancelled = info?._cancelled ?? false
  const isComplete  = stream?.isComplete ?? false

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-md font-inter">
      {/* ── Financial Card ──────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg">

        {/* Relayer syncing overlay */}
        {!relayerReady && (
          <SyncingOverlay onReady={() => setRelayerReady(true)} />
        )}

        {/* ── Card Header ─────────────────────────────────────────────── */}
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
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[#00FF41]"
                  style={{ animation: 'streamPulse 2s ease-in-out infinite' }}
                />
                Live
              </span>
            )}
            {isCancelled && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-400">
                Cancelled
              </span>
            )}
            {isComplete && !isCancelled && (
              <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#00CC33]">
                Complete
              </span>
            )}
          </div>
        </div>

        {/* ── Main Body ───────────────────────────────────────────────── */}
        <div className="px-6 pb-6 pt-4 space-y-6">

          {/* Role label */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
              {isRecipient
                ? 'Available for Withdrawal'
                : isSender
                ? 'Active Payroll Stream'
                : isDemo
                ? 'Available for Withdrawal'
                : 'Stream Overview'}
            </p>

            {/* ── Live Ticker ─────────────────────────────────────────── */}
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-[11px] font-medium text-gray-400 self-start mt-2">$</span>
              <span
                className="text-[3.25rem] font-bold leading-none tracking-tight tabular-nums transition-none"
                style={{ color: '#00FF41', fontVariantNumeric: 'tabular-nums' }}
              >
                {stream
                  ? formatUsdcFull(
                      isRecipient || isDemo
                        ? stream.totalUnlocked
                        : stream.totalUnlocked
                    )
                  : '0.000000'}
              </span>
              <span className="mb-0.5 self-end text-xs font-medium text-gray-400">USDC</span>
            </div>
            <p className="mt-0.5 text-[12px] text-gray-400">
              {stream?.isBeforeStart
                ? 'Stream starts soon'
                : stream?.isComplete || isCancelled
                ? 'Final vested amount'
                : 'Total unlocked · updates every 100ms'}
            </p>
          </div>

          {/* ── Tri-State Progress Bar ────────────────────────────────��─── */}
          {stream && (
            <TriStateBar
              claimed={stream.alreadyWithdrawn}
              unlocked={stream.claimable}
              locked={stream.remainingInStream}
              total={liveParams?.totalAmount ?? 1n}
            />
          )}

          {/* ── Stream metadata ─────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-3">
            <MetaCell
              label="Total"
              value={formatUsdc(liveParams?.totalAmount ?? 0n)}
            />
            <MetaCell
              label={isCancelled ? 'Cancelled' : isComplete ? 'Completed' : 'Remaining'}
              value={isCancelled || isComplete
                ? '—'
                : timeRemaining(endTime)}
            />
            <MetaCell
              label="Withdrawn"
              value={formatUsdc(stream?.alreadyWithdrawn ?? 0n)}
            />
          </div>

          {/* ── Action Button ───────────────────────────────────���────────── */}
          {!isCancelled && (
            <div className="space-y-2.5">

              {/* Wrong network */}
              {isConnected && !isOnArc && !isDemo && (
                <button
                  onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 py-3.5 text-[14px] font-semibold text-white transition-all hover:bg-gray-700 active:scale-[0.98]"
                >
                  Switch to Arc Network
                </button>
              )}

              {/* Not connected */}
              {!isConnected && !isDemo && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 py-3.5 text-center text-[13px] text-gray-400">
                  Connect your wallet to interact
                </div>
              )}

              {/* Recipient: Withdraw */}
              {(isRecipient || isDemo) && (isOnArc || isDemo) && !isComplete && (
                <ActionButton
                  state={actionState}
                  label={`Withdraw ${formatUsdc(stream?.claimable ?? 0n)} to Wallet`}
                  signingLabel="Sign in wallet — no gas required"
                  relayingLabel="Submitting via relayer…"
                  successLabel="Withdrawal submitted"
                  disabled={!stream || stream.claimable === 0n || isDemo}
                  onClick={handleClaim}
                />
              )}

              {/* Recipient: Fully withdrawn */}
              {isRecipient && isComplete && stream?.claimable === 0n && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 py-3.5 text-center text-[13px] font-medium text-gray-500">
                  All funds withdrawn
                </div>
              )}

              {/* Sender: Manage / Cancel */}
              {isSender && !isComplete && (
                <button
                  onClick={handleCancel}
                  disabled={actionState !== 'idle'}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 py-3 text-[13px] font-semibold text-red-600 transition-all hover:bg-red-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {actionState === 'signing' ? 'Sign to confirm…'
                  : actionState === 'relaying' ? 'Processing cancellation…'
                  : 'Cancel Stream & Reclaim Locked Funds'}
                </button>
              )}

              {/* Tx success */}
              {actionState === 'success' && txHash && (
                <a
                  href={`${ARC_EXPLORER}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 text-[12px] font-medium text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                  View on Arcscan
                </a>
              )}

              {/* Error */}
              {actionState === 'error' && actionError && (
                <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-center text-[12px] text-red-500">
                  {actionError}
                </p>
              )}

              {/* Demo try stream button */}
              {isDemo && (
                <button
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-[13px] font-medium text-gray-500 transition-colors hover:bg-gray-50"
                  onClick={() => alert('Connect a vault address to stream real USDC on Arc Testnet.')}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                  </svg>
                  Try a Demo Stream
                </button>
              )}
            </div>
          )}

          {/* ── Address metadata ─────────────────────────────────────────── */}
          {!isDemo && info && (
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

        {/* ── Powered by Hash PayLink badge ────────────────────────────── */}
        <div className="flex items-center justify-center gap-1.5 border-t border-gray-50 bg-gray-50/40 py-3">
          <img src="/hash-logo.png" alt="Hash PayLink" className="h-3.5 w-3.5 opacity-25" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-300">
            Powered by Hash PayLink
          </span>
        </div>
      </div>

      {/* Pulse keyframe (shared across card) */}
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
  state:        ActionState
  label:        string
  signingLabel: string
  relayingLabel:string
  successLabel: string
  disabled?:    boolean
  onClick:      () => void
}

function ActionButton({
  state, label, signingLabel, relayingLabel, successLabel, disabled, onClick,
}: ActionButtonProps) {
  const isActive  = state === 'idle' || state === 'error'
  const isWorking = state === 'signing' || state === 'relaying'
  const isDone    = state === 'success'

  const displayLabel = state === 'signing'  ? signingLabel
    : state === 'relaying' ? relayingLabel
    : isDone               ? successLabel
    : label

  return (
    <button
      onClick={onClick}
      disabled={disabled || isWorking || isDone}
      className={[
        'flex w-full items-center justify-center gap-2.5 rounded-xl py-3.5 text-[14px] font-semibold',
        'transition-all duration-150 active:scale-[0.98]',
        isDone
          ? 'bg-gray-100 text-gray-500 cursor-default'
          : isWorking
          ? 'cursor-wait opacity-75'
          : disabled
          ? 'cursor-not-allowed opacity-40'
          : 'shadow-sm hover:opacity-90 active:shadow-none',
      ].join(' ')}
      style={!isDone && !isWorking && !disabled
        ? { background: '#00FF41', color: '#0a0a0a' }
        : undefined}
    >
      {isWorking && (
        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
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
