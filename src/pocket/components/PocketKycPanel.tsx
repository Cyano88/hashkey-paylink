import { useCallback, useEffect, useRef, useState } from 'react'
import { pocketApiUrl, POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'

type KycState = { environment: 'sandbox' | 'production'; status: 'not_started' | 'pending' | 'passed' | 'failed' | 'review'; verified: boolean; canResume?: boolean }
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
  const [state, setState] = useState<KycState | null>(null)
  const [busy, setBusy] = useState(false)
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true)
  const inFlight = useRef(false)
  const api = useCallback(async (action: 'status' | 'start' | 'resume') => {
    const token = await getAccessToken()
    if (!token) throw new Error('Sign in again to continue.')
    const response = await fetch(pocketApiUrl('/api/pocket/kyc'), { method: 'POST', cache: 'no-store', headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...(action !== 'status' ? { consent: true } : {}) }), signal: AbortSignal.timeout(20000) })
    const data = await response.json()
    if (!response.ok || data.ok !== true) throw new Error(typeof data.error === 'string' ? data.error : 'Verification could not load. Please try again.')
    if (!['sandbox', 'production'].includes(data.environment) || !['not_started', 'pending', 'passed', 'failed', 'review'].includes(data.status)) throw new Error('Verification returned an invalid response.')
    return data as Session
  }, [getAccessToken])
  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try { const next = await api('status'); if (mounted.current) { setState(next); setError('') } }
    catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'Verification could not load.') }
    finally { inFlight.current = false }
  }, [api])
  useEffect(() => { mounted.current = true; void refresh(); return () => { mounted.current = false; document.getElementById('smile-identity-hosted-web-integration')?.remove() } }, [refresh])
  useEffect(() => {
    if (state?.status !== 'pending') return
    const timer = window.setInterval(() => { if (!document.hidden) void refresh() }, 15000)
    return () => clearInterval(timer)
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
        partner_details: { partner_id: session.partnerId, name: 'Pocket by Hash PayLink', logo_url: 'https://app.hashpaylink.com/pocket-circle.png', policy_url: 'https://app.hashpaylink.com/docs/privacy', theme_color: '#171717' },
        onSuccess: done, onClose: done,
        onError: () => { done(); if (mounted.current) setError('Verification was interrupted. Check progress before trying again.') },
      })
    } catch (reason) { if (mounted.current) { setError(reason instanceof Error ? reason.message : 'Verification could not open.'); setBusy(false) } }
  }
  const retryable = state?.status === 'not_started' || state?.status === 'failed' || state?.canResume === true
  return <section className="mt-6 space-y-5">
    {!state && !error && <div role="status" aria-label="Loading verification" className="h-44 animate-pulse rounded-3xl bg-gray-200/70 dark:bg-white/10" />}
    {state && <>
      {state.environment === 'sandbox' && <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">Sandbox test. Use Smile ID test details. This does not verify your live account or unlock POS payments.</p>}
      <div className="rounded-3xl bg-white p-5 dark:bg-[#121212]">
        <h2 className="text-base font-semibold">{state.status === 'passed' ? state.verified ? 'Identity verified' : 'Sandbox test completed' : state.status === 'pending' ? 'Verification in progress' : state.status === 'review' ? 'Verification needs support' : state.status === 'failed' ? 'Try verification again' : 'Verify your identity'}</h2>
        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{state.status === 'pending' ? state.canResume ? 'Your verification has not been submitted. Continue when you are ready.' : 'Your result will update here. You can safely leave this screen and return later.' : state.status === 'review' ? 'Contact Agent Hash for help with this verification.' : state.status === 'passed' ? state.verified ? 'Your identity check is complete.' : 'The sandbox check passed. Production verification is still required for live POS access.' : 'For Nigerian individuals. Verify your BVN and take a live selfie with Smile ID.'}</p>
      </div>
      {retryable && <>
        <label className="flex items-start gap-3 text-sm leading-6 text-gray-600 dark:text-gray-300"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-1 h-4 w-4 shrink-0" />I agree to share my identity details and selfie with Smile ID for verification.</label>
        <button type="button" disabled={!consent || busy} onClick={() => void start()} className="w-full rounded-xl bg-gray-950 px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950">{busy ? 'Opening verification...' : state.canResume ? 'Continue verification' : state.environment === 'sandbox' ? 'Start sandbox verification' : 'Start verification'}</button>
      </>}
      {state.status === 'review' && <a href={POCKET_BASE_PATH + POCKET_ROUTES.assistant} className="block w-full py-3 text-center text-sm font-semibold">Contact support</a>}
      {state.status === 'pending' && !busy && <button type="button" onClick={() => void refresh()} className="w-full py-3 text-sm font-semibold">Check progress</button>}
    </>}
    {error && <div role="alert" className="text-sm text-red-600 dark:text-red-400">{error}<button type="button" onClick={() => void refresh()} className="ml-2 underline">Try again</button></div>}
  </section>
}
