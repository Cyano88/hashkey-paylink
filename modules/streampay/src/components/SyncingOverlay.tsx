import { useEffect, useRef, useState } from 'react'

const TIMEOUT_SEC = 180
const POLL_MS     = 5_000

interface SyncingOverlayProps {
  onReady:    () => void
  onTimeout?: () => void
}

export function SyncingOverlay({ onReady, onTimeout }: SyncingOverlayProps) {
  const [elapsed, setElapsed]   = useState(0)
  const [timedOut, setTimedOut] = useState(false)
  const startRef = useRef(Date.now())
  const deadRef  = useRef(false)

  useEffect(() => {
    deadRef.current = false

    const ticker = setInterval(() => {
      const s = Math.floor((Date.now() - startRef.current) / 1000)
      setElapsed(s)
      if (s >= TIMEOUT_SEC && !deadRef.current) {
        deadRef.current = true
        setTimedOut(true)
        clearInterval(ticker)
        onTimeout?.()
      }
    }, 1_000)

    async function poll() {
      if (deadRef.current) return
      try {
        const r = await fetch('/api/health', { cache: 'no-store' })
        if (r.ok && !deadRef.current) {
          deadRef.current = true
          clearInterval(ticker)
          onReady()
          return
        }
      } catch { /* still waking */ }
      const s = Math.floor((Date.now() - startRef.current) / 1000)
      if (!deadRef.current && s < TIMEOUT_SEC) setTimeout(poll, POLL_MS)
    }
    poll()

    return () => { deadRef.current = true; clearInterval(ticker) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const progress  = Math.min(1, elapsed / TIMEOUT_SEC)
  const remaining = Math.max(0, TIMEOUT_SEC - elapsed)
  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-white/92 backdrop-blur-sm">
      <div className="w-60 text-center space-y-5">
        {/* Spinner or warning */}
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-gray-100 bg-gray-50">
          {timedOut ? (
            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          ) : (
            <div className="h-6 w-6 rounded-full border-2 border-gray-200 border-t-gray-700 animate-spin" />
          )}
        </div>

        <div>
          <p className="text-[13px] font-semibold text-gray-800">
            {timedOut ? 'Connection timeout' : 'Connecting to Secure Network'}
          </p>
          <p className="mt-1 text-[12px] text-gray-400 leading-relaxed">
            {timedOut
              ? 'The relayer did not respond. Please retry.'
              : 'Infrastructure is starting. Gasless transactions will be ready shortly.'}
          </p>
        </div>

        {/* Progress track */}
        <div className="space-y-1.5">
          <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width:      `${progress * 100}%`,
                background: timedOut ? '#d1d5db' : '#1a1a1a',
              }}
            />
          </div>
          <p className="text-right font-mono text-[11px] text-gray-400 tabular-nums">
            {mins}:{String(secs).padStart(2, '0')}
          </p>
        </div>

        {timedOut && (
          <button
            onClick={() => {
              startRef.current = Date.now()
              setElapsed(0)
              setTimedOut(false)
              window.location.reload()
            }}
            className="w-full rounded-xl border border-gray-200 py-2 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Retry Connection
          </button>
        )}
      </div>
    </div>
  )
}
