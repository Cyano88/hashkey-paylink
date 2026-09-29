import usePocketLimitDisplay from '../hooks/usePocketLimitDisplay'
import { kycGuidance } from '../lib/kycGuidance'
import { useCallback, useEffect, useRef, useState } from 'react'
import { openSmileFrame } from '../lib/smileFrame'
import usePocketLightSurface from '../hooks/usePocketLightSurface'
import PocketBottomSheet from './PocketBottomSheet'
import { Check, Clock3, Info } from './PocketIcons'
import { protectSmileViewport } from '../lib/smileViewport'
import { pocketApiUrl, POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'

type VerificationMethod = 'bvn' | 'nin' | 'government_id'
type VerificationPolicy = { method?: VerificationMethod; product?: string; country: string; countryName: string; provider: string; idSelection: Record<string, string[]>; consentRequired: Record<string, string[]>; previewBVNMFA: boolean }
type KycState = {level?:'none'|'basic'|'advanced';basicDailyLimitNgn?:number;advancedDailyLimitNgn?:number|null; workflow?: { bvnPassed: boolean; complete: boolean; needsAdditional: boolean; methods: string[] }; environment: 'sandbox' | 'production'; status: 'not_started' | 'pending' | 'passed' | 'failed' | 'review'; verified: boolean; canResume?: boolean; canCorrectNames?: boolean; uploadReported?: boolean; failureReason?: string | null; verification?: VerificationPolicy; jobId?: string }
type Session = KycState & { token: string; partnerId: string; callbackUrl: string; partnerParams?: Record<string,string> }
type SmileWindow = Window & { SmileIdentity?: (config: Record<string, unknown>) => void }
const TEMPORARY_ERROR = 'Verification is temporarily unavailable. We will retry automatically.'
function loadSmile() {
  ;(window as SmileWindow).SmileIdentity ??= openSmileFrame
  return Promise.resolve()
}

export default function PocketKycPanel({ getAccessToken }: { getAccessToken: () => Promise<string | null> }) {
  const limitDisplay = usePocketLimitDisplay()
  const [providerVisible, setProviderVisible] = useState(false)
  usePocketLightSurface(providerVisible)
  const [state, setState] = useState<KycState | null>(null)
  const [submittedSheet, setSubmittedSheet] = useState(false)
  const [busy, setBusy] = useState(false)
  const [additionalMethod, setAdditionalMethod] = useState<'nin' | 'government_id'>('nin')
  const [selectedLevel,setSelectedLevel]=useState<'basic'|'advanced'>(()=>new URLSearchParams(window.location.search).get('level')==='advanced'?'advanced':'basic')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [autoRetry, setAutoRetry] = useState(true)
  const mounted = useRef(true)
  const inFlight = useRef(false)
  const tokenReader = useRef(getAccessToken); tokenReader.current = getAccessToken
  const retryNotBefore = useRef(0)
  const [retryAt, setRetryAt] = useState(0)
  const api = useCallback(async (action: 'status' | 'start' | 'resume' | 'uploaded' | 'correct_names', jobId?: string, method?: VerificationMethod, submission?: {jobId:string;userId:string}) => {
    if (Date.now() < retryNotBefore.current) throw Object.assign(new Error('Verification is busy. Please wait a moment.'), {retryable:true})
    const token = await tokenReader.current()
    if (!token) throw Object.assign(new Error('Sign in again to continue.'), {retryable:false})
    const response = await fetch(pocketApiUrl('/api/pocket/kyc'), { method: 'POST', cache: 'no-store', headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...(method ? { method } : {}), ...(jobId ? { jobId } : {}), ...(submission ? {submission} : {}), ...(action !== 'status' ? { consent: true } : {}) }), signal: AbortSignal.timeout(20000) }).catch(() => { throw new Error(TEMPORARY_ERROR) })
    if (response.status === 429) {
      const header = response.headers.get('Retry-After')
      const seconds = header ? Number(header) : NaN
      const delay = Number.isFinite(seconds) ? seconds * 1000 : header ? Date.parse(header) - Date.now() : 60000
      retryNotBefore.current = Date.now() + Math.max(1000, Number.isFinite(delay) ? delay : 60000)
      if (mounted.current) setRetryAt(retryNotBefore.current)
      throw Object.assign(new Error('Verification is busy. Please wait a moment.'), {retryable:true})
    }
    const data = await response.json().catch(() => null)
    if (!response.ok || data?.ok !== true) {
      const retryable = data?.retryable !== false && (response.status >= 500 || response.status === 429)
      throw Object.assign(new Error(typeof data?.error === 'string' && (response.status < 500 || !retryable) ? data.error : TEMPORARY_ERROR), {retryable})
    }
    if (!['sandbox', 'production'].includes(data.environment) || !['not_started', 'pending', 'passed', 'failed', 'review'].includes(data.status)) throw new Error(TEMPORARY_ERROR)
    return data as Session
  }, [])
  const refresh = useCallback(async () => {
    if (inFlight.current || Date.now() < retryNotBefore.current) return
    inFlight.current = true
    try { const next = await api('status'); if (mounted.current) { setState(current => current?.jobId === next.jobId && current?.uploadReported && next.status === 'pending' ? { ...next, canResume: false, uploadReported: true } : next); setError(''); setAutoRetry(true) } }
    catch (reason) { if (mounted.current) { setError(reason instanceof Error ? reason.message : 'Verification could not load.'); setAutoRetry((reason as {retryable?:boolean})?.retryable !== false) } }
    finally { inFlight.current = false }
  }, [api])
  useEffect(() => {
    if (!retryAt) return
    const timer = window.setTimeout(() => { setRetryAt(0); if (autoRetry && !document.hidden) void refresh() }, Math.max(0, retryAt - Date.now()))
    return () => clearTimeout(timer)
  }, [retryAt, autoRetry, refresh])
  useEffect(() => protectSmileViewport(setProviderVisible), [])
  useEffect(() => { mounted.current = true; void refresh(); return () => { mounted.current = false; document.getElementById('smile-identity-hosted-web-integration')?.remove() } }, [refresh])
  useEffect(() => {
    if (error && !autoRetry || ((!state || !['pending', 'review'].includes(state.status)) && !error)) return
    const onVisible = () => { if (!document.hidden) void refresh() }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(() => { if (!document.hidden) void refresh() }, state?.status === 'review' ? 60000 : 15000)
    return () => { clearInterval(timer); window.removeEventListener('focus', onVisible); document.removeEventListener('visibilitychange', onVisible) }
  }, [state?.status, error, autoRetry, refresh])
  const start = async () => {
    if (!consent || busy || Date.now() < retryNotBefore.current) return
    setBusy(true); setError(''); setAutoRetry(true)
    try {
      await loadSmile()
      if (!mounted.current) return
      const session = await api(state?.canCorrectNames ? 'correct_names' : state?.canResume ? 'resume' : 'start', state?.canCorrectNames ? state.jobId : undefined, state?.canResume ? state.verification?.method : state?.workflow?.bvnPassed && selectedLevel==='advanced' ? additionalMethod : 'bvn')
      if (!mounted.current) return
      if (!session.verification || session.verification.provider !== 'smile') throw new Error(TEMPORARY_ERROR)
      setState(session)
      const done = () => { if (mounted.current) { setBusy(false); void refresh() } }
      ;(window as SmileWindow).SmileIdentity!({
        token: session.token, product: session.verification.product || 'biometric_kyc', environment: session.environment, callback_url: session.callbackUrl,
        id_selection: session.verification.idSelection, partner_params: session.partnerParams,
        // V12 collects explicit provider consent; default capture uses smile detection.
        use_strict_mode: false, allow_agent_mode: false, allow_legacy_selfie_fallback: false,
        translation: { language: 'en-GB', locales: { 'en-GB': { selfie: { ess: { alert: { smile: 'Smile with your mouth slightly open', holdStill: 'Hold still and look at the camera', capturing: 'Keep smiling' } }, smart: { alert: { smileRequired: 'Smile with your mouth slightly open', openMouthSmile: 'Keep smiling and open your mouth slightly' } } } } } },
        partner_details: { partner_id: session.partnerId, name: 'Pocket by Hash PayLink', logo_url: 'https://app.hashpaylink.com/pocket-mark.svg', policy_url: 'https://app.hashpaylink.com/docs/privacy', theme_color: '#171717' },
        onSuccess: (submission?: {jobId:string;userId:string}) => {
          if (!mounted.current) return
          setBusy(false)
          setSubmittedSheet(true)
          setState(current => current && { ...current, canResume: false, uploadReported: true })
          // An upload notification is only a processing hint, never identity approval.
          void api('uploaded', session.jobId, undefined, submission).then(next => { if (mounted.current) { setState(next); void refresh() } }).catch(() => {
            if (mounted.current) setError('Your upload finished. We will keep checking for your result.')
          })
        }, onClose: done,
        onError: (failure?: { frameOpen?: boolean; errorCode?: string; status?: number }) => {
          if (!mounted.current) return
          if (failure?.frameOpen) return // The provider retains its error and retry screen.
          setBusy(false)
          setError(failure?.errorCode === 'CONSENT_DENIED' ? 'Verification was cancelled.' : 'Verification could not open. Please try again.')
        },
      })
    } catch (reason) { if (mounted.current) { setError(reason instanceof Error ? reason.message : 'Verification could not open.'); setBusy(false); setAutoRetry((reason as {retryable?:boolean})?.retryable !== false) } }
  }
  const basicPassed=Boolean(state?.workflow?.bvnPassed)
  const needsAdditional = Boolean(state?.workflow?.needsAdditional) && selectedLevel==='advanced'
  useEffect(() => { setConsent(false) }, [needsAdditional,selectedLevel])
  useEffect(() => { if(state&&!basicPassed)setSelectedLevel('basic') }, [Boolean(state),basicPassed])
  const complete = state?.workflow ? state.workflow.complete : state?.status === 'passed'
  const failed = state?.status === 'failed'
  const guidance = state ? kycGuidance(state) : null
  const passed = state?.status === 'passed'
  const resultTitle = basicPassed && passed && state?.environment==='production' && !state?.workflow?.complete ? 'Basic verification complete' : guidance?.title ? guidance.title : passed ? state.verified ? 'Verification complete' : 'Sandbox test completed' : 'Verification submitted'
  const resultText = basicPassed && passed && state?.environment==='production' && !complete ? `Your daily allowance is ${limitDisplay.usdc(50_000)}. Advanced verification is optional.` : guidance?.message ? guidance.message : passed ? state.verified ? 'Your identity check passed. You can continue to Pocket.' : 'Your sandbox identity check passed. This is a test result, not a production identity verification.' : 'Your submission has been received. We are checking the result with Smile ID. You can stay here for the update or continue while it processes.'
  const retryable = !complete && guidance?.action !== 'support' && (selectedLevel==='advanced' ? basicPassed && (needsAdditional || state?.canResume === true || state?.status==='failed') : !basicPassed && (state?.canCorrectNames === true || state?.status === 'not_started' || state?.status === 'failed' || state?.canResume === true))
  return <section className="mt-6 space-y-5">
    {!state && !error && <div role="status" aria-label="Loading verification" className="h-44 animate-pulse rounded-3xl bg-gray-200/70 dark:bg-white/10" />}
    {state && <>
      {state.environment === 'sandbox' && <p className="rounded-xl bg-gray-50 px-4 py-3 text-xs leading-5 text-gray-600 dark:bg-[#121212] dark:text-gray-300">Sandbox test. Real BVN/NIN records are not checked here. Use Smile ID test details and a matching test photo. This does not verify your real identity.</p>}
      <div aria-label="Verification levels" className="space-y-3">
        <button type="button" onClick={()=>setSelectedLevel('basic')} className={`w-full rounded-2xl border p-4 text-left ${selectedLevel==='basic'?'border-gray-900 dark:border-white':'border-gray-200 dark:border-[#262626]'}`}>
          <span className="flex items-center justify-between text-sm font-semibold"><span>Basic</span>{basicPassed&&<Check aria-label="Basic complete" className="h-4 w-4 text-green-600"/>}</span>
          <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">BVN + selfie · {limitDisplay.usdc(50_000)} daily{limitDisplay.secondary(50_000) && <small className="mt-1 block">{limitDisplay.secondary(50_000)}</small>}</span>
        </button>
        <button type="button" disabled={!basicPassed} onClick={()=>setSelectedLevel('advanced')} className={`w-full rounded-2xl border p-4 text-left disabled:opacity-50 ${selectedLevel==='advanced'?'border-gray-900 dark:border-white':'border-gray-200 dark:border-[#262626]'}`}>
          <span className="flex items-center justify-between text-sm font-semibold"><span>Advanced</span>{complete&&<Check aria-label="Advanced complete" className="h-4 w-4 text-green-600"/>}</span>
          <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{!basicPassed?'Complete Basic first':state.advancedDailyLimitNgn?`NIN or government ID · ${limitDisplay.usdc(state.advancedDailyLimitNgn)} daily`:'NIN or government ID · Higher limits pending activation'}</span>
        </button>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">Bank transfers and XPay bank payouts share this allowance. Bills are excluded.</p>
      {guidance?<div role="status" className="space-y-1"><p className="text-sm font-medium">{guidance.title}</p><p className="text-sm leading-6 text-gray-500 dark:text-gray-400">{guidance.message}</p></div>:passed?<p role="status" className="text-sm text-green-700 dark:text-green-400">{state.environment==='sandbox'?'Sandbox test completed':complete?'Advanced verification complete':'Basic verification complete'}</p>:null}
      {needsAdditional && <fieldset disabled={busy} className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Choose how to verify</legend>
        {([{ value: 'nin', title: 'NIN', description: 'Verify your National Identification Number and take a selfie.' }, { value: 'government_id', title: 'Government ID', description: 'Use an available government-issued ID and take a selfie.' }] as const).map(option => <label key={option.value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4 dark:border-white/10">
          <input type="radio" name="identity-method" value={option.value} checked={additionalMethod === option.value} onChange={() => { setAdditionalMethod(option.value); setConsent(false) }} className="mt-1 h-4 w-4" />
          <span><span className="block text-sm font-medium">{option.title}</span><span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">{option.description}</span></span>
        </label>)}
      </fieldset>}
      {retryable && <>
        <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">Use your names exactly as shown on your ID. Given names means your first and middle names. Last name means your surname.</p>
        <label className="flex items-start gap-3 text-sm leading-6 text-gray-600 dark:text-gray-300"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-1 h-4 w-4 shrink-0" />I agree to share my identity details and selfie with Smile ID for verification.</label>
        <button type="button" disabled={!consent || busy || retryAt > 0} onClick={() => void start()} className="pocket-cta-primary w-full px-4 py-3.5">{busy ? 'Opening verification...' : state.canCorrectNames ? 'Correct names' : state.canResume ? 'Continue verification' : needsAdditional ? additionalMethod === 'nin' ? 'Verify NIN' : 'Verify government ID' : failed ? 'Try verification again' : state.environment === 'sandbox' ? 'Start sandbox verification' : 'Verify Basic'}</button>
      </>}
      {(guidance?.action === 'support') && <a href={POCKET_BASE_PATH + POCKET_ROUTES.assistant} className="block w-full py-3 text-center text-sm font-semibold">Contact support</a>}
    </>}
    {submittedSheet && <PocketBottomSheet title={resultTitle} dismissOnBackdrop={false} onClose={() => setSubmittedSheet(false)}>
      <div className="pb-2 pt-3 text-center">
        {passed ? <Check aria-hidden="true" className="mx-auto h-14 w-14 text-green-600" /> : failed || state?.status === 'review' ? <Info aria-hidden="true" className="mx-auto h-14 w-14 text-red-500" /> : <Clock3 aria-hidden="true" className="mx-auto h-14 w-14 text-gray-500 dark:text-gray-400" />}
        <h2 className="mt-6 text-2xl font-semibold">{resultTitle}</h2>
        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{resultText}</p>
        {guidance?.action === 'support' && <a href={POCKET_BASE_PATH + POCKET_ROUTES.assistant} className="mt-5 block text-sm font-semibold">Contact support</a>}
        <button type="button" onClick={() => setSubmittedSheet(false)} className="pocket-cta-primary mt-7 w-full px-4 py-3.5">Done</button>
      </div>
    </PocketBottomSheet>}
    {error && <div role="alert" className="text-sm text-red-600 dark:text-red-400"><p>{error}</p>{autoRetry && !retryAt && <button type="button" onClick={() => void refresh()} className="mt-3 block min-h-10 font-semibold underline">Try again</button>}</div>}
  </section>
}
