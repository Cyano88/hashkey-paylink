import { useCallback, useEffect, useState } from 'react'
import {
  readPocketLocalCurrencyProfile,
  savePocketLocalCurrencyProfile,
} from '../api/pocketReadClient'
import type { LocalCurrencyProfile } from '../models/localCurrencyProfile'

type PocketAccessTokenReader = () => Promise<string | null>

const emptyProfile: LocalCurrencyProfile = { firstName: '', lastName: '', email: '' }
const pocketProfileCache = new Map<string, LocalCurrencyProfile | null>()

export default function usePocketProfile({
  authenticated,
  email,
  getAccessToken,
}: {
  authenticated: boolean
  email: string
  getAccessToken: PocketAccessTokenReader
}) {
  const cached = authenticated && email ? pocketProfileCache.get(email) : undefined
  const [profile, setProfile] = useState<LocalCurrencyProfile | null>(() => cached ?? null)
  const [draft, setDraft] = useState<LocalCurrencyProfile>(() => cached ?? { ...emptyProfile, email })
  const [editing, setEditing] = useState(() => cached === null)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(() => !authenticated || cached !== undefined)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async (isCurrent: () => boolean = () => true) => {
    if (!authenticated) {
      setProfile(null)
      setDraft(emptyProfile)
      setEditing(false)
      setBusy(false)
      setLoaded(true)
      setError('')
      setLoadError('')
      return
    }
    const immediate = pocketProfileCache.get(email)
    if (immediate !== undefined) {
      setProfile(immediate)
      setDraft(immediate ?? { ...emptyProfile, email })
      setEditing(!immediate)
    }
    setLoaded(immediate !== undefined)
    setBusy(immediate === undefined)
    setError('')
    setLoadError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to save local currency profile.')
      const data = await readPocketLocalCurrencyProfile({ accessToken: token })
      if (!isCurrent()) return
      const nextProfile = data.profile ?? null
      pocketProfileCache.set(email, nextProfile)
      setProfile(nextProfile)
      setDraft({
        firstName: nextProfile?.firstName ?? '',
        lastName: nextProfile?.lastName ?? '',
        email: nextProfile?.email ?? data.email ?? email,
      })
      setEditing(!nextProfile)
      setLoaded(true)
    } catch (reason) {
      if (!isCurrent()) return
      const message = reason instanceof Error ? reason.message : 'Could not load payout profile.'
      setError(message)
      setLoadError(message)
      setDraft(current => ({ ...current, email: email || current.email }))
      setEditing(true)
      setLoaded(true)
    } finally {
      if (isCurrent()) setBusy(false)
    }
  }, [authenticated, email, getAccessToken])

  const save = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to save local currency profile.')
      const data = await savePocketLocalCurrencyProfile({
        accessToken: token,
        profile: { ...draft, email: email || draft.email },
        expectedUpdatedAt: profile?.updatedAt,
      })
      setProfile(data.profile)
      setDraft(data.profile)
      pocketProfileCache.set(email, data.profile)
      setEditing(false)
      return data.profile
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save payout profile.')
      return null
    } finally {
      setBusy(false)
    }
  }, [draft, email, getAccessToken, profile?.updatedAt])

  const edit = useCallback(() => {
    if (profile) setDraft(profile)
    else setDraft(current => ({ ...current, email: email || current.email }))
    setError('')
    setEditing(true)
  }, [email, profile])

  const cancel = useCallback(() => {
    if (!profile) return
    setDraft(profile)
    setError('')
    setEditing(false)
  }, [profile])

  useEffect(() => {
    let current = true
    void load(() => current)
    return () => {
      current = false
    }
  }, [load])

  return {
    profile,
    draft,
    setDraft,
    editing,
    busy,
    loaded,
    error,
    loadError,
    save,
    edit,
    cancel,
    reload: () => load(),
  }
}
