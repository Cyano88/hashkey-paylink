import { useEffect, useRef } from 'react'
import { prefetchPocketActivity } from './usePocketActivity'

/** Refresh authoritative history after checkout verification; never invent a payment row. */
export default function useCheckoutActivityRefresh({ verified, paymentId, authenticated, userId, email, getAccessToken }: {
  verified: boolean; paymentId: string; authenticated: boolean; userId?: string; email: string
  getAccessToken: () => Promise<string | null>
}) {
  const owner = authenticated && userId && email ? `${userId}:${email.trim().toLowerCase()}` : ''
  const currentOwner = useRef(owner)
  currentOwner.current = owner
  const refreshed = useRef('')
  useEffect(() => {
    if (!verified || !paymentId || !owner) return
    const key = `${owner}:${paymentId}`
    if (refreshed.current === key) return
    refreshed.current = key
    // Retain this read across navigation to Home. An account change still invalidates it.
    // A failed read leaves the existing dirty marker for the next Activity refresh.
    void prefetchPocketActivity({ email, getAccessToken, fresh: true,
      isCurrent: () => currentOwner.current === owner }).catch(() => {})
  }, [verified, paymentId, owner, email, getAccessToken])
}
