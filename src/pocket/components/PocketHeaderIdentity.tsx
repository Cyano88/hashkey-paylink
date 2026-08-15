import { useState } from 'react'
import { copyToClipboard } from '../../lib/utils'
import { Check } from './PocketIcons'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketProfile from '../hooks/usePocketProfile'

export default function PocketHeaderIdentity() {
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const profile = usePocketProfile({ authenticated, email, getAccessToken })
  const [copied, setCopied] = useState(false)

  if (!authenticated) return <span className="text-sm font-black tracking-[-0.025em]">Pocket</span>
  if (!profile.loaded || !profile.profile) return <span className="h-3.5 w-20 animate-pulse rounded bg-gray-200 dark:bg-white/10" aria-label="Loading Pocket ID" />
  const pocketId = profile.profile?.pocketId || ''
  const copyId = async () => {
    if (!pocketId) return
    await copyToClipboard(pocketId)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1_500)
  }
  return <>
    <button type="button" onClick={event => { event.preventDefault(); event.stopPropagation(); void copyId() }} className="text-sm font-black tabular-nums tracking-[-0.025em]" aria-label="Copy Pocket ID">ID: {pocketId || 'Unavailable'}</button>
    {copied && <div role="status" aria-live="polite" className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+4.25rem)] z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-800 shadow-[0_12px_32px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-[#202024] dark:text-white"><Check className="h-3.5 w-3.5 text-blue-500" />Pocket ID copied</div>}
  </>
}
