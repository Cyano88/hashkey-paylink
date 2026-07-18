import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, Loader2, LogOut, Pencil, UserRound } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { PrivyConnectButton } from '../../lib/PrivyConnectButton'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketProfile from '../hooks/usePocketProfile'

type AccountMenuMode = 'menu' | 'view' | 'edit'

function initialsFor(name: string, email: string) {
  const words = name.replace(/[^a-z0-9\s-]/gi, ' ').trim().split(/\s+/).filter(Boolean)
  if (words.length) return words.slice(0, 2).map(word => word[0]?.toUpperCase()).join('')
  const emailName = email.split('@')[0]?.replace(/[^a-z0-9]/gi, ' ').trim() ?? ''
  const emailWords = emailName.split(/\s+/).filter(Boolean)
  return emailWords.slice(0, 2).map(word => word[0]?.toUpperCase()).join('') || 'P'
}

function avatarGradient(seed: string) {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  const hue = hash % 360
  return `linear-gradient(135deg, hsl(${hue} 72% 48%), hsl(${(hue + 46) % 360} 78% 42%))`
}

export default function PocketAccountMenu() {
  const location = useLocation()
  const { ready, authenticated, email, getAccessToken, logout } = usePocketIdentity()
  const profile = usePocketProfile({ authenticated, email, getAccessToken })
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<AccountMenuMode>('menu')
  const [promptProfileAfterLogin, setPromptProfileAfterLogin] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const fullName = profile.profile
    ? `${profile.profile.firstName} ${profile.profile.lastName}`.trim()
    : `${profile.draft.firstName} ${profile.draft.lastName}`.trim()
  const initials = useMemo(() => initialsFor(fullName, email), [email, fullName])
  const gradient = useMemo(() => avatarGradient(`${email}:${fullName}`), [email, fullName])

  useEffect(() => {
    setOpen(false)
    setMode('menu')
  }, [location.pathname])

  useEffect(() => {
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress)
  }, [])

  useEffect(() => {
    if (!promptProfileAfterLogin || !authenticated || !profile.loaded || profile.busy) return
    setPromptProfileAfterLogin(false)
    setMode(profile.loadError || profile.profile ? 'menu' : 'edit')
    setOpen(true)
  }, [authenticated, profile.busy, profile.loadError, profile.loaded, profile.profile, promptProfileAfterLogin])

  if (!ready) {
    return <span className="pointer-events-none h-9 w-9 animate-pulse rounded-full border border-gray-200 bg-gray-100 dark:border-white/10 dark:bg-white/[0.08]" aria-hidden="true" />
  }

  if (!authenticated) {
    return (
      <PrivyConnectButton
        debugLabel="pocket-header-sign-in"
        logoutOnAuthenticated={false}
        onBeforeLogin={() => setPromptProfileAfterLogin(true)}
        className="pointer-events-auto rounded-full border border-gray-950 bg-gray-950 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-gray-800 active:scale-[0.98] disabled:opacity-60 dark:border-white dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
      >
        Sign in
      </PrivyConnectButton>
    )
  }

  const openEdit = () => {
    profile.edit()
    setMode('edit')
    setOpen(true)
  }

  const save = async () => {
    const saved = await profile.save()
    if (saved) setMode('menu')
  }

  return (
    <div ref={rootRef} className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => {
          setMode('menu')
          setOpen(current => !current)
        }}
        aria-label="Open Pocket profile"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/70 text-[11px] font-black text-white shadow-sm ring-1 ring-black/[0.06] transition hover:scale-[1.03] active:scale-[0.97] dark:border-white/20 dark:ring-white/[0.08]"
        style={{ background: gradient }}
      >
        {profile.busy && !profile.loaded ? <Loader2 className="h-4 w-4 animate-spin" /> : initials}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-[70] w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-[24px] border border-gray-200 bg-white p-2 shadow-[0_24px_70px_rgba(15,23,42,0.22)] dark:border-white/10 dark:bg-[#18181c] dark:shadow-[0_28px_80px_rgba(0,0,0,0.5)]">
          {mode === 'menu' && (
            <>
              <div className="flex items-center gap-3 px-3 pb-3 pt-2">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/70 text-sm font-black text-white shadow-sm" style={{ background: gradient }}>{initials}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-gray-950 dark:text-white">{fullName || 'Pocket profile'}</span>
                  <span className="mt-0.5 block truncate text-[11px] font-medium text-gray-400">{email}</span>
                </span>
              </div>

              {!profile.loaded || profile.busy ? (
                <div className="flex items-center justify-center gap-2 rounded-[18px] bg-gray-50 px-4 py-6 text-xs font-semibold text-gray-400 dark:bg-white/[0.04]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading profile
                </div>
              ) : profile.loadError ? (
                <div className="rounded-[18px] bg-red-50 p-3 dark:bg-red-400/10">
                  <p className="text-xs font-semibold leading-relaxed text-red-700 dark:text-red-200">{profile.loadError}</p>
                  <button type="button" onClick={() => void profile.reload()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-gray-950 px-3 py-2.5 text-xs font-bold text-white dark:bg-white dark:text-gray-950">
                    <Loader2 className="h-3.5 w-3.5" />
                    Try again
                  </button>
                </div>
              ) : (
                <div className="space-y-1 rounded-[18px] bg-gray-50 p-1 dark:bg-white/[0.04]">
                  <button
                    type="button"
                    onClick={() => setMode('view')}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-xs font-bold text-gray-700 transition hover:bg-white hover:text-gray-950 hover:shadow-sm dark:text-gray-300 dark:hover:bg-white/[0.07] dark:hover:text-white"
                  >
                    <UserRound className="h-4 w-4" />
                    <span className="flex-1">View profile</span>
                    <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                  </button>
                  <button
                    type="button"
                    onClick={openEdit}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-xs font-bold text-gray-700 transition hover:bg-white hover:text-gray-950 hover:shadow-sm dark:text-gray-300 dark:hover:bg-white/[0.07] dark:hover:text-white"
                  >
                    <Pencil className="h-4 w-4" />
                    <span className="flex-1">{profile.profile ? 'Edit profile' : 'Complete profile'}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => void logout().then(() => setOpen(false))}
                className="mt-2 flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left text-xs font-bold text-red-600 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-400/10"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </>
          )}

          {mode === 'view' && (
            <div className="p-2">
              <button type="button" onClick={() => setMode('menu')} className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-white/[0.07] dark:text-gray-300" aria-label="Back to profile menu">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="mt-3 text-center">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/70 text-lg font-black text-white shadow-sm" style={{ background: gradient }}>{initials}</span>
                <p className="mt-3 text-base font-black text-gray-950 dark:text-white">{fullName || 'Pocket profile'}</p>
                <p className="mt-1 truncate text-xs font-medium text-gray-400">{email}</p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-gray-50 p-3 dark:bg-white/[0.04]">
                  <p className="text-[9px] font-black uppercase tracking-wider text-gray-400">First name</p>
                  <p className="mt-1 truncate text-xs font-bold text-gray-800 dark:text-gray-200">{profile.profile?.firstName || 'Not set'}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-3 dark:bg-white/[0.04]">
                  <p className="text-[9px] font-black uppercase tracking-wider text-gray-400">Last name</p>
                  <p className="mt-1 truncate text-xs font-bold text-gray-800 dark:text-gray-200">{profile.profile?.lastName || 'Not set'}</p>
                </div>
              </div>
              <button type="button" onClick={openEdit} className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-gray-950 px-4 py-3 text-xs font-bold text-white dark:bg-white dark:text-gray-950">
                <Pencil className="h-3.5 w-3.5" />
                Edit profile
              </button>
            </div>
          )}

          {mode === 'edit' && (
            <div className="p-2">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => profile.profile ? setMode('menu') : setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-white/[0.07] dark:text-gray-300" aria-label="Close profile editor">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div>
                  <p className="text-sm font-black text-gray-950 dark:text-white">{profile.profile ? 'Edit profile' : 'Complete profile'}</p>
                  <p className="text-[10px] font-medium text-gray-400">Payout identity and receipts</p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <input
                  value={profile.draft.firstName}
                  onChange={event => profile.setDraft({ ...profile.draft, firstName: event.target.value })}
                  placeholder="First name"
                  autoComplete="given-name"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-950 outline-none focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.05] dark:text-white"
                />
                <input
                  value={profile.draft.lastName}
                  onChange={event => profile.setDraft({ ...profile.draft, lastName: event.target.value })}
                  placeholder="Last name"
                  autoComplete="family-name"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-950 outline-none focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.05] dark:text-white"
                />
                <div className="truncate rounded-xl border border-gray-200 bg-gray-100 px-3 py-2.5 text-xs font-medium text-gray-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-400">{email}</div>
              </div>

              {profile.error && <p className="mt-3 text-xs font-semibold text-red-600 dark:text-red-300">{profile.error}</p>}
              <button
                type="button"
                onClick={() => void save()}
                disabled={profile.busy || !profile.draft.firstName.trim() || !profile.draft.lastName.trim()}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-gray-950 px-4 py-3 text-xs font-bold text-white transition active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-gray-950"
              >
                {profile.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
                {profile.busy ? 'Saving profile' : 'Save changes'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
