import { useEffect, useRef } from 'react'
import { useSearchParams }  from 'react-router-dom'
import { useAccount }       from 'wagmi'
import { usePoAStream }     from '../../hooks/usePoAStream'
import { usePasskey }       from '../../hooks/usePasskey'

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

  const { isConnected } = useAccount()
  const passkey = usePasskey()
  const poa     = usePoAStream({ contentId, creator, dripRate, sessionCap })
  const { sessionStart, sessionStop, setVisible } = poa

  // IntersectionObserver: start/stop drip only when ≥50% of content is visible
  const contentRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = contentRef.current
    if (!el || !passkey.registered || !isConnected) return

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
  }, [passkey.registered, isConnected, sessionStart, sessionStop, setVisible])

  // Final checkpoint sign on page leave
  useEffect(() => () => sessionStop(), [sessionStop])

  if (!contentId || !creator) {
    return (
      <div className="w-full max-w-[480px] mx-auto mt-12 text-center text-[13px] text-gray-400 py-12">
        Invalid gate link — missing content parameters.
      </div>
    )
  }

  const progressPct = Math.min((poa.accrued / sessionCap) * 100, 100)

  return (
    <div className="w-full max-w-[480px] mx-auto mt-8 space-y-4">

      {/* Gated content card */}
      <div ref={contentRef} className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">

        {/* Article preview — blurred until authorised */}
        <div
          className="p-6 space-y-3 select-none"
          style={passkey.registered && isConnected
            ? {}
            : { filter: 'blur(5px) brightness(0.9)', pointerEvents: 'none' }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-500">Gated Content</p>
          <h2 className="text-[18px] font-bold text-gray-900 leading-snug line-clamp-2">
            {title || 'Premium Content'}
          </h2>
          <p className="text-[13px] text-gray-500 leading-relaxed">
            This content is protected by a StreamPay Proof-of-Attention gate.
            Reading streams USDC to the creator in real time — only while you are actively viewing.
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

        {/* Gate overlay — shown when not authorised */}
        {(!passkey.registered || !isConnected) && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center p-6 space-y-4"
            style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(3px)' }}
          >
            <div className="text-center space-y-2">
              <p className="text-[15px] font-bold text-gray-900">Content Locked</p>
              <p className="text-[12px] text-gray-500 max-w-[260px]">
                Pay{' '}
                <span className="font-semibold">${dripRate.toFixed(4)}/sec</span>
                {' '}via Arc wallet — max{' '}
                <span className="font-semibold">${sessionCap.toFixed(2)} USDC</span>
                {' '}per session.
              </p>
            </div>

            {!isConnected ? (
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-5 py-3 text-center text-[12px] text-gray-500">
                Connect your wallet in the header above
              </div>
            ) : (
              <button
                onClick={() => void passkey.register()}
                disabled={passkey.registering}
                className="flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[13px] font-semibold text-white min-h-[48px] transition-all active:scale-[0.98]"
                style={{ background: '#111827' }}
              >
                {passkey.registering
                  ? <><Spinner />Authorizing…</>
                  : <><FingerprintIcon />Authorize via Passkey</>
                }
              </button>
            )}

            {passkey.error && (
              <p className="text-[11px] text-red-500 text-center max-w-[260px]">{passkey.error}</p>
            )}

            <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              First $0.02 sponsored by Arc Paymaster
            </div>
          </div>
        )}

        {/* ViewerHUD: live spending meter (only when authorised) */}
        {passkey.registered && isConnected && (
          <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {poa.isActive
                  ? <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                  : <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
                }
                <span className="text-[11px] font-semibold text-gray-500">
                  {poa.isActive    ? 'Session Active'
                   : poa.capHit   ? 'Session Complete'
                   :                'Session Paused'}
                </span>
              </div>
              <span className="font-mono text-[12px] font-semibold text-gray-700">
                ${poa.accrued.toFixed(6)}{' '}
                <span className="text-gray-400 font-normal">/ ${sessionCap.toFixed(2)}</span>
              </span>
            </div>

            {/* Progress bar */}
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

function FingerprintIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a7.464 7.464 0 01-1.15 3.993m1.989 3.559A11.209 11.209 0 008.25 10.5a3.75 3.75 0 117.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 01-3.6 9.75m6.633-4.596a18.666 18.666 0 01-2.485 5.33" />
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
