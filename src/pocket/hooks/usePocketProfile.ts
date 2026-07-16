import { useCallback, useEffect, useState } from 'react'
import {
  readPocketLocalCurrencyProfile,
  savePocketLocalCurrencyProfile,
} from '../api/pocketReadClient'
import type { LocalCurrencyProfile } from '../models/localCurrencyProfile'

type PocketAccessTokenReader = () => Promise<string | null>

const emptyProfile: LocalCurrencyProfile = { firstName: '', lastName: '', email: '' }

export default function usePocketProfile({
  authenticated,
  email,
  getAccessToken,
}: {
  authenticated: boolean
  email: string
  getAccessToken: PocketAccessTokenReader
}) {
  const [profile, setProfile] = useState<LocalCurrencyProfile | null>(null)
  const [draft, setDraft] = useState<LocalCurrencyProfile>(emptyProfile)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (isCurrent: () => boolean = () => true) => {
    if (!authenticated) {
      setProfile(null)
      setDraft(emptyProfile)
      setEditing(false)
      setBusy(false)
      setError('')
      return
    }
    setBusy(true)
    setError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to save local currency profile.')
      const data = await readPocketLocalCurrencyProfile({ accessToken: token })
      if (!isCurrent()) return
      const nextProfile = data.profile ?? null
      setProfile(nextProfile)
      setDraft({
        firstName: nextProfile?.firstName ?? '',
        lastName: nextProfile?.lastName ?? '',
        email: nextProfile?.email ?? data.email ?? email,
      })
      setEditing(!nextProfile)
    } catch (reason) {
      if (!isCurrent()) return
      setError(reason instanceof Error ? reason.message : 'Could not load payout profile.')
      setDraft(current => ({ ...current, email: email || current.email }))
      setEditing(true)
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
      setEditing(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save payout profile.')
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

  return { profile, draft, setDraft, editing, busy, error, save, edit, cancel }
}
