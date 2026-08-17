import { useCallback, useEffect, useState } from 'react'
import { readPocketActivity } from '../api/pocketReadClient'
import type { PocketActivityRow } from '../models/pocketActivity'
import type { PocketCollectionResource, PocketPosResource } from '../lib/pocketSchemas'
import { isPocketActivityRow } from '../lib/pocketSchemas'
import { registerPocketRefreshHandler } from '../lib/pocketRefresh'

type PocketAccessTokenReader = () => Promise<string | null>
const pocketActivityCache = new Map<string, PocketActivityRow[]>()
const pocketResourceCache = new Map<string, { merchants: PocketPosResource[]; collections: PocketCollectionResource[] }>()
const pocketActivityPrefetches = new Map<string, Promise<void>>()
const pocketActivityResolved = new Set<string>()
const POCKET_ACTIVITY_CACHE_PREFIX = 'pocket:activity:snapshot:v1:'
const POCKET_ACTIVITY_CACHE_TTL_MS = 7 * 24 * 60 * 60_000

function activityCacheKey(email: string, recent: boolean) {
  return recent ? email + ':recent' : email
}

function durableActivityKey(email: string, recent: boolean) {
  return POCKET_ACTIVITY_CACHE_PREFIX + encodeURIComponent(email.trim().toLowerCase()) + ':' + (recent ? 'recent' : 'all')
}

function readDurableActivity(email: string, recent: boolean): PocketActivityRow[] | undefined {
  if (!email) return undefined
  try {
    const value = JSON.parse(window.localStorage.getItem(durableActivityKey(email, recent)) || 'null') as { savedAt?: number; rows?: unknown[] } | null
    if (!value?.savedAt || Date.now() - value.savedAt > POCKET_ACTIVITY_CACHE_TTL_MS || !Array.isArray(value.rows)) return undefined
    return value.rows.filter(isPocketActivityRow)
  } catch {
    return undefined
  }
}

function writeDurableActivity(email: string, recent: boolean, rows: PocketActivityRow[]) {
  if (!email) return
  try {
    window.localStorage.setItem(durableActivityKey(email, recent), JSON.stringify({
      savedAt: Date.now(),
      rows: rows.slice(0, recent ? 4 : 100),
    }))
  } catch {
    // In-memory caching remains available when device storage is full.
  }
}

export async function prefetchPocketActivity({ email, getAccessToken, recent = false }: { email: string; getAccessToken: PocketAccessTokenReader; recent?: boolean }) {
  const key = activityCacheKey(email, recent)
  if (!email || pocketActivityResolved.has(key)) return
  const active = pocketActivityPrefetches.get(key)
  if (active) return active
  const request = (async () => {
    const token = await getAccessToken()
    if (!token) throw new Error('Pocket session is not ready.')
    const data = await readPocketActivity({ accessToken: token, recent })
    const rows = data.payments.slice().sort((a, b) => Number((b.ts || 0) - (a.ts || 0)))
    pocketActivityCache.set(key, rows)
    if (!recent) pocketResourceCache.set(email, { merchants: data.merchants, collections: data.collections })
    pocketActivityResolved.add(key)
  })().finally(() => pocketActivityPrefetches.delete(key))
  pocketActivityPrefetches.set(key, request)
  return request
}

export default function usePocketActivity({
  authenticated,
  email,
  enabled,
  recent = false,
  getAccessToken,
}: {
  authenticated: boolean
  email: string
  enabled: boolean
  recent?: boolean
  getAccessToken: PocketAccessTokenReader
}) {
  const key = activityCacheKey(email, recent)
  const recentKey = activityCacheKey(email, true)
  const cachedRows = () => authenticated && email
    ? pocketActivityCache.get(key)
      ?? (!recent ? pocketActivityCache.get(recentKey) : undefined)
      ?? readDurableActivity(email, recent)
      ?? (!recent ? readDurableActivity(email, true) : undefined)
      ?? []
    : []
  const [rows, setRows] = useState<PocketActivityRow[]>(cachedRows)
  const [busy, setBusy] = useState(false)
  const [resolved, setResolved] = useState(() => !authenticated || Boolean(email && (
    pocketActivityResolved.has(key)
    || pocketActivityCache.has(key)
    || readDurableActivity(email, recent) !== undefined
    || (!recent && (pocketActivityCache.has(recentKey) || pocketResourceCache.has(email) || readDurableActivity(email, true) !== undefined))
  )))
  const [error, setError] = useState('')
  const [merchants, setMerchants] = useState<PocketPosResource[]>(() => authenticated && email ? pocketResourceCache.get(email)?.merchants ?? [] : [])
  const [collections, setCollections] = useState<PocketCollectionResource[]>(() => authenticated && email ? pocketResourceCache.get(email)?.collections ?? [] : [])

  const refresh = useCallback(async () => {
    if (!authenticated) {
      setRows([])
      setMerchants([])
      setCollections([])
      setError('')
      setResolved(true)
      return
    }
    const hasSnapshot = Boolean(email && (
      pocketActivityCache.has(key)
      || readDurableActivity(email, recent) !== undefined
      || (!recent && (pocketActivityCache.has(recentKey) || pocketResourceCache.has(email) || readDurableActivity(email, true) !== undefined))
      || pocketActivityResolved.has(key)
    ))
    if (!hasSnapshot) setBusy(true)
    const initialController = !hasSnapshot ? new AbortController() : null
    const initialTimeout = initialController ? window.setTimeout(() => initialController.abort(), 2_800) : 0
    const initialDeadline = initialController ? new Promise<never>((_, reject) => {
      initialController.signal.addEventListener('abort', () => reject(new DOMException('Activity deadline exceeded.', 'AbortError')), { once: true })
    }) : null
    const apply = (data: Awaited<ReturnType<typeof readPocketActivity>>, cacheKey: string, resources: boolean) => {
      const nextRows = data.payments.slice().sort((a, b) => Number((b.ts || 0) - (a.ts || 0)))
      setRows(nextRows)
      if (resources) { setMerchants(data.merchants); setCollections(data.collections) }
      if (email) {
        const cacheRecent = cacheKey === recentKey
        pocketActivityCache.set(cacheKey, nextRows)
        writeDurableActivity(email, cacheRecent, nextRows)
        if (resources) pocketResourceCache.set(email, { merchants: data.merchants, collections: data.collections })
        pocketActivityResolved.add(cacheKey)
      }
    }
    try {
      const token = initialDeadline
        ? await Promise.race([getAccessToken(), initialDeadline])
        : await getAccessToken()
      if (!token) throw new Error('Sign in again to load Circle Pocket activity.')
      if (!hasSnapshot) {
        apply(await Promise.race([
          readPocketActivity({ accessToken: token, recent: true, signal: initialController?.signal }),
          initialDeadline!,
        ]), recentKey, false)
        setBusy(false)
        setResolved(true)
        setError('')
        if (!recent) void readPocketActivity({ accessToken: token }).then(data => apply(data, key, true)).catch(() => undefined)
        return
      }
      apply(await readPocketActivity({ accessToken: token, recent }), key, !recent)
      setError('')
    } catch (reason) {
      const deadlineExceeded = reason instanceof DOMException && reason.name === 'AbortError'
      if (deadlineExceeded) {
        // Resolve at the hard deadline using the durable snapshot or normal
        // empty state, while a fresh server request continues quietly.
        setError('')
        void (async () => {
          const retryToken = await getAccessToken()
          if (!retryToken) return
          const data = await readPocketActivity({ accessToken: retryToken, recent: true })
          apply(data, recentKey, false)
          if (!recent) {
            void readPocketActivity({ accessToken: retryToken }).then(next => apply(next, key, true)).catch(() => undefined)
          }
        })().catch(() => undefined)
      } else if (!hasSnapshot) {
        setError(!navigator.onLine
          ? 'No internet connection. Reconnect, then tap Retry.'
          : reason instanceof Error ? reason.message : 'Activity is temporarily unavailable.')
      }
    } finally {
      if (initialTimeout) window.clearTimeout(initialTimeout)
      setBusy(false)
      setResolved(true)
    }
  }, [authenticated, email, getAccessToken, key, recent, recentKey])

  useEffect(() => {
    if (!authenticated) {
      setRows([])
      setMerchants([])
      setCollections([])
      setError('')
      setResolved(true)
      return
    }
    const cached = pocketActivityCache.get(key)
      ?? (!recent ? pocketActivityCache.get(recentKey) : undefined)
      ?? readDurableActivity(email, recent)
      ?? (!recent ? readDurableActivity(email, true) : undefined)
    if (cached !== undefined) setRows(cached)
    const cachedResources = recent ? undefined : pocketResourceCache.get(email)
    if (cachedResources) {
      setMerchants(cachedResources.merchants)
      setCollections(cachedResources.collections)
    }
    setResolved(cached !== undefined || Boolean(cachedResources) || pocketActivityResolved.has(key) || (!recent && pocketActivityResolved.has(recentKey)))
    if (enabled) void refresh()
  }, [authenticated, email, enabled, key, recent, recentKey, refresh])

  useEffect(() => {
    if (!authenticated || !enabled) return
    const refreshVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    const interval = window.setInterval(refreshVisible, 20_000)
    window.addEventListener('focus', refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshVisible)
      document.removeEventListener('visibilitychange', refreshVisible)
    }
  }, [authenticated, enabled, refresh])

  useEffect(() => {
    if (!authenticated || !enabled) return
    return registerPocketRefreshHandler(refresh)
  }, [authenticated, enabled, refresh])

  return { rows, merchants, collections, busy, resolved, error, refresh }
}
