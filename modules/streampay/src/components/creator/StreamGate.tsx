import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams }    from 'react-router-dom'
import { useAccount, useChainId, useSwitchChain, useWriteContract } from 'wagmi'
import { useQuery }           from '@tanstack/react-query'
import { createPublicClient, http, defineChain, parseAbi } from 'viem'
import { usePoAStream }       from '../../hooks/usePoAStream'
import { usePasskey }         from '../../hooks/usePasskey'

// ── Arc standalone client (same pattern as StreamView) ────────────────────────
const arcClient = createPublicClient({
  chain: defineChain({
    id:             5042002,
    name:           'Arc Testnet',
    nativeCurrency: { decimals: 18, name: 'USD Coin', symbol: 'USDC' },
    rpcUrls:        { default: { http: ['https://rpc.testnet.arc.network'] } },
  }),
  transport: http('https://rpc.testnet.arc.network'),
})

const ARC_CHAIN_ID  = 5042002
const ARC_USDC      = '0x3600000000000000000000000000000000000000' as const
const POA_CONTRACT  = (import.meta.env.VITE_POA_CONTRACT ?? '') as `0x${string}`

const ERC20_ABI = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
])

// ── Component ─────────────────────────────────────────────────────────────────

export function StreamGate() {
  const [params] = useSearchParams()

  const contentId  = params.get('id')   ?? ''
  const creator    = (params.get('cr')  ?? '') as `0x${string}`
  const rateRaw    = parseInt(params.get('r')   ?? '1000',   10)
  const capRaw     = parseInt(params.get('cap') ?? '100000', 10)
  const url        = params.get('u')    ?? ''
  const title      = params.get('t')    ?? url

  const dripRate   = rateRaw  / 1_000_000
  const sessionCap = capRaw   / 1_000_000

  const { address, isConnected }  = useAccount()
  const chainId                   = useChainId()
  const { switchChain }           = useSwitchChain()
  const { writeContractAsync }    = useWriteContract()
  const isOnArc = chainId === ARC_CHAIN_ID

  const passkey = usePasskey()
  const poa     = usePoAStream({ contentId, creator, dripRate, sessionCap })
  const { sessionStart, sessionStop, setVisible } = poa

  // ── USDC allowance check ──────────────────────────────────────────────────
  const { data: allowance, refetch: refetchAllowance } = useQuery<bigint>({
    queryKey: ['poa_allowance', address, POA_CONTRACT],
    queryFn:  async () => {
      if (!address || !POA_CONTRACT) return 0n
      const raw = await arcClient.readContract({
        address: ARC_USDC, abi: ERC20_ABI,
        functionName: 'allowance', args: [address, POA_CONTRACT],
      })
      return raw as bigint
    },
    enabled:        !!address && !!POA_CONTRACT && isOnArc,
    staleTime:      10_000,
    refetchInterval: 15_000,
  })

  const isApproved = !!allowance && allowance >= BigInt(capRaw)

  // ── USDC approve() flow ───────────────────────────────────────────────────
  const [approving,    setApproving]    = useState(false)
  const [approveTx,    setApproveTx]    = useState<`0x${string}` | null>(null)
  const [approveError, setApproveError] = useState<string | null>(null)
  const [approvePending, setApprovePending] = useState(false)

  async function handleApprove() {
    if (!POA_CONTRACT || !isConnected || !isOnArc) return
    setApproving(true)
    setApproveError(null)
    try {
      const tx = await writeContractAsync({
        address: ARC_USDC, abi: ERC20_ABI,
        functionName: 'approve',
        args: [POA_CONTRACT, BigInt(capRaw)],
        gas: 100_000n,
      })
      setApproveTx(tx)
      setApprovePending(true)
      pollApproval(tx)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!/rejected|denied/i.test(msg)) setApproveError(msg.slice(0, 140))
    } finally {
      setApproving(false)
    }
  }

  // Poll for approval receipt using standalone Arc client (same as StreamView)
  const pollApproval = useCallback((hash: `0x${string}`, attempts = 0) => {
    if (attempts > 40) {
      setApprovePending(false)
      setApproveError('Approval not confirmed after 2 min — check Arcscan')
      return
    }
    setTimeout(async () => {
      try {
        const receipt = await arcClient.getTransactionReceipt({ hash })
        if (receipt?.status === 'success') {
          setApprovePending(false)
          setApproveTx(null)
          refetchAllowance()
        } else if (receipt?.status === 'reverted') {
          setApprovePending(false)
          setApproveError('Approval transaction reverted')
        } else {
          pollApproval(hash, attempts + 1)
        }
      } catch { pollApproval(hash, attempts + 1) }
    }, 3_000)
  }, [refetchAllowance])

  // ── Auth gate state ───────────────────────────────────────────────────────
  // Content unlocks only when all 4 conditions are met
  const fullyAuthorised = isConnected && isOnArc && passkey.registered && isApproved

  // IntersectionObserver: start/stop drip when ≥50% of content is visible
  const contentRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = contentRef.current
    if (!el || !fullyAuthorised) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting && entry.intersectionRatio >= 0.5
        setVisible(visible)
        if (visible) void sessionStart()
        else sessionStop()
      },
      { threshold: [0, 0.5, 1.0] },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [fullyAuthorised, sessionStart, sessionStop, setVisible])

  // Final checkpoint sign on page leave
  useEffect(() => () => sessionStop(), [sessionStop])

  // ── Invalid link ──────────────────────────────────────────────────────────
  if (!contentId || !creator) {
    return (
      <div className="w-full max-w-[480px] mx-auto mt-12 text-center text-[13px] text-gray-400 py-12">
        Invalid gate link — missing content parameters.
      </div>
    )
  }

  const progressPct  = Math.min((poa.accrued / sessionCap) * 100, 100)
  const currentStep  = !isConnected ? 0 : !isOnArc ? 1 : !passkey.registered ? 2 : 3

  return (
    <div className="w-full max-w-[480px] mx-auto mt-8 space-y-4">

      {/* Gated content card */}
      <div ref={contentRef} className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">

        {/* Article preview — blurred until fully authorised */}
        <div
          className="p-6 space-y-3 select-none"
          style={fullyAuthorised ? {} : { filter: 'blur(5px) brightness(0.9)', pointerEvents: 'none' }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-500">Gated Content</p>
          <h2 className="text-[18px] font-bold text-gray-900 leading-snug line-clamp-2">
            {title || 'Premium Content'}
          </h2>
          <p className="text-[13px] text-gray-500 leading-relaxed">
            This content is protected by a StreamPay Proof-of-Attention gate.
            USDC streams to the creator only while you are actively reading.
          </p>
          <div className="space-y-2 pt-1">
            {[90, 75, 55].map(w => (
              <div key={w} className="h-2.5 rounded-full bg-gray-100" style={{ width: `${w}%` }} />
            ))}
          </div>
          {url && (
            <a
              href={url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
            >
              Open original →
            </a>
          )}
        </div>

        {/* Gate overlay — dismissed once fully authorised */}
        {!fullyAuthorised && (
          <OverlayShell dripRate={dripRate} sessionCap={sessionCap}>

            {/* Step 1 — wallet not connected */}
            {!isConnected && (
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-5 py-3 text-center text-[12px] text-gray-500">
                Connect your wallet in the header above
              </div>
            )}

            {/* Step 2 — wrong network */}
            {isConnected && !isOnArc && (
              <button
                onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
                className="flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[13px] font-semibold text-white min-h-[48px] transition-all active:scale-[0.98]"
                style={{ background: '#111827' }}
              >
                Switch to Arc Network
              </button>
            )}

            {/* Step 3 — passkey registration */}
            {isConnected && isOnArc && !passkey.registered && (
              <>
                <button
                  onClick={() => void passkey.register()}
                  disabled={passkey.registering}
                  className="flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[13px] font-semibold text-white min-h-[48px] transition-all active:scale-[0.98]"
                  style={{ background: '#111827' }}
                >
                  {passkey.registering
                    ? <><Spinner />Authorizing…</>
                    : <><FingerprintIcon />Authorize via Passkey</>}
                </button>
                {passkey.error && (
                  <p className="text-[11px] text-red-500 text-center max-w-[260px]">{passkey.error}</p>
                )}
              </>
            )}

            {/* Step 4 — USDC approval */}
            {isConnected && isOnArc && passkey.registered && !isApproved && (
              <>
                {!POA_CONTRACT ? (
                  <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-center text-[12px] text-amber-700">
                    Contract not configured — set VITE_POA_CONTRACT on Render
                  </div>
                ) : approvePending ? (
                  <div className="space-y-2 w-full max-w-[260px]">
                    <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 py-3 text-[13px] text-gray-500">
                      <Spinner />Approval pending on Arc…
                    </div>
                    {approveTx && (
                      <button
                        type="button"
                        onClick={() => window.open(`https://testnet.arcscan.app/tx/${approveTx}`, '_blank', 'noopener,noreferrer')}
                        className="flex w-full items-center justify-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-gray-800 underline underline-offset-2 transition-colors"
                      >
                        <ExtLinkIcon />Track on Arcscan
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="text-center space-y-1 max-w-[260px]">
                      <p className="text-[13px] font-semibold text-gray-800">Set Spending Limit</p>
                      <p className="text-[12px] text-gray-500">
                        Approve up to{' '}
                        <span className="font-semibold">${sessionCap.toFixed(2)} USDC</span>
                        {' '}for this session.
                      </p>
                    </div>
                    <button
                      onClick={handleApprove}
                      disabled={approving}
                      className="flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[13px] font-semibold text-white min-h-[48px] transition-all active:scale-[0.98]"
                      style={{ background: '#111827' }}
                    >
                      {approving ? <><Spinner />Confirm in wallet…</> : 'Approve USDC Spending'}
                    </button>
                    {approveError && (
                      <p className="text-[11px] text-red-500 text-center max-w-[260px]">{approveError}</p>
                    )}
                  </>
                )}
              </>
            )}

            <StepDots current={currentStep} />
          </OverlayShell>
        )}

        {/* ViewerHUD — live spending meter, only when authorised */}
        {fullyAuthorised && (
          <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {poa.isActive
                  ? <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                  : <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />}
                <span className="text-[11px] font-semibold text-gray-500">
                  {poa.isActive  ? 'Session Active'
                   : poa.capHit ? 'Session Complete'
                   :              'Session Paused'}
                </span>
              </div>
              <span className="font-mono text-[12px] font-semibold text-gray-700">
                ${poa.accrued.toFixed(6)}{' '}
                <span className="text-gray-400 font-normal">/ ${sessionCap.toFixed(2)}</span>
              </span>
            </div>

            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width:      `${progressPct}%`,
                  background: progressPct >= 100 ? '#6b7280' : '#3b82f6',
                }}
              />
            </div>

            {poa.ghostVault && (
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-gray-400">
                  Checkpoint: {new Date(poa.ghostVault.ts).toLocaleTimeString()}
                </p>
                <button
                  onClick={() => { sessionStop(); passkey.reset() }}
                  className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
                >
                  End session
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Creator / rate strip */}
      <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
        <div className="space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Creator</p>
          <p className="font-mono text-[12px] text-gray-600">
            {creator ? `${creator.slice(0, 6)}…${creator.slice(-4)}` : '—'}
          </p>
        </div>
        <div className="text-right space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Drip Rate</p>
          <p className="text-[12px] font-semibold text-gray-700">${dripRate.toFixed(4)}/sec</p>
        </div>
      </div>

    </div>
  )
}

// ── Shared overlay shell ──────────────────────────────────────────────────────

function OverlayShell({
  dripRate, sessionCap, children,
}: {
  dripRate: number; sessionCap: number; children: React.ReactNode
}) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center p-6 space-y-4"
      style={{ background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(3px)' }}
    >
      <div className="text-center space-y-1.5">
        <p className="text-[15px] font-bold text-gray-900">Content Locked</p>
        <p className="text-[12px] text-gray-500 max-w-[260px]">
          Pay <span className="font-semibold">${dripRate.toFixed(4)}/sec</span>
          {' '}— max <span className="font-semibold">${sessionCap.toFixed(2)} USDC</span>
        </p>
      </div>
      {children}
      <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
        Powered by Arc Network
      </div>
    </div>
  )
}

// 4-dot step indicator (0-indexed current step)
function StepDots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2, 3].map(i => (
        <span
          key={i}
          className="h-1.5 rounded-full transition-all"
          style={{
            width:      i === current ? 16 : 6,
            background: i <= current  ? '#111827' : '#e5e7eb',
          }}
        />
      ))}
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function FingerprintIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a7.464 7.464 0 01-1.15 3.993m1.989 3.559A11.209 11.209 0 008.25 10.5a3.75 3.75 0 117.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 01-3.6 9.75m6.633-4.596a18.666 18.666 0 01-2.485 5.33" />
    </svg>
  )
}

function ExtLinkIcon() {
  return (
    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
