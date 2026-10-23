// Display-only balance reads. Execution and quote validation must read fresh
// balances directly; this short cache must never authorize a transfer.
export function createArcDisplayBalanceReader({
  read, now = Date.now, ttlMs = 5_000, maxEntries = 1_000, concurrency = 6,
}: {
  read: (wallet: string, token: string) => Promise<bigint>
  now?: () => number
  ttlMs?: number
  maxEntries?: number
  concurrency?: number
}) {
  const cache = new Map<string, { value: bigint; expiresAt: number }>()
  const pending = new Map<string, Promise<bigint>>()
  const waiting: Array<() => void> = []
  let running = 0
  const acquire = async () => {
    if (running < concurrency) { running++; return }
    await new Promise<void>(resolve => waiting.push(resolve))
  }
  const release = () => {
    const next = waiting.shift()
    if (next) next()
    else running--
  }
  return async (owner: string, wallet: string, token: string): Promise<bigint> => {
    const key = JSON.stringify([owner, wallet.toLowerCase(), token.toLowerCase()])
    const cached = cache.get(key)
    if (cached && cached.expiresAt > now()) return cached.value
    cache.delete(key)
    const existing = pending.get(key)
    if (existing) return existing
    if (pending.size >= maxEntries) throw new Error('Token balance reads are busy. Retry shortly.')
    const queuedAt = now()
    const request = (async () => {
      await acquire()
      try {
        // Drop queued work during an RPC outage rather than draining stale catalogs.
        if (now() - queuedAt > 5_000) throw new Error('Token balance read queue expired.')
        const value = await read(wallet, token)
        if (cache.size >= maxEntries) cache.delete(cache.keys().next().value!)
        cache.set(key, { value, expiresAt: now() + ttlMs })
        return value
      } finally { release() }
    })().finally(() => pending.delete(key))
    pending.set(key, request)
    return request
  }
}
