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
  const [rows, setRows] = useState<PocketActivityRow[]>(() => authenticated && email ? pocketActivityCache.get(key) ?? [] : [])
  const [busy, setBusy] = useState(false)
  const [resolved, setResolved] = useState(() => !authenticated || Boolean(email && (pocketActivityResolved.has(key) || pocketActivityCache.has(key) || (!recent && pocketResourceCache.has(email)))))
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
    const hasSnapshot = Boolean(email && (pocketActivityCache.has(key) || (!recent && pocketResourceCache.has(email)) || pocketActivityResolved.has(key)))
    if (!hasSnapshot) setBusy(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to load Circle Pocket activity.')
      const data = await readPocketActivity({ accessToken: token, recent })
      const nextRows = data.payments.slice().sort((a, b) => Number((b.ts || 0) - (a.ts || 0)))
      setRows(nextRows)
      setMerchants(data.merchants)
      setCollections(data.collections)
      if (email) {
        pocketActivityCache.set(key, nextRows)
        if (!recent) pocketResourceCache.set(email, { merchants: data.merchants, collections: data.collections })
        pocketActivityResolved.add(key)
      }
      setError('')
    } catch (reason) {
      if (!hasSnapshot) setError('Activity is taking longer than expected. Pocket will keep trying in the background.')
    } finally {
      setBusy(false)
      setResolved(true)
    }
  }, [authenticated, email, getAccessToken, key, recent])

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
    if (cached) setRows(cached)
    const cachedResources = recent ? undefined : pocketResourceCache.get(email)
    if (cachedResources) {
      setMerchants(cachedResources.merchants)
      setCollections(cachedResources.collections)
    }
    setResolved(Boolean(cached || cachedResources) || pocketActivityResolved.has(key))
    if (enabled) void refresh()
  }, [authenticated, email, enabled, key, recent, refresh])

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
