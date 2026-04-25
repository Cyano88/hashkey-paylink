import { useEffect, useRef, useState } from 'react'

// ── Constants ─────────────────────────────────────────────────────────────────
const TIMEOUT_SEC = 180   // 3 minutes — Render free tier cold-start upper bound
const POLL_MS     = 5_000 // check every 5 seconds

type WakeStatus = 'waking' | 'ready' | 'timeout'

// ── Props ─────────────────────────────────────────────────────────────────────
interface RelayerWakeUpProps {
  /** Called as soon as /api/health responds 200. */
  onReady:    () => void
  /** Called if the server never responds within TIMEOUT_SEC. Optional. */
  onTimeout?: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * RelayerWakeUp
 *
 * Render's free tier spins down after ~15 min of inactivity. Cold-start takes
 * up to 3 minutes. This overlay polls /api/health every 5 seconds and shows a
 * professional countdown so users understand what's happening instead of seeing
 * a blank screen or mysterious loading spinner.
 *
 * Usage:
 *   const [relayerReady, setRelayerReady] = useState(false)
 *   if (!relayerReady) return <RelayerWakeUp onReady={() => setRelayerReady(true)} />
 */
export function RelayerWakeUp({ onReady, onTimeout }: RelayerWakeUpProps) {
  const [status,  setStatus]  = useState<WakeStatus>('waking')
  const [elapsed, setElapsed] = useState(0)
  const startRef  = useRef(Date.now())
  const deadRef   = useRef(false)

  useEffect(() => {
    deadRef.current = false

    // ── Elapsed ticker ───────────────────────────────────────────────────────
    const ticker = setInterval(() => {
      const secs = Math.floor((Date.now() - startRef.current) / 1000)
      setElapsed(secs)
      if (secs >= TIMEOUT_SEC && !deadRef.current) {
        deadRef.current = true
        setStatus('timeout')
        onTimeout?.()
        clearInterval(ticker)
      }
    }, 1_000)

    // ── Health poller ────────────────────────────────────────────────────────
    async function poll() {
      if (deadRef.current) return
      try {
        const res = await fetch('/api/health', { cache: 'no-store' })
        if (res.ok && !deadRef.current) {
          deadRef.current = true
          setStatus('ready')
          clearInterval(ticker)
          onReady()
          return
        }
      } catch {
        // server still waking — try again after POLL_MS
      }
      const secsNow = Math.floor((Date.now() - startRef.current) / 1000)
      if (!deadRef.current && secsNow < TIMEOUT_SEC) {
        setTimeout(poll, POLL_MS)
      }
    }
    poll()

    return () => {
      deadRef.current = true
      clearInterval(ticker)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'ready') return null

  const remaining = Math.max(0, TIMEOUT_SEC - elapsed)
  const progress  = Math.min(1, elapsed / TIMEOUT_SEC)
  const mins      = Math.floor(remaining / 60)
  const secs      = remaining % 60
  const countdown = `${mins}:${String(secs).padStart(2, '0')}`

  function retry() {
    startRef.current = Date.now()
    deadRef.current  = false
    setElapsed(0)
    setStatus('waking')
    window.location.reload()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#F5F5F7]/90 backdrop-blur-sm">
      <div className="w-80 rounded-2xl border border-gray-200 bg-white px-8 py-9 shadow-xl">

        {/* Spinner */}
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-gray-100 bg-gray-50">
          {status === 'timeout' ? (
            <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          ) : (
            <div className="h-7 w-7 rounded-full border-2 border-gray-200 border-t-[#7C3AED] animate-spin" />
          )}
        </div>

        {/* Copy */}
        <div className="text-center space-y-1.5 mb-6">
          <p className="text-[15px] font-semibold text-gray-900">
            {status === 'timeout' ? 'Connection timed out' : 'Waking up Relayer'}
          </p>
          <p className="text-[13px] leading-relaxed text-gray-500">
            {status === 'timeout'
              ? 'The server did not respond within 3 minutes. Please try again.'
              : 'The payment infrastructure is starting from sleep. This takes up to 3 minutes on the free tier.'}
          </p>
        </div>

        {/* Progress bar */}
        <div className="space-y-2 mb-6">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-[#7C3AED] transition-all duration-1000 ease-linear"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-400">
              {status === 'timeout' ? 'Timed out' : 'Connecting to Arc Network…'}
            </span>
            <span className="font-mono text-[11px] text-gray-500 tabular-nums">
              {countdown}
            </span>
          </div>
        </div>

        {/* Status dots — shows each poll attempt */}
        <div className="flex items-center justify-center gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => {
            const attempt = Math.floor(elapsed / (POLL_MS / 1000))
            return (
              <span
                key={i}
                className={[
                  'h-1.5 w-1.5 rounded-full transition-colors duration-500',
                  i < attempt && status !== 'timeout'
                    ? 'bg-[#7C3AED]'
                    : status === 'timeout'
                    ? 'bg-red-300'
                    : 'bg-gray-200',
                ].join(' ')}
              />
            )
          })}
        </div>

        {/* Retry button — only shown on timeout */}
        {status === 'timeout' && (
          <button
            onClick={retry}
            className="mt-5 w-full rounded-xl border border-gray-200 py-2.5 text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Try Again
          </button>
        )}
      </div>
    </div>
  )
}
