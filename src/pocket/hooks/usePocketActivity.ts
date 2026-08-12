import { useCallback, useEffect, useState } from 'react'
import { readPocketActivity } from '../api/pocketReadClient'
import type { PocketActivityRow } from '../models/pocketActivity'
import type { PocketCollectionResource, PocketPosResource } from '../lib/pocketSchemas'

type PocketAccessTokenReader = () => Promise<string | null>
const pocketActivityCache = new Map<string, PocketActivityRow[]>()
const pocketResourceCache = new Map<string, { merchants: PocketPosResource[]; collections: PocketCollectionResource[] }>()

export default function usePocketActivity({
  authenticated,
  email,
  enabled,
  getAccessToken,
}: {
  authenticated: boolean
  email: string
  enabled: boolean
  getAccessToken: PocketAccessTokenReader
}) {
  const [rows, setRows] = useState<PocketActivityRow[]>(() => authenticated && email ? pocketActivityCache.get(email) ?? [] : [])
  const [busy, setBusy] = useState(false)
  const [resolved, setResolved] = useState(() => !authenticated || Boolean(email && (pocketActivityCache.has(email) || pocketResourceCache.has(email))))
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
    setBusy(true)
    setError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to load Circle Pocket activity.')
      const data = await readPocketActivity({ accessToken: token })
      const nextRows = data.payments.slice().sort((a, b) => Number((b.ts || 0) - (a.ts || 0)))
      setRows(nextRows)
      setMerchants(data.merchants)
      setCollections(data.collections)
      if (email) {
        pocketActivityCache.set(email, nextRows)
        pocketResourceCache.set(email, { merchants: data.merchants, collections: data.collections })
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load Circle Pocket activity.')
    } finally {
      setBusy(false)
      setResolved(true)
    }
  }, [authenticated, email, getAccessToken])

  useEffect(() => {
    if (!authenticated) {
      setRows([])
      setMerchants([])
      setCollections([])
      setError('')
      setResolved(true)
      return
    }
    const cached = pocketActivityCache.get(email)
    if (cached) setRows(cached)
    const cachedResources = pocketResourceCache.get(email)
    if (cachedResources) {
      setMerchants(cachedResources.merchants)
      setCollections(cachedResources.collections)
    }
    setResolved(Boolean(cached || cachedResources))
    if (enabled) void refresh()
  }, [authenticated, email, enabled, refresh])

  return { rows, merchants, collections, busy, resolved, error, refresh }
}
