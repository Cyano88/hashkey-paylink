import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Banknote, Bell, Check, ChevronRight, Coins, Copy, Loader2, Lock, LogOut, MessageCircle, Pencil, Trash, TrendingUp } from '../components/PocketIcons'
import PocketFlowHeader from '../components/PocketFlowHeader'
import PocketAvatar from '../components/PocketAvatar'
import PocketBottomNav, { type PocketNavTab } from '../components/PocketBottomNav'
import PocketLoadingState from '../components/PocketLoadingState'
import PocketThemeToggle from '../components/PocketThemeToggle'
import PocketDisplayCurrencyPicker from '../components/PocketDisplayCurrencyPicker'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketStockCurrency from '../hooks/usePocketStockCurrency'
import usePocketProfile from '../hooks/usePocketProfile'
import { resetPocketSessionSplash } from '../hooks/usePocketSessionSplash'
import { POCKET_BASE_PATH, POCKET_ROUTES, pocketPathFor } from '../lib/pocketRoutes'
import { disablePocketQuickApproval } from '../lib/pocketQuickApproval'
import { isXStocksPath, xStockPath } from '../lib/pocketRail'
import { cn } from '../../lib/utils'
import PocketProfileFeaturePage, { type PocketProfileFeature } from '../components/PocketProfileFeaturePage'
import { unregisterPocketPushDevice } from '../lib/pocketPushPreference'
import { POCKET_NATIVE_BACK_EVENT } from '../lib/pocketNativeBack'
import { disablePocketPaymentBiometrics } from '../lib/pocketPaymentBiometrics'
import { POCKET_PIN_RESET_KEY } from '../components/PocketPaymentSecurityGate'
import { deletePocketSecureWalletSession } from '../lib/pocketSecureWalletSession'
import { beginPocketPaymentPinReset } from '../api/pocketPaymentSecurityClient'
import { clearPocketAccountOperationState } from '../lib/pocketAccountState'
import { deletePocketAccount } from '../api/pocketAccountClient'

export default function PocketProfilePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const stocks = isXStocksPath(location.pathname)
  const returnHome = () => navigate(stocks ? xStockPath('portfolio') : POCKET_BASE_PATH + POCKET_ROUTES.home, { replace: true })
  const { authenticated, email, getAccessToken, logout: identityLogout } = usePocketIdentity()
  const profile = usePocketProfile({ authenticated, email, getAccessToken })
  const stockCurrency = usePocketStockCurrency(email)
  const displayCurrency = stocks ? stockCurrency.currency : profile.profile?.displayCurrency
  const [editing, setEditing] = useState(() => new URLSearchParams(window.location.search).get('edit') === 'id')
  const [currencyOpen, setCurrencyOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [feature, setFeature] = useState<PocketProfileFeature | null>(() => {
    const requested = new URLSearchParams(window.location.search).get('feature')
    if (stocks && requested !== 'security' && requested !== 'kyc') return null
    return requested === 'rates' || requested === 'limits' || requested === 'notifications' || requested === 'security' || requested === 'wallet-setup' || requested === 'kyc' ? requested : null
  })
  const quickApprovalAvailable = false
  const quickApprovalBusy = false
  const quickApprovalEnabled = false
  const quickApprovalError = ''
  const toggleQuickApproval = () => setFeature('security')
  const [copied, setCopied] = useState(false)
  const logout = async () => {
    await Promise.all([
      disablePocketPaymentBiometrics(email),
      disablePocketQuickApproval(email),
      deletePocketSecureWalletSession(email),
    ])
    await identityLogout()
  }
  useEffect(() => { if (profile.loaded && editing) profile.edit() }, [profile.loaded]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const handleNativeBack = (rawEvent: Event) => {
      if (deleteOpen) {
        rawEvent.preventDefault()
        if (!deleteBusy) setDeleteOpen(false)
      } else if (feature) {
        rawEvent.preventDefault()
        setFeature(null)
      } else if (currencyOpen) {
        rawEvent.preventDefault()
        setCurrencyOpen(false)
      } else if (editing) {
        rawEvent.preventDefault()
        setEditing(false)
      } else {
        rawEvent.preventDefault()
        returnHome()
      }
    }
    window.addEventListener(POCKET_NATIVE_BACK_EVENT, handleNativeBack)
    return () => window.removeEventListener(POCKET_NATIVE_BACK_EVENT, handleNativeBack)
  }, [currencyOpen, deleteBusy, deleteOpen, editing, feature, stocks, navigate])
  if (!profile.loaded || profile.busy && !profile.profile) return <PocketLoadingState active="home" />
  const current = profile.profile
  const copyId = async () => { if (!current?.pocketId) return; await navigator.clipboard.writeText(current.pocketId); setCopied(true); window.setTimeout(() => setCopied(false), 1200) }
  const save = async () => { if (await profile.save()) setEditing(false) }
  const signOut = async (resetPin = false) => {
    if (resetPin) {
      const reset = await beginPocketPaymentPinReset(getAccessToken)
      localStorage.setItem(POCKET_PIN_RESET_KEY, reset.resetToken)
    }
    resetPocketSessionSplash()
    await unregisterPocketPushDevice(getAccessToken).catch(() => false)
    await Promise.all([
      disablePocketPaymentBiometrics(email),
      disablePocketQuickApproval(email),
      deletePocketSecureWalletSession(email),
    ])
    clearPocketAccountOperationState()
    await logout()
    navigate(POCKET_BASE_PATH || POCKET_ROUTES.root)
  }
  const selectNav = (tab: PocketNavTab) => navigate(POCKET_BASE_PATH + (tab === 'profile' ? POCKET_ROUTES.profile : tab === 'bills' ? pocketPathFor({ section: 'bills', view: 'overview' }) : tab === 'activity' ? POCKET_ROUTES.activity : POCKET_ROUTES.home))
  const confirmAccountDeletion = async () => {
    if (deleteConfirmation !== 'DELETE' || deleteBusy) return
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await deletePocketAccount(getAccessToken, deleteConfirmation)
      resetPocketSessionSplash()
      await Promise.all([
        disablePocketPaymentBiometrics(email),
        disablePocketQuickApproval(email),
        deletePocketSecureWalletSession(email),
      ])
      clearPocketAccountOperationState()
      await identityLogout().catch(() => undefined)
      navigate(POCKET_BASE_PATH || POCKET_ROUTES.root, { replace: true })
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : 'Pocket could not delete your account.')
      setDeleteBusy(false)
    }
  }
  if (deleteOpen) return <div className="fixed inset-0 z-[70] overflow-y-auto bg-[#F5F5F7] text-gray-950 dark:bg-black dark:text-white">
    <main className="mx-auto flex min-h-full w-full max-w-[462px] flex-col px-4 pb-[max(2rem,var(--pocket-safe-bottom))] pt-[calc(var(--pocket-safe-top)+1rem)]">
      <PocketFlowHeader centered title="Delete account" onBack={() => { if (!deleteBusy) setDeleteOpen(false) }} />
      <section className="flex flex-1 flex-col pt-8">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300"><Trash className="h-6 w-6" /></span>
        <h1 className="mt-6 text-3xl font-black tracking-[-0.04em]">Delete your Pocket account?</h1>
        <p className="mt-3 text-sm font-medium leading-6 text-gray-500 dark:text-gray-400">This permanently removes your profile, Pocket ID association, saved wallet links, push registrations, Pocket PIN, and Agent Hash account memory.</p>
        <div className="mt-6 rounded-[22px] border border-gray-200 bg-gray-50 p-4 text-xs font-medium leading-5 text-gray-600 dark:border-[#262626] dark:bg-[#171717] dark:text-gray-300">
          Completed payments are not reversed. Transaction, payout, bill, receipt, reconciliation, dispute, fraud-prevention, security, and accounting records may be retained where required. Public blockchain records cannot be erased.
        </div>
        <label className="mt-8 text-[10px] font-black uppercase tracking-[0.18em] text-gray-400" htmlFor="delete-pocket-confirmation">Type DELETE to confirm</label>
        <input id="delete-pocket-confirmation" value={deleteConfirmation} onChange={event => setDeleteConfirmation(event.target.value.toUpperCase().slice(0, 6))} autoCapitalize="characters" autoCorrect="off" disabled={deleteBusy} className="mt-2 min-h-14 rounded-2xl border border-gray-200 bg-white px-4 text-base font-black tracking-[0.16em] outline-none focus:border-red-500 dark:border-[#262626] dark:bg-[#121212] dark:shadow-none" />
        {deleteError && <p className="mt-3 text-xs font-semibold leading-5 text-red-600 dark:text-red-300" role="alert">{deleteError}</p>}
        <button type="button" onClick={() => void confirmAccountDeletion()} disabled={deleteConfirmation !== 'DELETE' || deleteBusy} className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-red-600 px-4 text-sm font-bold text-white disabled:opacity-40">
          {deleteBusy && <Loader2 className="h-4 w-4" />}{deleteBusy ? 'Deleting account' : 'Delete account permanently'}
        </button>
        <a href="/docs/account-deletion" target="_blank" rel="noreferrer" className="mt-5 text-center text-xs font-bold text-gray-500 underline underline-offset-4">Account deletion and retention details</a>
      </section>
    </main>
  </div>
  if (feature) return <PocketProfileFeaturePage stocks={stocks} feature={feature} onBack={() => setFeature(null)} getAccessToken={getAccessToken} email={email} onResetPin={() => signOut(true)} />
  if (currencyOpen) return <PocketDisplayCurrencyPicker stocks={stocks} current={displayCurrency ?? 'USDC'} busy={stocks ? false : profile.busy} error={stocks ? '' : profile.error} onBack={() => setCurrencyOpen(false)} onSelect={async currency => stocks ? stockCurrency.save(currency) : Boolean(await profile.saveDisplayCurrency(currency))} />
  return <div className="fixed inset-0 z-[45] overflow-y-auto bg-[#F5F5F7] text-gray-950 dark:bg-black dark:text-white">
    <main className="mx-auto flex min-h-full w-full max-w-[462px] flex-col px-4 pb-[calc(7.5rem+var(--pocket-safe-bottom))] pt-[calc(var(--pocket-safe-top)+1rem)]">
      <PocketFlowHeader centered title="Profile" onBack={() => editing ? setEditing(false) : returnHome()} />
      <section className="flex flex-1 flex-col pt-8">
        <div className="text-center"><PocketAvatar avatarId={editing ? profile.draft.avatarId : current?.avatarId} className="mx-auto h-24 w-24" /><p className="mt-4 text-xl font-black tracking-[-0.03em]">{current?.resolvedName || 'Pocket profile'}</p><p className="mt-1 text-xs font-medium text-gray-400">{email}</p></div>
        {editing ? <div className="mt-8 space-y-5">
          <div><label className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Pocket ID</label><input value={profile.draft.pocketId} onChange={e => profile.setDraft({ ...profile.draft, pocketId: e.target.value.replace(/\D/g, '').slice(0, 12) })} inputMode="numeric" className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-4 text-base font-bold tabular-nums outline-none focus:border-gray-500 dark:border-[#262626] dark:bg-[#121212] dark:shadow-none" /><p className="mt-2 text-[10px] leading-relaxed text-gray-400">6 to 12 digits. Your original Pocket number stays reserved to you.</p></div>
          {profile.error && <p className="text-xs font-semibold text-red-600 dark:text-red-300">{profile.error}</p>}
          <button type="button" onClick={() => void save()} disabled={profile.busy || !/^\d{6,12}$/.test(profile.draft.pocketId)} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-gray-950 text-sm font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">{profile.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save profile</button>
        </div> : <div className="mt-8 space-y-3">
          <button type="button" onClick={() => void copyId()} className="flex w-full items-center gap-3 rounded-[22px] bg-white p-4 text-left shadow-sm dark:bg-[#121212] dark:shadow-none"><span className="min-w-0 flex-1"><span className="block text-[9px] font-black uppercase tracking-[0.18em] text-gray-400">Pocket ID</span><span className="mt-1 block text-base font-black tabular-nums">{current?.pocketId}</span></span><Copy className="h-4 w-4 text-gray-400" />{copied && <span className="text-xs font-bold text-emerald-500">Copied</span>}</button>
          <button type="button" onClick={() => navigate(stocks ? xStockPath('verify-name') : POCKET_BASE_PATH + POCKET_ROUTES.verifyName, { state: { bankVerificationFrom: location.pathname + location.search } })} className="flex w-full items-center gap-3 rounded-[22px] bg-white p-4 text-left shadow-sm dark:bg-[#121212] dark:shadow-none"><span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-gray-400">Bank account name</span><span className="mt-1 block text-sm font-bold">{current?.resolvedName || 'Verify bank name'}</span></span><ChevronRight className="h-4 w-4 text-gray-400" /></button>
          <button type="button" onClick={() => setFeature('kyc')} className="flex w-full items-center gap-3 rounded-[22px] bg-white p-4 text-left dark:bg-[#121212]"><span className="min-w-0 flex-1"><span className="block text-[9px] font-black uppercase tracking-[0.18em] text-gray-400">Identity verification</span><span className="mt-1 block text-sm font-bold">Verify with Smile ID</span></span><ChevronRight className="h-4 w-4 text-gray-400" /></button>
          {!stocks && <button type="button" onClick={() => setFeature('wallet-setup')} className="flex min-h-16 w-full items-center gap-3 rounded-[22px] bg-white p-4 text-left shadow-sm dark:bg-[#121212] dark:shadow-none"><span className="min-w-0 flex-1"><span className="block text-[9px] font-black uppercase tracking-[0.18em] text-gray-400">Wallets</span><span className="mt-1 block text-sm font-bold">Wallet update</span></span><ChevronRight className="h-4 w-4 text-gray-400" /></button>}
          <div className="rounded-[22px] bg-white p-4 shadow-sm dark:bg-[#121212] dark:shadow-none"><p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-gray-400">Email<Lock className="h-3 w-3" /></p><p className="mt-1 truncate text-sm font-bold">{email}</p></div>
          {!stocks && <div className="flex min-h-16 items-center gap-3 rounded-[22px] bg-white p-4 shadow-sm dark:bg-[#121212] dark:shadow-none"><span className="min-w-0 flex-1"><span className="block text-[9px] font-black uppercase tracking-[0.18em] text-gray-400">Appearance</span><span className="mt-1 block text-sm font-bold">Light or dark theme</span></span><PocketThemeToggle /></div>}
          <button type="button" onClick={() => setCurrencyOpen(true)} className="flex min-h-16 w-full items-center gap-3 rounded-[22px] bg-white p-4 text-left shadow-sm dark:bg-[#121212] dark:shadow-none">
            <Coins className="h-5 w-5 text-gray-500 dark:text-gray-300" />
            <span className="min-w-0 flex-1"><span className="block text-[9px] font-black uppercase tracking-[0.18em] text-gray-400">Display currency</span><span className="mt-1 block text-sm font-bold">{displayCurrency === 'NGN' ? 'Nigeria (NGN)' : stocks ? 'Default (USD)' : 'Default (USDC)'}</span></span>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </button>
          {!stocks && <button type='button' onClick={() => setFeature('rates')} className='flex min-h-16 w-full items-center gap-3 rounded-[22px] bg-white p-4 text-left shadow-sm dark:bg-[#121212] dark:shadow-none'><TrendingUp className='h-5 w-5 text-gray-500 dark:text-gray-300' /><span className='min-w-0 flex-1'><span className='block text-[9px] font-black uppercase tracking-[0.18em] text-gray-400'>Rates</span><span className='mt-1 block text-sm font-bold'>USDC to local currency</span></span><ChevronRight className='h-4 w-4 text-gray-400' /></button>}
          {!stocks && <button type='button' onClick={() => setFeature('limits')} className='flex min-h-16 w-full items-center gap-3 rounded-[22px] bg-white p-4 text-left shadow-sm dark:bg-[#121212] dark:shadow-none'><Banknote className='h-5 w-5 text-gray-500 dark:text-gray-300' /><span className='min-w-0 flex-1'><span className='block text-[9px] font-black uppercase tracking-[0.18em] text-gray-400'>Spending limits</span><span className='mt-1 block text-sm font-bold'>Bank, Bills, and USDC limits</span></span><ChevronRight className='h-4 w-4 text-gray-400' /></button>}
          <button type='button' onClick={() => stocks ? navigate(xStockPath('notifications')) : setFeature('notifications')} className='flex min-h-16 w-full items-center gap-3 rounded-[22px] bg-white p-4 text-left shadow-sm dark:bg-[#121212] dark:shadow-none'><Bell className='h-5 w-5 text-gray-500 dark:text-gray-300' /><span className='min-w-0 flex-1'><span className='block text-[9px] font-black uppercase tracking-[0.18em] text-gray-400'>Notifications</span><span className='mt-1 block text-sm font-bold'>Alerts and Pocket updates</span></span><ChevronRight className='h-4 w-4 text-gray-400' /></button>
          <button type='button' onClick={() => setFeature('security')} className='flex min-h-16 w-full items-center gap-3 rounded-[22px] bg-white p-4 text-left shadow-sm dark:bg-[#121212] dark:shadow-none'><Lock className='h-5 w-5 text-gray-500 dark:text-gray-300' /><span className='min-w-0 flex-1'><span className='block text-[9px] font-black uppercase tracking-[0.18em] text-gray-400'>Payment security</span><span className='mt-1 block text-sm font-bold'>PIN, fingerprint, or face</span></span><ChevronRight className='h-4 w-4 text-gray-400' /></button>
          {quickApprovalAvailable && <button type="button" onClick={() => void toggleQuickApproval()} disabled={quickApprovalBusy} className="flex min-h-16 w-full items-center gap-3 rounded-[22px] bg-white p-4 text-left shadow-sm disabled:opacity-60 dark:bg-[#121212] dark:shadow-none">
            <Lock className="h-5 w-5 text-gray-500 dark:text-gray-300" />
            <span className="min-w-0 flex-1"><span className="block text-[9px] font-black uppercase tracking-[0.18em] text-gray-400">Pocket unlock</span><span className="mt-1 block text-sm font-bold">{quickApprovalEnabled ? 'Fingerprint or face enabled' : 'Use fingerprint or face'}</span></span>
            <span className={cn('relative h-7 w-12 rounded-full transition-colors', quickApprovalEnabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-white/15')}><span className={cn('absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform', quickApprovalEnabled ? 'translate-x-6' : 'translate-x-1')} /></span>
          </button>}
          {quickApprovalError && <p className="-mt-1 px-2 text-xs font-medium text-red-500" role="status">{quickApprovalError}</p>}
          <button type="button" onClick={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.assistant)} className="flex min-h-16 w-full items-center gap-3 rounded-[22px] bg-white p-4 text-left shadow-sm dark:bg-[#121212] dark:shadow-none">
            <MessageCircle className="h-5 w-5 text-gray-500 dark:text-gray-300" />
            <span className="min-w-0 flex-1"><span className="block text-[9px] font-black uppercase tracking-[0.18em] text-gray-400">Support</span><span className="mt-1 block text-sm font-bold">Chat with Agent Hash</span></span>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </button>
          <button type="button" onClick={() => { setDeleteConfirmation(''); setDeleteError(''); setDeleteOpen(true) }} className="flex min-h-16 w-full items-center gap-3 rounded-[22px] bg-white p-4 text-left shadow-sm dark:bg-[#121212] dark:shadow-none">
            <Trash className="h-5 w-5 text-red-500" />
            <span className="min-w-0 flex-1"><span className="block text-[9px] font-black uppercase tracking-[0.18em] text-red-500">Account</span><span className="mt-1 block text-sm font-bold">Delete account</span></span>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </button>
          <button type="button" onClick={() => { profile.edit(); setEditing(true) }} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-gray-950 text-sm font-bold text-white dark:bg-white dark:text-gray-950"><Pencil className="h-4 w-4" />Edit profile</button>
        </div>}
        {!editing && <button type="button" onClick={() => { resetPocketSessionSplash(); void unregisterPocketPushDevice(getAccessToken).catch(() => false).then(() => disablePocketQuickApproval(email)).then(logout).then(() => navigate(POCKET_BASE_PATH || POCKET_ROUTES.root)) }} className="mt-auto flex min-h-14 w-full items-center justify-center gap-2 pt-10 text-sm font-bold text-red-600 dark:text-red-300"><LogOut className="h-4 w-4" />Sign out</button>}
      </section>
    </main>
    {!editing && <PocketBottomNav active="profile" onSelect={selectNav} />}
  </div>
}
