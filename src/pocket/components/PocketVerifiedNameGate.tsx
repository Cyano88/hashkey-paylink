import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { POCKET_BASE_PATH, POCKET_ROUTES, pocketApiUrl } from '../lib/pocketRoutes'
import usePocketIdentity from '../hooks/usePocketIdentity'
import PocketKycGate from './PocketKycGate'
import PocketResolvedNameRow from './PocketResolvedNameRow'

export default function PocketVerifiedNameGate() {
  const navigate = useNavigate()
  const { getAccessToken } = usePocketIdentity()
  const [pending, setPending] = useState(false)
  useEffect(() => {
    let current = true
    void (async () => {
      try {
        const token = await getAccessToken()
        if (!token) return
        const response = await fetch(pocketApiUrl('/api/pocket/kyc'), { method: 'POST', headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'eligibility' }), signal: AbortSignal.timeout(15000) })
        const data = await response.json()
        if (current && response.ok && data.ok) setPending(['pending', 'review'].includes(data.status))
      } catch { /* Keep the verification entry point available on lookup failure. */ }
    })()
    return () => { current = false }
  }, [getAccessToken])
  return <PocketKycGate pending={pending} onClose={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.home)} />
}

export function PocketVerifiedNameBadge({ name }: { name: string }) {
  return <PocketResolvedNameRow label="Verified name" name={name} />
}
