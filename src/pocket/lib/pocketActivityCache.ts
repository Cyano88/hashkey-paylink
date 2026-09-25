import { readPocketActivity, type PocketActivityReadResult } from '../api/pocketReadClient'
import { isPocketActivityReadData, isPocketActivityRow } from './pocketSchemas'
import { mergePocketActivitySnapshot } from './pocketActivitySnapshot'

type Snapshot = PocketActivityReadResult & { savedAt: number; full: boolean }
const snapshots = new Map<string, Snapshot>()
const dirtyScopes = new Set<string>()
export function markPocketActivityDirty(scope: string) { if (scope) dirtyScopes.add(activityScope(scope)) }
const pending = new Map<string, { promise: Promise<void>; fresh: boolean }>()
const listeners = new Map<string, Set<() => void>>()
const prefix = 'pocket:activity:snapshot:v2:'
export const activityScope = (email: string) => email.trim().toLowerCase()

export function cachedPocketActivity(scope: string): Snapshot | undefined {
  if (!scope) return undefined
  if (snapshots.has(scope)) return snapshots.get(scope)
  try {
    const saved = JSON.parse(localStorage.getItem(prefix + encodeURIComponent(scope)) || 'null')
    if (isPocketActivityReadData(saved)) {
      const metadata = saved as unknown as { savedAt?: number; full?: boolean }
      const snapshot: Snapshot = { ...saved, savedAt: Number(metadata.savedAt) || 0, full: metadata.full === true }
      snapshots.set(scope, snapshot)
      return snapshot
    }
    // Recover the previous device cache. Age affects freshness, not retention.
    for (const mode of ['all', 'recent']) {
      const old = JSON.parse(localStorage.getItem('pocket:activity:snapshot:v1:' + encodeURIComponent(scope) + ':' + mode) || 'null')
      if (Array.isArray(old?.rows)) {
        const snapshot = { payments: old.rows.filter(isPocketActivityRow), merchants: [], collections: [], savedAt: 0, full: false }
        snapshots.set(scope, snapshot)
        return snapshot
      }
    }
  } catch { /* Server history remains durable when device storage is unavailable. */ }
  return undefined
}

export function subscribePocketActivity(scope: string, callback: () => void) {
  const subscriptions = listeners.get(scope) ?? new Set<() => void>()
  subscriptions.add(callback)
  listeners.set(scope, subscriptions)
  return () => { subscriptions.delete(callback); if (!subscriptions.size) listeners.delete(scope) }
}

export async function refreshPocketActivity(scope: string, getAccessToken: () => Promise<string | null>, recent: boolean, isCurrent: () => boolean = () => true, fresh = false): Promise<void> {
  if (!scope) return
  fresh = fresh || dirtyScopes.has(scope)
  const active = pending.get(scope)
  if (active) {
    await active.promise
    if ((fresh && !active.fresh) || (!recent && !cachedPocketActivity(scope)?.full)) return refreshPocketActivity(scope, getAccessToken, recent, isCurrent, fresh)
    return
  }
  const work = (async () => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        (async () => {
          const token = await getAccessToken()
          controller.signal.throwIfAborted()
          if (!isCurrent()) throw new Error('Activity account changed.')
          if (!token) throw new Error('Sign in again to load activity.')
          const incoming = await readPocketActivity({ accessToken: token, recent, fresh, signal: controller.signal })
          controller.signal.throwIfAborted()
          if (!isCurrent()) throw new Error('Activity account changed.')
          const previous = cachedPocketActivity(scope)
          const snapshot: Snapshot = { ...mergePocketActivitySnapshot(previous, incoming), savedAt: Date.now(), full: !recent || Boolean(previous?.full) }
          if (snapshots.size >= 32 && !snapshots.has(scope)) snapshots.delete(snapshots.keys().next().value!)
          snapshots.set(scope, snapshot)
          if (fresh) dirtyScopes.delete(scope)
          try { localStorage.setItem(prefix + encodeURIComponent(scope), JSON.stringify(snapshot)) } catch { /* Keep memory cache on a full device. */ }
          listeners.get(scope)?.forEach(notify => notify())
        })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Activity is taking longer to refresh. Your saved history is retained.')) }, fresh ? 18_000 : 12_000) }),
      ])
    } finally { clearTimeout(timer); controller.abort() }
  })().finally(() => pending.delete(scope))
  pending.set(scope, { promise: work, fresh })
  return work
}
