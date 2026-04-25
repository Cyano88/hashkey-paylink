import { useEffect, useRef, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StreamParams {
  totalAmount:      bigint
  startTime:        bigint   // Unix seconds
  endTime:          bigint   // Unix seconds
  alreadyWithdrawn: bigint   // Fetched once from contract; refresh after Claim/Cancel
  cancelled:        boolean
  /** Set false to pause the live ticker (e.g. while a tx is pending). */
  enabled?:         boolean
}

export interface StreamState {
  /** Total vested so far — increases every second. Clamped to totalAmount. */
  totalUnlocked:     bigint
  /** Already claimed by recipient (from contract state). */
  alreadyWithdrawn:  bigint
  /** Vested but not yet claimed — the amount the recipient can claim right now. */
  claimable:         bigint
  /** Still locked / not yet vested. */
  remainingInStream: bigint
  /** 0–100. Drives the tri-state progress bar width. */
  percentUnlocked:   number
  /** True before the stream's startTime. */
  isBeforeStart:     boolean
  /** True at or after endTime, or if cancelled. */
  isComplete:        boolean
}

// ── Pure calculation (mirrors StreamVault.calculateUnlocked in Solidity) ──────

function calcUnlocked(
  totalAmount: bigint,
  startTime:   bigint,
  endTime:     bigint,
): bigint {
  const now = BigInt(Math.floor(Date.now() / 1000))
  if (now < startTime)  return 0n
  if (now >= endTime)   return totalAmount
  // Integer division — matches Solidity behaviour exactly
  return (now - startTime) * totalAmount / (endTime - startTime)
}

function snapshot(p: StreamParams): StreamState {
  const { totalAmount, startTime, endTime, alreadyWithdrawn, cancelled } = p
  const now = BigInt(Math.floor(Date.now() / 1000))

  const totalUnlocked = cancelled
    ? totalAmount                        // cancelled: treat everything as "done"
    : calcUnlocked(totalAmount, startTime, endTime)

  const claimable = cancelled
    ? 0n                                 // cancelled: relay already distributed claimable share
    : (totalUnlocked > alreadyWithdrawn ? totalUnlocked - alreadyWithdrawn : 0n)

  const remainingInStream = totalAmount - totalUnlocked

  // Avoid division by zero; express as fixed-point (multiply first to preserve precision)
  const percentUnlocked = totalAmount > 0n
    ? Number((totalUnlocked * 10_000n) / totalAmount) / 100
    : 0

  return {
    totalUnlocked,
    alreadyWithdrawn,
    claimable,
    remainingInStream,
    percentUnlocked,
    isBeforeStart: now < startTime,
    isComplete:    now >= endTime || cancelled,
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useStreamState
 *
 * Calculates the "live ticker" StreamState entirely in the browser using
 * Date.now() — no RPC call on every tick.
 *
 * Call pattern:
 *   1. Fetch {totalAmount, startTime, endTime, alreadyWithdrawn, cancelled}
 *      from the contract ONCE on page load (via wagmi useReadContract).
 *   2. Pass those values here. The hook re-calculates every `tickMs` milliseconds.
 *   3. After a Claim or Cancel tx confirms, refetch from contract and pass
 *      updated `alreadyWithdrawn` / `cancelled` — the ticker resets instantly.
 *
 * @param params  Stream data fetched from contract. Pass `null` while loading.
 * @param tickMs  Ticker resolution in ms. Default 1000 (1-second precision).
 *                Use 200 for a smoother progress bar animation.
 */
export function useStreamState(
  params: StreamParams | null,
  tickMs = 1_000,
): StreamState | null {
  // Ref keeps the latest params without causing the ticker effect to restart
  const paramsRef = useRef<StreamParams | null>(params)
  paramsRef.current = params

  const [state, setState] = useState<StreamState | null>(
    () => params ? snapshot(params) : null,
  )

  // Recompute immediately when contract data changes (new claim / cancel confirmed)
  useEffect(() => {
    setState(params ? snapshot(params) : null)
  }, [
    // Primitive deps — avoids reacting to object reference churn from the parent
    params?.totalAmount,
    params?.startTime,
    params?.endTime,
    params?.alreadyWithdrawn,
    params?.cancelled,
    params?.enabled,
  ])

  // Ticker — runs on an interval, reads latest params from ref (no stale closure)
  useEffect(() => {
    if (!params || params.enabled === false) return
    const id = setInterval(() => {
      if (paramsRef.current) setState(snapshot(paramsRef.current))
    }, tickMs)
    return () => clearInterval(id)
  }, [tickMs, params?.enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  return state
}
