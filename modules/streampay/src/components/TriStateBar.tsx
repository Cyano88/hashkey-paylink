// ── TriStateBar ───────────────────────────────────────────────────────────────
// Three-segment stream progress track:
//   Segment 1 (solid green)        — already withdrawn by recipient
//   Segment 2 (pulse/glow green)   — unlocked but not yet claimed ("live" zone)
//   Segment 3 (light grey)         — still locked / future

interface TriStateBarProps {
  claimed:  bigint   // alreadyWithdrawn from contract
  unlocked: bigint   // vested but unclaimed (claimable)
  locked:   bigint   // not yet vested
  total:    bigint
}

// Convert bigint ratio to a CSS percentage string, floored to avoid overflows
function pct(part: bigint, total: bigint): number {
  if (total === 0n) return 0
  return Math.max(0, Math.min(100, Number((part * 10_000n) / total) / 100))
}

export function TriStateBar({ claimed, unlocked, locked, total }: TriStateBarProps) {
  const claimedPct  = pct(claimed,  total)
  const unlockedPct = pct(unlocked, total)
  const lockedPct   = Math.max(0, 100 - claimedPct - unlockedPct) // avoid fp drift

  const showClaimed  = claimedPct  > 0.1
  const showUnlocked = unlockedPct > 0.1
  const showLocked   = lockedPct   > 0.1

  return (
    <div className="space-y-3">
      {/* Track */}
      <div
        className="relative h-[5px] w-full overflow-hidden rounded-full bg-gray-100"
        role="progressbar"
        aria-valuenow={claimedPct + unlockedPct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {/* Segment 1 — withdrawn (solid) */}
        {showClaimed && (
          <div
            className="absolute left-0 top-0 h-full rounded-l-full transition-all duration-500"
            style={{
              width:      `${claimedPct}%`,
              background: '#00FF41',
            }}
          />
        )}

        {/* Segment 2 — unlocked / live (pulse + glow) */}
        {showUnlocked && (
          <div
            className="absolute top-0 h-full"
            style={{
              left:       `${claimedPct}%`,
              width:      `${unlockedPct}%`,
              background: 'rgba(0,255,65,0.55)',
              boxShadow:  '0 0 6px 1px rgba(0,255,65,0.45)',
              animation:  'streamPulse 2s ease-in-out infinite',
              borderRadius: showClaimed ? '0' : '9999px 0 0 9999px',
            }}
          />
        )}

        {/* Segment 3 — locked (grey, always fills remainder) */}
        {showLocked && (
          <div
            className="absolute right-0 top-0 h-full rounded-r-full bg-gray-100"
            style={{ width: `${lockedPct}%` }}
          />
        )}
      </div>

      {/* Labels */}
      <div className="flex items-center justify-between text-[11px] font-medium text-gray-400 tabular-nums">
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#00FF41]" />
          {formatUsdc(claimed)} withdrawn
        </span>
        {showUnlocked && (
          <span className="flex items-center gap-1 text-[#00CC33]">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-[#00FF41]"
              style={{ animation: 'streamPulse 2s ease-in-out infinite' }}
            />
            {formatUsdc(unlocked)} available
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-300" />
          {formatUsdc(locked)} locked
        </span>
      </div>

      {/* Keyframe definition */}
      <style>{`
        @keyframes streamPulse {
          0%, 100% { opacity: 0.55; }
          50%       { opacity: 1;    }
        }
      `}</style>
    </div>
  )
}

// ── Shared formatter ──────────────────────────────────────────────────────────
export function formatUsdc(raw: bigint, compact = true): string {
  if (compact && raw >= 1_000_000_000n) {
    return `$${(Number(raw) / 1_000_000_000).toFixed(2)}K`
  }
  const whole = raw / 1_000_000n
  const frac  = raw % 1_000_000n
  const fracStr = frac.toString().padStart(6, '0')
  const wholeFormatted = Number(whole).toLocaleString('en-US')
  return `$${wholeFormatted}.${fracStr.slice(0, 2)}`
}

// Full precision for the headline ticker
export function formatUsdcFull(raw: bigint): string {
  const whole = raw / 1_000_000n
  const frac  = raw % 1_000_000n
  return `${Number(whole).toLocaleString('en-US')}.${frac.toString().padStart(6, '0')}`
}
