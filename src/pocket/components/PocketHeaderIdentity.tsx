import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketProfile from '../hooks/usePocketProfile'

export default function PocketHeaderIdentity() {
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const profile = usePocketProfile({ authenticated, email, getAccessToken })

  if (!authenticated) return <span className="text-sm font-black tracking-[-0.025em]">Pocket</span>
  if (!profile.loaded || profile.busy) return <span className="h-3.5 w-20 animate-pulse rounded bg-gray-200 dark:bg-white/10" aria-label="Loading Pocket ID" />
  return <span className="text-sm font-black tabular-nums tracking-[-0.025em]">ID: {profile.profile?.pocketId || 'Unavailable'}</span>
}
