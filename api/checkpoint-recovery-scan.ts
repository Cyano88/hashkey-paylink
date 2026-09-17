export class CheckpointRecoveryPending extends Error {
  constructor() { super('Previous session lookup is not complete. Please try again shortly.') }
}

/** Per-process guard for compatibility recovery; no background polling or chain-wide scans. */
export function createCheckpointRecoveryScan(now = Date.now, deadlineMs = 10_000) {
  type Cursor = { next?: bigint; retryAt: number; completeUntil: number }
  const cursors = new Map<string, Cursor>()
  const pending = new Map<string, Promise<unknown>>()
  let windowStart = now(), starts = 0, providerRetryAt = 0
  return async function scan<T>(key: string, floor: bigint, span: bigint,
    head: (signal: AbortSignal) => Promise<bigint>,
    range: (from: bigint, to: bigint, signal: AbortSignal) => Promise<T | null>,
  ): Promise<T | null> {
    if (floor < 0n || span < 1n || span > 2048n) throw new CheckpointRecoveryPending()
    const active = pending.get(key)
    if (active) return active as Promise<T | null>
    let cursor = cursors.get(key)
    if (cursor && cursor.completeUntil > now()) return null
    if (providerRetryAt > now() || (cursor?.retryAt ?? 0) > now()) throw new CheckpointRecoveryPending()
    if (now() - windowStart >= 60_000) { windowStart = now(); starts = 0 }
    if (pending.size >= 4 || starts >= 30) throw new CheckpointRecoveryPending()
    if (!cursor || cursor.completeUntil) {
      if (!cursor && cursors.size >= 256) {
        const oldestIdle = [...cursors.keys()].find(k => !pending.has(k))
        if (oldestIdle === undefined) throw new CheckpointRecoveryPending()
        cursors.delete(oldestIdle)
      }
      cursor = { retryAt: 0, completeUntil: 0 }
      cursors.set(key, cursor)
    }
    const state = cursor
    starts++
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), deadlineMs)
    const work = Promise.resolve().then(async () => {
      if (state.next === undefined) state.next = await head(controller.signal)
      if (state.next < floor) throw new Error('Recovery deployment block exceeds chain head')
      for (let i = 0; i < 4; i++) {
        const to = state.next!
        const from = to - span + 1n > floor ? to - span + 1n : floor
        const result = await range(from, to, controller.signal)
        controller.signal.throwIfAborted()
        if (result !== null) { cursors.delete(key); return result }
        // Advance only after a completely successful range, including verification.
        if (from === floor) { state.completeUntil = now() + 30_000; state.next = undefined; return null }
        state.next = from - 1n
      }
      state.retryAt = now() + 5_000
      throw new CheckpointRecoveryPending()
    }).catch(error => {
      if (!(error instanceof CheckpointRecoveryPending)) {
        state.retryAt = now() + 60_000
        providerRetryAt = state.retryAt
      }
      state.retryAt = Math.max(state.retryAt, now() + 5_000)
      throw new CheckpointRecoveryPending()
    }).finally(() => { controller.abort(); clearTimeout(timer); pending.delete(key) })
    pending.set(key, work)
    return work
  }
}

export function checkpointRecoveryDeploymentBlock(env: Record<string, string | undefined> = process.env) {
  const value = env.CHECKPOINT_FACTORY_DEPLOYMENT_BLOCK_MAINNET?.trim()
  return value && /^(0|[1-9][0-9]{0,15})$/.test(value) ? BigInt(value) : null
}
