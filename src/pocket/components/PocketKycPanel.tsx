import { useCallback, useEffect, useRef, useState } from 'react'
import usePocketLightSurface from '../hooks/usePocketLightSurface'
import PocketBottomSheet from './PocketBottomSheet'
import { Check, CheckCircle2, Clock3, Info } from './PocketIcons'
import { protectSmileViewport } from '../lib/smileViewport'
import { pocketApiUrl, POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'

type KycState = { environment: 'sandbox' | 'production'; status: 'not_started' | 'pending' | 'passed' | 'failed' | 'review'; verified: boolean; canResume?: boolean; uploadReported?: boolean; jobId?: string }
type Session = KycState & { token: string; partnerId: string; callbackUrl: string }
type SmileWindow = Window & { SmileIdentity?: (config: Record<string, unknown>) => void }
let sdk: Promise<void> | undefined
function loadSmile() {
  if ((window as SmileWindow).SmileIdentity) return Promise.resolve()
  sdk ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.smileidentity.com/inline/v1/js/script.min.js'
    script.async = true
    const timer = window.setTimeout(() => { script.remove(); sdk = undefined; reject(new Error('Verification could not open. Please try again.')) }, 15000)
    script.onload = () => { clearTimeout(timer); if ((window as SmileWindow).SmileIdentity) resolve(); else { sdk = undefined; reject(new Error('Verification could not open.')) } }
    script.onerror = () => { clearTimeout(timer); script.remove(); sdk = undefined; reject(new Error('Verification could not open. Please try again.')) }
    document.head.appendChild(script)
  })
  return sdk
}

export default function PocketKycPanel({ getAccessToken }: { getAccessToken: () => Promise<string | null> }) {
  const [providerVisible, setProviderVisible] = useState(false)
  usePocketLightSurface(providerVisible)
  const [state, setState] = useState<KycState | null>(null)
  const [submittedSheet, setSubmittedSheet] = useState(false)
  const [busy, setBusy] = useState(false)
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true)
  const inFlight = useRef(false)
  const api = useCallback(async (action: 'status' | 'start' | 'resume' | 'uploaded', jobId?: string) => {
    const token = await getAccessToken()
    if (!token) throw new Error('Sign in again to continue.')
    const response = await fetch(pocketApiUrl('/api/pocket/kyc'), { method: 'POST', cache: 'no-store', headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...(jobId ? { jobId } : {}), ...(action !== 'status' ? { consent: true } : {}) }), signal: AbortSignal.timeout(20000) })
    const data = await response.json()
    if (!response.ok || data.ok !== true) throw new Error(typeof data.error === 'string' ? data.error : 'Verification could not load. Please try again.')
    if (!['sandbox', 'production'].includes(data.environment) || !['not_started', 'pending', 'passed', 'failed', 'review'].includes(data.status)) throw new Error('Verification returned an invalid response.')
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
    if (!state || !['pending', 'review'].includes(state.status)) return
    const onVisible = () => { if (!document.hidden) void refresh() }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(() => { if (!document.hidden) void refresh() }, 15000)
    return () => { clearInterval(timer); window.removeEventListener('focus', onVisible); document.removeEventListener('visibilitychange', onVisible) }
  }, [state?.status, refresh])
  const start = async () => {
    if (!consent || busy) return
    setBusy(true); setError('')
    try {
      await loadSmile()
      if (!mounted.current) return
      const session = await api(state?.canResume ? 'resume' : 'start')
      if (!mounted.current) return
      setState(session)
      const done = () => { if (mounted.current) { setBusy(false); void refresh() } }
      ;(window as SmileWindow).SmileIdentity!({
        token: session.token, product: 'biometric_kyc', environment: session.environment, callback_url: session.callbackUrl,
        id_selection: { NG: ['BVN_MFA'] }, consent_required: { NG: ['BVN_MFA'] }, previewBVNMFA: true,
        use_strict_mode: true, allow_agent_mode: false, allow_legacy_selfie_fallback: false,
        partner_details: { partner_id: session.partnerId, name: 'Pocket by Hash PayLink', logo_url: 'https://app.hashpaylink.com/pocket-mark.svg', policy_url: 'https://app.hashpaylink.com/docs/privacy', theme_color: '#171717' },
        onSuccess: () => {
          if (!mounted.current) return
          setBusy(false)
          setSubmittedSheet(true)
          setState(current => current && { ...current, canResume: false, uploadReported: true })
          // An upload notification is only a processing hint, never identity approval.
          void api('uploaded', session.jobId).then(next => { if (mounted.current) setState(next) }).catch(() => {
            if (mounted.current) setError('Your upload finished. We will keep checking for your result.')
          })
        }, onClose: done,
        onError: () => { done(); if (mounted.current) setError('Verification was interrupted. We are checking its status.') },
      })
    } catch (reason) { if (mounted.current) { setError(reason instanceof Error ? reason.message : 'Verification could not open.'); setBusy(false) } }
  }
  const retryable = state?.status === 'not_started' || state?.status === 'failed' || state?.canResume === true
  return <section className="mt-6 space-y-5">
    {!state && !error && <div role="status" aria-label="Loading verification" className="h-44 animate-pulse rounded-3xl bg-gray-200/70 dark:bg-white/10" />}
    {state && <>
      {state.environment === 'sandbox' && <p className="rounded-xl bg-gray-50 px-4 py-3 text-xs leading-5 text-gray-600 dark:bg-[#171717] dark:text-gray-300">Sandbox test. Use Smile ID test details. This does not verify your live account or unlock POS payments.</p>}
      <div className="space-y-4">

        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-5 dark:border-white/10 dark:bg-[#121212]">
          <span className="text-sm font-medium">BVN and facial verification</span>
          {state.status === 'passed' ? <Check aria-label={state.verified ? 'Verified' : 'Sandbox completed'} className="h-5 w-5 text-green-600" /> : ['pending', 'review'].includes(state.status) ? <Clock3 aria-label="In progress" className="h-5 w-5 text-blue-500" /> : null}
        </div>
        <div role="status" className={`flex items-start gap-3 rounded-xl p-4 ${state.status === 'passed' ? 'bg-green-50 text-green-800 dark:bg-green-500/10 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300'}`}>
          <Info className="mt-0.5 h-5 w-5 shrink-0" />
          <div><h3 className="text-sm font-medium">{state.canResume ? 'Complete verification' : state.status === 'passed' ? state.verified ? 'Verification complete' : 'Sandbox test completed' : state.status === 'pending' ? 'Verification in progress' : state.status === 'review' ? 'Verification processing' : state.status === 'failed' ? 'Try verification again' : 'Verify your identity'}</h3>
          <p className="mt-1 text-sm leading-6">{state.canResume ? 'Your last session was not submitted. Continue to finish your verification.' : state.status === 'pending' ? 'Your verification is being processed. We will update your status when the result is confirmed.' : state.status === 'review' ? 'Your result is taking longer than expected. We will update it automatically once confirmed.' : state.status === 'passed' ? state.verified ? 'Your identity check is complete. You can now set up your POS.' : 'The sandbox check passed. Production verification is still required for live POS access.' : 'For Nigerian individuals. Verify your BVN and take a live selfie with Smile ID.'}</p></div>
        </div>
      </div>
      {retryable && <>
        <label className="flex items-start gap-3 text-sm leading-6 text-gray-600 dark:text-gray-300"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-1 h-4 w-4 shrink-0" />I agree to share my identity details and selfie with Smile ID for verification.</label>
        <button type="button" disabled={!consent || busy} onClick={() => void start()} className="w-full rounded-xl bg-gray-950 px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950">{busy ? 'Opening verification...' : state.canResume ? 'Continue verification' : state.environment === 'sandbox' ? 'Start sandbox verification' : 'Start verification'}</button>
      </>}
      {state.status === 'review' && !state.canResume && <a href={POCKET_BASE_PATH + POCKET_ROUTES.assistant} className="block w-full py-3 text-center text-sm font-semibold">Contact support</a>}
    </>}
    {submittedSheet && <PocketBottomSheet title="Verification submitted" onClose={() => setSubmittedSheet(false)}>
      <div className="pb-2 pt-3 text-center">
        <CheckCircle2 aria-hidden="true" className="mx-auto h-20 w-20 text-green-500" />
        <h2 className="mt-6 text-2xl font-semibold">Verification submitted</h2>
        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">Your upload is complete. We will update your verification status once Smile ID confirms the result.</p>
        <button type="button" onClick={() => setSubmittedSheet(false)} className="mt-7 w-full rounded-xl bg-gray-950 px-4 py-3.5 text-sm font-semibold text-white dark:bg-white dark:text-gray-950">Continue</button>
      </div>
    </PocketBottomSheet>}
    {error && <div role="alert" className="text-sm text-red-600 dark:text-red-400">{error}<button type="button" onClick={() => void refresh()} className="ml-2 underline">Try again</button></div>}
  </section>
}
