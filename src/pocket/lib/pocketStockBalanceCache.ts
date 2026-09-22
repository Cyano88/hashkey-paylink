import type { Address } from 'viem'
import { readStockHoldings, type StockBalanceSnapshot } from './pocketXStocksWallet'

export const STOCK_BALANCE_FRESH_MS = 30_000
export const STOCK_BALANCE_MAX_AGE_MS = 60_000
export function createStockBalanceCache(reader = readStockHoldings, now = Date.now, timeoutMs = 28_000) {
  type Entry = { snapshot?: StockBalanceSnapshot; pending?: Promise<void>; failures: number; nextAttemptAt: number; error: string }
  const entries = new Map<string, Entry>()
  const listeners = new Map<string, Set<() => void>>()
  const notify = (key: string) => listeners.get(key)?.forEach(fn => fn())
  const entry = (key: string) => { let value = entries.get(key); if (!value) { value = { failures: 0, nextAttemptAt: 0, error: '' }; entries.set(key, value) }; return value }
  return {
    peek(key: string) {
      const value = entries.get(key)
      const expired = !!value?.snapshot && now() - value.snapshot.observedAt >= STOCK_BALANCE_MAX_AGE_MS
      return { snapshot: expired ? undefined : value?.snapshot, busy: !!value?.pending, error: value?.pending ? '' : value?.error || (expired ? 'Balances need a fresh update.' : '') }
    },
    subscribe(key: string, listener: () => void) { const set = listeners.get(key) || new Set<() => void>(); set.add(listener); listeners.set(key, set); return () => { set.delete(listener); if (!set.size) listeners.delete(key) } },
    async load(key: string, address: Address, fresh = false, read = reader): Promise<void> {
      if (!key) return
      const value = entry(key)
      if (value.pending) { await value.pending; if (fresh) return this.load(key, address, true, read); return }
      if (!fresh && now() < value.nextAttemptAt) return
      value.pending = (async () => {
        const controller = new AbortController()
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          const snapshot = await Promise.race([read(address, fresh ? undefined : value.snapshot, controller.signal, { force: fresh }), new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Error('Balance timeout')) }, timeoutMs) })])
          if (now() - snapshot.observedAt >= STOCK_BALANCE_MAX_AGE_MS) throw Error('X Layer balances could not be refreshed.')
          value.snapshot = snapshot; value.failures = 0; value.error = ''; value.nextAttemptAt = Math.min(now() + STOCK_BALANCE_FRESH_MS, snapshot.observedAt + STOCK_BALANCE_FRESH_MS)
        } catch { value.failures++; value.error = 'Could not refresh X Layer balances.'; value.nextAttemptAt = now() + Math.min(60_000, 15_000 * 2 ** (value.failures - 1)) } finally { clearTimeout(timer) }
      })()
      notify(key)
      try { await value.pending } finally { value.pending = undefined; notify(key) }
      if (entries.size > 32) for (const [oldKey, old] of entries) { if (oldKey !== key && !old.pending && !listeners.has(oldKey)) { entries.delete(oldKey); break } }
    },
  }
}
export const stockBalanceCache = createStockBalanceCache()
