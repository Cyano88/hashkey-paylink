import { useEffect, useRef } from 'react'
import { readPocketActivity } from '../api/pocketReadClient'
import { cacheConfirmedPocketActivity, markPocketActivityDirty } from '../lib/pocketActivityCache'

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
    // Retain this read across navigation to Home, scoped to the captured account.
    void (async () => {
      const token = await getAccessToken()
      if (!token || currentOwner.current !== owner) return
      const result = await readPocketActivity({accessToken:token,checkoutId:paymentId,signal:AbortSignal.timeout(12000)})
      if (currentOwner.current !== owner) return
      const rows = result.payments.filter(row=>row.merchantId===paymentId)
      if (!rows.length) markPocketActivityDirty(email)
      for (const row of rows) cacheConfirmedPocketActivity(email,row)
    })().catch(() => { if (currentOwner.current === owner) markPocketActivityDirty(email) })

  }, [verified, paymentId, owner, email, getAccessToken])
}
