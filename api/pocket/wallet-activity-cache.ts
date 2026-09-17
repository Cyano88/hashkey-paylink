import type { PocketActivityRow } from '../../src/pocket/lib/pocketSchemas.js'

type Scan = (network: string, wallet: string, signal: AbortSignal) => Promise<PocketActivityRow[]>
type Snapshot = { rows: PocketActivityRow[]; freshUntil: number; retainUntil: number; retryAfter: number }

/** Shared, bounded activity reads only; never used as payment settlement proof. */
export function createWalletActivityReader(scan: Scan, now = Date.now, deadlineMs = 10_000) {
  const cache = new Map<string, Snapshot>()
  const cooldown = new Map<string, number>()
  const pending = new Map<string, Promise<PocketActivityRow[]>>()
  let windowStart = now(), started = 0
  const copy = (rows: PocketActivityRow[]) => rows.map(row => ({ ...row }))
  return async (ownerId: string, network: string, wallet: string, waitMs = 10_000) => {
    // Solana addresses are case-sensitive. EVM case does not change identity.
    const key = JSON.stringify([ownerId, network, network === 'solana' ? wallet : wallet.toLowerCase()])
    const hit = cache.get(key)
    const previous = hit && hit.retainUntil > now() ? hit.rows : []
    if (hit && (hit.freshUntil > now() || hit.retryAfter > now())) return copy(previous)
    if ((cooldown.get(network) ?? 0) > now()) return copy(previous)
    let work = pending.get(key)
    if (!work) {
      if (now() - windowStart >= 60_000) { windowStart = now(); started = 0 }
      if (pending.size >= 16 || started >= 60) return copy(previous)
      started++
      const controller = new AbortController()
      // Recent activity may wait only 900ms, but shares the same bounded scan
      // as the full page. The scan always aborts after this independent deadline.
      const deadline = setTimeout(() => controller.abort(), deadlineMs)
      work = Promise.resolve().then(() => scan(network, wallet, controller.signal)).then(rows => {
        controller.signal.throwIfAborted()
        const bounded = rows.sort((a, b) => b.ts - a.ts).slice(0, 100)
        if (cache.size >= 256 && !cache.has(key)) cache.delete(cache.keys().next().value!)
        cache.set(key, { rows: copy(bounded), freshUntil: now() + 30_000, retainUntil: now() + 120_000, retryAfter: 0 })
        return bounded
      }).catch((error: unknown) => {
        const code = (error as { code?: number } | null)?.code
        if (code === -32004 || code === -32005) cooldown.set(network, now() + 60_000)
        if (cache.size >= 256 && !cache.has(key)) cache.delete(cache.keys().next().value!)
        cache.set(key, { rows: previous, freshUntil: 0, retainUntil: hit?.retainUntil ?? 0, retryAfter: now() + 15_000 })
        // Never emit provider messages, endpoint URLs, keys or wallet addresses.
        console.warn('[pocket-activity] wallet scan unavailable', { network, reason: controller.signal.aborted ? 'deadline' : 'provider' })
        return previous
      }).finally(() => { controller.abort(); clearTimeout(deadline); pending.delete(key) })
      pending.set(key, work)
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return copy(await Promise.race([
        work,
        new Promise<PocketActivityRow[]>(resolve => { timer = setTimeout(() => resolve(previous), Math.max(1, Math.min(waitMs, deadlineMs))) }),
      ]))
    } finally { clearTimeout(timer) }
  }
}
