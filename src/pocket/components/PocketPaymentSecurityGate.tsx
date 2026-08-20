import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Lock, Loader2 } from './PocketIcons'
import { readPocketPaymentSecurity, updatePocketPaymentSecurity, verifyPocketPaymentPin } from '../api/pocketPaymentSecurityClient'
import { POCKET_PAYMENT_APPROVAL_CANCELLED_EVENT, POCKET_PAYMENT_APPROVAL_EVENT, setPocketPaymentApproval } from '../lib/pocketPaymentApproval'
import { disablePocketPaymentBiometrics, enablePocketPaymentBiometrics, pocketPaymentBiometricsAvailable, pocketPaymentBiometricsConfigured, pocketPaymentBiometricsEnabled, readPocketPinWithBiometrics } from '../lib/pocketPaymentBiometrics'
import { POCKET_NATIVE_BACK_EVENT } from '../lib/pocketNativeBack'
import usePocketLightSurface from '../hooks/usePocketLightSurface'

export const POCKET_PIN_RESET_KEY = 'pocket:payment-pin:reset-after-login:v1'
const PAYMENT_SECURITY_CONFIGURED_PREFIX = 'pocket:payment-security:configured:v1:'
type PendingApproval = { resolve(): void; reject(reason?: unknown): void }

function PocketSecuritySurface({ children, scroll = false }: { children: ReactNode; scroll?: boolean }) {
  usePocketLightSurface()
  return (
    <main className={`fixed inset-0 z-[80] flex items-center justify-center bg-[#F5F5F7] px-6 pb-[max(1rem,var(--pocket-safe-bottom))] pt-[max(1rem,var(--pocket-safe-top))] text-gray-950 ${scroll ? 'overflow-y-auto' : ''}`}>
      {children}
    </main>
  )
}

function configuredKey(email: string) { return PAYMENT_SECURITY_CONFIGURED_PREFIX + email.trim().toLowerCase() }
function initialSecurityState(email: string): 'loading' | 'ready' {
  try {
    const configured = localStorage.getItem(configuredKey(email)) === 'true'
    const resetPending = Boolean(localStorage.getItem(POCKET_PIN_RESET_KEY))
    return configured && !resetPending ? 'ready' : 'loading'
  } catch {
    return 'loading'
  }
}
function pendingResetToken() {
  const token = localStorage.getItem(POCKET_PIN_RESET_KEY) ?? ''
  if (token === 'true') {
    localStorage.removeItem(POCKET_PIN_RESET_KEY)
    return ''
  }
  return token
}

function PinFields({ pin, confirm, onPin, onConfirm, disabled }: { pin: string; confirm: string; onPin(value: string): void; onConfirm(value: string): void; disabled: boolean }) {
  const field = 'min-h-14 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 text-center text-xl font-black tracking-[0.35em] outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/[0.06]'
  return <div className='mt-6 space-y-3'>
    <input value={pin} onChange={event => onPin(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode='numeric' type='password' autoComplete='new-password' placeholder='Six-digit PIN' aria-label='New Pocket PIN' disabled={disabled} className={field} />
    <input value={confirm} onChange={event => onConfirm(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode='numeric' type='password' autoComplete='new-password' placeholder='Confirm PIN' aria-label='Confirm Pocket PIN' disabled={disabled} className={field} />
  </div>
}

export default function PocketPaymentSecurityGate({ email, getAccessToken, onInitialStateResolved, children }: { email: string; getAccessToken(): Promise<string | null>; onInitialStateResolved?(): void; children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'error' | 'setup' | 'offer' | 'ready'>(() => initialSecurityState(email))
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [resetting, setResetting] = useState(false)
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [setupPin, setSetupPin] = useState('')
  const [existingPin, setExistingPin] = useState('')
  const [approvalPin, setApprovalPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [biometricsAvailable, setBiometricsAvailable] = useState(false)
  const pending = useRef<PendingApproval | null>(null)

  useEffect(() => {
    let active = true
    setState(initialSecurityState(email))
    void Promise.all([readPocketPaymentSecurity(getAccessToken), pocketPaymentBiometricsAvailable()])
      .then(([security, available]) => {
        if (!active) return
        const reset = Boolean(pendingResetToken())
        if (security.configured) localStorage.setItem(configuredKey(email), 'true')
        else localStorage.removeItem(configuredKey(email))
        setResetting(reset && security.configured)
        setBiometricsAvailable(available)
        setState(!security.configured || reset ? 'setup' : available && !pocketPaymentBiometricsConfigured() ? 'offer' : 'ready')
      })
      .catch(() => {
        if (!active) return
        const configuredOnThisDevice = localStorage.getItem(configuredKey(email)) === 'true'
        const reset = Boolean(pendingResetToken())
        if (configuredOnThisDevice && !reset) {
          // Opening the app may use the last verified non-secret configuration.
          // Every payment still verifies its PIN/biometric approval with the
          // server, so an outage cannot authorize a transaction.
          setState('ready')
          return
        }
        setError('Pocket could not prepare payment security. Check your connection and try again.')
        setState('error')
      })
    return () => { active = false }
  }, [email, getAccessToken, loadAttempt])

  useEffect(() => {
    if (state !== 'loading') onInitialStateResolved?.()
  }, [onInitialStateResolved, state])

  useEffect(() => {
    const request = (raw: Event) => {
      const detail = (raw as CustomEvent<PendingApproval>).detail
      if (!detail || pending.current) return detail?.reject(new Error('Another payment approval is already open.'))
      pending.current = detail
      setApprovalPin('')
      setError('')
      const fallback = () => setApprovalPin(' ')
      if (!pocketPaymentBiometricsEnabled()) return fallback()
      setBusy(true)
      void readPocketPinWithBiometrics(email)
        .then(value => value ? verifyPocketPaymentPin(getAccessToken, value) : Promise.reject(new Error('Use your Pocket PIN.')))
        .then(result => {
          setPocketPaymentApproval(result.approvalToken, result.expiresAt, result.authorization)
          pending.current?.resolve()
          pending.current = null
        })
        .catch(fallback)
        .finally(() => setBusy(false))
    }
    window.addEventListener(POCKET_PAYMENT_APPROVAL_EVENT, request)
    return () => window.removeEventListener(POCKET_PAYMENT_APPROVAL_EVENT, request)
  }, [email, getAccessToken])

  const savePin = async () => {
    if (!/^\d{6}$/.test(pin)) return setError('Create a six-digit Pocket PIN.')
    if (pin !== confirm) return setError('The PINs do not match.')
    setBusy(true); setError('')
    try {
      const resetToken = pendingResetToken()
      await updatePocketPaymentSecurity(getAccessToken, resetting ? { action: 'reset', pin, resetToken } : { action: 'setup', pin })
      localStorage.setItem(configuredKey(email), 'true')
      localStorage.removeItem(POCKET_PIN_RESET_KEY)
      setSetupPin(pin); setPin(''); setConfirm('')
      setState(biometricsAvailable ? 'offer' : 'ready')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Pocket PIN was not saved.') }
    finally { setBusy(false) }
  }

  const approveWithPin = async () => {
    const value = approvalPin.trim()
    if (!/^\d{6}$/.test(value)) return setError('Enter your six-digit Pocket PIN.')
    setBusy(true); setError('')
    try {
      const result = await verifyPocketPaymentPin(getAccessToken, value)
      setPocketPaymentApproval(result.approvalToken, result.expiresAt, result.authorization)
      pending.current?.resolve(); pending.current = null; setApprovalPin('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Payment approval failed.') }
    finally { setBusy(false) }
  }

  const turnOnBiometrics = async () => {
    const value = setupPin || existingPin.trim()
    if (!/^\d{6}$/.test(value)) return setError('Enter your six-digit Pocket PIN.')
    setBusy(true); setError('')
    try {
      if (!setupPin) await verifyPocketPaymentPin(getAccessToken, value)
      await enablePocketPaymentBiometrics(email, value)
      setExistingPin('')
      setSetupPin('')
      setState('ready')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Biometrics were not enabled.') }
    finally { setBusy(false) }
  }

  const cancelApproval = () => {
    pending.current?.reject(new Error('Payment approval was cancelled.'))
    pending.current = null; setApprovalPin(''); setError('')
    window.dispatchEvent(new Event(POCKET_PAYMENT_APPROVAL_CANCELLED_EVENT))
  }

  useEffect(() => {
    const handleNativeBack = (event: Event) => {
      if (!pending.current || approvalPin === '') return
      event.preventDefault()
      if (!busy) cancelApproval()
    }
    window.addEventListener(POCKET_NATIVE_BACK_EVENT, handleNativeBack)
    return () => window.removeEventListener(POCKET_NATIVE_BACK_EVENT, handleNativeBack)
  }, [approvalPin, busy])

  if (state === 'loading') return <PocketSecuritySurface><Loader2 className='h-6 w-6 animate-spin text-blue-600' /></PocketSecuritySurface>
  if (state === 'error') return <PocketSecuritySurface>
    <section className='w-full max-w-[390px] rounded-[30px] bg-white p-7 text-center shadow-xl dark:bg-[#17181c]'>
      <h1 className='text-xl font-black'>Payment security needs attention</h1>
      <p className='mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400'>{error}</p>
      <button type='button' onClick={() => { setError(''); setState('loading'); setLoadAttempt(value => value + 1) }} className='mt-5 min-h-14 w-full rounded-full bg-gray-950 text-sm font-bold text-white dark:bg-white dark:text-gray-950'>Try again</button>
    </section>
  </PocketSecuritySurface>
  if (state === 'setup') return <PocketSecuritySurface scroll>
    <section className='w-full max-w-[390px] rounded-[30px] bg-white p-7 text-center shadow-xl dark:bg-[#17181c]'>
      <span className='mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-400/10'><Lock className='h-6 w-6' /></span>
      <h1 className='mt-5 text-xl font-black'>{resetting ? 'Reset Pocket PIN' : 'Create your Pocket PIN'}</h1>
      <p className='mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400'>{resetting ? 'Your sign-in was verified. Choose a new PIN for payments.' : 'Use this six-digit PIN whenever fingerprint or face approval is unavailable.'}</p>
      <PinFields pin={pin} confirm={confirm} onPin={setPin} onConfirm={setConfirm} disabled={busy} />
      {error && <p className='mt-3 text-xs font-semibold text-red-500'>{error}</p>}
      <button type='button' onClick={() => void savePin()} disabled={busy || pin.length !== 6 || confirm.length !== 6} className='mt-5 min-h-14 w-full rounded-full bg-gray-950 text-sm font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950'>{busy ? 'Saving PIN…' : 'Continue'}</button>
    </section>
  </PocketSecuritySurface>
  if (state === 'offer') return <PocketSecuritySurface scroll>
    <section className='w-full max-w-[390px] rounded-[30px] bg-white p-7 text-center shadow-xl dark:bg-[#17181c]'>
      <span className='mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-400/10'><Lock className='h-6 w-6' /></span>
      <h1 className='mt-5 text-xl font-black'>Faster payment approval</h1><p className='mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400'>{setupPin ? 'Use fingerprint or face first. Your Pocket PIN remains available as fallback.' : 'Confirm your Pocket PIN once, then use fingerprint or face for payments on this phone.'}</p>
      {!setupPin && <input autoFocus value={existingPin} onChange={event => setExistingPin(event.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={event => { if (event.key === 'Enter') void turnOnBiometrics() }} inputMode='numeric' type='password' autoComplete='current-password' placeholder='Six-digit Pocket PIN' aria-label='Pocket PIN' disabled={busy} className='mt-6 min-h-14 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 text-center text-xl font-black tracking-[0.35em] outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/[0.06]' />}
      {error && <p className='mt-3 text-xs font-semibold text-red-500'>{error}</p>}
      <button type='button' disabled={busy || (!setupPin && existingPin.length !== 6)} onClick={() => void turnOnBiometrics()} className='mt-6 min-h-14 w-full rounded-full bg-gray-950 text-sm font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950'>{busy ? 'Turning on…' : setupPin ? 'Use fingerprint or face' : 'Verify PIN and enable'}</button>
      <button type='button' disabled={busy} onClick={() => { setBusy(true); setError(''); void disablePocketPaymentBiometrics(email).then(() => setState('ready')).catch(() => setError('Pocket could not save this choice. Try again.')).finally(() => setBusy(false)) }} className='mt-2 min-h-12 w-full text-sm font-bold text-gray-500'>Use PIN only</button>
    </section>
  </PocketSecuritySurface>

  return <>{children}{pending.current && approvalPin !== '' && <div className='fixed inset-0 z-[90] flex items-end justify-center bg-black/45 px-4 pb-[calc(1rem+var(--pocket-safe-bottom))] pt-[var(--pocket-safe-top)] sm:items-center'>
    <section className='w-full max-w-[390px] rounded-[28px] bg-white p-6 text-center text-gray-950 shadow-2xl dark:bg-[#17181c] dark:text-white'>
      <h2 className='text-lg font-black'>Enter Pocket PIN</h2><p className='mt-2 text-xs leading-5 text-gray-500'>Approve this payment with your six-digit PIN.</p>
      <input autoFocus value={approvalPin.trim()} onChange={event => setApprovalPin(event.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={event => { if (event.key === 'Enter') void approveWithPin() }} inputMode='numeric' type='password' autoComplete='current-password' className='mt-5 min-h-14 w-full rounded-2xl bg-gray-100 px-4 text-center text-xl font-black tracking-[0.35em] outline-none focus:ring-2 focus:ring-blue-500 dark:bg-white/[0.07]' />
      {error && <p className='mt-3 text-xs font-semibold text-red-500'>{error}</p>}
      <button type='button' onClick={() => void approveWithPin()} disabled={busy || approvalPin.trim().length !== 6} className='mt-5 min-h-14 w-full rounded-full bg-gray-950 text-sm font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950'>{busy ? 'Confirming…' : 'Confirm payment'}</button>
      <button type='button' onClick={cancelApproval} disabled={busy} className='mt-2 min-h-11 w-full text-sm font-bold text-gray-500'>Cancel</button>
    </section>
  </div>}</>
}
