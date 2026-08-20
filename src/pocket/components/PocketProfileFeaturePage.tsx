import { useEffect, useState } from 'react'
import { ArrowLeft, Bell, Loader2 } from './PocketIcons'
import usePocketFxQuote from '../hooks/usePocketFxQuote'
import { cn } from '../../lib/utils'
import { pocketPushEnabled, setPocketPushEnabled } from '../lib/pocketPushPreference'
import { readPocketBillsLimitUsage, type PocketBillsLimitUsage } from '../api/pocketBillsClient'
import { readPocketBankPayoutLimit, type PocketBankPayoutLimit } from '../api/pocketSpendingLimitsClient'
import { updatePocketPaymentSecurity, verifyPocketPaymentPin } from '../api/pocketPaymentSecurityClient'
import { disablePocketPaymentBiometrics, enablePocketPaymentBiometrics, pocketPaymentBiometricsAvailable, pocketPaymentBiometricsEnabled } from '../lib/pocketPaymentBiometrics'
import { reconnectPocketBaseWallet } from '../controllers/usePocketWalletController'

export type PocketProfileFeature = 'rates' | 'limits' | 'notifications' | 'security'

function ngn(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits }).format(value)
}

function RatesPanel({ fx, currency, onCurrency }: { fx: ReturnType<typeof usePocketFxQuote>; currency: string; onCurrency(value: string): void }) {
  const options = [
    { code: 'NGN', country: 'Nigeria', available: true },
    { code: 'GHS', country: 'Ghana', available: false },
    { code: 'KES', country: 'Kenya', available: false },
  ]
  return <section className='pt-10'>
    <p className='text-[10px] font-black uppercase tracking-[0.18em] text-gray-400'>Direct payout rate</p>
    <div className='mt-3 rounded-[28px] bg-white p-5 shadow-sm dark:bg-white/[0.05]'>
      <div className='flex items-center justify-between border-b border-gray-100 pb-5 dark:border-white/10'>
        <span><span className='block text-[10px] font-bold text-gray-400'>Reference amount</span><strong className='mt-1 block text-2xl'>10 USDC</strong></span>
        <span className='rounded-full bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 dark:bg-blue-400/10 dark:text-blue-300'>USDC</span>
      </div>
      <div className='pt-5'>
        <label htmlFor='pocket-rate-currency' className='text-[10px] font-bold text-gray-400'>Receiver gets</label>
        <select id='pocket-rate-currency' value={currency} onChange={event => onCurrency(event.target.value)} className='mt-2 min-h-12 w-full rounded-2xl bg-gray-50 px-4 text-sm font-bold outline-none dark:bg-white/[0.06]'>
          {options.map(option => <option key={option.code} value={option.code} disabled={!option.available}>{option.country} ({option.code}){option.available ? '' : ' - Coming soon'}</option>)}
        </select>
        {fx.busy && !fx.quote
          ? <p className='mt-6 flex items-center gap-2 text-sm font-bold text-gray-500'><Loader2 className='h-4 w-4 animate-spin' />Loading live rate</p>
          : fx.quote
            ? <><p className='mt-6 text-3xl font-black tracking-[-0.04em]'>{ngn(fx.quote.rate * 10, 2)}</p><p className='mt-2 text-xs font-bold text-gray-500 dark:text-gray-400'>1 USDC = {ngn(fx.quote.rate, 2)}</p></>
            : <p className='mt-6 text-sm font-bold text-red-500'>{fx.error || 'The live rate could not be reached. Tap refresh.'}</p>}
        <p className='mt-2 text-[11px] leading-5 text-gray-400'>{fx.quote?.stale ? 'Last confirmed rate. A fresh quote is requested before payment.' : 'Live sell quote for 10 USDC. Your amount-specific rate is locked when the payout is prepared.'}</p>
        <button type='button' onClick={() => void fx.refresh()} disabled={fx.busy} className='mt-5 min-h-11 w-full rounded-full border border-gray-200 text-xs font-black disabled:opacity-50 dark:border-white/10'>Refresh rate</button>
      </div>
    </div>
  </section>
}

function LimitProgress({ title, used, limit, detail }: { title: string; used: number | null; limit: number; detail: string }) {
  const percent = used !== null && limit > 0 ? Math.min(100, Math.max(0, used / limit * 100)) : 0
  return <article className='rounded-[24px] bg-white p-5 shadow-sm dark:bg-white/[0.05]'>
    <div className='flex items-start justify-between gap-4'>
      <div><h2 className='text-sm font-black'>{title}</h2><p className='mt-1 text-[11px] text-gray-400'>{detail}</p></div>
      <strong className='shrink-0 text-xs'>{ngn(limit)} daily</strong>
    </div>
    <div className='mt-5 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10'><div className='h-full rounded-full bg-blue-600 transition-[width]' style={{ width: `${percent}%` }} /></div>
    <div className='mt-3 flex justify-between text-[11px]'>
      {used === null
        ? <span className='font-bold text-gray-400'>Today's usage is unavailable</span>
        : <><span className='font-bold'>{ngn(used)} used</span><span className='text-gray-400'>{ngn(Math.max(0, limit - used))} remaining</span></>}
    </div>
  </article>
}

function LimitsPanel({ usage, bank, busy, error, onRefresh }: { usage: PocketBillsLimitUsage | null; bank: PocketBankPayoutLimit | null; busy: boolean; error: string; onRefresh(): void }) {
  const airtime = usage?.airtime ?? { perPaymentNgn: 50_000, dailyLimitNgn: 200_000, usedTodayNgn: null }
  const otherBills = usage?.otherBills ?? { dailyLimitNgn: 1_000_000, usedTodayNgn: null }
  return <section className='pt-10'>
    <p className='text-xs leading-5 text-gray-500 dark:text-gray-400'>Your Pocket limits</p>
    <div className='mt-5 space-y-3'>
      {busy && !usage && <div className='flex items-center gap-2 rounded-[24px] bg-white p-5 text-sm font-bold text-gray-500 dark:bg-white/[0.05]'><Loader2 className='h-4 w-4 animate-spin' />Loading today's usage</div>}
      {bank && <article className='rounded-[24px] bg-white p-5 shadow-sm dark:bg-white/[0.05]'>
        <p className='text-[10px] font-black uppercase tracking-[0.18em] text-gray-400'>Bank payout</p>
        <p className='mt-2 text-2xl font-black'>{new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(bank.maxUsdc)} USDC</p>
        <p className='mt-1 text-xs text-gray-400'>About {ngn(bank.ngnEquivalent)} currently</p>
        <p className='mt-3 text-[11px] leading-5 text-gray-400'>Current available limit. Rechecked before payout.</p>
      </article>}
      <LimitProgress title='Airtime' used={airtime.usedTodayNgn} limit={airtime.dailyLimitNgn} detail={`Up to ${ngn(airtime.perPaymentNgn)} per payment`} />
      <LimitProgress title='Other Bills' used={otherBills.usedTodayNgn} limit={otherBills.dailyLimitNgn} detail='Data, TV, and electricity combined' />
      <p className='px-1 text-[11px] leading-5 text-gray-400'>Resets daily at midnight, Lagos time. Product-specific limits may be lower.</p>
      {!usage && !busy && <div className='rounded-[20px] bg-amber-50 p-4 dark:bg-amber-400/10'>
        <p className='text-xs font-bold text-amber-800 dark:text-amber-200'>{error || `Today's usage could not be refreshed.`}</p>
        <button type='button' onClick={onRefresh} className='mt-3 min-h-9 rounded-full border border-amber-200 px-4 text-[11px] font-black dark:border-amber-400/20'>Try again</button>
      </div>}
    </div>
  </section>
}

function NotificationsPanel({ enabled, onChange }: { enabled: boolean; onChange(value: boolean): void }) {
  return <section className='pt-10'>
    <div className='rounded-[26px] bg-white p-5 shadow-sm dark:bg-white/[0.05]'>
      <div className='flex items-center gap-3'>
        <span className='flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300'><Bell className='h-5 w-5' /></span>
        <span className='min-w-0 flex-1'><strong className='block text-sm'>Notifications</strong><span className='mt-1 block text-xs text-gray-500 dark:text-gray-400'>Payments, service status, and important Pocket updates</span></span>
        <label className={cn('relative h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors', enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-white/15')}>
          <input type='checkbox' role='switch' aria-label='Notifications' checked={enabled} onChange={event => onChange(event.target.checked)} className='peer sr-only' />
          <span className={cn('pointer-events-none absolute left-0 top-1 block h-5 w-5 rounded-full bg-white shadow-sm transition-transform', enabled ? 'translate-x-6' : 'translate-x-1')} />
        </label>
      </div>
    </div>
    <p className='mt-4 px-1 text-[11px] leading-5 text-gray-400'>{enabled ? 'Enabled on this device. Android notification permission must also remain allowed.' : 'Disabled on this device. Pocket will stop registering this device for notifications.'}</p>
  </section>
}

function SecurityPanel({ email, getAccessToken, onResetPin }: { email: string; getAccessToken(): Promise<string | null>; onResetPin(): Promise<void> }) {
  const [currentPin, setCurrentPin] = useState('')
  const [biometricPin, setBiometricPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [biometrics, setBiometrics] = useState(pocketPaymentBiometricsEnabled)
  const [biometricsAvailable, setBiometricsAvailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => { void pocketPaymentBiometricsAvailable().then(setBiometricsAvailable) }, [])
  const clean = (value: string) => value.replace(/\D/g, '').slice(0, 6)
  const changePin = async () => {
    if (!/^\d{6}$/.test(currentPin) || !/^\d{6}$/.test(newPin)) return setError('Enter your current and new six-digit PINs.')
    if (newPin !== confirmPin) return setError('The new PINs do not match.')
    setBusy(true); setError(''); setNotice('')
    try {
      await updatePocketPaymentSecurity(getAccessToken, { action: 'change', currentPin, newPin })
      if (biometrics) await enablePocketPaymentBiometrics(email, newPin)
      setCurrentPin(''); setNewPin(''); setConfirmPin(''); setNotice('Pocket PIN changed.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Pocket PIN was not changed.') }
    finally { setBusy(false) }
  }
  const toggleBiometrics = async () => {
    setBusy(true); setError(''); setNotice('')
    try {
      if (biometrics) {
        await disablePocketPaymentBiometrics(email); setBiometrics(false); setNotice('Payments will use your Pocket PIN.')
      } else {
        if (!/^\d{6}$/.test(biometricPin)) throw new Error('Enter your current Pocket PIN to enable fingerprint or face.')
        await verifyPocketPaymentPin(getAccessToken, biometricPin)
        await enablePocketPaymentBiometrics(email, biometricPin)
        setBiometrics(true); setBiometricPin(''); setNotice('Fingerprint or face enabled for payments.')
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Payment approval was not changed.') }
    finally { setBusy(false) }
  }
  const reconnectWallet = async () => {
    setBusy(true); setError(''); setNotice('')
    try {
      await reconnectPocketBaseWallet({ authenticated: true, email, getAccessToken })
      setNotice('Circle wallet session reconnected on this phone.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Circle wallet was not reconnected.') }
    finally { setBusy(false) }
  }
  const resetPin = async () => {
    setBusy(true); setError(''); setNotice('')
    try { await onResetPin() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Pocket PIN reset could not start.') }
    finally { setBusy(false) }
  }
  const inputClass = 'mt-2 min-h-12 w-full rounded-2xl bg-gray-50 px-4 text-center text-base font-black tracking-[0.25em] outline-none focus:ring-2 focus:ring-blue-500 dark:bg-white/[0.06]'
  return <section className='pt-8 space-y-4'>
    <article className='rounded-[26px] bg-white p-5 shadow-sm dark:bg-white/[0.05]'>
      <div className='flex items-center gap-3'><span className='min-w-0 flex-1'><strong className='block text-sm'>Fingerprint or face</strong><span className='mt-1 block text-xs text-gray-500'>{biometrics ? 'Used first for payment approval' : 'Payments use your Pocket PIN'}</span></span>{biometricsAvailable && <label className={cn('relative h-7 w-12 cursor-pointer rounded-full transition-colors', busy && 'pointer-events-none opacity-50', biometrics ? 'bg-blue-600' : 'bg-gray-200 dark:bg-white/15')}><input type='checkbox' role='switch' aria-label='Fingerprint or face' checked={biometrics} onChange={() => void toggleBiometrics()} disabled={busy} className='peer sr-only' /><span className={cn('pointer-events-none absolute left-0 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform', biometrics ? 'translate-x-6' : 'translate-x-1')} /></label>}</div>
      {!biometrics && biometricsAvailable && <><label className='mt-4 block text-[10px] font-black uppercase tracking-[0.16em] text-gray-400'>Current PIN</label><input value={biometricPin} onChange={event => setBiometricPin(clean(event.target.value))} inputMode='numeric' type='password' className={inputClass} /></>}
    </article>
    <article className='rounded-[26px] bg-white p-5 shadow-sm dark:bg-white/[0.05]'>
      <strong className='text-sm'>Change PIN</strong>
      <input value={currentPin} onChange={event => setCurrentPin(clean(event.target.value))} inputMode='numeric' type='password' placeholder='Current PIN' aria-label='Current Pocket PIN' className={inputClass} />
      <input value={newPin} onChange={event => setNewPin(clean(event.target.value))} inputMode='numeric' type='password' placeholder='New PIN' aria-label='New Pocket PIN' className={inputClass} />
      <input value={confirmPin} onChange={event => setConfirmPin(clean(event.target.value))} inputMode='numeric' type='password' placeholder='Confirm new PIN' aria-label='Confirm new Pocket PIN' className={inputClass} />
      <button type='button' onClick={() => void changePin()} disabled={busy || currentPin.length !== 6 || newPin.length !== 6 || confirmPin.length !== 6} className='mt-4 min-h-12 w-full rounded-full bg-gray-950 text-xs font-black text-white disabled:opacity-50 dark:bg-white dark:text-gray-950'>Change PIN</button>
    </article>
    <button type='button' onClick={() => void reconnectWallet()} disabled={busy} className='min-h-12 w-full rounded-full border border-gray-200 text-xs font-black text-gray-700 disabled:opacity-50 dark:border-white/10 dark:text-gray-200'>{busy ? 'Please wait...' : 'Reconnect Circle wallet'}</button>
    {error && <p className='px-2 text-xs font-semibold text-red-500'>{error}</p>}{notice && <p className='px-2 text-xs font-semibold text-emerald-600'>{notice}</p>}
    <button type='button' onClick={() => void resetPin()} disabled={busy} className='min-h-12 w-full rounded-full border border-red-200 text-xs font-black text-red-600 disabled:opacity-50 dark:border-red-400/20 dark:text-red-300'>Forgot or reset PIN</button>
    <p className='px-1 text-[11px] leading-5 text-gray-400'>Reset signs you out first so your email identity can be verified again.</p>
  </section>
}

export default function PocketProfileFeaturePage({ feature, onBack, getAccessToken, email = '', onResetPin = async () => undefined }: { feature: PocketProfileFeature; onBack(): void; getAccessToken(): Promise<string | null>; email?: string; onResetPin?(): Promise<void> }) {
  const fx = usePocketFxQuote(10, feature === 'rates')
  const [currency, setCurrency] = useState('NGN')
  const [pushEnabled, setPushEnabled] = useState(pocketPushEnabled)
  const [limits, setLimits] = useState<PocketBillsLimitUsage | null>(null)
  const [bankLimit, setBankLimit] = useState<PocketBankPayoutLimit | null>(null)
  const [limitsBusy, setLimitsBusy] = useState(false)
  const [limitsError, setLimitsError] = useState('')
  const refreshLimits = async () => {
    setLimitsBusy(true)
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new Error('Sign in again to view today\'s limits.')
      const [billsResult, bankResult] = await Promise.allSettled([
        readPocketBillsLimitUsage({ accessToken }),
        readPocketBankPayoutLimit({ accessToken }),
      ])
      if (billsResult.status === 'rejected') throw billsResult.reason
      setLimits(billsResult.value)
      setBankLimit(bankResult.status === 'fulfilled' ? bankResult.value : null)
      setLimitsError('')
    } catch {
      setLimitsError('Today\'s usage could not be refreshed.')
    } finally {
      setLimitsBusy(false)
    }
  }
  useEffect(() => { if (feature === 'limits') void refreshLimits() }, [feature]) // eslint-disable-line react-hooks/exhaustive-deps
  const title = feature === 'rates' ? 'Rates' : feature === 'limits' ? 'Spending limits' : feature === 'security' ? 'Payment security' : 'Notifications'
  return <div className='fixed inset-0 z-[60] overflow-y-auto bg-[#F5F5F7] text-gray-950 dark:bg-[#0A0A0A] dark:text-white'>
    <main className='mx-auto min-h-full w-full max-w-[480px] px-5 pb-[max(2.5rem,var(--pocket-safe-bottom))] pt-[max(1rem,var(--pocket-safe-top))]'>
      <header className='flex h-12 items-center justify-between'><button type='button' onClick={onBack} className='flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-white/[0.07]' aria-label='Back'><ArrowLeft className='h-4 w-4' /></button><p className='text-sm font-black'>{title}</p><span className='h-10 w-10' /></header>
      {feature === 'rates' && <RatesPanel fx={fx} currency={currency} onCurrency={setCurrency} />}
      {feature === 'limits' && <LimitsPanel usage={limits} bank={bankLimit} busy={limitsBusy} error={limitsError} onRefresh={() => void refreshLimits()} />}
      {feature === 'notifications' && <NotificationsPanel enabled={pushEnabled} onChange={enabled => { setPocketPushEnabled(enabled); setPushEnabled(enabled) }} />}
      {feature === 'security' && <SecurityPanel email={email} getAccessToken={getAccessToken} onResetPin={onResetPin} />}
    </main>
  </div>
}
