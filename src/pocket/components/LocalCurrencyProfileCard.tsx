import { CheckCheck, ChevronDown, Loader2, Mail, UserRound } from 'lucide-react'
import { PrivyConnectButton } from '../../lib/PrivyConnectButton'
import type { LocalCurrencyProfile } from '../models/localCurrencyProfile'

export type { LocalCurrencyProfile } from '../models/localCurrencyProfile'

export function LocalCurrencySignInGate({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200">
          <Mail className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-950 dark:text-white">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{body}</p>
        </div>
      </div>
      <PrivyConnectButton
        loginOptions={{ loginMethods: ['email'] }}
        logoutOnAuthenticated={false}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-black active:scale-[0.98] disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100"
      >
        <Mail className="h-4 w-4" />
        Sign in to continue
      </PrivyConnectButton>
      <p className="mt-3 text-center text-[11px] font-medium leading-relaxed text-gray-400 dark:text-gray-500">
        Sign-in saves local currency history, receipts, payout context, and support records.
      </p>
    </div>
  )
}

export function LocalCurrencyProfileCard({
  profile,
  draft,
  email,
  busy,
  error,
  editing,
  bankAccountName,
  title = 'Your payout profile',
  body = 'Used for receipts, payout support, and matching bank payment records.',
  savedFallback = 'Payout profile',
  saveLabel = 'Save payout profile',
  savedBadgeLabel = 'Circle Pocket',
  identityBadgeLabel = 'Circle Pocket',
  onDraftChange,
  onSave,
  onEdit,
  onCancel,
}: {
  profile: LocalCurrencyProfile | null
  draft: LocalCurrencyProfile
  email: string
  busy: boolean
  error: string
  editing: boolean
  bankAccountName?: string
  title?: string
  body?: string
  savedFallback?: string
  saveLabel?: string
  savedBadgeLabel?: string
  identityBadgeLabel?: string
  onDraftChange: (next: LocalCurrencyProfile) => void
  onSave: () => void
  onEdit: () => void
  onCancel: () => void
}) {
  const complete = Boolean(profile?.firstName && profile?.lastName && profile?.email)
  const dirty = Boolean(profile && (
    profile.firstName !== draft.firstName ||
    profile.lastName !== draft.lastName ||
    profile.email !== (email || draft.email)
  ))
  const fullName = `${draft.firstName} ${draft.lastName}`.trim()
  const bankMismatch = Boolean(bankAccountName && fullName && !bankAccountName.toLowerCase().includes(draft.lastName.trim().toLowerCase()))
  const identityEmail = email || draft.email || profile?.email || ''

  if (complete && !editing) {
    const savedName = `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim()
    return (
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Open ${savedFallback.toLowerCase()}`}
        className="group flex w-full items-center gap-3 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white px-3.5 py-3 text-left shadow-sm transition-all hover:border-blue-200 hover:shadow-md active:scale-[0.99] dark:border-blue-400/20 dark:from-blue-400/10 dark:to-white/[0.035] dark:hover:border-blue-300/30"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-white text-blue-600 shadow-sm dark:border-blue-400/20 dark:bg-white/10 dark:text-blue-200">
          <UserRound className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-black text-gray-950 dark:text-white">{savedName || savedFallback}</span>
            <span className="shrink-0 rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-blue-700 dark:border-blue-400/20 dark:bg-white/10 dark:text-blue-200">
              {savedBadgeLabel}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-[11px] font-medium text-gray-500 dark:text-gray-400">{profile?.email}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-gray-400 transition-colors group-hover:text-gray-700 dark:group-hover:text-gray-200">
          Edit
          <ChevronDown className="h-3.5 w-3.5 -rotate-90 transition-transform group-hover:translate-x-0.5" />
        </span>
      </button>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-gray-950 dark:text-white">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{body}</p>
        </div>
        {complete && editing && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] font-bold text-gray-600 transition-all hover:bg-gray-100 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]"
          >
            Cancel
          </button>
        )}
      </div>

      {identityEmail && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 dark:border-blue-400/20 dark:bg-blue-400/10">
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-blue-500 dark:text-blue-300">Signed in as</span>
            <span className="block truncate text-xs font-semibold text-blue-900 dark:text-blue-100">{identityEmail}</span>
          </span>
          <span className="shrink-0 rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:border-blue-400/20 dark:bg-white/10 dark:text-blue-200">
            {identityBadgeLabel}
          </span>
        </div>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">First name</span>
          <input
            value={draft.firstName}
            onChange={event => onDraftChange({ ...draft, firstName: event.target.value })}
            placeholder="First name"
            className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-950 outline-none placeholder:text-gray-300 focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-gray-600 dark:focus:border-white/25"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Last name</span>
          <input
            value={draft.lastName}
            onChange={event => onDraftChange({ ...draft, lastName: event.target.value })}
            placeholder="Last name"
            className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-950 outline-none placeholder:text-gray-300 focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-gray-600 dark:focus:border-white/25"
          />
        </label>
      </div>

      <label className="mt-2 block">
        <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Email</span>
        <input
          value={identityEmail}
          readOnly
          placeholder="Signed-in email"
          className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-100 px-3 py-2 text-sm font-medium text-gray-500 outline-none dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-400"
        />
      </label>

      {bankMismatch && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-relaxed text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
          Bank account name is {bankAccountName}. Make sure this payout account belongs to you or your business.
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300">
          {error}
        </p>
      )}

      {(!complete || dirty) && (
        <button
          type="button"
          onClick={onSave}
          disabled={busy || !draft.firstName.trim() || !draft.lastName.trim() || !(email || draft.email)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-black active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
          {dirty ? 'Save changes' : saveLabel}
        </button>
      )}
    </div>
  )
}
