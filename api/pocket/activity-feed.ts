import { isIncomingPosPayment } from '../../src/pocket/lib/pocketPurchaseKind.js'
import type { Request, Response } from 'express'
import { createHash } from 'node:crypto'
import { pocketActivityStore } from './activity-store.js'
import type { PocketActivityReadData } from '../../src/pocket/lib/pocketSchemas.js'
import { mergePocketActivitySnapshot } from '../../src/pocket/lib/pocketActivitySnapshot.js'

type Source = { snapshot: PocketActivityReadData; startedAt: number; updatedAt: number }
export type ActivityFeed = { version: 1; sources: Record<string, Source> }
type Store = {
  read(key: string): Promise<ActivityFeed | undefined>
  mutate(key: string, update: (previous: ActivityFeed | undefined) => ActivityFeed): Promise<ActivityFeed>
}
type Dependencies = {
  verifyUser(req: Request): Promise<{ userId: string }>
  sources: Record<string, (owner: string) => Promise<PocketActivityReadData>>
  store?: Store
  now?: () => number
  coldWaitMs?: number
  sourceTimeoutMs?: number
}
const empty = (): PocketActivityReadData => ({ payments: [], merchants: [], collections: [] })
export const activityFeedKey = (owner: string) => 'pocket:activity-feed:v1:' + createHash('sha256').update(owner).digest('hex')

/** Authenticated read model only. Source records remain the settlement authority. */
export function createDurablePocketActivityHandler(dependencies: Dependencies) {
  const store: Store = dependencies.store ?? pocketActivityStore
  const now = dependencies.now ?? Date.now
  const pending = new Map<string, Promise<void>>()
  const retryAfter = new Map<string, number>()
  const sourceNames = Object.keys(dependencies.sources)
  async function refresh(owner: string, key: string, saved: ActivityFeed | undefined, force: boolean) {
    const tasks = sourceNames.map(async name => {
      if (!force && now() - (saved?.sources[name]?.updatedAt ?? 0) < 15_000) return
      const startedAt = now()
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const snapshot = await Promise.race([
          dependencies.sources[name](owner),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Source deadline')), dependencies.sourceTimeoutMs ?? 15_000) }),
        ])
        await store.mutate(key, previous => {
          const feed: ActivityFeed = previous ?? { version: 1, sources: {} }
          const old = feed.sources[name]
          if (old && old.startedAt > startedAt) return feed
          return { version: 1, sources: { ...feed.sources, [name]: {
            snapshot: mergePocketActivitySnapshot(old?.snapshot, snapshot),
            startedAt, updatedAt: now(),
          } } }
        })
      } catch {
        // Neither a provider failure nor a storage failure deletes saved rows.
        // Do not log owner identifiers, provider URLs, tokens or financial data.
        console.warn('[pocket-activity] source refresh unavailable', { source: name })
      } finally { clearTimeout(timer) }
    })
    await Promise.all(tasks)
  }
  return async function pocketActivity(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'private, no-store')
    if (req.method !== 'GET') return res.status(405).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Method not allowed.', retryable: false } })
    const scope = req.query?.scope
    if (scope !== undefined && scope !== '' && scope !== 'recent') return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Activity scope is invalid.', retryable: false } })
    try {
      const { userId } = await dependencies.verifyUser(req)
      const key = activityFeedKey(userId)
      let saved = await store.read(key)
      const force = req.query?.refresh === '1'
      const stale = force || sourceNames.some(name => now() - (saved?.sources[name]?.updatedAt ?? 0) >= 15_000)
      if (stale && !pending.has(key) && (retryAfter.get(key) ?? 0) <= now() && pending.size < 16) {
        const work = refresh(userId, key, saved, force).finally(() => {
          pending.delete(key)
          if (retryAfter.size >= 256) retryAfter.delete(retryAfter.keys().next().value!)
          retryAfter.set(key, now() + 5_000)
        })
        pending.set(key, work)
      }
      if (force && pending.has(key)) {
        await pending.get(key)
        saved = await store.read(key)
      }
      if (!saved && pending.has(key)) {
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          await Promise.race([pending.get(key), new Promise(resolve => { timer = setTimeout(resolve, dependencies.coldWaitMs ?? 600) })])
        } finally { clearTimeout(timer) }
        saved = await store.read(key)
      }
      const snapshot = Object.values(saved?.sources ?? {}).reduce((result, source) => mergePocketActivitySnapshot(result, source.snapshot), empty())
      const complete = sourceNames.every(name => Boolean(saved?.sources[name]))
      const partial = !complete || sourceNames.some(name => now() - (saved?.sources[name]?.updatedAt ?? 0) > 60_000)
      return res.json({
        ok: true, ...snapshot,
        payments: scope === 'recent' ? snapshot.payments.filter(row => !isIncomingPosPayment(row)).slice(0, 4) : snapshot.payments,
        complete, partial, refreshing: pending.has(key),
        updatedAt: Math.max(0, ...Object.values(saved?.sources ?? {}).map(source => source.updatedAt)),
      })
    } catch (error) {
      const status = (error as { status?: number }).status
      const auth = status === 401 || status === 403
      return res.status(auth ? status : 503).json({ ok: false, error: {
        code: auth ? status === 401 ? 'AUTH_REQUIRED' : 'FORBIDDEN' : 'PROVIDER_UNAVAILABLE',
        message: auth ? 'Sign in again to load activity.' : 'Activity is temporarily unavailable. Your saved history is retained.',
        retryable: !auth,
      } })
    }
  }
}

/** Called by existing wallet scans, including the background money worker. */
export async function persistObservedWalletActivity(owner: string, payments: PocketActivityReadData['payments']) {
  if (!payments.length) return
  const observedAt = Date.now()
  await pocketActivityStore.mutate(activityFeedKey(owner), previous => {
    const feed: ActivityFeed = previous ?? { version: 1, sources: {} }
    return { version: 1, sources: { ...feed.sources, wallets: {
      snapshot: mergePocketActivitySnapshot(feed.sources.wallets?.snapshot, { payments, merchants: [], collections: [] }),
      startedAt: observedAt, updatedAt: feed.sources.wallets?.updatedAt ?? 0,
    } } }
  })
}
