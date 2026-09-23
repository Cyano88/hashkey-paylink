import { useCallback, useEffect, useRef, useState } from 'react'
import { openSmileFrame } from '../lib/smileFrame'
import usePocketLightSurface from '../hooks/usePocketLightSurface'
import PocketBottomSheet from './PocketBottomSheet'
import { Check, Clock3, Info } from './PocketIcons'
import { protectSmileViewport } from '../lib/smileViewport'
import { pocketApiUrl, POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'

type VerificationMethod = 'bvn' | 'nin' | 'government_id'
type VerificationPolicy = { method?: VerificationMethod; product?: string; country: string; countryName: string; provider: string; idSelection: Record<string, string[]>; consentRequired: Record<string, string[]>; previewBVNMFA: boolean }
type KycState = { workflow?: { bvnPassed: boolean; complete: boolean; needsAdditional: boolean; methods: string[] }; environment: 'sandbox' | 'production'; status: 'not_started' | 'pending' | 'passed' | 'failed' | 'review'; verified: boolean; canResume?: boolean; uploadReported?: boolean; failureReason?: string | null; verification?: VerificationPolicy; jobId?: string }
type Session = KycState & { token: string; partnerId: string; callbackUrl: string; partnerParams?: Record<string,string> }
type SmileWindow = Window & { SmileIdentity?: (config: Record<string, unknown>) => void }
const TEMPORARY_ERROR = 'Verification is temporarily unavailable. We will retry automatically.'
function loadSmile() {
  ;(window as SmileWindow).SmileIdentity ??= openSmileFrame
  return Promise.resolve()
}

export default function PocketKycPanel({ getAccessToken }: { getAccessToken: () => Promise<string | null> }) {
  const [providerVisible, setProviderVisible] = useState(false)
  usePocketLightSurface(providerVisible)
  const [state, setState] = useState<KycState | null>(null)
  const [submittedSheet, setSubmittedSheet] = useState(false)
  const [busy, setBusy] = useState(false)
  const [additionalMethod, setAdditionalMethod] = useState<'nin' | 'government_id'>('nin')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true)
  const inFlight = useRef(false)
  const api = useCallback(async (action: 'status' | 'start' | 'resume' | 'uploaded', jobId?: string, method?: VerificationMethod) => {
    const token = await getAccessToken()
    if (!token) throw new Error('Sign in again to continue.')
    const response = await fetch(pocketApiUrl('/api/pocket/kyc'), { method: 'POST', cache: 'no-store', headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...(method ? { method } : {}), ...(jobId ? { jobId } : {}), ...(action !== 'status' ? { consent: true } : {}) }), signal: AbortSignal.timeout(20000) }).catch(() => { throw new Error(TEMPORARY_ERROR) })
    const data = await response.json().catch(() => null)
    if (!response.ok || data?.ok !== true) throw new Error(response.status < 500 && typeof data?.error === 'string' ? data.error : TEMPORARY_ERROR)
    if (!['sandbox', 'production'].includes(data.environment) || !['not_started', 'pending', 'passed', 'failed', 'review'].includes(data.status)) throw new Error(TEMPORARY_ERROR)
    return data as Session
  }, [getAccessToken])
  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try { const next = await api('status'); if (mounted.current) { setState(current => current?.jobId === next.jobId && current?.uploadReported && next.status === 'pending' ? { ...next, canResume: false, uploadReported: true } : next); setError('') } }
    catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'Verification could not load.') }
    finally { inFlight.current = false }
  }, [api])
  useEffect(() => protectSmileViewport(setProviderVisible), [])
  useEffect(() => { mounted.current = true; void refresh(); return () => { mounted.current = false; document.getElementById('smile-identity-hosted-web-integration')?.remove() } }, [refresh])
  useEffect(() => {
    if ((!state || !['pending', 'review'].includes(state.status)) && !error) return
    const onVisible = () => { if (!document.hidden) void refresh() }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(() => { if (!document.hidden) void refresh() }, 15000)
    return () => { clearInterval(timer); window.removeEventListener('focus', onVisible); document.removeEventListener('visibilitychange', onVisible) }
  }, [state?.status, error, refresh])
  const start = async () => {
    if (!consent || busy) return
    setBusy(true); setError('')
    try {
      await loadSmile()
      if (!mounted.current) return
      const session = await api(state?.canResume ? 'resume' : 'start', undefined, state?.canResume ? state.verification?.method : state?.workflow?.needsAdditional ? additionalMethod : 'bvn')
      if (!mounted.current) return
      if (!session.verification || session.verification.provider !== 'smile') throw new Error(TEMPORARY_ERROR)
      setState(session)
      const done = () => { if (mounted.current) { setBusy(false); void refresh() } }
      ;(window as SmileWindow).SmileIdentity!({
        token: session.token, product: session.verification.product || 'biometric_kyc', environment: session.environment, callback_url: session.callbackUrl,
        id_selection: session.verification.idSelection, partner_params: session.partnerParams,
        // V12 collects explicit provider consent; default capture uses smile detection.
        use_strict_mode: false, allow_agent_mode: false, allow_legacy_selfie_fallback: false,
        partner_details: { partner_id: session.partnerId, name: 'Pocket by Hash PayLink', logo_url: 'https://app.hashpaylink.com/pocket-mark.svg', policy_url: 'https://app.hashpaylink.com/docs/privacy', theme_color: '#171717' },
        onSuccess: () => {
          if (!mounted.current) return
          setBusy(false)
          setSubmittedSheet(true)
          setState(current => current && { ...current, canResume: false, uploadReported: true })
          // An upload notification is only a processing hint, never identity approval.
          void api('uploaded', session.jobId).then(next => { if (mounted.current) { setState(next); void refresh() } }).catch(() => {
            if (mounted.current) setError('Your upload finished. We will keep checking for your result.')
          })
        }, onClose: done,
        onError: () => { done(); if (mounted.current) setError('Verification was interrupted. We are checking its status.') },
      })
    } catch (reason) { if (mounted.current) { setError(reason instanceof Error ? reason.message : 'Verification could not open.'); setBusy(false) } }
  }
  const needsAdditional = Boolean(state?.workflow?.needsAdditional)
  useEffect(() => { setConsent(false) }, [needsAdditional])
  const complete = state?.workflow ? state.workflow.complete : state?.status === 'passed'
  const stepLabel = state?.verification?.method === 'government_id' ? 'Government ID and selfie' : state?.verification?.method === 'nin' ? 'NIN and facial verification' : 'BVN and facial verification'
  const failed = state?.status === 'failed'
  const failureText = state?.failureReason === 'identity_mismatch' ? 'The identity details could not be matched to your verified BVN. Contact support to review your verification.' : state?.failureReason === 'face_mismatch' ? (state.environment === 'sandbox' ? 'The selfie did not match the sandbox test identity. Sandbox does not look up your real BVN. Use a Smile ID test identity configured with a matching test photo.' : 'Smile ID received your submission, but could not match your selfie to the identity image. Please check your details before trying again.') : state?.failureReason === 'session_failed' ? 'The verification session could not start. Please try again.' : 'Smile ID received your submission, but the identity check did not pass. Please review your details before trying again.'
  const passed = state?.status === 'passed'
  const resultTitle = needsAdditional && !failed ? 'BVN verification complete' : failed ? 'Verification did not pass' : passed ? state.verified ? 'Verification complete' : 'Sandbox test completed' : 'Verification submitted'
  const resultText = needsAdditional && !failed ? 'Next, verify your NIN or a government-issued ID to finish your identity verification.' : failed ? failureText : passed ? state.verified ? 'Your identity check passed. You can continue to Pocket.' : 'Your sandbox identity check passed. Production verification is still required for live POS access.' : 'Your submission has been received. We are checking the result with Smile ID. You can stay here for the update or continue while it processes.'
  const retryable = needsAdditional || state?.status === 'not_started' || state?.status === 'failed' || state?.canResume === true
  return <section className="mt-6 space-y-5">
    {!state && !error && <div role="status" aria-label="Loading verification" className="h-44 animate-pulse rounded-3xl bg-gray-200/70 dark:bg-white/10" />}
    {state && <>
      {state.environment === 'sandbox' && <p className="rounded-xl bg-gray-50 px-4 py-3 text-xs leading-5 text-gray-600 dark:bg-[#171717] dark:text-gray-300">Sandbox test. Real BVN/NIN records are not checked here. Use Smile ID test details and a matching test photo. This does not unlock live POS payments.</p>}
      <div className="space-y-4">

        {!state.workflow && <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-5 dark:border-white/10 dark:bg-[#121212]">
          <span className="text-sm font-medium">{stepLabel}</span>
          {state.status === 'passed' ? <Check aria-label={state.verified ? 'Verified' : 'Sandbox completed'} className="h-5 w-5 text-green-600" /> : ['pending', 'review'].includes(state.status) ? <Clock3 aria-label="In progress" className="h-5 w-5 text-blue-500" /> : null}
        </div>}
        <div role="status" className={`flex items-start gap-3 rounded-xl p-4 ${state.status === 'passed' ? 'bg-green-50 text-green-800 dark:bg-green-500/10 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300'}`}>
          <Info className="mt-0.5 h-5 w-5 shrink-0" />
          <div><h3 className="text-sm font-medium">{needsAdditional && !failed ? 'Choose your next verification step' : state.canResume ? 'Complete verification' : state.status === 'passed' ? state.verified ? 'Verification complete' : 'Sandbox test completed' : state.status === 'pending' ? 'Verification in progress' : state.status === 'review' ? 'Verification processing' : state.status === 'failed' ? state.environment === 'sandbox' ? 'Sandbox verification did not pass' : 'Verification did not pass' : 'Verify your identity'}</h3>
          <p className="mt-1 text-sm leading-6">{needsAdditional && !failed ? 'Your BVN check passed. Verify your NIN or a government-issued ID to finish.' : state.failureReason === 'identity_mismatch' ? failureText : state.canResume ? 'Your last session was not submitted. Continue to finish your verification.' : state.status === 'pending' ? 'Your verification is being processed. We will update your status when the result is confirmed.' : state.status === 'review' ? 'Your result is taking longer than expected. We will update it automatically once confirmed.' : state.status === 'passed' ? state.verified ? 'Your identity check is complete. You can now set up your POS.' : 'The sandbox check passed. Production verification is still required for live POS access.' : failed ? failureText : 'First, verify your BVN and take a selfie. After it passes, choose NIN or a government-issued ID to finish.'}</p></div>
        </div>
      </div>
      {state.workflow && <ol aria-label="Verification steps" className="space-y-2 text-sm">
        <li className="flex items-center justify-between py-2"><span>1. BVN verification</span><span className="text-gray-500">{state.workflow.bvnPassed ? 'Complete' : 'Required'}</span></li>
        <li className="flex items-center justify-between py-2"><span>2. NIN or government ID</span><span className="text-gray-500">{complete ? 'Complete' : !state.workflow.bvnPassed ? 'After BVN passes' : !needsAdditional ? 'In progress' : 'Required'}</span></li>
      </ol>}
      {needsAdditional && <fieldset disabled={busy} className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Choose how to verify</legend>
        {([{ value: 'nin', title: 'NIN', description: 'Verify your National Identification Number and take a selfie.' }, { value: 'government_id', title: 'Government ID', description: 'Use your passport, driving licence or national ID card and take a selfie.' }] as const).map(option => <label key={option.value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4 dark:border-white/10">
          <input type="radio" name="identity-method" value={option.value} checked={additionalMethod === option.value} onChange={() => { setAdditionalMethod(option.value); setConsent(false) }} className="mt-1 h-4 w-4" />
          <span><span className="block text-sm font-medium">{option.title}</span><span className="mt-1 block text-xs leading-5 text-gray-500">{option.description}</span></span>
        </label>)}
      </fieldset>}
      {retryable && <>
        <label className="flex items-start gap-3 text-sm leading-6 text-gray-600 dark:text-gray-300"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-1 h-4 w-4 shrink-0" />I agree to share my identity details and selfie with Smile ID for verification.</label>
        <button type="button" disabled={!consent || busy} onClick={() => void start()} className="w-full rounded-xl bg-gray-950 px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950">{busy ? 'Opening verification...' : state.canResume ? 'Continue verification' : needsAdditional ? additionalMethod === 'nin' ? 'Verify NIN' : 'Verify government ID' : failed ? 'Try verification again' : state.environment === 'sandbox' ? 'Start sandbox verification' : 'Start verification'}</button>
      </>}
      {(failed || state.status === 'review' && !state.canResume) && <a href={POCKET_BASE_PATH + POCKET_ROUTES.assistant} className="block w-full py-3 text-center text-sm font-semibold">Contact support</a>}
    </>}
    {submittedSheet && <PocketBottomSheet title={resultTitle} onClose={() => setSubmittedSheet(false)}>
      <div className="pb-2 pt-3 text-center">
        {passed ? <Check aria-hidden="true" className="mx-auto h-14 w-14 text-green-600" /> : failed ? <Info aria-hidden="true" className="mx-auto h-14 w-14 text-red-500" /> : <Clock3 aria-hidden="true" className="mx-auto h-14 w-14 text-gray-500" />}
        <h2 className="mt-6 text-2xl font-semibold">{resultTitle}</h2>
        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{resultText}</p>
        <button type="button" onClick={() => setSubmittedSheet(false)} className="mt-7 w-full rounded-xl bg-gray-950 px-4 py-3.5 text-sm font-semibold text-white dark:bg-white dark:text-gray-950">{needsAdditional ? 'Choose NIN or government ID' : 'Continue'}</button>
      </div>
    </PocketBottomSheet>}
    {error && <div role="alert" className="text-sm text-red-600 dark:text-red-400">{error}<button type="button" onClick={() => void refresh()} className="ml-2 underline">Try again</button></div>}
  </section>
}
