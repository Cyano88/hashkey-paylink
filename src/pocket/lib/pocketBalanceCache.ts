import type { UnifiedBalanceBreakdown, UnifiedBalanceResult } from '../../lib/unifiedBalance'
import type { CirclePocketWallets } from '../models/pocketWallet'
import { readPocketBalances, readPocketLinkedWallets } from '../api/pocketReadClient'
import { pocketBalanceRevision } from './pocketBalanceRevision'
import { POCKET_NETWORKS } from './pocketSchemas'
import { parsePocketWalletUpdateNotice } from './pocketWalletUpdate'

export type BalanceDisplayRow = UnifiedBalanceBreakdown & { known: boolean; stale: boolean }
export type PocketBalanceSnapshot = {
  wallets: CirclePocketWallets
  rows: UnifiedBalanceBreakdown[]
  displayRows: BalanceDisplayRow[]
  total: number
  totalComplete: boolean
  displayTotal: number
  displayComplete: boolean
  savedAt: number
  walletUpdate: ReturnType<typeof parsePocketWalletUpdateNotice>
}
const cache = new Map<string, PocketBalanceSnapshot>()
const pending = new Map<string, { promise: Promise<void>; fresh: boolean; valid: () => boolean }>()
const listeners = new Map<string, Set<() => void>>()
const versions = new Map<string, number>()
const prefix = 'pocket:balances:v1:'
export const balanceOwner = (email: string) => email.trim().toLowerCase()
const changed = (owner: string) => listeners.get(owner)?.forEach(notify => notify())

export function readCachedPocketBalance(owner: string): PocketBalanceSnapshot | undefined {
  if (!owner) return
  if (cache.has(owner)) {
    const saved = cache.get(owner)!
    if (saved.totalComplete && Date.now() - saved.savedAt > 60_000) {
      const stale = { ...saved, total: 0, totalComplete: false, rows: saved.rows.map(row => ({ ...row, status: 'error' as const, balance: 0 })), displayRows: saved.displayRows.map(row => ({ ...row, stale: true })) }
      cache.set(owner, stale)
      return stale
    }
    return saved
  }
  try {
    const saved = JSON.parse(localStorage.getItem(prefix + encodeURIComponent(owner)) || 'null') as PocketBalanceSnapshot | null
    if (!saved || !saved.wallets || !Number.isFinite(saved.savedAt) || !Array.isArray(saved.displayRows) || ![4, POCKET_NETWORKS.length].includes(saved.displayRows.length)) return
    if (!saved.displayRows.every((row, index) => row.key === POCKET_NETWORKS[index] && typeof row.known === 'boolean'
      && Number.isFinite(row.balance) && row.balance >= 0 && (!row.known || (Number.isSafeInteger(row.observedAt) && row.observedAt! > 0 && /^[a-f0-9]{64}$/.test(row.walletRevision ?? ''))))) return
    // A restored snapshot is display-only until wallet binding and balances are refreshed.
    const displayRows: BalanceDisplayRow[] = POCKET_NETWORKS.map((key, index) => {
      const row = saved.displayRows[index]
      return row ? { ...row, stale: true, status: 'error' as const }
        : { key, label: key, balance: 0, known: false, stale: true, status: 'error' as const }
    })
    const snapshot: PocketBalanceSnapshot = { ...saved, displayRows, rows: displayRows.map(row => ({ ...row, balance: 0 })), total: 0, totalComplete: false,
      displayTotal: displayRows.reduce((sum, row) => sum + (row.known ? row.balance : 0), 0), displayComplete: displayRows.every(row => row.known), walletUpdate: 'hidden' }
    cache.set(owner, snapshot)
    return snapshot
  } catch { return }
}
function save(owner: string, snapshot: PocketBalanceSnapshot) {
  if (cache.size >= 32 && !cache.has(owner)) cache.delete(cache.keys().next().value!)
  cache.set(owner, snapshot)
  try { localStorage.setItem(prefix + encodeURIComponent(owner), JSON.stringify(snapshot)) } catch { /* Memory snapshot remains available. */ }
  changed(owner)
}
export function subscribePocketBalance(owner: string, notify: () => void) {
  const subscriptions = listeners.get(owner) ?? new Set<() => void>()
  subscriptions.add(notify); listeners.set(owner, subscriptions)
  return () => { subscriptions.delete(notify); if (!subscriptions.size) listeners.delete(owner) }
}

export async function mergePocketBalance(previous: PocketBalanceSnapshot | undefined, wallets: CirclePocketWallets, result?: UnifiedBalanceResult): Promise<PocketBalanceSnapshot> {
  const displayRows = await Promise.all(POCKET_NETWORKS.map(async key => {
    const revision = await pocketBalanceRevision(key, wallets[key])
    const incoming = result?.rows.find(row => row.key === key)
    const matched = incoming?.walletRevision === revision
    const old = previous?.displayRows.find(row => row.key === key && row.walletRevision === revision && row.known)
    const fresh = matched && incoming.status === 'ok'
    // A mismatched response is neither a valid current balance nor a reason to
    // carry the old wallet's balance forward. Retry against the current links.
    const retained = (!incoming || matched) ? old : undefined
    return {
      key, label: incoming?.label || old?.label || key,
      balance: fresh ? incoming.balance : retained?.balance ?? 0,
      status: fresh ? 'ok' as const : 'error' as const,
      walletRevision: revision,
      observedAt: fresh ? incoming.observedAt ?? Date.now() : retained?.observedAt,
      known: Boolean(fresh || retained), stale: !fresh,
    }
  }))
  const rows = displayRows.map(row => ({ ...row, balance: row.stale ? 0 : row.balance }))
  return { wallets, rows, displayRows, total: rows.reduce((sum, row) => sum + row.balance, 0),
    totalComplete: displayRows.every(row => !row.stale), displayTotal: displayRows.reduce((sum, row) => sum + row.balance, 0),
    displayComplete: displayRows.every(row => row.known), savedAt: Date.now(), walletUpdate: parsePocketWalletUpdateNotice(result?.walletUpdate) }
}

/** Immediately hide balances for changed wallets, and invalidate older reads. */
export async function replacePocketBalanceWallets(owner: string, wallets: CirclePocketWallets) {
  const version = (versions.get(owner) ?? 0) + 1
  versions.set(owner, version)
  const previous = readCachedPocketBalance(owner)
  if (previous) {
    // Hide during asynchronous revision calculation, never paint an old address's amount.
    const displayRows = previous.displayRows.map(row => ({ ...row, balance: 0, known: false, stale: true, status: 'error' as const }))
    save(owner, { ...previous, wallets, displayRows, rows: displayRows, total: 0, totalComplete: false, displayTotal: 0, displayComplete: false })
  }
  const snapshot = await mergePocketBalance(previous, wallets)
  if (versions.get(owner) === version) save(owner, snapshot)
}

export async function loadPocketBalance(owner: string, getAccessToken: () => Promise<string | null>, fresh = false, valid: () => boolean = () => true): Promise<void> {
  if (!owner || !valid()) return
  const active = pending.get(owner)
  if (active) {
    let failure: unknown
    try { await active.promise } catch (reason) { failure = reason }
    if (valid() && ((fresh && !active.fresh) || !active.valid())) return loadPocketBalance(owner, getAccessToken, fresh, valid)
    if (failure) throw failure
    return
  }
  const version = versions.get(owner) ?? 0
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const work = (async () => {
    let applied = false
    try {
      await Promise.race([
        (async () => {
          const token = await getAccessToken()
          if (!valid()) return
          controller.signal.throwIfAborted()
          if (!token) throw new Error('Sign in again to refresh balances.')
          // Both responses are linked by per-network wallet revisions.
          const [wallets, result] = await Promise.all([
            readPocketLinkedWallets({ accessToken: token, signal: controller.signal }),
            readPocketBalances({ accessToken: token, fresh, signal: controller.signal }).catch(() => undefined),
          ])
          controller.signal.throwIfAborted()
          if (!valid() || (versions.get(owner) ?? 0) !== version) return
          const snapshot = await mergePocketBalance(readCachedPocketBalance(owner), wallets, result)
          if (!valid() || (versions.get(owner) ?? 0) !== version) return
          save(owner, snapshot)
          applied = true
          if (!snapshot.totalComplete) throw new Error('Balance refresh is taking longer. Try again.')
        })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Balance refresh is taking longer. Try again.')) }, 10_000) }),
      ])
    } catch (reason) {
      if (!applied && valid() && (versions.get(owner) ?? 0) === version) {
        const saved = readCachedPocketBalance(owner)
        if (saved) save(owner, { ...saved, totalComplete: false, total: 0, rows: saved.rows.map(row => ({ ...row, status: 'error', balance: 0 })), displayRows: saved.displayRows.map(row => ({ ...row, stale: true })) })
      }
      throw reason
    } finally { clearTimeout(timer); controller.abort() }
  })().finally(() => { if (pending.get(owner)?.promise === work) pending.delete(owner) })
  pending.set(owner, { promise: work, fresh, valid })
  return work
}
