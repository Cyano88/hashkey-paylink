import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Copy, Pencil, UserRound } from './PocketIcons'
import { useLocation, useNavigate } from 'react-router-dom'
import { PrivyConnectButton } from '../../lib/PrivyConnectButton'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketProfile from '../hooks/usePocketProfile'
import { POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'
import PocketThemeToggle from './PocketThemeToggle'
import PocketAvatar from './PocketAvatar'

export default function PocketAccountMenu() {
  const location = useLocation()
  const navigate = useNavigate()
  const { ready, authenticated, email, getAccessToken } = usePocketIdentity()
  const profile = usePocketProfile({ authenticated, email, getAccessToken })
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const current = profile.profile

  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  if (!ready) return <span className="h-9 w-9 rounded-full bg-gray-100 dark:bg-white/[0.08]" aria-hidden="true" />
  if (!authenticated) return <PrivyConnectButton debugLabel="pocket-header-sign-in" logoutOnAuthenticated={false} className="pointer-events-auto rounded-full bg-gray-950 px-4 py-2 text-xs font-bold text-white dark:bg-white dark:text-gray-950">Sign in</PrivyConnectButton>

  const copyId = async () => {
    if (!current?.pocketId) return
    await navigator.clipboard.writeText(current.pocketId)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div ref={rootRef} className="pointer-events-auto relative">
      <button type="button" onClick={() => setOpen(value => !value)} aria-label="Open Pocket profile" aria-expanded={open}>
        <PocketAvatar avatarId={current?.avatarId} className="h-9 w-9 border border-gray-200 shadow-sm dark:border-white/10" />
      </button>
      {open && <div className="absolute right-0 top-12 z-[70] w-[min(330px,calc(100vw-2rem))] rounded-[24px] border border-gray-200 bg-white p-2 shadow-[0_24px_70px_rgba(15,23,42,0.22)] dark:border-white/10 dark:bg-[#18181c]">
        <div className="flex items-center gap-3 px-3 pb-3 pt-2">
          <PocketAvatar avatarId={current?.avatarId} className="h-12 w-12" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-black text-gray-950 dark:text-white">{current?.resolvedName || 'Pocket profile'}</span>
            <button type="button" onClick={() => void copyId()} className="mt-0.5 flex max-w-full items-center gap-1.5 text-[11px] font-semibold tabular-nums text-gray-400" aria-label="Copy Pocket ID">
              <span className="truncate">ID: {current?.pocketId}</span><Copy className="h-3 w-3 shrink-0" />
              {copied && <span className="text-emerald-500">Copied</span>}
            </button>
          </span>
        </div>
        <div className="space-y-1 rounded-[18px] bg-gray-50 p-1 dark:bg-white/[0.04]">
          <button type="button" onClick={() => navigate(`${POCKET_BASE_PATH}${POCKET_ROUTES.profile}`)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-xs font-bold text-gray-700 hover:bg-white dark:text-gray-300 dark:hover:bg-white/[0.07]">
            <UserRound className="h-4 w-4" /><span className="flex-1">View profile</span><ChevronRight className="h-3.5 w-3.5 text-gray-400" />
          </button>
          <button type="button" onClick={() => navigate(`${POCKET_BASE_PATH}${POCKET_ROUTES.profile}?edit=id`)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-xs font-bold text-gray-700 hover:bg-white dark:text-gray-300 dark:hover:bg-white/[0.07]">
            <Pencil className="h-4 w-4" /><span className="flex-1">Edit Pocket ID</span><ChevronRight className="h-3.5 w-3.5 text-gray-400" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-2.5 dark:bg-white/[0.04]">
          <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Appearance</span><PocketThemeToggle className="border-0 bg-transparent shadow-none dark:bg-transparent" />
        </div>
      </div>}
    </div>
  )
}
