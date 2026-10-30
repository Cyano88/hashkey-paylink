import { useEffect, useRef, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'

const CIRCLE_NETWORKS = ['base', 'arbitrum', 'arc', 'ethereum', 'polygon', 'solana']
export default function EnablePocketWallets({ wallets, onReady, onBusy }: {
  wallets: Record<string, string>
  onReady: (wallets: Record<string, string>) => void
  onBusy: (busy: boolean) => void
}) {
  const { user, authenticated, getAccessToken } = usePrivy()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const running = useRef(false)
  const mounted = useRef(false)
  const owner = useRef(user?.id); owner.current = user?.id
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; onBusy(false) } }, [onBusy])
  const ready = CIRCLE_NETWORKS.every(network => Boolean(wallets[network]))
  async function enable() {
    if (running.current || !authenticated || !user?.id) return
    const email = user.email?.address
    if (!email) { setError('Sign in with a verified email to enable Pocket wallets.'); return }
    const startedOwner = user.id
    const active = () => mounted.current && owner.current === startedOwner
    running.current = true; setBusy(true); onBusy(true); setError('')
    try {
      // Reuse Pocket's owner-bound setup, session recovery and network linking.
      // Loading this card never opens Circle or provisions a wallet.
      const { reconnectPocketBaseWallet } = await import('../pocket/controllers/usePocketWalletController')
      if (!active()) return
      await reconnectPocketBaseWallet({ authenticated: true, email, getAccessToken, shouldContinue: active })
      if (!active()) return
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to load your Pocket wallets.')
      const response = await fetch('/api/developer-projects?resource=receiving-wallets', {
        headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(20000),
      })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error('Your wallets could not be loaded. Try again.')
      if (active()) onReady(data.wallets ?? {})
    } catch (reason) {
      if (active()) setError(reason instanceof Error && /cancel/i.test(reason.message) ? 'Wallet setup cancelled. You can try again or use your own address.' : reason instanceof Error ? reason.message : 'Pocket wallets could not be enabled. Try again.')
    } finally {
      running.current = false
      if (active()) { setBusy(false); onBusy(false) }
    }
  }
  return <section className="mt-5 rounded-2xl border border-gray-200 p-4 dark:border-white/10" aria-label="Optional Pocket wallets">
    <h3 className="text-sm font-semibold">Pocket wallets <span className="font-normal text-gray-500">(optional)</span></h3>
    <p className="mt-2 text-sm leading-6 text-gray-500">Receive payments in Pocket, or enter a wallet address you control.</p>
    {ready ? <p role="status" className="mt-2 text-sm text-gray-500">Your Pocket wallets are ready. Choose a wallet below, then save your settings.</p> : <>
      <p className="mt-2 text-xs leading-5 text-gray-500">Verify your email with Circle to set up your wallets. Existing wallets are reused.</p>
      <button type="button" disabled={busy} onClick={() => void enable()} className="developer-primary mt-3 min-h-11 px-4 text-sm font-semibold disabled:opacity-50">{busy ? 'Enabling Pocket wallets…' : 'Enable Pocket wallets'}</button>
    </>}
    {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
  </section>
}
