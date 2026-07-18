import { useCallback, useEffect, useState } from 'react'
import { readPocketActivity } from '../api/pocketReadClient'
import type { PocketActivityRow } from '../models/pocketActivity'

type PocketAccessTokenReader = () => Promise<string | null>
const pocketActivityCache = new Map<string, PocketActivityRow[]>()

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
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!authenticated) {
      setRows([])
      setError('')
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
      if (email) pocketActivityCache.set(email, nextRows)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load Circle Pocket activity.')
    } finally {
      setBusy(false)
    }
  }, [authenticated, email, getAccessToken])

  useEffect(() => {
    if (!authenticated) {
      setRows([])
      setError('')
      return
    }
    const cached = pocketActivityCache.get(email)
    if (cached) setRows(cached)
    if (enabled) void refresh()
  }, [authenticated, email, enabled, refresh])

  return { rows, busy, error, refresh }
}
