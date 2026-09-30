import { publishPocketDisplayCurrency } from '../lib/pocketDisplayCurrency'
import { useCallback, useEffect, useState } from 'react'
import {
  readPocketLocalCurrencyProfile,
  savePocketLocalCurrencyProfile,
} from '../api/pocketReadClient'
import type { LocalCurrencyProfile } from '../models/localCurrencyProfile'

type PocketAccessTokenReader = () => Promise<string | null>

const emptyProfile: LocalCurrencyProfile = {
  firstName: '',
  lastName: '',
  resolvedName: '',
  nameStatus: 'unverified',
  email: '',
  pocketNumber: '',
  pocketId: '',
  avatarId: 1,
  displayCurrency: 'USDC',
}
const pocketProfileCache = new Map<string, LocalCurrencyProfile | null>()
const profileListeners = new Map<string, Set<() => void>>()
const profileSaveVersions = new Map<string, number>()
function publishProfile(email: string, profile: LocalCurrencyProfile | null, saved = false) {
  pocketProfileCache.set(email, profile)
  if (saved) profileSaveVersions.set(email, (profileSaveVersions.get(email) ?? 0) + 1)
  profileListeners.get(email)?.forEach(notify => notify())
}

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
    const saveVersion = profileSaveVersions.get(email) ?? 0
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
      // A GET started before a save must not restore the previous ID.
      if ((profileSaveVersions.get(email) ?? 0) !== saveVersion) return
      const nextProfile = data.profile ?? null
      publishProfile(email, nextProfile)
      publishPocketDisplayCurrency(email, nextProfile?.displayCurrency)
      setProfile(nextProfile)
      setDraft({
        firstName: nextProfile?.firstName ?? '',
        lastName: nextProfile?.lastName ?? '',
        resolvedName: nextProfile?.resolvedName ?? '',
        nameStatus: nextProfile?.nameStatus ?? 'unverified',
        email: nextProfile?.email ?? data.email ?? email,
        pocketNumber: nextProfile?.pocketNumber ?? '',
        pocketId: nextProfile?.pocketId ?? '',
        avatarId: nextProfile?.avatarId ?? 1,
        displayCurrency: nextProfile?.displayCurrency ?? 'USDC',
      })
      setEditing(!nextProfile)
      setLoaded(true)
    } catch (reason) {
      if (!isCurrent()) return
      const message = reason instanceof Error ? reason.message : 'Could not load payout profile.'
      setError(message)
      setLoadError(message)
      setDraft(current => ({ ...current, email: email || current.email }))
      setEditing(immediate === undefined || immediate === null)
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
        pocketId: draft.pocketId,
        avatarId: draft.avatarId,
        displayCurrency: draft.displayCurrency,
        expectedUpdatedAt: profile?.updatedAt,
      })
      setProfile(data.profile)
      setDraft(data.profile)
      publishProfile(email, data.profile, true)
      publishPocketDisplayCurrency(email, data.profile.displayCurrency)
      setEditing(false)
      return data.profile
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save payout profile.')
      return null
    } finally {
      setBusy(false)
    }
  }, [draft, email, getAccessToken, profile?.updatedAt])

  const saveDisplayCurrency = useCallback(async (displayCurrency: LocalCurrencyProfile['displayCurrency']) => {
    if (!profile) return null
    setBusy(true)
    setError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to save your display currency.')
      const data = await savePocketLocalCurrencyProfile({
        accessToken: token,
        pocketId: profile.pocketId,
        avatarId: profile.avatarId,
        displayCurrency,
        expectedUpdatedAt: profile.updatedAt,
      })
      setProfile(data.profile)
      setDraft(data.profile)
      publishProfile(email, data.profile, true)
      publishPocketDisplayCurrency(email, data.profile.displayCurrency)
      return data.profile
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save display currency.')
      return null
    } finally {
      setBusy(false)
    }
  }, [email, getAccessToken, profile])

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
    if (!authenticated || !email) return
    const notify = () => {
      setProfile(pocketProfileCache.get(email) ?? null)
      setLoaded(true)
    }
    const listeners = profileListeners.get(email) ?? new Set<() => void>()
    listeners.add(notify); profileListeners.set(email, listeners)
    return () => { listeners.delete(notify); if (!listeners.size) profileListeners.delete(email) }
  }, [authenticated, email])

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
    saveDisplayCurrency,
    edit,
    cancel,
    reload: load,
  }
}
