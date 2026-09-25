import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import PocketEmailLogin from '../pocket/components/PocketEmailLogin'
import { CheckoutTrustLine, HashPayLinkCheckoutBrand } from '../components/CheckoutChrome'

export default function WalletConnectionPage() {
  const { connectionId = '' } = useParams()
  const { ready, authenticated, user, logout } = usePrivy()
  const [access] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('access') || '')
  return <section className="mx-auto w-full max-w-md">
    <HashPayLinkCheckoutBrand />
    <div className="rounded-3xl border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-[#111216]">
      <h1 className="text-xl font-bold">Connect your Hash PayLink account</h1>
      {!/^wcs_[a-f0-9]{48}$/.test(connectionId) || !/^[A-Za-z0-9_-]{43}$/.test(access)
        ? <p role="alert">This connection link is invalid. Start again in your app.</p>
        : !ready ? <p role="status">Opening your connection...</p>
        : !authenticated ? <><p className="my-4 text-sm text-gray-500">Sign in with the email you use in the requesting app.</p><PocketEmailLogin context="agreement" /></>
        : <Connection key={user?.id + ':' + connectionId} id={connectionId} access={access} />}
    </div>
    <CheckoutTrustLine provider="hashpaylink" />
    {authenticated && <button className="mx-auto block min-h-11 text-sm underline" onClick={() => void logout()}>Switch account</button>}
  </section>
}
function Connection({ id, access }: { id: string; access: string }) {
  const { getAccessToken } = usePrivy()
  const [info, setInfo] = useState<{ projectName: string; approved: boolean }>()
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [retry, setRetry] = useState(0)
  const active = useRef(true), lock = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  async function post(action: string, signal?: AbortSignal) {
    const token = await getAccessToken()
    if (!active.current || !token) throw Error('Sign in again to continue.')
    const response = await fetch('/api/v2/wallet-connections/participant', { method: 'POST', signal,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ id, access, action }) })
    const body = await response.json().catch(() => { throw Error('Connection unavailable. Try again.') })
    if (!response.ok || body.ok !== true) throw Error(body.error || 'Connection unavailable.')
    return body
  }
  useEffect(() => {
    const controller = new AbortController()
    setError('')
    void post('read', controller.signal).then(value => { if (!controller.signal.aborted) setInfo(value) })
      .catch(e => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [id, access, retry])
  async function approve() {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { const value = await post('approve'); if (active.current) setInfo(value) }
    catch (e) { if (active.current) setError((e as Error).message) }
    finally { lock.current = false; if (active.current) setBusy(false) }
  }
  return <div className="mt-4 space-y-4 text-sm">
    {info?.approved ? <p role="status">Account approved. Return to your app to continue.</p> : info ? <>
      <p><strong>{info.projectName}</strong> wants to link your Hash PayLink identity to your account.</p>
      <p className="text-gray-500">Payments still require your approval. Existing balances stay in their current wallets.</p>
      <button disabled={busy} onClick={() => void approve()} className="min-h-11 w-full rounded-full bg-gray-950 px-5 py-3 font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950">{busy ? 'Connecting...' : 'Connect account'}</button>
    </> : !error && <p role="status">Loading connection...</p>}
    {error && <><p role="alert">{error}</p><button className="min-h-11 underline" onClick={() => setRetry(n => n + 1)}>Try again</button></>}
  </div>
}
