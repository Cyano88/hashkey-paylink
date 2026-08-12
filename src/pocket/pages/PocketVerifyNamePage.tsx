import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Loader2, Lock } from '../components/PocketIcons'
import PocketFlowHeader from '../components/PocketFlowHeader'
import PocketLoadingState from '../components/PocketLoadingState'
import PocketSelect from '../components/PocketSelect'
import { readPocketBankInstitutions, verifyPocketBankAccount } from '../api/pocketBankClient'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketProfile from '../hooks/usePocketProfile'
import { POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'

export default function PocketVerifyNamePage() {
  const navigate = useNavigate()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const profile = usePocketProfile({ authenticated, email, getAccessToken })
  const [institutions, setInstitutions] = useState<Array<{ code: string; name: string }>>([])
  const [bankCode, setBankCode] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [resolvedName, setResolvedName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lastResolutionKey = useRef('')
  const bankName = institutions.find(item => item.code === bankCode)?.name ?? ''
  const locked = profile.profile?.nameStatus === 'bank_resolved'
  const canResolve = Boolean(bankCode && /^\d{10}$/.test(accountNumber))
  const options = useMemo(() => institutions.map(item => ({ value: item.code, label: item.name })), [institutions])

  useEffect(() => {
    let current = true
    setBusy(true)
    readPocketBankInstitutions()
      .then(data => { if (current) setInstitutions(data.institutions) })
      .catch(reason => { if (current) setError(reason instanceof Error ? reason.message : 'Could not load banks.') })
      .finally(() => { if (current) setBusy(false) })
    return () => { current = false }
  }, [])

  const resolve = async () => {
    if (!canResolve) return
    setBusy(true)
    setError('')
    setResolvedName('')
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new Error('Sign in again to verify your name.')
      const result = await verifyPocketBankAccount({ accessToken, request: { bank_code: bankCode, bank_name: bankName, account_number: accountNumber } })
      setResolvedName(result.account_name.trim())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Account verification failed.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!canResolve || busy || resolvedName || locked) return
    const resolutionKey = `${bankCode}:${accountNumber}`
    if (lastResolutionKey.current === resolutionKey) return
    lastResolutionKey.current = resolutionKey
    const timer = window.setTimeout(() => { void resolve() }, 250)
    return () => window.clearTimeout(timer)
  }, [accountNumber, bankCode, busy, locked, resolvedName]) // eslint-disable-line react-hooks/exhaustive-deps

  const confirm = async () => {
    if (!resolvedName) return
    setBusy(true)
    setError('')
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new Error('Sign in again to confirm your name.')
      const result = await verifyPocketBankAccount({ accessToken, request: { bank_code: bankCode, bank_name: bankName, account_number: accountNumber, confirm_profile_name: true } })
      if (result.account_name.trim().toLocaleUpperCase() !== resolvedName.toLocaleUpperCase()) throw new Error('The bank returned a different name. Resolve the account again.')
      await profile.reload()
      navigate(POCKET_BASE_PATH + POCKET_ROUTES.profile, { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not confirm your verified name.')
    } finally {
      setBusy(false)
    }
  }

  if (!profile.loaded) return <PocketLoadingState active="profile" />
  return <div className="fixed inset-0 z-[45] overflow-y-auto bg-[#F5F5F7] text-gray-950 dark:bg-[#0A0A0A] dark:text-white">
    <main className="mx-auto min-h-full w-full max-w-[480px] px-5 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
      <PocketFlowHeader title="Verified name" onBack={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.profile)} />
      {locked ? <section className="mt-7 rounded-[26px] bg-white p-6 text-center shadow-sm dark:bg-white/[0.05]">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10"><Lock className="h-5 w-5" /></span>
        <p className="mt-4 text-lg font-black">{profile.profile?.resolvedName}</p>
        <p className="mt-2 text-xs leading-5 text-gray-500">Your bank-verified name is locked. Contact support if a legal-name correction is required.</p>
      </section> : <section className="mt-7 space-y-5 rounded-[26px] bg-white p-5 shadow-sm dark:bg-white/[0.05]">
        <div><p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Most-used bank</p><PocketSelect value={bankCode} options={options} onChange={value => { lastResolutionKey.current = ''; setBankCode(String(value)); setResolvedName(''); setError('') }} ariaLabel="Select bank" /></div>
        <label className="block"><span className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Account number</span><input value={accountNumber} onChange={event => { lastResolutionKey.current = ''; setAccountNumber(event.target.value.replace(/\D/g, '').slice(0, 10)); setResolvedName(''); setError('') }} inputMode="numeric" placeholder="10-digit account number" className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-4 text-base font-bold outline-none focus:border-gray-500 dark:border-white/10 dark:bg-white/[0.04]" /></label>
        {busy && canResolve && !resolvedName ? <div className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-xs font-medium text-gray-500 dark:border-white/10 dark:bg-white/[0.04]"><Loader2 className="h-4 w-4 animate-spin" />Resolving account name</div> : resolvedName ? <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white p-4 shadow-sm dark:border-emerald-400/20 dark:from-emerald-400/10 dark:to-white/[0.03]"><div className="flex items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"><Check className="h-4 w-4 stroke-[2.5]" /></span><span><span className="block text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-600">Account name</span><span className="mt-0.5 block text-base font-semibold tracking-tight">{resolvedName}</span></span></div><p className="mt-3 text-xs leading-5 text-gray-600 dark:text-gray-300">Confirm only if this is your legal name. After confirmation, your verified name is permanently locked and changes require support verification.</p><button type="button" onClick={() => void confirm()} disabled={busy} className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-gray-950 text-sm font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Confirm and lock</button></div> : <p className="text-center text-xs leading-5 text-gray-400">The account name will resolve automatically after you enter all 10 digits.</p>}
        {error && <p className="rounded-2xl bg-red-50 p-3 text-xs font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-200">{error}</p>}
      </section>}
    </main>
  </div>
}
