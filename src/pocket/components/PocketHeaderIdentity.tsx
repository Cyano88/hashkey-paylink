import { isPocketId } from '../lib/pocketId'
import { useEffect, useState } from 'react'
import { copyToClipboard } from '../../lib/utils'
import { Check } from './PocketIcons'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketProfile from '../hooks/usePocketProfile'

export default function PocketHeaderIdentity() {
  const { ready, authenticated, email, getAccessToken } = usePocketIdentity()
  const profile = usePocketProfile({ authenticated, email, getAccessToken })
  const [copied, setCopied] = useState(false)

  // Display-only cache: never used to authorize a payment or resolve a recipient.
  const cacheKey = email ? 'pocket:header-id:v1:' + email.trim().toLowerCase() : ''
  const currentProfile = profile.profile?.email.trim().toLowerCase() === email.trim().toLowerCase() ? profile.profile : null
  const liveId = authenticated ? currentProfile?.pocketId || '' : ''
  let cachedId = ''
  try { if (authenticated && cacheKey) cachedId = localStorage.getItem(cacheKey) || '' } catch { /* Storage is optional. */ }
  const pocketId = isPocketId(liveId) ? liveId : isPocketId(cachedId) ? cachedId : ''
  useEffect(() => {
    if (!authenticated || !cacheKey || !isPocketId(liveId)) return
    try { localStorage.setItem(cacheKey, liveId) } catch { /* Display-only cache. */ }
  }, [authenticated, cacheKey, liveId])
  const loadingId = !pocketId && (ready === false || (authenticated && !profile.loaded))
  const copyId = async () => {
    if (!pocketId) return
    await copyToClipboard(pocketId)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1_500)
  }
  return <>
    <button type="button" disabled={!pocketId} onClick={event => { event.preventDefault(); event.stopPropagation(); void copyId() }} title={pocketId} className="inline-flex h-5 w-20 max-w-full items-center truncate text-[10px] font-bold tabular-nums tracking-tight" aria-label="Copy full Pocket ID" aria-busy={loadingId}>{loadingId ? <span aria-label="Loading Pocket ID" className="block h-3 w-16 animate-pulse rounded bg-gray-200/85 motion-reduce:animate-none dark:bg-white/[0.08]" /> : <>ID:{pocketId ? pocketId.slice(0, 8) : '\u2014'}</>}</button>
    {copied && <div role="status" aria-live="polite" className="pointer-events-none fixed left-1/2 top-[calc(var(--pocket-safe-top)+4.25rem)] z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-800 shadow-[0_12px_32px_rgba(15,23,42,0.16)] dark:border-[#262626] dark:bg-[#171717] dark:text-white"><Check className="h-3.5 w-3.5 text-blue-500" />Pocket ID copied</div>}
  </>
}
