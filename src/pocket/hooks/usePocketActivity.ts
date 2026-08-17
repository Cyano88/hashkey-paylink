import { useCallback, useEffect, useState } from 'react'
import { readPocketActivity } from '../api/pocketReadClient'
import type { PocketActivityRow } from '../models/pocketActivity'
import type { PocketCollectionResource, PocketPosResource } from '../lib/pocketSchemas'
import { registerPocketRefreshHandler } from '../lib/pocketRefresh'

type PocketAccessTokenReader = () => Promise<string | null>
const pocketActivityCache = new Map<string, PocketActivityRow[]>()
const pocketResourceCache = new Map<string, { merchants: PocketPosResource[]; collections: PocketCollectionResource[] }>()
const pocketActivityPrefetches = new Map<string, Promise<void>>()
const pocketActivityResolved = new Set<string>()

function activityCacheKey(email: string, recent: boolean) {
  return recent ? `${email}:recent` : email
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
  const cachedRows = () => authenticated && email ? pocketActivityCache.get(key) ?? (!recent ? pocketActivityCache.get(recentKey) : undefined) ?? [] : []
  const [rows, setRows] = useState<PocketActivityRow[]>(cachedRows)
  const [busy, setBusy] = useState(false)
  const [resolved, setResolved] = useState(() => !authenticated || Boolean(email && (pocketActivityResolved.has(key) || pocketActivityCache.has(key) || (!recent && (pocketActivityCache.has(recentKey) || pocketResourceCache.has(email))))))
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
    const hasSnapshot = Boolean(email && (pocketActivityCache.has(key) || (!recent && (pocketActivityCache.has(recentKey) || pocketResourceCache.has(email))) || pocketActivityResolved.has(key)))
    if (!hasSnapshot) setBusy(true)
    const initialController = !hasSnapshot ? new AbortController() : null
    const initialTimeout = initialController ? window.setTimeout(() => initialController.abort(), 2_800) : 0
    const initialDeadline = initialController ? new Promise<never>((_, reject) => {
      initialController.signal.addEventListener('abort', () => reject(new DOMException('Activity deadline exceeded.', 'AbortError')), { once: true })
    }) : null
    try {
      const token = initialDeadline
        ? await Promise.race([getAccessToken(), initialDeadline])
        : await getAccessToken()
      if (!token) throw new Error('Sign in again to load Circle Pocket activity.')
      const apply = (data: Awaited<ReturnType<typeof readPocketActivity>>, cacheKey: string, resources: boolean) => {
        const nextRows = data.payments.slice().sort((a, b) => Number((b.ts || 0) - (a.ts || 0)))
        setRows(nextRows)
        if (resources) { setMerchants(data.merchants); setCollections(data.collections) }
        if (email) {
          pocketActivityCache.set(cacheKey, nextRows)
          if (resources) pocketResourceCache.set(email, { merchants: data.merchants, collections: data.collections })
          pocketActivityResolved.add(cacheKey)
        }
      }
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
      if (!hasSnapshot) setError(!navigator.onLine
        ? 'No internet connection. Reconnect, then tap Retry.'
        : reason instanceof DOMException && reason.name === 'AbortError'
          ? 'Activity did not respond within 3 seconds. Tap Retry.'
          : reason instanceof Error ? `Activity sync failed: ${reason.message}` : 'Activity sync failed before a response was received.')
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
    const cached = pocketActivityCache.get(key) ?? (!recent ? pocketActivityCache.get(recentKey) : undefined)
    if (cached) setRows(cached)
    const cachedResources = recent ? undefined : pocketResourceCache.get(email)
    if (cachedResources) {
      setMerchants(cachedResources.merchants)
      setCollections(cachedResources.collections)
    }
    setResolved(Boolean(cached || cachedResources) || pocketActivityResolved.has(key) || (!recent && pocketActivityResolved.has(recentKey)))
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
